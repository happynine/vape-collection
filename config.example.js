// ============================================================
// 前端配置 — 把此文件复制为 config.js，填入信息
//   cp config.example.js config.js
// config.js 已被 .gitignore 忽略，不会提交到 GitHub
//
// 说明：GitHub Token 不再放在前端，仅保存在 Cloudflare Worker
//       服务端。前端只需要 Worker 地址和访问密钥。
// ============================================================
window.VAPE_CONFIG = {
  // GitHub 用户名（或组织名）
  GITHUB_OWNER: "happynine",
  // 仓库名
  GITHUB_REPO: "vape-collection",
  // 数据文件所在分支
  GITHUB_BRANCH: "main",
  // Cloudflare Worker 写入代理地址（部署 worker/worker.js 后获得）
  WORKER_URL: "https://YOUR_WORKER_SUBDOMAIN.workers.dev/",
  // 访问密钥，需与 Worker 后台配置的 APP_SECRET 完全一致
  WORKER_KEY: "YOUR_WORKER_KEY"
};
