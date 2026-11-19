// ============================================================
// Deno Deploy —— Vape Collection 写入代理
//
// 作用：浏览器不再直接持有/发送 GitHub Token。
//   Token 仅保存在 Deno Deploy 的环境变量（GITHUB_TOKEN）里。
//   浏览器调用本函数完成一次原子提交（blob→tree→commit→ref）。
//
// 需要在 Deno Deploy 后台为本项目配置环境变量：
//   GITHUB_TOKEN   有 Contents 读写权限的 fine-grained token（必填）
//   APP_SECRET     客户端访问密钥（必填，随机长字符串）
//   GITHUB_OWNER   默认 happynine
//   GITHUB_REPO    默认 vape-collection
//   GITHUB_BRANCH  默认 main
// ============================================================

const ALLOW_ORIGIN = "https://happynine.github.io";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": ALLOW_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-App-Key",
  "Access-Control-Max-Age": "86400",
  Vary: "Origin",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// 块式 UTF-8 → base64，避免大字符串的 spread 参数栈溢出
function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const end = Math.min(i + CHUNK, bytes.length);
    for (let j = i; j < end; j++) bin += String.fromCharCode(bytes[j]);
  }
  return btoa(bin);
}

// 极简限流：每个 IP 每分钟最多 N 次写（隔离内存，够用）
const rateMap = new Map<string, { start: number; count: number }>();
function rateLimited(ip: string): boolean {
  const WINDOW = 60_000;
  const MAX = 30;
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


// ============================================================
// 访问统计（Deno KV）
//   写入：action=track  每次页面访问 +1
//   读取：action=stats  按月 / 按年聚合
// 数据按北京时间切日；国内按省、国外按国家；可排除站长本人
// ============================================================

type Geo = { country: string; region: string };

let kvPromise: Promise<any> | null = null;
function getKv(): Promise<any> {
  if (!kvPromise) {
    kvPromise = (async () => {
      try {
        const fn = (Deno as any).openKv;
        if (typeof fn !== "function") return null;
        return await fn.call(Deno);
      } catch (e) {
        console.warn("[stats] Deno KV 不可用:", e);
        return null;
      }
    })();
  }
  return kvPromise;
}

function hashStr(s: string): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = ((h1 ^ c) * 16777619) >>> 0;
    h2 = (h2 + c * (i + 1) * 2654435761) >>> 0;
  }
  return h1.toString(36) + h2.toString(36);
}

// ip-api / ipapi 返回英文省名时映射为中文
const CN_PROVINCE: Record<string, string> = {
  Beijing: "北京", Shanghai: "上海", Tianjin: "天津", Chongqing: "重庆",
  Guangdong: "广东", Zhejiang: "浙江", Jiangsu: "江苏", Fujian: "福建",
  Shandong: "山东", Henan: "河南", Sichuan: "四川", Hubei: "湖北",
  Hunan: "湖南", Hebei: "河北", Anhui: "安徽", Jiangxi: "江西",
  Shaanxi: "陕西", Liaoning: "辽宁", Guangxi: "广西", Yunnan: "云南",
  Guizhou: "贵州", Shanxi: "山西", Heilongjiang: "黑龙江", Jilin: "吉林",
  "Inner Mongolia": "内蒙古", Xinjiang: "新疆", Gansu: "甘肃", Hainan: "海南",
  Ningxia: "宁夏", Qinghai: "青海", Tibet: "西藏", Xizang: "西藏",
  "Hong Kong": "香港", Macau: "澳门", Macao: "澳门", Taiwan: "台湾",
};

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") || "";
  return (xff.split(",")[0] || "").trim() || "unknown";
}

async function lookupGeo(ip: string): Promise<Geo> {
  const kv = await getKv();
  const ckey = ["geo", hashStr(ip)];
  if (kv) {
    try {
      const r = await kv.get(ckey);
      if (r.value && (r.value as Geo).country) return r.value as Geo;
    } catch { /* ignore */ }
  }

  let out: Geo = { country: "", region: "" };

  // 1) Deno Deploy 边缘节点自带的地理信息
  const g = (Deno as any).geo;
  if (g && g.country) {
    out = { country: String(g.country).toUpperCase(), region: String(g.region || "") };
  }

  // 2) ip-api.com（中文省名）
  if (!out.country && ip && ip !== "unknown") {
    try {
      const r = await fetch(
        `http://ip-api.com/json/${ip}?fields=status,countryCode,regionName&lang=zh-CN`,
        { signal: AbortSignal.timeout(2500) },
      );
      const d = await r.json();
      if (d && d.status === "success" && d.countryCode) {
        out = { country: String(d.countryCode).toUpperCase(), region: String(d.regionName || "") };
      }
    } catch { /* ignore */ }
  }

  // 3) ipapi.co 兜底
  if (!out.country && ip && ip !== "unknown") {
    try {
      const r = await fetch(`https://ipapi.co/${ip}/json/`, { signal: AbortSignal.timeout(2500) });
      const d = await r.json();
      if (d && d.country_code) {
        out = { country: String(d.country_code).toUpperCase(), region: String(d.region || "") };
      }
    } catch { /* ignore */ }
  }

  if (out.country === "CN" && out.region) {
    out.region = CN_PROVINCE[out.region] || out.region;
  }
  if (kv && out.country) {
    try { await kv.set(ckey, out, { expireIn: 7 * 24 * 3600 * 1000 }); } catch { /* ignore */ }
  }
  return out;
}

function bjDay(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

async function trackVisit(req: Request, body: any, ip: string): Promise<Response> {
  const kv = await getKv();
  if (!kv) return json({ ok: false, error: "kv_unavailable" }, 503);

  const ua = req.headers.get("user-agent") || "";
  if (/bot|crawler|spider|headless|preview|curl|wget|python-requests/i.test(ua)) {
    return json({ ok: true, skipped: "bot" });
  }

  const geo = await lookupGeo(ip);
  const self = body.self ? 1 : 0;
  const day = bjDay();

  let at = kv.atomic();
  at = at.sum(["v", day, "pv"], 1n);
  if (self) at = at.sum(["v", day, "self"], 1n);
  if (geo.country) {
    at = at.sum(["v", day, "cc", geo.country], 1n);
    if (self) at = at.sum(["v", day, "sc", geo.country], 1n);
  }
  if (geo.country === "CN" && geo.region) {
    at = at.sum(["v", day, "rg", geo.region], 1n);
    if (self) at = at.sum(["v", day, "sr", geo.region], 1n);
  }
  await at.commit();

  // 独立访客：按 ip+UA 哈希按天去重
  const vh = hashStr(ip + "|" + ua);
  try {
    await kv.set(["v", day, self ? "suv" : "uv", vh], 1, { expireIn: 120 * 24 * 3600 * 1000 });
  } catch { /* ignore */ }

  return json({ ok: true });
}

const COUNTRY_CN: Record<string, string> = {
  CN: "中国", HK: "中国香港", MO: "中国澳门", TW: "中国台湾",
  US: "美国", GB: "英国", CA: "加拿大", RU: "俄罗斯", FR: "法国",
  DE: "德国", NL: "荷兰", IT: "意大利", ES: "西班牙", PL: "波兰",
  JP: "日本", KR: "韩国", SG: "新加坡", MY: "马来西亚", TH: "泰国",
  VN: "越南", ID: "印度尼西亚", PH: "菲律宾", IN: "印度", PK: "巴基斯坦",
  AU: "澳大利亚", NZ: "新西兰", AE: "阿联酋", SA: "沙特", IL: "以色列",
  TR: "土耳其", BR: "巴西", MX: "墨西哥", AR: "阿根廷", CL: "智利",
  ZA: "南非", NG: "尼日利亚", EG: "埃及", UA: "乌克兰", SE: "瑞典",
  NO: "挪威", DK: "丹麦", FI: "芬兰", CH: "瑞士", AT: "奥地利",
  BE: "比利时", CZ: "捷克", PT: "葡萄牙", GR: "希腊", IE: "爱尔兰",
};

async function readStats(body: any): Promise<Response> {
  const kv = await getKv();
  if (!kv) return json({ ok: false, error: "kv_unavailable" }, 503);

  const range = body.range === "year" ? "year" : "month";
  const key = String(body.key || "").slice(0, 10);
  if (!/^\d{4}(-\d{2})?$/.test(key)) return json({ ok: false, error: "bad_range" }, 400);
  const excludeSelf = !!body.excludeSelf;

  const start = ["v", key];
  const end = ["v", key + "\uffff"];

  let pv = 0, selfPv = 0;
  const cc = new Map<string, number>();
  const sc = new Map<string, number>();
  const rg = new Map<string, number>();
  const sr = new Map<string, number>();
  const uv = new Set<string>();
  const suv = new Set<string>();

  let cursor: string | undefined = undefined;
  let guard = 0;
  while (guard++ < 60) {
    const page: any = await kv.list({ start, end }, { limit: 1000, cursor });
    for await (const entry of page) {
      const k = entry.key as string[];
      const v = Number(entry.value || 0);
      const kind = k[2];
      if (kind === "pv") pv += v;
      else if (kind === "self") selfPv += v;
      else if (kind === "cc" && k[3]) cc.set(k[3], (cc.get(k[3]) || 0) + v);
      else if (kind === "sc" && k[3]) sc.set(k[3], (sc.get(k[3]) || 0) + v);
      else if (kind === "rg" && k[3]) rg.set(k[3], (rg.get(k[3]) || 0) + v);
      else if (kind === "sr" && k[3]) sr.set(k[3], (sr.get(k[3]) || 0) + v);
      else if (kind === "uv" && k[3]) uv.add(k[3]);
      else if (kind === "suv" && k[3]) suv.add(k[3]);
    }
    cursor = page.cursor;
    if (!cursor || page.list_complete) break;
  }

  let totalPv = pv;
  let totalUv = uv.size + suv.size;
  const countries: Array<{ code: string; name: string; count: number }> = [];
  const provinces: Array<{ name: string; count: number }> = [];

  if (excludeSelf) {
    totalPv = Math.max(0, pv - selfPv);
    totalUv = uv.size;
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
    pv: totalPv,
    uv: totalUv,
    selfPv,
    selfUv: suv.size,
    countries,
    provinces,
    excluded: excludeSelf,
  });
}

Deno.serve(async (request: Request): Promise<Response> => {
  const origin = request.headers.get("Origin") || "";
  if (origin !== ALLOW_ORIGIN) {
    return json({ ok: false, error: "forbidden_origin" }, 403);
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  // 访问密钥校验
  const appKey = request.headers.get("X-App-Key") || "";
  const expectedKey = Deno.env.get("APP_SECRET") || "";
  if (!expectedKey || appKey !== expectedKey) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const ip = request.headers.get("X-Forwarded-For") || "unknown";
  if (rateLimited(ip)) {
    return json({ ok: false, error: "rate_limited" }, 429);
  }

  let body: {
    action?: string;
    message?: string;
    files?: Array<{ path: string; content?: string; contentBase64?: string }>;
    deletes?: string[];
    self?: boolean;
    path?: string;
    range?: string;
    key?: string;
    excludeSelf?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "bad_json" }, 400);
  }
  if (!body || !body.action) {
    return json({ ok: false, error: "unknown_action" }, 400);
  }
  if (body.action === "track") return await trackVisit(request, body, ip);
  if (body.action === "stats") return await readStats(body);
  if (body.action !== "commit") {
    return json({ ok: false, error: "unknown_action" }, 400);
  }

  const OWNER = Deno.env.get("GITHUB_OWNER") || "happynine";
  const REPO = Deno.env.get("GITHUB_REPO") || "vape-collection";
  const BRANCH = Deno.env.get("GITHUB_BRANCH") || "main";
  const TOKEN = Deno.env.get("GITHUB_TOKEN") || "";
  const API = `https://api.github.com/repos/${OWNER}/${REPO}`;

  const ghHeaders: Record<string, string> = {
    Authorization: `Bearer ${TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
    "User-Agent": "vape-collection-deno",
  };

  async function gh(
    url: string,
    options: { method?: string; body?: string } = {},
  ): Promise<{ ok: boolean; status: number; data: any }> {
    const res = await fetch(url, { ...options, headers: ghHeaders });
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }
    return { ok: res.ok, status: res.status, data };
  }

  const message = String(body.message || "db: update").slice(0, 200);
  const files = Array.isArray(body.files) ? body.files : [];
  const deletes = Array.isArray(body.deletes) ? body.deletes : [];
  if (!files.length && !deletes.length) {
    return json({ ok: false, error: "empty_commit" }, 400);
  }

  // 路径白名单：只允许写 data/ 下文件，杜绝越权
  const safePath = (p: unknown): p is string =>
    typeof p === "string" &&
    /^data\/[A-Za-z0-9_\-./]+\.(json|png|jpg|jpeg|webp|gif|svg|ico)$/.test(p) &&
    !p.includes("..");
  for (const f of files) {
    if (!safePath(f?.path)) {
      return json({ ok: false, error: "unsafe_path", path: f?.path }, 400);
    }
  }
  for (const p of deletes) {
    if (!safePath(p)) return json({ ok: false, error: "unsafe_path", path: p }, 400);
  }

  const doCommit = async (): Promise<{ commitSha: string }> => {
    // 1. 分支 ref
    const refR = await gh(`${API}/git/ref/heads/${BRANCH}`);
    if (!refR.ok) throw new Error(`ref ${refR.status}`);
    const parentSha = refR.data.object.sha;

    // 2. 父 commit → base tree
    const comR = await gh(`${API}/git/commits/${parentSha}`);
    if (!comR.ok) throw new Error(`parent ${comR.status}`);
    const baseTreeSha = comR.data.tree.sha;

    // 3. 为每个文件创建 blob
    const treeItems: Array<Record<string, unknown>> = [];
    for (const f of files) {
      let contentB64: string;
      if (f.contentBase64 !== undefined) {
        contentB64 = String(f.contentBase64);
      } else {
        contentB64 = utf8ToBase64(String(f.content ?? ""));
      }
      const blobR = await gh(`${API}/git/blobs`, {
        method: "POST",
        body: JSON.stringify({ content: contentB64, encoding: "base64" }),
      });
      if (!blobR.ok) throw new Error(`blob ${blobR.status}`);
      treeItems.push({ path: f.path, mode: "100644", type: "blob", sha: blobR.data.sha });
    }

    // 删除项：tree 条目 sha=null
    for (const p of deletes) {
      treeItems.push({ path: p, mode: "100644", type: "blob", sha: null });
    }

    // 4. 新 tree
    const treeR = await gh(`${API}/git/trees`, {
      method: "POST",
      body: JSON.stringify({ base_tree: baseTreeSha, tree: treeItems }),
    });
    if (!treeR.ok) throw new Error(`tree ${treeR.status}`);

    // 5. commit
    const newComR = await gh(`${API}/git/commits`, {
      method: "POST",
      body: JSON.stringify({ message, tree: treeR.data.sha, parents: [parentSha] }),
    });
    if (!newComR.ok) throw new Error(`commit ${newComR.status}`);

    // 6. 更新 ref（fast-forward）
    const updR = await gh(`${API}/git/refs/heads/${BRANCH}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: newComR.data.sha, force: false }),
    });
    if (!updR.ok) {
      const err = new Error(`ref_update ${updR.status}`) as Error & { conflict?: boolean };
      err.conflict = updR.status === 409 || updR.status === 422;
      throw err;
    }
    return { commitSha: newComR.data.sha };
  };

  try {
    try {
      const r = await doCommit();
      return json({ ok: true, mode: "cloud", commitSha: r.commitSha });
    } catch (e) {
      if ((e as Error & { conflict?: boolean }).conflict) {
        const r = await doCommit();
        return json({ ok: true, mode: "cloud", commitSha: r.commitSha, retried: true });
      }
      throw e;
    }
  } catch (e) {
    return json({ ok: false, mode: "local", error: String((e as Error).message || e) }, 502);
  }
});
