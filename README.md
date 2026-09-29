# TeamPulse

TeamPulse 是一个面向团队 Agent 协作的 AI 工作面板。它用来查看成员当前正在做什么、最近做过什么，并支持 Codex、Claude Code 以及能执行终端命令的通用 Agent 接入。

## 项目结构

```txt
apps/web/            Next.js 14 应用，UI 和 API Route 在同一个代码库里
packages/plugin/     Claude Code 插件，包含 hooks 和 MCP server
packages/teampulse-codex/
                     Codex 插件，包含 MCP server 和调试 CLI
packages/teampulse-agent/
                     可分发给普通成员的 Agent Skill，负责写入本机凭据
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
3. 在成员管理中创建团队账号。每个成员用自己的账号登录后，在 `/settings/connect` 认领自己的设备。

### 开发者接入

1. 登录自己的 TeamPulse 账号，打开 `/settings/connect`。
2. 根据页面选择 Agent 类型：Codex、Claude Code 或 OpenClaw / 通用 Agent。
3. 推荐让 Agent 使用 TeamPulse Agent Skill 注册设备，拿到 `claim_code`。
4. 把 `claim_code` 填到“我的接入”页面。哪个账号提交认领码，设备就归属到哪个账号。
5. 绑定后让 Agent 执行 poll，Skill 会领取 token 并写入 `~/.teampulse/credentials.json`。
6. 后续该设备上报的任务、心跳和文件触碰记录都会归到当前账号下。

管理员仍可在 `/admin/devices` 查看待认领设备，并在必要时代为绑定。

### Agent Skill 接入

正式给团队成员使用时，不要求他们拥有 TeamPulse 项目源码。把 `packages/teampulse-agent` 发布到 Skillhub 或其它 Skill 分发渠道即可。

Skill 内置 `scripts/teampulse-connect.mjs`，负责：

1. 注册设备并把 `device_secret` 暂存到 `~/.teampulse/device.json`。
2. 返回 `claim_code` 给用户绑定。
3. 绑定后领取 token。
4. 写入 `~/.teampulse/credentials.json` 并删除临时 `device.json`。

没有 Skill 平台时，也可以从 TeamPulse Web 下载独立连接脚本：

```bash
mkdir -p "$HOME/.teampulse/bin"
curl -fsSL "http://localhost:3002/agent/teampulse-connect.mjs" \
  -o "$HOME/.teampulse/bin/teampulse-connect.mjs"
chmod 700 "$HOME/.teampulse/bin/teampulse-connect.mjs"

node "$HOME/.teampulse/bin/teampulse-connect.mjs" register --server-url http://localhost:3002
# 把输出的 claim_code 填到 /settings/connect
node "$HOME/.teampulse/bin/teampulse-connect.mjs" poll --server-url http://localhost:3002
node "$HOME/.teampulse/bin/teampulse-connect.mjs" status
```

后续 TeamPulse 服务升级后，已安装连接脚本的用户不需要重新认领设备。连接脚本会在日常任务命令启动时自动检查并更新自身；需要立即强制更新时也可以手动执行：

```bash
node "$HOME/.teampulse/bin/teampulse-connect.mjs" update
node "$HOME/.teampulse/bin/teampulse-connect.mjs" version
```

自动更新和 `update` 都会优先使用 `~/.teampulse/credentials.json` 里的 `server_url` 下载最新版脚本，并保留现有凭据。通过 Skillhub 或其它 Skill 分发渠道安装的用户，连接脚本可自更新；Skill 本体是否自动更新取决于分发平台。

### curl 协议

curl 是底层协议，适合理解和调试；正式使用建议由 Agent Skill 封装并写入凭据。

```bash
# 1. Agent 在本机注册设备
curl -sS -X POST "http://localhost:3002/api/v1/devices/register" \
  -H "Content-Type: application/json" \
  -d "{\"hostname\":\"$(hostname)\",\"os\":\"$(uname -s)\"}"

# 响应里会返回 claim_code 和 device_secret：
# {"device_id":"...","claim_code":"AB-CD-EF","device_secret":"...","status":"pending"}
```

用户登录 TeamPulse 后，把 `claim_code` 填到 `/settings/connect`。绑定完成后，Agent 再领取 token：

```bash
CLAIM_CODE="AB-CD-EF"
DEVICE_SECRET="把注册响应里的 device_secret 粘到这里"

curl -sS -X POST "http://localhost:3002/api/v1/devices/claim-code/$CLAIM_CODE" \
  -H "Content-Type: application/json" \
  -d "{\"device_secret\":\"$DEVICE_SECRET\"}"
```

### Codex 接入

普通 Codex 用户使用 TeamPulse Agent Skill 接入，不需要 TeamPulse 项目源码。
`packages/teampulse-codex` 是本仓库维护者调试 Codex MCP tools 用的源码包。

### Claude Code 接入

仓库内的 Claude Code 插件位于 `packages/plugin`，插件声明文件是 `packages/plugin/.claude-plugin/plugin.json`。

1. 在 Claude Code 中安装或启用该插件。
2. 重启 Claude Code，并在任意 git 仓库打开会话。
3. 会话上下文出现 `[TeamPulse 待认领]` 时，把 Claim code 填到 `/settings/connect`。
4. 再开启一次 Claude Code 会话，插件会自动领取凭据并开始上报任务。

### OpenClaw / 通用 Agent 接入

只要 Agent 能执行终端命令，就走 TeamPulse Agent Skill。通过 Skillhub 这类商店分发后，Agent 只需要按 Skill 流程注册、等待用户绑定、poll 并写入凭据。

手动上报当前 Codex 任务：

```bash
pnpm --filter @teampulse/codex-plugin start-task -- \
  --intent "实现 Codex 接入" \
  --cwd /path/to/repo

pnpm --filter @teampulse/codex-plugin heartbeat -- \
  --file packages/teampulse-codex/mcp-server/index.js

pnpm --filter @teampulse/codex-plugin end-session -- \
  --summary "Changed: ...; Verified: ...; Risks: ...; Next: ..."
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
- `teampulse_send_message`
- `teampulse_reply`
- `teampulse_inbox`
- `teampulse_resolve_overlap`
- `teampulse_web_login`
- `teampulse_recent_events`

## 架构要点

- **Web 优先**：核心产品是团队面板，插件只是轻量接入层。
- **展示 presence，而不是自动判定冲突**：TeamPulse 只展示“谁在做什么”，具体是否协调由人和 Claude 决定。
- **单进程后端**：Next.js 14 App Router 同时承载页面和 API。SSE 使用进程内 `EventEmitter`，不依赖 Redis，适合小团队规模。
- **工作项与分诊分开**：工作项状态由服务端状态机约束。模型只返回分诊建议，不直接改优先级、指派或阶段。
- **账号认领认证**：开发者设备自注册后生成认领码，由当前登录账号在 `/settings/connect` 确认绑定。插件拿到 bearer token 后保存本机凭据。

## 项目说明

TeamPulse 记录两件事：Agent 此刻在改什么，以及一项需求走到了哪一步。

实时页面按心跳列出正在进行的任务、分支和碰过的文件。同一项目里的文件重叠、分支风险会单独标出，处理方式是确认、移交或暂停。需求则走工作项：录入、澄清、就绪、指派、进行、待验收、通过，也可以打回或取消。一次 Agent 会话先挂到工作项上，完成后再作为验收材料。

JEV 分诊给工作项四项建议：优先级、是否要先澄清、是否适合交给 Agent、交付风险。建议写入工作项事件。负责人可以采纳优先级，或把刚录入的事项转入澄清；采纳只对当前版本有效。验收可以由人、Agent 或双方完成，执行者不能审核自己的工作项，通过时要逐条勾选验收标准。

实现上，Next.js 同时提供页面和 API。登录态用 session，设备用 bearer token。Postgres 保存用户、设备、项目、任务、工作项和事件；工作项带版本号，阶段转换由服务端检查。心跳和文件记录通过 SSE 推到页面，重叠直接比较同一项目里仍在心跳的任务。

Claude Code 通过 hooks 上报，Codex 通过 MCP，其他 Agent 通过一个 Node 脚本上报。模型密钥留在面板服务端。分诊请求会截断描述和验收标准，每个用户每小时 10 次；模型超时或结果无法解析时，这次分析不入库。连接脚本可以单独更新，设备凭据仍留在本机。

## 部署说明

面板用 Docker 部署。Agent 装在成员自己的电脑上。

```bash
cp .env.prod.example .env.prod
docker build -f apps/web/Dockerfile.base -t teampulse-node-base:22-bookworm .
docker build -f apps/web/Dockerfile --build-arg BASE_IMAGE=teampulse-node-base:22-bookworm -t teampulse-web:latest .
docker-compose --env-file .env.prod -f docker-compose.prod.yml up -d
```

生产变量、自动部署和回滚见下方「部署」。

成员安装对应 Skill 后，Agent 注册设备并给出认领码。成员登录网页，在 `/settings/connect` 绑定认领码，Agent 再领取 token，写入 `~/.teampulse/credentials.json`。

分诊模型跑在两台 DGX Spark 上，每台是 NVIDIA GB10、128GB 统一内存。系统驱动是 NVIDIA 580.173.02，CUDA SDK 13.0.3，容器运行时是 NVIDIA Container Toolkit 1.19.0，Kubernetes 使用 `nvcr.io/nvidia/k8s-device-plugin:v0.19.1` 分配 GPU。两台用 tensor parallel 组成一组，编译目标是 GB10 的 CUDA 架构 `12.1a`。

JEV 分诊使用 `GLM-5.3-Flash-EXL3`：

| 参数 | 值 |
| --- | --- |
| 权重 | `Mia-AiLab/GLM-5.3-Flash-EXL3-TR3-4bpw` |
| 运行时 | vLLM，`quantization=exl3`，`load-format=instanttensor` |
| 并行 | `tensor-parallel-size=2`，`nnodes=2` |
| 上下文 | `max-model-len=262144` |
| KV cache | FP8，5 GiB |
| 显存比例 | `gpu-memory-utilization=0.80` |
| 并发 | `max-num-seqs=4`，`max-num-batched-tokens=1024` |
| 投机解码 | DFlash，`num_speculative_tokens=7`，草稿模型 `incoai/GLM-5.3-Flash-DFlash2` |
| 单机资源 | 1 GPU，内存请求 96Gi、上限 116Gi |

同一对 Spark 上还配置了 `qwen3.8-flash-next`，权重是 `RadixArk/Qwen3.8-Flash-Next-NVFP4`，用 SGLang 运行。量化 `modelopt_fp4`，GEMM 后端 `flashinfer_cutlass`，同样是两机 `tp-size=2`，上下文 262144，静态显存比例 0.80。投机解码使用 NEXTN，3 步、4 个草稿 token。这份部署当前副本数是 0。

针对这两台 Spark 的配置：

- 单机 128GB 统一内存装不下目标模型，所以用两机 `tensor parallel`，节点间走 NCCL，通道数限制为 4。
- 量化分别使用 EXL3 4-bit 和 NVFP4，KV cache 使用 FP8，把显存留给 256K 上下文。
- 静态显存比例设为 0.80，并设置内存保护；可用内存过低时停止服务，避免 GB10 被统一内存打满。
- 并发限制为 4 个序列。GLM 的预填批次是 1024 token，Qwen 的分块预填是 4096 token。
- 投机解码用来降低解码延迟：GLM 使用 DFlash，一次 7 个草稿 token；Qwen 使用 NEXTN，3 步、4 个草稿 token。
- CUDA graph 只覆盖小 batch，Qwen 关闭了预填阶段的 CUDA graph 和 radix cache。
- 容器里设置 `CUDA_MODULE_LOADING=LAZY`，并分别配置 vLLM 与 FlashInfer 的编译缓存。

服务对外提供 OpenAI 兼容接口。TeamPulse 这样接入：

```bash
JEV_BASE_URL=http://<spark-gateway>/v1
JEV_MODEL=GLM-5.3-Flash-EXL3
JEV_API_KEY=
```

请求发往 `${JEV_BASE_URL}/chat/completions`，回答必须是规定的 JSON。没有本地地址时使用 TypeSafe。

三份 Skill 对应三种运行方式：

- `packages/teampulse-agent/SKILL.md`：能执行终端命令的 Agent，使用 Node 连接脚本。
- `packages/plugin/skills/teampulse/SKILL.md`：Claude Code，使用 hooks 和 MCP。
- `packages/teampulse-codex/skills/teampulse-codex/SKILL.md`：Codex，使用 MCP 和调试 CLI。

开始一项具体工作时上报任务，改文件后发心跳，遇到重叠先按返回的协调动作处理，结束时提交结果。

## 技术栈

| 层 | 使用 |
| --- | --- |
| 面板 | Next.js 14、React 18、Postgres、Drizzle、Tailwind、Docker、Caddy |
| Agent | Claude Code hooks 与 MCP、Codex MCP、Node.js、Agent Skills |
| 分诊 | 两台 DGX Spark 上的 vLLM / SGLang；未配置本地地址时用 TypeSafe `jev-latest` |
| NVIDIA | 驱动 580.173.02、CUDA SDK 13.0.3、Container Toolkit 1.19.0、k8s-device-plugin v0.19.1、NCCL、GB10 `sm_121`、vLLM、SGLang、FlashInfer、EXL3、NVFP4、FP8 KV cache |

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
        devices/page.tsx             设备管理页面
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

packages/teampulse-agent/
  SKILL.md                           普通 Agent 接入 TeamPulse 的 Skill
  scripts/teampulse-connect.mjs      无源码环境下注册、poll、写入凭据
```

## 已完成功能

- Phase 1：认证、设备注册、账号认领流、插件骨架。
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
- Agent Skill 接入：
  - `packages/teampulse-agent` 可发布到 Skillhub 或其它 Skill 分发渠道。
  - `teampulse-connect.mjs` 支持无源码环境下注册设备、等待账号认领、领取 token、写入本机凭据。
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

# 2. 构建基础镜像。服务器上已有 node:22-bookworm 时，这一步很快；
#    后续应用镜像会复用这个基础镜像，不再反复安装系统依赖。
docker build -f apps/web/Dockerfile.base -t teampulse-node-base:22-bookworm .

# 3. 构建应用镜像。如果挂在域名子路径下，把 NEXT_PUBLIC_BASE_PATH 一起传入。
docker build \
  -f apps/web/Dockerfile \
  --build-arg BASE_IMAGE=teampulse-node-base:22-bookworm \
  --build-arg PUBLIC_APP_URL="${PUBLIC_APP_URL:-http://localhost:3000}" \
  --build-arg NEXT_PUBLIC_BASE_PATH="${NEXT_PUBLIC_BASE_PATH:-}" \
  -t teampulse-web:latest .

# 4. 启动服务，migrate 容器会先执行数据库迁移
docker-compose --env-file .env.prod -f docker-compose.prod.yml up -d
```

### Gitea Actions 自动部署

仓库包含 `.gitea/workflows/deploy.yml`。Gitea 实例和当前仓库都启用 Actions，
且有可用的 `ubuntu-latest` act runner 后，每次 push 到 `main` 会打包当前 commit，
上传到生产机，并在生产机执行
`scripts/deploy/remote-deploy.sh`：

1. 保留生产机上的 `.env.prod`、`.env.app`、`docker-compose.deploy.yml` 和
   `backups/`。
2. 替换 `/opt/teampulse` 为新版本，并保留最近 3 个
   `/opt/teampulse.prev.*` 回滚目录。
3. 构建 `teampulse-web:latest`。
4. 执行数据库迁移并重启 `postgres`、`migrate`、`app` 三个 TeamPulse 服务。
5. 通过 `http://127.0.0.1:${APP_PORT}${NEXT_PUBLIC_BASE_PATH}/agent/skill.md`
   做健康检查。

需要在 Gitea 仓库 Settings → Actions → Secrets 配置：

- `DEPLOY_SSH_KEY`：推荐，能登录生产机的私钥内容。
- 或 `DEPLOY_PASSWORD`：备用，生产机 SSH 密码。

如果两个 secret 都没有配置，workflow 会正常跳过部署，避免首次 push 直接失败。

可选 secrets：

- `DEPLOY_HOST`：默认 `118.195.165.111`。
- `DEPLOY_USER`：默认 `root`。
- `DEPLOY_DIR`：默认 `/opt/teampulse`。

生产机如果有额外端口映射，放在 `/opt/teampulse/docker-compose.deploy.yml`。
当前 111 服务器用它把 app 暴露为 `${APP_PORT:-13002}:3000`，避免影响宿主机
上已占用 `3000` 的其它容器。

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
