import { env } from "@/lib/env";
import type { OpsService } from "./catalog";

type GiteaWorkflowRun = {
  id?: number;
  name?: string;
  display_title?: string;
  status?: string;
  conclusion?: string | null;
  event?: string;
  head_branch?: string;
  head_sha?: string;
  path?: string;
  html_url?: string;
  created_at?: string;
  updated_at?: string;
  run_started_at?: string;
};

type GiteaWorkflow = {
  id?: string | number;
  name?: string;
  path?: string;
  state?: string;
};

type WorkflowsResponse = {
  workflows?: GiteaWorkflow[];
};

type WorkflowRunsResponse = {
  workflow_runs?: GiteaWorkflowRun[];
  runs?: GiteaWorkflowRun[];
};

export type OpsWorkflowState = {
  state: "ready" | "running" | "success" | "failed" | "unconfigured" | "not-integrated" | "unknown";
  label: string;
  detail: string;
  triggerable: boolean;
  runUrl?: string;
  headSha?: string;
  updatedAt?: string;
};

export class OpsIntegrationError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

export async function getWorkflowState(service: OpsService): Promise<OpsWorkflowState> {
  if (!service.workflow) {
    return {
      state: "not-integrated",
      label: "待接入",
      detail: service.notes ?? "还没有标准 Gitea Actions 发布 workflow。",
      triggerable: false,
    };
  }

  if (!env.OPS_GITEA_TOKEN) {
    return {
      state: "unconfigured",
      label: "未配置",
      detail: "缺少 OPS_GITEA_TOKEN，只能展示目录，不能读取或触发 workflow。",
      triggerable: false,
    };
  }

  try {
    const workflow = await resolveWorkflow(service);
    if (!workflow) {
      return {
        state: "not-integrated",
        label: "未发现",
        detail: `Gitea 未发现 ${service.workflow} workflow。`,
        triggerable: false,
      };
    }
    const params = new URLSearchParams({
      branch: service.ref,
      limit: "1",
    });
    const data = await giteaRequest<WorkflowRunsResponse>(
      `/api/v1/repos/${encodePath(service.owner)}/${encodePath(service.repo)}/actions/runs?${params.toString()}`
    );
    const runs = (Array.isArray(data.workflow_runs) ? data.workflow_runs : Array.isArray(data.runs) ? data.runs : [])
      .filter((run) => isRunForWorkflow(run, workflow));
    const latest = runs[0];
    if (!latest) {
      return {
        state: "ready",
        label: "可发布",
        detail: "还没有 workflow 运行记录。",
        triggerable: true,
      };
    }
    return classifyRun(latest);
  } catch (error) {
    return {
      state: "unknown",
      label: "读取失败",
      detail: error instanceof Error ? error.message : "Gitea 状态读取失败。",
      triggerable: true,
    };
  }
}

export async function dispatchWorkflow(service: OpsService, ref?: string): Promise<void> {
  if (!service.workflow) {
    throw new OpsIntegrationError("该服务还没有配置发布 workflow", 400);
  }
  if (!env.OPS_GITEA_TOKEN) {
    throw new OpsIntegrationError("缺少 OPS_GITEA_TOKEN，无法触发 Gitea workflow", 503);
  }
  const workflow = await resolveWorkflow(service);
  if (!workflow?.id) {
    throw new OpsIntegrationError(`Gitea 未发现 ${service.workflow} workflow`, 404);
  }

  await giteaRequest<void>(
    `/api/v1/repos/${encodePath(service.owner)}/${encodePath(service.repo)}/actions/workflows/${encodePath(
      String(workflow.id)
    )}/dispatches`,
    {
      method: "POST",
      body: JSON.stringify({
        ref: ref?.trim() || service.ref,
        inputs: {},
      }),
    }
  );
}

async function resolveWorkflow(service: OpsService): Promise<GiteaWorkflow | undefined> {
  if (!service.workflow) return undefined;
  const data = await giteaRequest<WorkflowsResponse>(
    `/api/v1/repos/${encodePath(service.owner)}/${encodePath(service.repo)}/actions/workflows`
  );
  const workflows = Array.isArray(data.workflows) ? data.workflows : [];
  return workflows.find((workflow) => {
    const path = workflow.path ?? "";
    return (
      workflow.id === service.workflow ||
      String(workflow.id) === service.workflow ||
      workflow.name === service.workflow ||
      path === service.workflow ||
      path.endsWith(`/${service.workflow}`)
    );
  });
}

function isRunForWorkflow(run: GiteaWorkflowRun, workflow: GiteaWorkflow): boolean {
  const runPath = (run.path ?? "").split("@", 1)[0];
  const workflowPath = workflow.path ?? "";
  const workflowFile = workflowPath.split("/").pop() ?? workflowPath;
  const workflowId = workflow.id ? String(workflow.id) : "";
  return runPath === workflowPath || runPath === workflowFile || runPath === workflowId;
}

async function giteaRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const baseUrl = env.OPS_GITEA_BASE_URL.replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `token ${env.OPS_GITEA_TOKEN}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    cache: "no-store",
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  if (!response.ok) {
    let message = text;
    try {
      const parsed = JSON.parse(text) as { message?: string; error?: string };
      message = parsed.message ?? parsed.error ?? text;
    } catch {
      // Keep the plain text body.
    }
    throw new OpsIntegrationError(`Gitea HTTP ${response.status}: ${message || response.statusText}`, response.status);
  }

  if (!text) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}

function classifyRun(run: GiteaWorkflowRun): OpsWorkflowState {
  const status = run.status ?? "unknown";
  const conclusion = run.conclusion ?? "";
  const updatedAt = run.updated_at ?? run.run_started_at ?? run.created_at;
  const headSha = run.head_sha?.slice(0, 8);
  const suffix = [headSha, updatedAt ? new Date(updatedAt).toLocaleString("zh-CN", { hour12: false }) : undefined]
    .filter(Boolean)
    .join(" · ");

  if (status === "completed") {
    if (conclusion === "success") {
      return {
        state: "success",
        label: "最近成功",
        detail: suffix || "最近一次 workflow 已成功。",
        triggerable: true,
        runUrl: run.html_url,
        headSha,
        updatedAt,
      };
    }
    return {
      state: "failed",
      label: "最近失败",
      detail: [conclusion || "失败", suffix].filter(Boolean).join(" · "),
      triggerable: true,
      runUrl: run.html_url,
      headSha,
      updatedAt,
    };
  }

  if (status === "queued" || status === "waiting" || status === "in_progress" || status === "running") {
    return {
      state: "running",
      label: "执行中",
      detail: suffix || "workflow 正在执行。",
      triggerable: false,
      runUrl: run.html_url,
      headSha,
      updatedAt,
    };
  }

  return {
    state: "unknown",
    label: "状态未知",
    detail: [status, suffix].filter(Boolean).join(" · ") || "Gitea 返回了未知状态。",
    triggerable: true,
    runUrl: run.html_url,
    headSha,
    updatedAt,
  };
}

function encodePath(value: string): string {
  return encodeURIComponent(value);
}
