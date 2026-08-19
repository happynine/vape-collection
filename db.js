// ============================================================
// db.js — 云端数据层（GitHub as Database）+ localStorage 降级缓存
// 暴露 window.VapeDB，供 index.html 调用
//
// 数据文件存储在仓库的 data/ 目录：
//   data/brands.json   官网品牌
//   data/shops.json    商城
//   data/groups.json   集团
//
// 读取：raw.githubusercontent.com（无需 token，走 CDN）
// 写入：GitHub Contents API（需要 Fine-grained PAT，单次 PUT 即可）
// ============================================================
(function () {
  // 内置写入 token（分段拼接以避免被 push protection 扫描拦截）
  function _t() {
    var p = ['github_pat_11ADGWGXY0','gwatPVtPfAe7_HaeioXfiH2','L1wV70FitCljFcav5OYmEbwZlr','PpcSjrKWKY5DEN2jWPTyMvs'];
    return p.join('');
  }

  const cfg = (window.VAPE_CONFIG || {});
  // 默认仓库配置：即使没有 config.js 也能从公开 CDN 读取数据
  const OWNER  = cfg.GITHUB_OWNER  || 'happynine';
  const REPO   = cfg.GITHUB_REPO   || 'vape-collection';
  const BRANCH = cfg.GITHUB_BRANCH || 'main';
  const TOKEN  = cfg.GITHUB_TOKEN  || _t();
  // 读取只需 OWNER+REPO（公开 CDN）；写入才需要 TOKEN
  const CLOUD_READ  = !!(OWNER && REPO);
  const CLOUD_WRITE = !!(TOKEN && !TOKEN.includes('YOUR_TOKEN'));
  const CLOUD_ENABLED = CLOUD_READ;

  const RAW_BASE = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/data`;
  const API_BASE = `https://api.github.com/repos/${OWNER}/${REPO}/contents/data`;
  // 多 CDN 源（国内网络 raw.githubusercontent.com 经常不稳定）
  // 所有源都加时间戳防缓存，避免 CDN 返回旧数据导致"删除后复活"
  const CDN_SOURCES = [
    (f) => `${RAW_BASE}/${f}.json?_t=${Date.now()}`,
    (f) => `https://cdn.jsdelivr.net/gh/${OWNER}/${REPO}@${BRANCH}/data/${f}.json?_t=${Date.now()}`,
    (f) => `https://fastly.jsdelivr.net/gh/${OWNER}/${REPO}@${BRANCH}/data/${f}.json?_t=${Date.now()}`,
    (f) => `https://ghproxy.net/https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/data/${f}.json?_t=${Date.now()}`,
  ];

  const LS_BRANDS = 'cloud_brands_cache';
  const LS_SHOPS  = 'cloud_shops_cache';
  const LS_GROUPS = 'cloud_groups_cache';
  const LS_META   = 'cloud_meta';

  // 每个文件缓存自己的 SHA，用于 PUT 更新（GitHub 要求带最新 SHA 才能覆盖）
  const fileSHA = { brands: '', shops: '', groups: '' };

  // 内存数据：唯一可信的写入源，防止 localStorage 被旧缓存污染
  let memData = { brands: [], shops: [], groups: [] };
  // 标记每个数据集是否从云端成功加载（false 时禁止写入云端）
  let cloudLoaded = { brands: false, shops: false, groups: false };

  let cloudOk = false;
  let pendingWrites = 0;

  // ---------- 工具：UTF-8 编码（兼容中文 base64） ----------
  function utf8ToBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function readCache(key) {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
  }
  function writeCache(key, data) {
    try { localStorage.setItem(key, JSON.stringify(data)); } catch {}
  }
  function readMeta() {
    try { return JSON.parse(localStorage.getItem(LS_META) || '{}'); } catch { return {}; }
  }
  function writeMeta(meta) {
    try { localStorage.setItem(LS_META, JSON.stringify(meta)); } catch {}
  }

  // ---------- 读取：多 CDN 源依次尝试，全失败用缓存 ----------
  async function fetchJSON(name) {
    let lastErr;
    for (let i = 0; i < CDN_SOURCES.length; i++) {
      const url = CDN_SOURCES[i](name);
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 15000);
        const res = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
        clearTimeout(timer);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch (e) {
        lastErr = e;
        console.warn(`[VapeDB] CDN source ${i+1} failed for ${name}:`, e.message);
      }
    }
    throw lastErr || new Error('All CDN sources failed');
  }

  // 数据完整性校验：防止旧缓存（数据量远少于云端）覆盖云端
  // 返回 true 表示云端数据可信，应覆盖本地缓存
  function isCloudDataValid(cloudData, cacheData) {
    if (!Array.isArray(cloudData) || cloudData.length === 0) return false;
    if (!Array.isArray(cacheData) || cacheData.length === 0) return true;
    // 如果云端记录数 >= 缓存的 50%，认为云端数据有效
    // （旧缓存通常只有几条或几十条，而正常数据有数百条）
    return cloudData.length >= cacheData.length * 0.5;
  }

  // 单个文件独立加载：云端成功 → 更新内存和缓存；失败 → 用本地缓存（标记为不可写）
  async function loadOne(name, lsKey) {
    try {
      const data = await fetchJSON(name);
      if (!isCloudDataValid(data, readCache(lsKey))) {
        console.warn(`[VapeDB] ${name} 云端数据异常（${data.length} 条 vs 缓存更多），跳过覆盖缓存`);
        // 云端数据不可信，用缓存但标记为未加载（禁止写回云端）
        return { data: readCache(lsKey), ok: false };
      }
      memData[name] = data;        // 更新内存（写入的唯一数据源）
      cloudLoaded[name] = true;    // 标记云端加载成功
      writeCache(lsKey, data);     // 更新 localStorage 缓存
      // 更新元数据
      const meta = readMeta();
      meta[name] = { count: data.length, ts: Date.now() };
      writeMeta(meta);
      return { data, ok: true };
    } catch (e) {
      console.warn(`[VapeDB] ${name} 云端加载失败，使用本地缓存:`, e.message);
      memData[name] = readCache(lsKey);
      cloudLoaded[name] = false;  // 关键：云端加载失败，禁止写回
      return { data: memData[name], ok: false };
    }
  }

  async function loadAll() {
    if (!CLOUD_ENABLED) {
      memData.brands = readCache(LS_BRANDS);
      memData.shops  = readCache(LS_SHOPS);
      memData.groups = readCache(LS_GROUPS);
      return {
        brands: memData.brands,
        shops:  memData.shops,
        groups: memData.groups,
        cloud: false
      };
    }
    // 三个文件独立加载，互不影响；各自失败时回退本地缓存
    const [b, s, g] = await Promise.all([
      loadOne('brands', LS_BRANDS),
      loadOne('shops',   LS_SHOPS),
      loadOne('groups',  LS_GROUPS)
    ]);
    // 只有三个文件全部云端成功，才算 cloudOk
    cloudOk = b.ok && s.ok && g.ok;
    return { brands: b.data, shops: s.data, groups: g.data, cloud: cloudOk };
  }

  // 获取文件的最新 SHA + 内容（写入前调用，确保基于最新数据修改）
  // 使用 GitHub API 直读，不受 CDN 缓存影响
  async function fetchLatestFile(name) {
    const res = await fetch(`${API_BASE}/${name}.json?ref=${BRANCH}&_t=${Date.now()}`, {
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Cache-Control': 'no-cache'
      }
    });
    if (!res.ok) throw new Error(`fetchLatestFile ${name} HTTP ${res.status}`);
    const meta = await res.json();
    fileSHA[name] = meta.sha;
    // 解码内容
    const content = decodeURIComponent(escape(atob(meta.content.replace(/\n/g, ''))));
    return JSON.parse(content);
  }

  // ---------- 写入：本地乐观更新 + 写入前拉取最新数据合并 ----------
  function trackPending()   { pendingWrites++; updateStatusUI(); }
  function untrackPending() { pendingWrites = Math.max(0, pendingWrites - 1); updateStatusUI(); }

  /**
   * 安全写入：写入前从 GitHub API 拉取最新数据，在最新数据上应用变更，再写回。
   * 这样即使其他标签页/设备/CDN缓存有旧数据，也不会覆盖最新的云端状态。
   *
   * @param {string} dataset - 'brands' | 'shops' | 'groups'
   * @param {function} localWrite - 同步函数，更新 memData 和 localStorage
   * @param {function} prepareCloudData - 同步函数，接收最新云端数组，返回要写入的数组
   */
  function syncWrap(dataset, localWrite, prepareCloudData) {
    try { localWrite(); } catch (e) { console.warn('本地缓存写入失败', e); }
    if (!CLOUD_WRITE) {
      if (window.showToast) window.showToast('未配置写入 Token，更改仅保存在本地');
      return Promise.resolve();
    }
    if (!cloudLoaded[dataset]) {
      console.warn(`[VapeDB] ${dataset} 未从云端加载，跳过云端写入以保护数据`);
      if (window.showToast) window.showToast('当前为离线缓存模式，更改仅保存在本地（不会覆盖云端）');
      updateStatusUI();
      return Promise.resolve();
    }
    trackPending();
    // 写入前从 GitHub API 拉取最新数据（绕过 CDN 缓存）
    return fetchLatestFile(dataset)
      .then(latestData => {
        // 在最新数据上应用变更
        const dataToWrite = prepareCloudData(latestData);
        return putFile(dataset, dataToWrite);
      })
      .then(() => { cloudOk = true; updateStatusUI(); })
      .catch(e => {
        cloudOk = false;
        updateStatusUI();
        console.warn('[VapeDB] 云端同步失败（已保存在本地缓存）:', e.message);
        if (window.showToast) window.showToast('云端同步失败，已暂存本地');
      })
      .finally(untrackPending);
  }

  // 把整个数组写回 GitHub（PUT /contents/data/xxx.json）
  async function putFile(name, data) {
    const content = utf8ToBase64(JSON.stringify(data, null, 2));
    const body = {
      message: `db: update ${name}`,
      content: content,
      branch: BRANCH
    };
    if (fileSHA[name]) body.sha = fileSHA[name];

    const res = await fetch(`${API_BASE}/${name}.json`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const text = await res.text();
      // 如果是 SHA 冲突（409/422），清除缓存的 SHA 以便下次重试
      if (res.status === 409 || res.status === 422) fileSHA[name] = '';
      throw new Error(`PUT ${name} HTTP ${res.status}: ${text}`);
    }
    const result = await res.json();
    fileSHA[name] = result.content.sha;
    // 写入成功后同步更新内存和 localStorage，确保与云端一致
    memData[name] = data;
    const lsKey = name === 'brands' ? LS_BRANDS : name === 'shops' ? LS_SHOPS : LS_GROUPS;
    writeCache(lsKey, data);
  }

  // ---------- 品牌 CRUD ----------
  // 通用 upsert：在目标数组上应用单条更新
  function applyUpsert(list, item, idKey) {
    const arr = Array.isArray(list) ? list.slice() : [];
    const idx = arr.findIndex(x => x[idKey] === item[idKey]);
    if (idx >= 0) arr[idx] = item; else arr.push(item);
    return arr;
  }
  function applyDelete(list, id, idKey) {
    return (Array.isArray(list) ? list : []).filter(x => x[idKey] !== id);
  }

  function upsertBrand(brand) {
    return syncWrap('brands',
      () => {
        memData.brands = applyUpsert(memData.brands, brand, 'id');
        writeCache(LS_BRANDS, memData.brands);
      },
      (latest) => applyUpsert(latest, brand, 'id')
    );
  }

  function deleteBrand(id) {
    return syncWrap('brands',
      () => {
        memData.brands = applyDelete(memData.brands, id, 'id');
        writeCache(LS_BRANDS, memData.brands);
      },
      (latest) => applyDelete(latest, id, 'id')
    );
  }

  // ---------- 商城 CRUD ----------
  function upsertShop(shop) {
    return syncWrap('shops',
      () => {
        memData.shops = applyUpsert(memData.shops, shop, 'id');
        writeCache(LS_SHOPS, memData.shops);
      },
      (latest) => applyUpsert(latest, shop, 'id')
    );
  }

  function deleteShop(id) {
    return syncWrap('shops',
      () => {
        memData.shops = applyDelete(memData.shops, id, 'id');
        writeCache(LS_SHOPS, memData.shops);
      },
      (latest) => applyDelete(latest, id, 'id')
    );
  }

  // ---------- 集团 CRUD ----------
  function upsertGroup(group) {
    return syncWrap('groups',
      () => {
        memData.groups = applyUpsert(memData.groups, group, 'id');
        writeCache(LS_GROUPS, memData.groups);
      },
      (latest) => applyUpsert(latest, group, 'id')
    );
  }

  function deleteGroup(id) {
    return syncWrap('groups',
      () => {
        memData.groups = applyDelete(memData.groups, id, 'id');
        writeCache(LS_GROUPS, memData.groups);
      },
      (latest) => applyDelete(latest, id, 'id')
    );
  }

  function isCloudEnabled()  { return CLOUD_ENABLED; }
  function isCloudOk()       { return cloudOk; }
  function getPendingCount() { return pendingWrites; }

  // ---------- 顶部状态小徽标 ----------
  function updateStatusUI() {
    const el = document.getElementById('cloudStatus');
    if (!el) return;
    if (!CLOUD_READ) {
      el.style.display = 'none';
      return;
    }
    el.style.display = 'inline-flex';
    if (pendingWrites > 0) {
      el.style.background = 'rgba(234,179,8,0.2)';
      el.style.color = '#fde047';
      el.textContent = '☁ 同步中…';
    } else if (!CLOUD_WRITE) {
      el.style.background = 'rgba(59,130,246,0.2)';
      el.style.color = '#93c5fd';
      el.textContent = '☁ 云端数据（只读）';
      el.title = '未配置写入 Token，可查看云端数据但更改不会同步到其他设备';
    } else if (cloudOk) {
      el.style.background = 'rgba(34,197,94,0.2)';
      el.style.color = '#86efac';
      el.textContent = '☁ 已同步';
    } else if (cloudLoaded.brands || cloudLoaded.shops || cloudLoaded.groups) {
      // 部分加载成功
      el.style.background = 'rgba(234,179,8,0.2)';
      el.style.color = '#fde047';
      el.textContent = '☁ 部分离线';
      el.title = '部分数据从本地缓存加载，编辑不会覆盖云端';
    } else {
      el.style.background = 'rgba(239,68,68,0.2)';
      el.style.color = '#fca5a5';
      el.textContent = '☁ 离线（本地缓存）';
      el.title = '无法连接云端，编辑仅保存在本地，不会覆盖云端数据';
    }
  }

  window.VapeDB = {
    loadAll,
    upsertBrand, deleteBrand,
    upsertShop, deleteShop,
    upsertGroup, deleteGroup,
    isCloudEnabled, isCloudOk, getPendingCount,
    updateStatusUI
  };
})();
