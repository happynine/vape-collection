# AGENTS.md

## 项目概述

Vape品牌商官网查找系统 — 帮助用户快速查找全球 Vape 品牌的官方网站信息。

### 技术栈
- **类型**: 纯静态站点（HTML/CSS/JS）
- **样式**: Tailwind CSS（CDN）
- **数据**: 内置 JSON 数据 + localStorage 用户数据
- **部署**: GitHub Pages

### 核心功能
- **前台**：品牌搜索（实时搜索 + 1s 防抖）、A-Z 字母筛选、主打地区筛选、品牌卡片展示（Logo + 英文名 + 中文名 + 主打地区）
- **添加功能**：右下角固定"添加"按钮 → 弹窗表单 → 保存至 localStorage

## 目录结构

```
├── index.html        # 主页面（所有功能）
├── brands.js         # 328条品牌数据
├── DESIGN.md         # 设计规范
├── AGENTS.md         # 项目规范
└── .coze             # 部署配置
```

## 数据结构

### brands.js (BRANDS_DATA)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | number | 唯一标识 |
| name_en | string | 英文名 |
| name_cn | string | 中文名 |
| url | string | 官网地址 |
| region | string | 主打地区 |
| level | number | 推荐等级(1-5) |
| logo | string | Logo(base64或空) |

### localStorage (userBrands)
用户添加的品牌存储在 `localStorage.userBrands`，格式与 BRANDS_DATA 相同。

## 开发规范
- 单文件应用，所有逻辑在 index.html 中
- 品牌 UI 数据在 brands.js 中
- 使用 Tailwind CSS CDN，无需构建步骤
- 所有交互纯客户端，无需后端
