import { z } from "zod";

const endpoint = "https://api.typesafe.ai/v1/systemone";

const probability = z.number().min(0).max(1);
const choiceAnswer = z.object({
  type: z.literal("choice"),
  choice: z.enum(["low", "normal", "high", "urgent"]),
  confidence: probability,
});
const scoreAnswer = z.object({
  type: z.literal("score"),
  score: z.number().min(0).max(2),
  confidence: probability,
});
const noulAnswer = z.object({
  type: z.literal("noul"),
  noul: probability,
});
const responseSchema = z.object({
  model: z.string().min(1),
  answers: z.object({
    priority: choiceAnswer,
    needs_clarification: noulAnswer,
    agent_fit: scoreAnswer,
    delivery_risk: scoreAnswer,
  }),
});

const persistedTriageSchema = z.object({
  model: z.string().min(1),
  priority: choiceAnswer,
  needsClarification: noulAnswer,
  agentFit: scoreAnswer,
  deliveryRisk: scoreAnswer,
});
const triageEventPayloadSchema = z.object({
  input_version: z.number().int().positive(),
  triage: persistedTriageSchema,
});

export type JevTriage = z.infer<typeof persistedTriageSchema>;

export function parsePersistedJevTriage(payload: unknown): { inputVersion: number; triage: JevTriage } | null {
  const parsed = triageEventPayloadSchema.safeParse(payload);
  if (!parsed.success) return null;
  return { inputVersion: parsed.data.input_version, triage: parsed.data.triage };
}

export type TriageInput = {
  kind: string;
  title: string;
  description: string | null;
  acceptanceCriteria: string[];
  priority: string;
  status: string;
};

export class JevServiceError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

export function isAllowedTriageOrigin(origin: string | null, publicAppUrl: string): boolean {
  return origin !== null && origin === new URL(publicAppUrl).origin;
}

export async function triageWorkItem(
  item: TriageInput,
  apiKey: string,
  request: typeof fetch = fetch
): Promise<JevTriage> {
  const description = item.description?.slice(0, 4000) ?? null;
  const criteria = item.acceptanceCriteria.slice(0, 10).map((criterion) => criterion.slice(0, 500));
  const body = {
    model: "jev-latest",
    state: {
      kind: item.kind,
      title: item.title.slice(0, 240),
      description,
      description_truncated: Boolean(item.description && item.description.length > 4000),
      acceptance_criteria: criteria,
      acceptance_criteria_truncated: item.acceptanceCriteria.length > 10,
      current_priority: item.priority,
      status: item.status,
    },
    questions: {
      priority: {
        type: "choice",
        instructions: "建议这个工作项的处理优先级。根据明确的业务影响、时效和阻塞程度判断，不要仅因当前优先级字段而重复它。",
        criteria: {
          low: "影响小且不紧急，可以排在常规工作之后",
          normal: "常规业务价值和时效，按计划处理",
          high: "重要业务影响或明显阻塞，应优先处理",
          urgent: "明确的严重事故、关键截止时间或重大业务中断，需要立即处理",
        },
      },
      needs_clarification: {
        type: "noul",
        instructions: "当前需求、范围或验收标准存在关键缺口，开始执行前需要向提出人澄清。",
      },
      agent_fit: {
        type: "score",
        instructions: "评估该工作项适合由 AI Agent 执行的程度。",
        criteria: [
          "需要人工决策或线下执行，Agent 不适合主导",
          "适合 Agent 与人工协作，需要人工提供决策或资源",
          "目标和验收标准清晰，Agent 可主导执行并提交证据",
        ],
      },
      delivery_risk: {
        type: "score",
        instructions: "评估按当前描述完成并通过验收的风险。",
        criteria: [
          "风险低，依赖和验收标准清楚",
          "有部分不确定性、依赖或验收难点",
          "风险高，关键依赖或验收条件缺失，可能明显延期或返工",
        ],
      },
    },
  };

  let response: Response;
  try {
    response = await request(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
  } catch {
    throw new JevServiceError("JEV 服务暂不可用，请稍后重试", 503);
  }

  if (!response.ok) {
    if (response.status === 429) throw new JevServiceError("JEV 请求频率受限，请稍后重试", 429);
    if (response.status === 401 || response.status === 403) {
      throw new JevServiceError("JEV API key 无效或权限不足，请联系管理员", 503);
    }
    if (response.status >= 500) throw new JevServiceError("JEV 服务暂不可用，请稍后重试", 503);
    throw new JevServiceError("JEV 无法处理当前工作项，请联系管理员", 502);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new JevServiceError("JEV 返回了无效结果", 502);
  }
  const parsed = responseSchema.safeParse(payload);
  if (!parsed.success) throw new JevServiceError("JEV 返回了无效结果", 502);

  return {
    model: parsed.data.model,
    priority: parsed.data.answers.priority,
    needsClarification: parsed.data.answers.needs_clarification,
    agentFit: parsed.data.answers.agent_fit,
    deliveryRisk: parsed.data.answers.delivery_risk,
  };
}
