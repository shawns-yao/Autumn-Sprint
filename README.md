# 秋招速递

秋招速递是一套面向个人求职者的本地优先招聘流程工作台。它把公司、岗位、投递记录、招聘节点、面试复盘、笔记和求职资源放在一个连续的工作空间中，帮助使用者看清每个机会当前走到哪一步、下一步是什么，以及哪些事项需要跟进。

项目以岗位为核心组织数据。同一家公司可以维护多个岗位，并保留志愿顺序；每个岗位拥有独立的招聘流程，可记录初筛、测评、笔试、面试、Offer 和终止结果。总览页提供当前流程分布、历史投递漏斗、投递趋势和即将到来的节点，适合快速判断整体进度。

项目地址：<https://github.com/shawns-yao/Autumn-Sprint>

## 项目特点

- **本地优先**：岗位、笔记、附件和设置保存在本机 SQLite 数据库中。
- **流程可追踪**：招聘节点支持状态、日期、时间、地点、链接、结果和复盘内容。
- **多岗位管理**：同一家公司可关联多个岗位，并按志愿顺序组织。
- **总览清晰**：用统计卡片、流程分布、投递漏斗、趋势图和近期节点呈现求职状态。
- **笔记与资源集中管理**：笔记可以关联岗位，招聘网站和投递入口统一保存。
- **数据保护**：支持版本冲突保护、软删除、附件管理和生产环境安全响应头。
- **可选 AI 配置**：支持配置兼容 OpenAI 接口格式的模型服务，用于辅助求职整理。

## 页面

| 页面 | 用途 |
| --- | --- |
| 首页 | 进入主要工作区 |
| 投递总览 | 查看整体进度、漏斗、趋势和即将到来的节点 |
| 岗位 | 搜索、筛选和管理公司及岗位 |
| 岗位详情 | 编辑基本信息、招聘流程、面试记录、复盘和附件 |
| 笔记 | 管理求职笔记并关联岗位 |
| 投递资源 | 保存招聘官网、投递入口和实用链接 |
| 设置 | 配置提醒、AI 服务和数据导出 |

## 技术栈

- React、TypeScript、Vite
- Node.js 原生 HTTP 服务
- SQLite、`better-sqlite3`
- Tiptap 富文本编辑器
- `lucide-react` 图标库
- Docker Compose、Caddy

## 本地运行

### 环境要求

- Node.js 24 或兼容当前依赖的较新版本
- npm

### 安装与启动

```bash
npm ci

# 终端一：启动 API
npm run api

# 终端二：启动前端
npm run dev
```

前端默认地址为 `http://localhost:5173`，API 默认地址为 `http://127.0.0.1:8787`。前端 API 地址可以通过 `VITE_API_BASE_URL` 配置。

## Docker 部署

项目提供 API 和网页两个容器。SQLite 数据通过数据卷持久化，Caddy 负责 HTTPS 和入口认证。

```bash
cp .env.example .env
docker compose up -d --build
```

`.env` 需要配置 `DOMAIN`、`BASIC_AUTH_USER` 和 `BASIC_AUTH_PASSWORD_HASH`。如需使用 AI 服务，再配置 `AI_API_KEY`。

## 常用脚本

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动 Vite 开发服务器 |
| `npm run api` | 启动本地 API 服务 |
| `npm run build` | 类型检查并构建生产前端 |
| `npm run preview` | 预览生产构建 |
| `npm run test:targeted` | 执行后端定向测试 |
| `npm run db:import` | 导入旧数据 |

## 数据与隐私

项目默认将业务数据保存在本机，不会自动同步到 GitHub 或其他云端服务。数据库、附件、导出文件和环境变量都可能包含个人求职信息，不应提交到公开仓库。

建议将以下内容保留在本地：

- `data/` 下的数据库和备份
- `.env` 及密钥文件
- `Log/`、`Temp/` 和测试输出
- 从设置页导出的岗位、笔记、资源和设置 JSON

## 项目结构

```text
Autumn Sprint/
├─ Config/             # Caddy 配置
├─ Image/              # 参考图与设计素材
├─ public/             # 前端静态资源
├─ scripts/            # 导入脚本
├─ server/             # API、SQLite 和数据存储
├─ src/                # React 页面、组件和样式
├─ Test/               # 定向测试
├─ Dockerfile
├─ compose.yaml
├─ package.json
└─ README.md
```
