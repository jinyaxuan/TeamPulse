# TeamPulse 项目及报告书

仓库：https://github.com/jinyaxuan/TeamPulse

演示视频：见仓库 Release `demo-20260928` 附件 `teampulseDemo.mov`（时长约 3 分 20 秒）

## 1. 项目是什么

TeamPulse 是一个面向团队 Agent 协作的工作面板。它显示谁正在做什么、改了哪些文件、一项需求走到了哪一步，以及验收依据。

支持接入 Codex、Claude Code，以及任何能执行终端命令的通用 Agent。成员不需要拿到本仓库源码，用独立连接脚本或 Agent Skill 即可注册设备、认领账号并持续上报。

## 2. 为什么做

团队开始同时使用多个编码 Agent 之后，原有的看板和即时消息不够用。Agent 的工作发生在本机终端里，默认没有共享状态。结果通常是三件事：

- 两个人或两个 Agent 同时改同一批文件，直到提交时才发现冲突。
- 需求停在聊天记录里，没有负责人、验收标准和阶段。
- 做完以后只剩一段对话，无法回溯谁做的、依据什么通过验收。

TeamPulse 把这三件事收成同一条记录：实时任务、持久工作项、可审计的决策。

## 3. 做了什么

### 3.1 实时协作

- Agent 上报当前任务、分支和触碰的文件，面板按心跳区分“正在做”和“最近做过”。
- 检测同一项目里的文件重叠和分支风险，并支持确认、移交或暂停。
- 设备通过认领码绑定到具体账号，后续任务归到这个人，而不是归到某台匿名机器。
- 保留任务历史，可筛选并导出，便于复盘。

### 3.2 工作项生命周期

一条需求或任务按固定阶段推进：

`intake → clarifying → ready → assigned → in_progress → awaiting_acceptance → accepted`

也可以进入 `rejected` 或 `cancelled`。阶段转换在服务端校验，不能从任意状态跳到任意状态。

工作项包含标题、描述、验收标准、优先级、负责人、验收人和验收策略。验收策略可以是人工、Agent，或两者都要通过。Agent 不能给自己验收。通过时必须逐条确认验收标准。

执行会话要先挂到工作项上，至少有一条已完成的会话，才能提交验收。验收意见、证据和知识草稿都留在工作项上。

### 3.3 JEV 分诊建议

JEV 给工作项提供分诊建议。项目默认关闭。Owner 或管理员在网页里打开后，分析会把工作项类型、标题、描述、验收标准、当前阶段和优先级发给模型。配置 `JEV_BASE_URL` 时使用本地 OpenAI 兼容服务，否则使用 TypeSafe 的 `jev-latest`。

它返回四项建议：优先级、是否需要澄清、Agent 适配度、交付风险，并带置信度。结果只写入审计事件，不改工作项。

负责人可以显式采纳其中一项，且必须对应当前版本：

- 采纳优先级。待验收、已验收、已取消的工作项不能改。
- 把处于 `intake` 的工作项转入澄清。

每次分析都记 `jev_requested` 和 `jev_triaged`，采纳记 `jev_adopted`。开关变更另记项目策略事件。同一用户每小时最多 10 次。

### 3.4 接入与部署

- Web 与 API 同仓，技术栈是 Next.js、Postgres、Drizzle。
- Codex 侧提供 MCP 工具，包括查询工作项、发起 JEV 分析、提交验收和记录评审。发起外部分析必须显式确认 `confirm_external_transfer`。
- 连接脚本可自更新，升级服务时不必重新认领设备。
- 提供 Docker 部署、邀请注册、OIDC 登录和套餐限额。

## 4. 部署与模型

面板用 Docker 部署。Agent 运行在成员本机，通过认领码接入。

`JEV_BASE_URL` 指向本地 OpenAI 兼容服务，`JEV_MODEL` 指定模型，分诊请求发往 `${JEV_BASE_URL}/chat/completions`。未配置时使用 TypeSafe。DGX Spark 上的 NVIDIA NIM、TensorRT-LLM 和 StepFun 启动后，把地址填进 `JEV_BASE_URL`。

Agent Skill：

- `packages/teampulse-agent/SKILL.md`
- `packages/plugin/skills/teampulse/SKILL.md`
- `packages/teampulse-codex/skills/teampulse-codex/SKILL.md`

## 5. 范围

- 分诊给出优先级、澄清概率、Agent 适配度和交付风险，不直接修改工作项。
- 描述最多 4000 字，验收标准最多 10 条。
- 演示视频放在 Release `demo-20260928`。

## 6. 本地运行

```bash
docker-compose up -d postgres
pnpm install
pnpm db:push
pnpm create-admin
pnpm dev
```

打开 http://localhost:3000 。生产密钥只放在环境变量里，仓库仅提供 `.env.prod.example` 和 `apps/web/.env.example`。
