# AGENTS.md

## 项目概述

Vape品牌商官网查找系统 — 帮助用户快速查找全球 Vape 品牌的官方网站、商城和集团信息。

### 技术栈
- **类型**: 纯静态站点（HTML/CSS/JS）
- **样式**: Tailwind CSS（CDN）
- **数据**: 内置 JSON 数据 + localStorage 用户数据
- **部署**: GitHub Pages

### 核心功能
- **三标签切换**：官网 / 商城 / 集团
- **官网标签**：品牌搜索（1s 防抖）、A-Z 字母筛选、主打地区筛选、品牌卡片（Logo + 英文名 + 中文名 + 主打地区 + 官网链接）、添加/编辑/导出
- **商城标签**：搜索、地区筛选（含国家详情）、商城卡片（Logo + 名称 + 国家地区 + 链接）、添加/编辑/导出
- **集团标签**：搜索、集团大卡片（Logo + 集团名 + 介绍 + 网址 + 子品牌列表）、子品牌可手动添加或关联官网已有品牌、添加/编辑/导出
- **身份验证**：添加/编辑/导出操作需 admin/funan 登录

## 目录结构

```
├── index.html        # 主页面（所有功能）
├── brands.js         # 356条品牌数据
├── DESIGN.md         # 设计规范
├── AGENTS.md         # 项目规范
└── .coze             # 部署配置
```

## 数据结构

### brands.js (BRANDS_DATA) — 官网数据
| 字段 | 类型 | 说明 |
|------|------|------|
| id | number | 唯一标识 |
| name_en | string | 英文名 |
| name_cn | string | 中文名 |
| url | string | 官网地址 |
| region | string | 主打地区 |
| level | number | 推荐等级(1-5) |
| logo | string | Logo(base64或空) |

### localStorage 键值
| 键 | 说明 |
|------|------|
| userBrands | 用户添加的官网品牌，格式同 BRANDS_DATA |
| brandOverrides | 用户编辑的内置品牌覆盖数据 |
| deletedBrands | 用户删除的内置品牌 ID 列表 |
| shopBrands | 商城数据 [{id, name_en, name_cn, url, region, country, logo}] |
| groupData | 集团数据 [{id, name, desc, url, logo, sub_brands: [{name, url, logo}]}] |

## 开发规范
- 单文件应用，所有逻辑在 index.html 中
- 品牌 UI 数据在 brands.js 中
- 使用 Tailwind CSS CDN，无需构建步骤
- 所有交互纯客户端，无需后端
- 三个标签各自独立渲染、独立编辑模式、独立导出
