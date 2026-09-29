# TeamPulse 项目及报告书

仓库：https://github.com/jinyaxuan/TeamPulse

演示视频：见仓库 Release `demo-20260928` 附件 `teampulseDemo.mov`（时长约 3 分 20 秒）

## 1. 项目

TeamPulse 给同一个项目里的人和编码 Agent 提供一块面板。Agent 上报当前任务、分支和碰过的文件，面板按心跳区分正在进行和最近完成的工作，并标出文件重叠与分支风险。一项需求则保留负责人、验收标准和阶段，做完后留下验收意见。

Codex、Claude Code 和能执行终端命令的 Agent 都可以接入。成员不需要本仓库源码，用 Agent Skill 或连接脚本注册设备，再用认领码把设备绑到自己的账号。

## 2. 工作项与分诊

工作项阶段为：

`intake → clarifying → ready → assigned → in_progress → awaiting_acceptance → accepted`

也可以进入 `rejected` 或 `cancelled`。阶段转换在服务端检查。工作项包含标题、描述、验收标准、优先级、负责人和验收人。验收可以由人、Agent 或双方完成；执行者不能审核自己的工作项，通过时要逐条确认验收标准。执行会话先挂到工作项上，至少有一条已完成的会话，才能提交验收。

JEV 在项目打开后，把工作项类型、标题、描述、验收标准、当前阶段和优先级发给模型，返回优先级、是否需要澄清、Agent 适配度和交付风险。描述最多 4000 字，验收标准最多 10 条，每个用户每小时最多 10 次。结果写入 `jev_triaged`。负责人可以采纳当前版本上的一条建议：调整优先级，或把处于 `intake` 的工作项转入澄清。采纳记为 `jev_adopted`。

## 3. 部署

面板用 Docker 部署，技术栈是 Next.js、Postgres、Drizzle。Agent 运行在成员本机。连接脚本可以单独更新，已认领的设备不用重新绑定。

JEV 使用两台 DGX Spark，每台 NVIDIA GB10、128GB 统一内存。驱动 580.173.02，CUDA SDK 13.0.3，NVIDIA Container Toolkit 1.19.0，GPU 由 `nvcr.io/nvidia/k8s-device-plugin:v0.19.1` 分配。两机通过 NCCL 做 tensor parallel，通道数 4，编译目标 `12.1a`。显存比例 0.80，上下文 262144，KV cache 为 FP8，同时最多 4 个序列。可用内存过低时服务停止。

`GLM-5.3-Flash-EXL3` 由 vLLM 加载 `Mia-AiLab/GLM-5.3-Flash-EXL3-TR3-4bpw`，量化 EXL3，预填批次 1024 token，并用 DFlash 一次取 7 个草稿 token。`qwen3.8-flash-next` 由 SGLang 加载 `RadixArk/Qwen3.8-Flash-Next-NVFP4`，量化 NVFP4，分块预填 4096 token，投机解码使用 NEXTN。

`JEV_BASE_URL` 指向该服务，`JEV_MODEL` 填 `GLM-5.3-Flash-EXL3`。未设置时使用 TypeSafe 的 `jev-latest`。

Agent Skill：

- `packages/teampulse-agent/SKILL.md`
- `packages/plugin/skills/teampulse/SKILL.md`
- `packages/teampulse-codex/skills/teampulse-codex/SKILL.md`

## 4. 本地运行

```bash
docker-compose up -d postgres
pnpm install
pnpm db:push
pnpm create-admin
pnpm dev
```

打开 http://localhost:3000 。生产密钥只放在环境变量里，仓库仅提供 `.env.prod.example` 和 `apps/web/.env.example`。
