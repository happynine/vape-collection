// ============================================================
// db.js — 云端数据层 + localStorage 降级缓存
// 暴露 window.VapeDB，供 index.html 调用
//
//   data/brands.json     官网品牌
//   data/shops.json      商城
//   data/groups.json     集团
//   data/logos/*         独立 logo 文件
//
// 读取：公开 CDN（raw / jsdelivr 等），无需任何 token
// 写入：Cloudflare Worker 代理（worker/worker.js）
//       GitHub Token 只保存在 Worker 服务端，浏览器里完全不存在，
//       因此外部访客无法从前端或网络请求中获取 GitHub Token。
//
// logo 约定：记录的 logo 字段为
//   - "logos/xxx.png"  → 仓库内独立文件（相对 data/ 目录）
//   - "https://..."    → 外链
//   - "data:..."       → 新上传/粘贴的内嵌图，写入云端时自动抽取为 logos/ 文件
// ============================================================
(function () {
  const cfg = (window.VAPE_CONFIG || {});
  const OWNER  = cfg.GITHUB_OWNER  || 'happynine';
  const REPO   = cfg.GITHUB_REPO   || 'vape-collection';
  const BRANCH = cfg.GITHUB_BRANCH || 'main';

  // 写入代理（Worker）。两者都配置时才启用云端写入
  const WORKER_URL = cfg.WORKER_URL || '';
  const WORKER_KEY = cfg.WORKER_KEY || '';
  const CLOUD_READ  = !!(OWNER && REPO);
  const CLOUD_WRITE = !!(WORKER_URL && WORKER_KEY);
  const CLOUD_ENABLED = CLOUD_READ;

  const RAW_BASE = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/data`;
  // logo 外链基础（data/ 目录），用于把 "logos/xx.png" 解析成可显示的 URL
  const LOGO_URL_BASE = RAW_BASE;

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

  // 内存数据：唯一可信的写入源，防止 localStorage 被旧缓存污染
  let memData = { brands: [], shops: [], groups: [] };
  // 标记每个数据集是否从云端成功加载（false 时禁止写入云端）
  let cloudLoaded = { brands: false, shops: false, groups: false };

  let cloudOk = false;
  let pendingWrites = 0;

  // ---------- logo MIME → 扩展名 ----------
  const MIME_EXT = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/svg+xml': 'svg',
    'image/x-icon': 'ico',
    'image/vnd.microsoft.icon': 'ico',
  };

  // ---------- 工具：UTF-8 base64 ----------
  function utf8ToBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
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

  // ---------- logo 解析：记录里的 logo 值 → 可显示 URL ----------
  // 空→''；http/data URI→原样；logos/xx → raw CDN URL（提交后立即可用）
  function resolveLogo(logo) {
    const v = logo || '';
    if (!v) return '';
    if (v.startsWith('http') || v.startsWith('data:')) return v;
    if (v.startsWith('logos/')) return `${LOGO_URL_BASE}/${v}`;
    // 兼容裸文件名
    return `${LOGO_URL_BASE}/logos/${v}`;
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

  // 云端响应合法性：必须是数组。空数组 [] 也是合法数据（groups 初始为空）
  function isCloudDataValid(cloudData) {
    return Array.isArray(cloudData);
  }

  // 单个文件独立加载：云端成功 → 更新内存和缓存；失败 → 用本地缓存（标记为不可写）
  async function loadOne(name, lsKey) {
    try {
      const data = await fetchJSON(name);
      if (!isCloudDataValid(data)) {
        console.warn(`[VapeDB] ${name} 云端响应非数组，跳过覆盖缓存`);
        return { data: readCache(lsKey), ok: false };
      }
      memData[name] = data;        // 更新内存（写入的唯一数据源）
      cloudLoaded[name] = true;    // 标记云端加载成功
      writeCache(lsKey, data);     // 更新 localStorage 缓存
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
      return { brands: memData.brands, shops: memData.shops, groups: memData.groups, cloud: false };
    }
    const [b, s, g] = await Promise.all([
      loadOne('brands', LS_BRANDS),
      loadOne('shops',   LS_SHOPS),
      loadOne('groups',  LS_GROUPS)
    ]);
    cloudOk = b.ok && s.ok && g.ok;
    return { brands: b.data, shops: s.data, groups: g.data, cloud: cloudOk };
  }

  // 获取文件的最新 JSON（写入前调用，确保基于最新数据修改，防止删除复活）
  // 走公开 CDN，无需 token
  async function fetchLatestFile(name) {
    const data = await fetchJSON(name);
    if (!Array.isArray(data)) throw new Error('CDN 返回非数组');
    return data;
  }

  // ---------- 写入：经 Cloudflare Worker 原子提交 ----------
  function trackPending()   { pendingWrites++; updateStatusUI(); }
  function untrackPending() { pendingWrites = Math.max(0, pendingWrites - 1); updateStatusUI(); }

  // 从 data URI 解析出 {mime, bufferBase64}
  function parseDataURI(uri) {
    const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(uri);
    if (!m) return null;
    return { mime: m[1] || 'image/png', isB64: !!m[2], payload: m[3] };
  }

  // POST 到 Worker。返回 Worker 的结构化结果
  async function commitViaWorker(payload) {
    const res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-App-Key': WORKER_KEY,
      },
      body: JSON.stringify(payload),
    });
    let data;
    try { data = await res.json(); } catch { data = {}; }
    if (!res.ok || !data.ok) {
      const err = new Error(data.error || `worker HTTP ${res.status}`);
      err.worker = true;
      throw err;
    }
    return data;
  }

  /**
   * 安全写入。返回结构化结果：
   *   { ok:true,  mode:'cloud' }            已提交云端
   *   { ok:true,  mode:'local', reason }     仅本地（离线/只读）
   *   { ok:false, mode:'local', error }      云端失败，已暂存本地
   *
   * @param {string} dataset - 'brands' | 'shops' | 'groups'
   * @param {function} localWrite - 同步，更新 memData / localStorage
   * @param {function} prepareCloudData - (latestArray) => 要写入的数组
   */
  function syncWrap(dataset, localWrite, prepareCloudData) {
    try { localWrite(); } catch (e) { console.warn('本地缓存写入失败', e); }

    if (!CLOUD_WRITE) {
      if (window.showToast) window.showToast('未配置写入服务，更改仅保存在本地');
      return Promise.resolve({ ok: true, mode: 'local', reason: 'no_worker' });
    }
    if (!cloudLoaded[dataset]) {
      console.warn(`[VapeDB] ${dataset} 未从云端加载，跳过云端写入以保护数据`);
      if (window.showToast) window.showToast('当前为离线缓存模式，更改仅保存在本地（不会覆盖云端）');
      updateStatusUI();
      return Promise.resolve({ ok: true, mode: 'local', reason: 'offline' });
    }

    trackPending();
    const run = () => {
      // 写前拉最新数据，在最新数据上应用变更
      return fetchLatestFile(dataset).then(latestData => {
        const cloudArray = prepareCloudData(latestData);
        // 抽取该数组里所有内嵌 data-URI logo 为独立文件
        const { files, deletes } = collectLogoChanges(dataset, cloudArray);
        files.push({
          path: `data/${dataset}.json`,
          content: JSON.stringify(cloudArray, null, 2),
        });
        return commitViaWorker({
          action: 'commit',
          message: `db: update ${dataset}`,
          files,
          deletes,
        }).then(() => cloudArray);
      });
    };

    return run()
      .then(cloudArray => {
        cloudOk = true;
        // localStorage 缓存用云端版本（小体积，logo 为路径）
        const lsKey = dataset === 'brands' ? LS_BRANDS : dataset === 'shops' ? LS_SHOPS : LS_GROUPS;
        writeCache(lsKey, cloudArray);
        updateStatusUI();
        return { ok: true, mode: 'cloud' };
      })
      .catch(e => {
        console.warn('[VapeDB] 云端同步失败（已保存在本地缓存）:', e.message);
        cloudOk = false;
        updateStatusUI();
        return { ok: false, mode: 'local', error: e.message };
      })
      .finally(untrackPending);
  }

  // 扫描数组内 logo 为 data URI 的记录，抽取为待写入文件并把字段改为 logos/ 路径
  // dataset → 文件名前缀；记录用自身 id 命名（同名覆盖，不堆积孤儿）
  function collectLogoChanges(dataset, arr) {
    const prefix = dataset === 'brands' ? 'brand' : dataset === 'shops' ? 'shop' : 'group';
    const files = [];
    const deletes = [];
    if (!Array.isArray(arr)) return { files, deletes };
    for (const rec of arr) {
      const logo = rec.logo || '';
      if (!logo.startsWith('data:')) continue;
      const parsed = parseDataURI(logo);
      if (!parsed) continue;
      const ext = MIME_EXT[parsed.mime] || 'png';
      const relPath = `logos/${prefix}_${rec.id}.${ext}`;
      // blob 内容：base64 直接透传；非 base64 需重新编码为 base64
      let b64;
      if (parsed.isB64) {
        b64 = parsed.payload.replace(/\s/g, '');
      } else {
        b64 = utf8ToBase64(decodeURIComponent(parsed.payload));
      }
      files.push({ path: `data/${relPath}`, contentBase64: b64 });
      rec.logo = relPath;
    }
    return { files, deletes };
  }

  // ---------- CRUD 基础变换 ----------
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
    if (!CLOUD_READ) { el.style.display = 'none'; return; }
    el.style.display = 'inline-flex';
    if (pendingWrites > 0) {
      el.style.background = 'rgba(234,179,8,0.2)';
      el.style.color = '#fde047';
      el.textContent = '☁ 同步中…';
    } else if (!CLOUD_WRITE) {
      el.style.background = 'rgba(59,130,246,0.2)';
      el.style.color = '#93c5fd';
      el.textContent = '☁ 云端数据（只读）';
      el.title = '未配置写入服务，可查看云端数据但更改不会同步到其他设备';
    } else if (cloudOk) {
      el.style.background = 'rgba(34,197,94,0.2)';
      el.style.color = '#86efac';
      el.textContent = '☁ 已同步';
    } else if (cloudLoaded.brands || cloudLoaded.shops || cloudLoaded.groups) {
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
    resolveLogo,
    upsertBrand, deleteBrand,
    upsertShop, deleteShop,
    upsertGroup, deleteGroup,
    isCloudEnabled, isCloudOk, getPendingCount,
    updateStatusUI
  };
})();
