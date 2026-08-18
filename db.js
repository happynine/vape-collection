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
  const cfg = (window.VAPE_CONFIG || {});
  // 默认仓库配置：即使没有 config.js 也能从公开 CDN 读取数据
  const OWNER  = cfg.GITHUB_OWNER  || 'happynine';
  const REPO   = cfg.GITHUB_REPO   || 'vape-collection';
  const BRANCH = cfg.GITHUB_BRANCH || 'main';
  const TOKEN  = cfg.GITHUB_TOKEN  || '';
  // 读取只需 OWNER+REPO（公开 CDN）；写入才需要 TOKEN
  const CLOUD_READ  = !!(OWNER && REPO);
  const CLOUD_WRITE = !!(TOKEN && !TOKEN.includes('YOUR_TOKEN'));
  const CLOUD_ENABLED = CLOUD_READ;

  const RAW_BASE = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/data`;
  const API_BASE = `https://api.github.com/repos/${OWNER}/${REPO}/contents/data`;

  const LS_BRANDS = 'cloud_brands_cache';
  const LS_SHOPS  = 'cloud_shops_cache';
  const LS_GROUPS = 'cloud_groups_cache';

  // 每个文件缓存自己的 SHA，用于 PUT 更新（GitHub 要求带最新 SHA 才能覆盖）
  const fileSHA = { brands: '', shops: '', groups: '' };

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

  // ---------- 读取：优先 raw.githubusercontent，失败用缓存 ----------
  // 加 _t 时间戳绕过 raw.githubusercontent.com 的 5 分钟 CDN 缓存
  async function fetchJSON(name) {
    const url = `${RAW_BASE}/${name}.json?_t=${Date.now()}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`GET ${name} HTTP ${res.status}`);
    return res.json();
  }

  // 单个文件独立加载：云端成功 → 更新缓存；失败 → 用本地缓存
  // 这样某个文件加载失败不会拖累其他文件
  async function loadOne(name, lsKey) {
    try {
      const data = await fetchJSON(name);
      writeCache(lsKey, data);
      return { data, ok: true };
    } catch (e) {
      console.warn(`[VapeDB] ${name} 云端加载失败，使用本地缓存:`, e.message);
      return { data: readCache(lsKey), ok: false };
    }
  }

  async function loadAll() {
    if (!CLOUD_ENABLED) {
      return {
        brands: readCache(LS_BRANDS),
        shops:  readCache(LS_SHOPS),
        groups: readCache(LS_GROUPS),
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
    // 顺便获取各文件的最新 SHA（用于后续 PUT），失败不影响读取
    Promise.all([
      fetchFileSHA('brands'),
      fetchFileSHA('shops'),
      fetchFileSHA('groups')
    ]).catch(() => {});
    return { brands: b.data, shops: s.data, groups: g.data, cloud: cloudOk };
  }

  // 获取文件的最新 SHA（PUT 更新时必须带）
  async function fetchFileSHA(name) {
    const res = await fetch(`${API_BASE}/${name}.json?ref=${BRANCH}`, {
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });
    if (res.ok) {
      const data = await res.json();
      fileSHA[name] = data.sha;
    }
  }

  // ---------- 写入：本地乐观更新 + 异步 PUT 到 GitHub ----------
  function trackPending()   { pendingWrites++; updateStatusUI(); }
  function untrackPending() { pendingWrites = Math.max(0, pendingWrites - 1); updateStatusUI(); }

  function syncWrap(localWrite, cloudWrite) {
    try { localWrite(); } catch (e) { console.warn('本地缓存写入失败', e); }
    if (!CLOUD_WRITE) {
      // 未配置 token：只存本地，不尝试云端写入
      if (window.showToast) window.showToast('未配置写入 Token，更改仅保存在本地');
      return Promise.resolve();
    }
    trackPending();
    return cloudWrite()
      .then(() => { cloudOk = true; })
      .catch(e => {
        cloudOk = false;
        console.warn('[VapeDB] 云端同步失败（已保存在本地缓存）:', e.message);
        if (window.showToast) window.showToast('云端同步失败，已暂存本地');
      })
      .finally(untrackPending);
  }

  // 把整个数组写回 GitHub（PUT /contents/data/xxx.json）
  async function putFile(name, data) {
    // 确保有最新 SHA（首次或可能失效时刷新）
    if (!fileSHA[name]) {
      await fetchFileSHA(name);
    }
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
      throw new Error(`PUT ${name} HTTP ${res.status}: ${text}`);
    }
    const result = await res.json();
    fileSHA[name] = result.content.sha; // 更新 SHA 供下次使用
  }

  // ---------- 品牌 CRUD ----------
  function upsertBrand(brand) {
    return syncWrap(
      () => {
        const list = readCache(LS_BRANDS);
        const idx = list.findIndex(b => b.id === brand.id);
        if (idx >= 0) list[idx] = brand; else list.push(brand);
        writeCache(LS_BRANDS, list);
      },
      async () => {
        const list = readCache(LS_BRANDS);
        await putFile('brands', list);
      }
    );
  }

  function deleteBrand(id) {
    return syncWrap(
      () => writeCache(LS_BRANDS, readCache(LS_BRANDS).filter(b => b.id !== id)),
      async () => {
        const list = readCache(LS_BRANDS);
        await putFile('brands', list);
      }
    );
  }

  // ---------- 商城 CRUD ----------
  function upsertShop(shop) {
    return syncWrap(
      () => {
        const list = readCache(LS_SHOPS);
        const idx = list.findIndex(s => s.id === shop.id);
        if (idx >= 0) list[idx] = shop; else list.push(shop);
        writeCache(LS_SHOPS, list);
      },
      async () => {
        const list = readCache(LS_SHOPS);
        await putFile('shops', list);
      }
    );
  }

  function deleteShop(id) {
    return syncWrap(
      () => writeCache(LS_SHOPS, readCache(LS_SHOPS).filter(s => s.id !== id)),
      async () => {
        const list = readCache(LS_SHOPS);
        await putFile('shops', list);
      }
    );
  }

  // ---------- 集团 CRUD ----------
  function upsertGroup(group) {
    return syncWrap(
      () => {
        const list = readCache(LS_GROUPS);
        const idx = list.findIndex(g => g.id === group.id);
        if (idx >= 0) list[idx] = group; else list.push(group);
        writeCache(LS_GROUPS, list);
      },
      async () => {
        const list = readCache(LS_GROUPS);
        await putFile('groups', list);
      }
    );
  }

  function deleteGroup(id) {
    return syncWrap(
      () => writeCache(LS_GROUPS, readCache(LS_GROUPS).filter(g => g.id !== id)),
      async () => {
        const list = readCache(LS_GROUPS);
        await putFile('groups', list);
      }
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
      // 只读模式：能从云端加载数据，但本地写入不能同步
      el.style.background = 'rgba(59,130,246,0.2)';
      el.style.color = '#93c5fd';
      el.textContent = '☁ 云端数据（只读）';
      el.title = '未配置写入 Token，可查看云端数据但更改不会同步到其他设备';
    } else if (cloudOk) {
      el.style.background = 'rgba(34,197,94,0.2)';
      el.style.color = '#86efac';
      el.textContent = '☁ 已同步';
    } else {
      el.style.background = 'rgba(239,68,68,0.2)';
      el.style.color = '#fca5a5';
      el.textContent = '☁ 离线（本地缓存）';
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
