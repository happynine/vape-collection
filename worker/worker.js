// ============================================================
// Cloudflare Worker —— Vape Collection 写入代理 + 访问统计
//
// 两种能力：
//   1) action=commit  浏览器 → 本 Worker → GitHub 原子提交（blob→tree→commit→ref）
//                     GitHub Token 只存在本 Worker 的 Secret 里，前端完全拿不到。
//   2) action=track   记录一次访问（IP 归属地 + UA 哈希，不存原始 IP）
//      action=stats   按月/按年聚合访问量、访客数、中国省份、国际国家
//      action=ping    健康检查（返回 D1 是否已绑定）
//
// 需要配置：
//   变量 / Secret：
//     GITHUB_TOKEN   有 repo contents:write 权限的 fine-grained token（必填）
//     APP_SECRET     客户端访问密钥（必填）
//     GITHUB_OWNER   默认 happynine
//     GITHUB_REPO    默认 vape-collection
//     GITHUB_BRANCH  默认 main
//   D1 绑定：
//     变量名 DB  →  绑定一个 D1 数据库（统计用；不绑也能正常读写数据，只是没有统计）
//     表结构会自动创建，无需手动执行 SQL
// ============================================================

const ALLOW_ORIGIN = 'https://happynine.github.io';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOW_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-App-Key',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

// 块式 UTF-8 → base64，避免大字符串的 spread 参数栈溢出
function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const end = Math.min(i + CHUNK, bytes.length);
    for (let j = i; j < end; j++) bin += String.fromCharCode(bytes[j]);
  }
  return btoa(bin);
}

// 极简限流：每个 IP 每分钟最多 N 次请求（Worker 隔离内存，够用）
const rateMap = new Map();
function rateLimited(ip) {
  const WINDOW = 60_000;
  const MAX = 60;
  const now = Date.now();
  let rec = rateMap.get(ip);
  if (!rec || now - rec.start > WINDOW) {
    rec = { start: now, count: 0 };
    rateMap.set(ip, rec);
  }
  rec.count++;
  if (rateMap.size > 500) {
    for (const [k, v] of rateMap) if (now - v.start > WINDOW) rateMap.delete(k);
  }
  return rec.count > MAX;
}

function hashStr(s) {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = ((h1 ^ c) * 16777619) >>> 0;
    h2 = (h2 + c * (i + 1) * 2654435761) >>> 0;
  }
  return h1.toString(36) + h2.toString(36);
}

// 中国省份：英文名 / ISO 代码 → 中文
const CN_PROVINCE = {
  Beijing: '北京', Shanghai: '上海', Tianjin: '天津', Chongqing: '重庆',
  Guangdong: '广东', Zhejiang: '浙江', Jiangsu: '江苏', Fujian: '福建',
  Shandong: '山东', Henan: '河南', Sichuan: '四川', Hubei: '湖北',
  Hunan: '湖南', Hebei: '河北', Anhui: '安徽', Jiangxi: '江西',
  Shaanxi: '陕西', Liaoning: '辽宁', Guangxi: '广西', Yunnan: '云南',
  Guizhou: '贵州', Shanxi: '山西', Heilongjiang: '黑龙江', Jilin: '吉林',
  'Inner Mongolia': '内蒙古', Xinjiang: '新疆', Gansu: '甘肃', Hainan: '海南',
  Ningxia: '宁夏', Qinghai: '青海', Tibet: '西藏', Xizang: '西藏',
  'Hong Kong': '香港', Macau: '澳门', Macao: '澳门', Taiwan: '台湾',
  BJ: '北京', TJ: '天津', HE: '河北', SX: '山西', NM: '内蒙古',
  LN: '辽宁', JL: '吉林', HL: '黑龙江', SH: '上海', JS: '江苏',
  ZJ: '浙江', AH: '安徽', FJ: '福建', JX: '江西', SD: '山东',
  HA: '河南', HB: '湖北', HN: '湖南', GD: '广东', GX: '广西',
  HI: '海南', CQ: '重庆', SC: '四川', GZ: '贵州', YN: '云南',
  XZ: '西藏', SN: '陕西', GS: '甘肃', QH: '青海', NX: '宁夏',
  XJ: '新疆', TW: '台湾', HK: '香港', MO: '澳门',
};

const COUNTRY_CN = {
  CN: '中国', HK: '中国香港', MO: '中国澳门', TW: '中国台湾',
  US: '美国', GB: '英国', CA: '加拿大', RU: '俄罗斯', FR: '法国',
  DE: '德国', NL: '荷兰', IT: '意大利', ES: '西班牙', PL: '波兰',
  JP: '日本', KR: '韩国', SG: '新加坡', MY: '马来西亚', TH: '泰国',
  VN: '越南', ID: '印度尼西亚', PH: '菲律宾', IN: '印度', PK: '巴基斯坦',
  AU: '澳大利亚', NZ: '新西兰', AE: '阿联酋', SA: '沙特', IL: '以色列',
  TR: '土耳其', BR: '巴西', MX: '墨西哥', AR: '阿根廷', CL: '智利',
  ZA: '南非', NG: '尼日利亚', EG: '埃及', UA: '乌克兰', SE: '瑞典',
  NO: '挪威', DK: '丹麦', FI: '芬兰', CH: '瑞士', AT: '奥地利',
  BE: '比利时', CZ: '捷克', PT: '葡萄牙', GR: '希腊', IE: '爱尔兰',
};

// 北京时间切日
function bjDay() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

let schemaReady = false;
async function ensureSchema(db) {
  if (schemaReady) return;
  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS visits (
         day TEXT NOT NULL,
         kind TEXT NOT NULL,
         dim TEXT NOT NULL DEFAULT '',
         n INTEGER NOT NULL DEFAULT 0,
         PRIMARY KEY (day, kind, dim)
       )`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS uniques (
         day TEXT NOT NULL,
         kind TEXT NOT NULL,
         vid TEXT NOT NULL,
         PRIMARY KEY (day, kind, vid)
       )`,
    ),
  ]);
  schemaReady = true;
}

// ---------------- 统计 ----------------
async function trackVisit(request, env, body) {
  if (!env.DB) return json({ ok: false, error: 'db_unavailable' }, 503);
  const ua = request.headers.get('User-Agent') || '';
  if (/bot|crawler|spider|headless|preview|curl|wget|python-requests/i.test(ua)) {
    return json({ ok: true, skipped: 'bot' });
  }

  const cf = request.cf || {};
  const country = (cf.country || '').toUpperCase();
  let region = cf.region || '';
  if (country === 'CN' && region) region = CN_PROVINCE[region] || region;
  if (country === 'CN' && !region && cf.regionCode) region = CN_PROVINCE[cf.regionCode] || cf.regionCode;

  const self = !!body.self;
  const day = bjDay();
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

  await ensureSchema(env.DB);

  const rows = [['pv', '']];
  if (self) rows.push(['self', '']);
  if (country) {
    rows.push(['cc', country]);
    if (self) rows.push(['sc', country]);
  }
  if (country === 'CN' && region) {
    rows.push(['rg', region]);
    if (self) rows.push(['sr', region]);
  }

  const stmts = rows.map(([kind, dim]) =>
    env.DB.prepare(
      `INSERT INTO visits (day, kind, dim, n) VALUES (?, ?, ?, 1)
       ON CONFLICT(day, kind, dim) DO UPDATE SET n = n + 1`,
    ).bind(day, kind, dim)
  );
  stmts.push(
    env.DB.prepare(
      `INSERT OR IGNORE INTO uniques (day, kind, vid) VALUES (?, ?, ?)`,
    ).bind(day, self ? 'suv' : 'uv', hashStr(ip + '|' + ua))
  );

  await env.DB.batch(stmts);
  return json({ ok: true });
}

async function readStats(env, body) {
  if (!env.DB) return json({ ok: false, error: 'db_unavailable' }, 503);
  const range = body.range === 'year' ? 'year' : 'month';
  const key = String(body.key || '').slice(0, 10);
  if (!/^\d{4}(-\d{2})?$/.test(key)) return json({ ok: false, error: 'bad_range' }, 400);
  const excludeSelf = !!body.excludeSelf;

  await ensureSchema(env.DB);
  const like = key + '%';

  const res = await env.DB.prepare(
    `SELECT kind, dim, SUM(n) AS n FROM visits WHERE day LIKE ? GROUP BY kind, dim`,
  ).bind(like).all();
  const uvRow = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM uniques WHERE day LIKE ? AND kind = 'uv'`,
  ).bind(like).first();
  const suvRow = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM uniques WHERE day LIKE ? AND kind = 'suv'`,
  ).bind(like).first();

  let pv = 0, selfPv = 0;
  const cc = new Map(), sc = new Map(), rg = new Map(), sr = new Map();
  for (const r of (res.results || [])) {
    const n = Number(r.n) || 0;
    switch (r.kind) {
      case 'pv': pv += n; break;
      case 'self': selfPv += n; break;
      case 'cc': cc.set(r.dim, (cc.get(r.dim) || 0) + n); break;
      case 'sc': sc.set(r.dim, (sc.get(r.dim) || 0) + n); break;
      case 'rg': rg.set(r.dim, (rg.get(r.dim) || 0) + n); break;
      case 'sr': sr.set(r.dim, (sr.get(r.dim) || 0) + n); break;
    }
  }

  const uv = Number(uvRow && uvRow.c) || 0;
  const suv = Number(suvRow && suvRow.c) || 0;
  const countries = [];
  const provinces = [];

  if (excludeSelf) {
    for (const [c, n] of cc) {
      const v = Math.max(0, n - (sc.get(c) || 0));
      if (v > 0) countries.push({ code: c, name: COUNTRY_CN[c] || c, count: v });
    }
    for (const [r, n] of rg) {
      const v = Math.max(0, n - (sr.get(r) || 0));
      if (v > 0) provinces.push({ name: r, count: v });
    }
  } else {
    for (const [c, n] of cc) countries.push({ code: c, name: COUNTRY_CN[c] || c, count: n });
    for (const [r, n] of rg) provinces.push({ name: r, count: n });
  }

  countries.sort((a, b) => b.count - a.count);
  provinces.sort((a, b) => b.count - a.count);

  return json({
    ok: true,
    range,
    key,
    pv: excludeSelf ? Math.max(0, pv - selfPv) : pv,
    uv: excludeSelf ? uv : uv + suv,
    selfPv,
    selfUv: suv,
    countries,
    provinces,
    excluded: excludeSelf,
  });
}

// ---------------- GitHub 原子提交 ----------------
async function commitToGithub(env, body) {
  const OWNER = env.GITHUB_OWNER || 'happynine';
  const REPO = env.GITHUB_REPO || 'vape-collection';
  const BRANCH = env.GITHUB_BRANCH || 'main';
  const API = `https://api.github.com/repos/${OWNER}/${REPO}`;

  const ghHeaders = {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    'User-Agent': 'vape-collection-worker',
  };

  async function gh(url, options = {}) {
    const res = await fetch(url, { ...options, headers: ghHeaders });
    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    return { ok: res.ok, status: res.status, data };
  }

  const message = String(body.message || 'db: update').slice(0, 200);
  const files = Array.isArray(body.files) ? body.files : [];
  const deletes = Array.isArray(body.deletes) ? body.deletes : [];
  if (!files.length && !deletes.length) {
    return json({ ok: false, error: 'empty_commit' }, 400);
  }

  // 路径白名单：只允许写 data/ 下文件，杜绝越权
  const safePath = (p) =>
    typeof p === 'string' &&
    /^data\/[A-Za-z0-9_\-./]+\.(json|png|jpg|jpeg|webp|gif|svg|ico)$/.test(p) &&
    !p.includes('..');
  for (const f of files) {
    if (!safePath(f.path)) return json({ ok: false, error: 'unsafe_path', path: f.path }, 400);
  }
  for (const p of deletes) {
    if (!safePath(p)) return json({ ok: false, error: 'unsafe_path', path: p }, 400);
  }

  const doCommit = async () => {
    const refR = await gh(`${API}/git/ref/heads/${BRANCH}`);
    if (!refR.ok) throw new Error(`ref ${refR.status}`);
    const parentSha = refR.data.object.sha;

    const comR = await gh(`${API}/git/commits/${parentSha}`);
    if (!comR.ok) throw new Error(`parent ${comR.status}`);
    const baseTreeSha = comR.data.tree.sha;

    const treeItems = [];
    for (const f of files) {
      let contentB64;
      if (f.contentBase64 !== undefined) {
        contentB64 = String(f.contentBase64);
      } else {
        contentB64 = utf8ToBase64(String(f.content ?? ''));
      }
      const blobR = await gh(`${API}/git/blobs`, {
        method: 'POST',
        body: JSON.stringify({ content: contentB64, encoding: 'base64' }),
      });
      if (!blobR.ok) throw new Error(`blob ${blobR.status}`);
      treeItems.push({ path: f.path, mode: '100644', type: 'blob', sha: blobR.data.sha });
    }

    for (const p of deletes) {
      treeItems.push({ path: p, mode: '100644', type: 'blob', sha: null });
    }

    const treeR = await gh(`${API}/git/trees`, {
      method: 'POST',
      body: JSON.stringify({ base_tree: baseTreeSha, tree: treeItems }),
    });
    if (!treeR.ok) throw new Error(`tree ${treeR.status}`);

    const newComR = await gh(`${API}/git/commits`, {
      method: 'POST',
      body: JSON.stringify({ message, tree: treeR.data.sha, parents: [parentSha] }),
    });
    if (!newComR.ok) throw new Error(`commit ${newComR.status}`);

    const updR = await gh(`${API}/git/refs/heads/${BRANCH}`, {
      method: 'PATCH',
      body: JSON.stringify({ sha: newComR.data.sha, force: false }),
    });
    if (!updR.ok) {
      const err = new Error(`ref_update ${updR.status}`);
      err.conflict = updR.status === 409 || updR.status === 422;
      throw err;
    }
    return { commitSha: newComR.data.sha };
  };

  try {
    try {
      const r = await doCommit();
      return json({ ok: true, mode: 'cloud', commitSha: r.commitSha });
    } catch (e) {
      if (e.conflict) {
        const r = await doCommit();
        return json({ ok: true, mode: 'cloud', commitSha: r.commitSha, retried: true });
      }
      throw e;
    }
  } catch (e) {
    return json({ ok: false, mode: 'local', error: String(e.message || e) }, 502);
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    if (origin && origin !== ALLOW_ORIGIN) {
      return json({ ok: false, error: 'forbidden_origin' }, 403);
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }
    if (request.method !== 'POST') {
      return json({ ok: false, error: 'method_not_allowed' }, 405);
    }

    const appKey = request.headers.get('X-App-Key') || '';
    const expectedKey = env.APP_SECRET || '';
    if (!expectedKey || appKey !== expectedKey) {
      return json({ ok: false, error: 'unauthorized' }, 401);
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (rateLimited(ip)) {
      return json({ ok: false, error: 'rate_limited' }, 429);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: 'bad_json' }, 400);
    }
    if (!body || !body.action) {
      return json({ ok: false, error: 'unknown_action' }, 400);
    }

    if (body.action === 'ping') {
      return json({ ok: true, db: !!env.DB, ts: Date.now() });
    }
    if (body.action === 'track') return await trackVisit(request, env, body);
    if (body.action === 'stats') return await readStats(env, body);
    if (body.action !== 'commit') {
      return json({ ok: false, error: 'unknown_action' }, 400);
    }
    return await commitToGithub(env, body);
  },
};
