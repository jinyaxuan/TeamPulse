export type AgentDisplayDevice = {
  agent_name: string | null;
  agent_type: string | null;
  hostname: string | null;
};

export type EditableAgentDevice = AgentDisplayDevice & {
  id: string;
  agent_role: string | null;
  capabilities: string[];
  os: string | null;
};

export function agentTypeLabel(type: string | null): string {
  if (type === "codex") return "Codex";
  if (type === "claude-code") return "Claude Code";
  if (type === "openclaw") return "OpenClaw";
  if (type === "generic") return "通用 Agent";
  return "未设置";
}

export function agentDisplayName(device: AgentDisplayDevice): string {
  return device.agent_name || device.hostname || "未命名 Agent";
}
