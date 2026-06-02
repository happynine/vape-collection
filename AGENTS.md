# 项目上下文

### 版本技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **Styling**: Tailwind CSS 4
- **Database**: Supabase (PostgreSQL)
- **Storage**: S3 兼容对象存储 (coze-coding-dev-sdk)

## 项目概述

Vape品牌商官网查找系统 — 帮助用户快速查找全球 Vape 品牌的官方网站信息。

### 核心功能
- **前台**：品牌搜索（实时搜索 + 防抖）、A-Z 字母筛选、主打地区筛选、品牌卡片展示（Logo + 英文名 + 中文名 + 主打地区）
- **后台**（/admin）：密码保护的管理面板（admin/funan），品牌增删改查、Logo 上传、发布/取消发布

## 目录结构

```
├── public/                 # 静态资源
├── scripts/                # 构建与启动脚本
├── src/
│   ├── app/
│   │   ├── page.tsx        # 前台首页（品牌查找）
│   │   ├── admin/page.tsx  # 后台管理面板
│   │   ├── layout.tsx      # 全局布局（暗色主题）
│   │   ├── globals.css     # 全局样式
│   │   └── api/
│   │       ├── brands/
│   │       │   ├── route.ts        # GET 品牌列表（支持搜索/筛选/分页）
│   │       │   ├── create/route.ts # POST 创建品牌
│   │       │   ├── seed/route.ts   # POST 批量导入种子数据
│   │       │   └── [id]/route.ts   # GET/PUT/DELETE 单个品牌
│   │       ├── upload/route.ts     # POST Logo 上传至对象存储
│   │       └── logo/route.ts       # GET Logo 预签名 URL
│   ├── components/ui/      # Shadcn UI 组件库
│   ├── hooks/              # 自定义 Hooks
│   ├── lib/utils.ts        # 通用工具函数 (cn)
│   ├── storage/database/
│   │   ├── supabase-client.ts      # Supabase 客户端
│   │   └── shared/schema.ts        # Drizzle ORM Schema
│   └── server.ts           # 自定义服务端入口
├── DESIGN.md               # 设计规范
├── next.config.ts          # Next.js 配置
├── package.json            # 项目依赖管理
└── tsconfig.json           # TypeScript 配置
```

## 数据库表结构

### brands 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | serial PK | 自增主键 |
| name_en | text NOT NULL | 英文名 |
| name_cn | text DEFAULT '' | 中文名 |
| url | text NOT NULL | 官网地址 |
| logo_key | text | Logo 存储键 |
| region | text DEFAULT '全球' | 主打地区 |
| level | integer DEFAULT 3 | 推荐等级(1-5) |
| is_published | integer DEFAULT 1 | 是否发布(0/1) |
| created_at | timestamptz | 创建时间 |
| updated_at | timestamptz | 更新时间 |

## API 接口清单

1. `GET /api/brands` — 获取品牌列表，支持 search/letter/region/page/pageSize/all 参数
2. `GET /api/brands/[id]` — 获取单个品牌详情
3. `POST /api/brands/create` — 创建品牌
4. `PUT /api/brands/[id]` — 更新品牌
5. `DELETE /api/brands/[id]` — 删除品牌
6. `POST /api/brands/seed` — 批量导入种子数据
7. `POST /api/upload` — 上传 Logo 至对象存储
8. `GET /api/logo?key=xxx` — 获取 Logo 预签名 URL

## 包管理规范

**仅允许使用 pnpm** 作为包管理器，**严禁使用 npm 或 yarn**。

## 开发规范

### 编码规范

- 默认按 TypeScript `strict` 心智写代码；优先复用当前作用域已声明的变量、函数、类型和导入
- 禁止隐式 `any` 和 `as any`；函数参数、返回值、解构项应有明确类型
- 前端动态内容必须使用 'use client' + useEffect + useState，避免 Hydration 错误

### next.config 配置规范

- 配置路径不要写死绝对路径，使用 path.resolve / import.meta.dirname / process.cwd() 动态拼接

### Hydration 问题防范

1. 严禁在 JSX 渲染逻辑中直接使用 typeof window、Date.now()、Math.random()
2. 必须使用 'use client' + useEffect + useState 确保动态内容仅在客户端挂载后渲染
3. 禁止非法 HTML 嵌套（如 <p> 嵌套 <div>）

## UI 设计与组件规范

- 使用 shadcn/ui 组件、风格和规范，位于 `src/components/ui/` 目录下
- 暗色主题为主，设计规范详见 DESIGN.md
