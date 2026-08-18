# 云端数据配置指南（GitHub as Database）

本项目使用 GitHub 仓库作为云端数据库，数据以 JSON 文件存储在 `data/` 目录。
换电脑后只需浏览器打开同一页面，所有 Logo、中文名、新增品牌/商城/集团自动同步。

---

## 一次性配置（约 5 分钟）

### 第 1 步：生成 GitHub Token

1. 打开 https://github.com/settings/personal-access-tokens/new
2. **Token name**：`vape-collection-db`
3. **Expiration**：选 90 天或更长
4. **Repository access** → 选 **Only select repositories** → 勾选 `vape-collection`
5. **Repository permissions**：
   - **Contents** → 选 **Read and write**
6. 点 **Generate token**，复制生成的 `github_pat_...` 字符串

### 第 2 步：创建 config.js

在项目根目录复制配置模板：

```bash
cp config.example.js config.js
```

编辑 `config.js`，填入你的信息：

```js
window.VAPE_CONFIG = {
  GITHUB_OWNER: "happynine",       // 你的 GitHub 用户名
  GITHUB_REPO: "vape-collection",  // 仓库名
  GITHUB_BRANCH: "main",           // 分支名
  GITHUB_TOKEN: "github_pat_你的token"
};
```

### 第 3 步：生成初始数据文件

```bash
node scripts/init-data.mjs
```

这会生成 `data/brands.json`（807 个品牌）、`data/shops.json`（107 个商城）、`data/groups.json`（空）。

### 第 4 步：提交并推送

```bash
git add data/ scripts/ config.example.js db.js .gitignore SETUP.md
git commit -m "feat: add GitHub-based cloud storage"
git push
```

> **注意**：`config.js` 已被 `.gitignore` 忽略，不会被提交。

### 第 5 步：验证

用浏览器打开 `index.html`（或部署后的网址），右上角应显示绿色 **☁ 已同步** 徽标。

---

## 工作原理

| 操作 | 读 | 写 |
|------|-----|-----|
| 数据来源 | `raw.githubusercontent.com`（公开 CDN，无需 token） | GitHub Contents API（需要 token） |
| 速度 | 快，走 CDN 缓存 | 约 0.5-2 秒 |
| 离线 | localStorage 自动缓存 | 失败时暂存本地，不阻塞 UI |

### 数据流

```
用户编辑 → 内存更新 → UI 立即刷新
                ↓
         localStorage 缓存
                ↓
         GitHub API 异步写入
                ↓
         其他电脑刷新页面 → 从 raw.githubusercontent.com 读取最新数据
```

### 安全说明

- Token 有仓库权限限制（只能操作这一个仓库的 Contents）
- Token 有过期时间，到期后需重新生成
- `config.js` 不会提交到 GitHub
- 站点本身已有 admin/funan 密码门控

---

## 文件结构

```
vape-collection/
├── config.example.js   ← 配置模板（提交到 GitHub）
├── config.js           ← 你的真实配置（不提交，含 token）
├── db.js               ← 云端数据层
├── index.html          ← 主页面
├── brands.js           ← 内置品牌数据（降级用）
├── data/               ← 云端数据文件
│   ├── brands.json
│   ├── shops.json
│   └── groups.json
└── scripts/
    └── init-data.mjs   ← 一次性数据生成脚本
```
