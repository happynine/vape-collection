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
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
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
  };
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "bad_json" }, 400);
  }
  if (!body || body.action !== "commit") {
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
