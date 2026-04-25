# TeamPulse

TeamPulse 是一个面向 Claude Code 团队使用的 AI 协作面板。它用来查看团队成员当前正在做什么、最近做过什么，并支持跨设备同步项目记忆。

## 项目结构

```txt
apps/web/            Next.js 14 应用，UI 和 API Route 在同一个代码库里
packages/plugin/     Claude Code 插件，包含 hooks 和 MCP server
packages/teampulse-codex/
                     Codex 插件，包含 MCP server 和调试 CLI
docker-compose.yml   本地开发用 Postgres
```

## 本地开发

```bash
# 1. 启动 Postgres
docker-compose up -d postgres

# 2. 安装依赖
pnpm install

# 3. 初始化数据库结构
pnpm db:push        # 开发环境可直接推 schema
# 或者
pnpm db:migrate     # 使用已生成的迁移

# 4. 创建第一个管理员
pnpm create-admin
# 按提示输入 name / email / display name / password

# 5. 启动 Next.js
pnpm dev
# 打开 http://localhost:3000
```

## 使用流程

### 管理员初始化

1. 运行 `pnpm create-admin` 创建第一个管理员账号。
2. 打开 `http://localhost:3000/login` 登录。
3. 进入 `/admin/devices`，审批新注册的开发设备。

### 开发者接入

1. 在 Claude Code 中安装 TeamPulse 插件。
2. 在任意 git 仓库里打开 Claude Code。插件会自动注册设备，并在会话上下文里显示 6 位认领码，例如 `AB-CD-EF`。
3. 把认领码发给管理员。
4. 管理员在 `/admin/devices` 审批设备，并填写开发者用户名。
5. 插件轮询服务端，拿到 bearer token 后保存到 `~/.teampulse/credentials.json`。
6. 之后该仓库中的 Claude Code 会话会自动上报任务状态。

开发者不需要单独创建密码，也不需要手动移动凭据文件。

### Codex 接入

项目内置了一个 Codex 适配插件：`packages/teampulse-codex`。它复用 TeamPulse 的设备审批和 bearer token 机制，凭据同样保存到 `~/.teampulse/credentials.json`。

首次接入：

```bash
# 如果你的本地 TeamPulse 跑在 3002，先指定服务地址
TEAMPULSE_SERVER_URL=http://localhost:3002 pnpm codex:register

# 输出 claim_code 后，到 Web 面板 /admin/devices 审批该设备

TEAMPULSE_SERVER_URL=http://localhost:3002 pnpm codex:poll
pnpm codex:status
```

手动上报当前 Codex 任务：

```bash
pnpm --filter @teampulse/codex-plugin start-task -- \
  --intent "实现 Codex 接入" \
  --cwd /path/to/repo

pnpm --filter @teampulse/codex-plugin heartbeat -- \
  --file packages/teampulse-codex/mcp-server/index.js

pnpm --filter @teampulse/codex-plugin end-session
```

作为 Codex 插件安装时，插件声明在 `packages/teampulse-codex/.codex-plugin/plugin.json`，MCP 配置在 `packages/teampulse-codex/.mcp.json`。可用 MCP tools 包括：

- `teampulse_register_device`
- `teampulse_poll_device`
- `teampulse_status`
- `teampulse_start_task`
- `teampulse_heartbeat`
- `teampulse_end_session`
- `teampulse_list_active_tasks`
- `teampulse_recent_history`
- `teampulse_web_login`
- `teampulse_recent_events`

## 架构要点

- **Web 优先**：核心产品是团队面板，插件只是轻量接入层。
- **展示 presence，而不是自动判定冲突**：TeamPulse 只展示“谁在做什么”，具体是否协调由人和 Claude 决定。
- **单进程后端**：Next.js 14 App Router 同时承载页面和 API。SSE 使用进程内 `EventEmitter`，不依赖 Redis，适合小团队规模。
- **无 ML 依赖**：没有 embedding、pgvector 或 LLM judge。基础栈是 Postgres、Drizzle、Tailwind。
- **设备优先认证**：开发者设备自注册，管理员审批后插件拿到 bearer token。开发者偶尔访问 Web 时可通过 magic link 登录。

## 目录说明

```txt
apps/web/
  src/
    app/
      layout.tsx                     根布局
      page.tsx                       首页面板
      login/                         管理员密码登录
      admin/
        layout.tsx                   管理员导航和权限保护
        devices/page.tsx             设备审批页面
        users/page.tsx               用户管理页面
      projects/
        page.tsx                     项目列表
        [id]/page.tsx                项目详情，包含活跃任务和历史记录
        [id]/project-live.tsx        SSE 实时更新订阅
      activity/page.tsx              团队活动流和 CSV 导出
      team/page.tsx                  成员活动统计
      settings/                      个人资料、设备、记忆同步设置
      api/v1/
        auth/{login,logout,magic}/
        devices/{register,claim-code/[code]}/
        admin/devices/{,[id]/approve,[id]/revoke}/
        admin/users/{,[id],[id]/revoke}/
        projects/{,resolve,[id]}/
        tasks/{,[id],active,history,heartbeat,end-session}/
        memory/[projectId]/
        activity/export/
        stream/                      SSE fanout
    components/
      app-shell.tsx                  导航和页面外壳
      logout-button.tsx              登出按钮
    db/
      schema.ts                      Drizzle 表结构
      index.ts                       Drizzle 客户端
      migrate.ts                     `pnpm db:migrate` 入口
      migrations/                    已生成 SQL 迁移
    lib/
      auth.ts                        Session、bearer token、Argon2
      api.ts                         handler()、ApiError、鉴权工具
      presence.ts                    EventEmitter 事件总线
      sweep.ts                       abandoned task 清理
      env.ts
      utils.ts
  scripts/create-admin.ts

packages/plugin/
  .claude-plugin/plugin.json         hooks 和 MCP 声明
  skills/teampulse/SKILL.md          LLM 使用指引和 onboarding 文案
  hooks/
    session-start.js                 注册设备或注入活跃任务上下文
    on-prompt.js                     异步上报用户意图
    on-tool-use.js                   心跳和 files_touched 上报
    on-stop.js                       结束会话任务并同步记忆
    _stdin.js
  mcp-server/
    index.js                         MCP tools
    api-client.js                    HTTP 客户端
    auth.js                          凭据和设备注册
    memory-sync.js                   MEMORY.md 同步
    live-events.js                   SSE 订阅
    project-resolve.js               项目识别
    queue.js                         离线请求队列

packages/teampulse-codex/
  .codex-plugin/plugin.json          Codex 插件声明
  .mcp.json                          Codex MCP server 配置
  skills/teampulse-codex/SKILL.md    Codex 使用 TeamPulse 的行为指引
  mcp-server/index.js                Codex MCP tools
  bin/teampulse-codex.js             手动注册、上报、查询 CLI
```

## 已完成功能

- Phase 1：认证、设备注册、管理员审批流、插件骨架。
- Phase 2：Projects API、Tasks CRUD、SSE fanout、核心页面、活动流。
- Phase 3：
  - LWW 记忆同步：`/api/v1/memory/:projectId`，支持 ETag 和冲突检测。
  - 插件端 memory sync：SessionStart 拉取，Stop 推送，冲突时生成本地 conflict 文件。
  - Magic link 登录：`/api/v1/auth/magic` 和 `/magic` 页面。
  - `/settings/profile`、`/settings/devices`、`/settings/memory`。
  - `/admin/users` 支持 promote、demote、revoke。
  - 用户自助撤销设备：`DELETE /api/v1/devices/:id`。
  - Abandoned task sweep：每 60 秒清理一次，15 分钟无心跳视为 abandoned。
  - `.teampulse.json` 项目覆盖配置，以及 `paused_until` 暂停文件。
- Codex 接入：
  - `packages/teampulse-codex` Codex 插件声明。
  - MCP tools 支持注册设备、开始任务、心跳、结束会话、查询活跃任务和历史记录。
  - `teampulse-codex` CLI 支持手动接入和调试。
- 部署：
  - 多阶段 Dockerfile。
  - `docker-compose.prod.yml`：Postgres、migrate、app、Caddy、夜间备份。
  - Caddy 自动 TLS，并对 SSE 做长连接友好配置。
  - `.env.prod.example` 生产环境变量模板。

## 部署

```bash
# 1. 复制并填写生产环境变量
cp .env.prod.example .env.prod
${EDITOR:-vim} .env.prod

# 2. 构建镜像
docker build -f apps/web/Dockerfile -t teampulse-web:latest .

# 3. 启动服务，migrate 容器会先执行数据库迁移
docker-compose --env-file .env.prod -f docker-compose.prod.yml up -d
```

生产环境首次管理员初始化目前建议在能访问生产数据库的维护环境中执行：

```bash
TEAMPULSE_ADMIN_NAME=admin \
TEAMPULSE_ADMIN_EMAIL=you@company.com \
TEAMPULSE_ADMIN_PASSWORD='your-strong-password' \
DATABASE_URL='postgresql://USER:PASSWORD@HOST:5432/DB' \
pnpm --filter @teampulse/web create-admin
```

然后将 DNS 指向服务器，Caddy 会自动申请证书：

```txt
https://teampulse.internal.company.com
```

备份文件会每 24 小时写入 `./backups/`，默认保留 14 天。生产环境建议把该目录挂载到真实备份目标，例如 NAS 或对象存储同步目录。

## 常见问题

### Docker 没启动

```bash
# macOS + Colima
colima start --cpu 2 --memory 4 --disk 20
docker-compose up -d postgres

# macOS + Docker Desktop
open -a Docker && sleep 15
docker-compose up -d postgres
```

### 数据库结构不一致

```bash
pnpm db:push
# 或
pnpm db:generate && pnpm db:migrate
```

### 本地旧数据库还是旧名称

如果本地之前已经启动过旧数据库，`postgres-data/` 里可能还是旧用户和旧库。改名为 TeamPulse 后，新的 `.env.local` 会使用 `teampulse` 用户和库名，这时可能出现认证失败。

开发环境可以删除旧数据目录后重建：

```bash
docker-compose down
rm -rf postgres-data
docker-compose up -d postgres
pnpm db:push
```

### 端口冲突

默认 Postgres 端口是 `5432`。如有冲突，修改 `docker-compose.yml` 和 `apps/web/.env.local`。

## 开发备注

- `pnpm build` 会构建所有 workspace 包；Web 构建输出到 `apps/web/.next-build`，并在构建阶段跳过后台清理任务。
- `pnpm --filter @teampulse/web build` 只构建 Web 应用，同样使用 `apps/web/.next-build`，不会覆盖开发服务正在使用的 `apps/web/.next`。
- `pnpm dev` 使用默认的 `apps/web/.next`。如果之前手动构建导致开发服务异常，可删除 `apps/web/.next` 后重新运行 `pnpm dev`。
- `pnpm --filter @teampulse/web test:e2e` 运行端到端 smoke test，需要本地 Postgres 和 `pnpm dev` 已启动。
- `pnpm lint` 当前依赖 Next.js ESLint 配置；如需接入 CI，应先补齐 ESLint 配置文件。
