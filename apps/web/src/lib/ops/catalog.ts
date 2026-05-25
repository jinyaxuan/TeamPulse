export type OpsService = {
  key: string;
  name: string;
  group: "core" | "business" | "infra";
  description: string;
  owner: string;
  repo: string;
  ref: string;
  workflow?: string;
  namespace: string;
  deployment: string;
  argocdApp: string;
  manifestPath: string;
  publicUrl?: string;
  tags: string[];
  notes?: string;
};

export const opsServices: OpsService[] = [
  {
    key: "teampulse",
    name: "TeamPulse",
    group: "core",
    description: "Agent 协作与任务态势入口。",
    owner: "kindong",
    repo: "TeamPulse",
    ref: "main",
    workflow: "deploy.yml",
    namespace: "devops",
    deployment: "teampulse-web",
    argocdApp: "devops",
    manifestPath: "devops/devops.yaml",
    publicUrl: "https://teampulse.tangchaolizi.com",
    tags: ["Gitea Actions", "multi-arch", "ArgoCD"],
  },
  {
    key: "code-plan",
    name: "Code Plan",
    group: "business",
    description: "智码 Code 门户。",
    owner: "tangchaolizi",
    repo: "code_plan",
    ref: "main",
    workflow: "build-and-deploy.yaml",
    namespace: "devops",
    deployment: "code-plan",
    argocdApp: "devops",
    manifestPath: "devops/code-plan.yaml",
    publicUrl: "https://code.tangchaolizi.com",
    tags: ["Gitea Actions", "Gitea Registry", "ArgoCD"],
  },
  {
    key: "claude-relay",
    name: "Claude Relay",
    group: "core",
    description: "Claude/OpenAI relay 边缘服务。",
    owner: "kindong",
    repo: "claude-relay-service",
    ref: "main",
    workflow: "build-deploy.yaml",
    namespace: "tools",
    deployment: "claude-relay-service",
    argocdApp: "tools",
    manifestPath: "tools/tools.yaml",
    publicUrl: "https://relay.tangchaolizi.com",
    tags: ["Gitea Actions", "ArgoCD"],
  },
  {
    key: "new-api",
    name: "New API",
    group: "core",
    description: "统一 OpenAI 兼容网关。",
    owner: "kindong",
    repo: "new-api",
    ref: "main",
    namespace: "devops",
    deployment: "new-api",
    argocdApp: "devops",
    manifestPath: "devops/devops.yaml",
    publicUrl: "https://new-api.tangchaolizi.com",
    tags: ["待接入 CI", "Gitea Registry"],
    notes: "已有 K3s 部署，还缺标准 .gitea workflow。",
  },
  {
    key: "skillhub-api",
    name: "Skillhub API",
    group: "business",
    description: "Skillhub 后端服务。",
    owner: "kindong",
    repo: "skillhub",
    ref: "main",
    namespace: "devops",
    deployment: "skillhub-api",
    argocdApp: "devops",
    manifestPath: "devops/devops.yaml",
    tags: ["待接入 CI"],
    notes: "本地仓库还不是可直接发布的业务仓，先列入接入队列。",
  },
  {
    key: "skillhub-web",
    name: "Skillhub Web",
    group: "business",
    description: "Skillhub 前端服务。",
    owner: "kindong",
    repo: "skillhub",
    ref: "main",
    namespace: "devops",
    deployment: "skillhub-web",
    argocdApp: "devops",
    manifestPath: "devops/devops.yaml",
    tags: ["待接入 CI"],
    notes: "与 Skillhub API 一起标准化。",
  },
];

export function getOpsService(key: string): OpsService | undefined {
  return opsServices.find((service) => service.key === key);
}

export function groupLabel(group: OpsService["group"]): string {
  if (group === "core") return "核心工具";
  if (group === "business") return "业务服务";
  return "基础设施";
}
