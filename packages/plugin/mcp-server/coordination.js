/**
 * Turn task overlap warnings into explicit instructions for the calling agent.
 * The API owns detection; MCP/CLI layers own agent-facing behavior.
 */
export function withCoordinationAdvice(payload) {
  const warnings = Array.isArray(payload?.overlap_warnings) ? payload.overlap_warnings : [];
  const highRisk = warnings.filter((warning) => warning.severity === "high");

  if (highRisk.length > 0) {
    return {
      ...payload,
      coordination: {
        action: "pause_for_confirmation",
        severity: "high",
        summary:
          "Potential file overlap detected. Do not edit the overlapping files until the user confirms how to coordinate.",
        instructions: [
          "Tell the user which teammate/task is already active and which files overlap.",
          "Ask whether to wait, take over, narrow the scope, or continue anyway.",
          "Do not modify overlapping files before the user gives explicit direction.",
        ],
        warnings: highRisk,
      },
    };
  }

  if (warnings.length > 0) {
    return {
      ...payload,
      coordination: {
        action: "proceed_with_caution",
        severity: "medium",
        summary:
          "Related active work detected. Mention it once, keep the change scope narrow, and avoid expanding into the other task.",
        instructions: [
          "Tell the user there is related active work before making edits.",
          "Prefer a narrower implementation plan that avoids the related task area.",
          "Continue only if the planned work does not depend on the teammate's active task.",
        ],
        warnings,
      },
    };
  }

  return {
    ...payload,
    coordination: {
      action: "continue",
      severity: "clear",
      summary: "No overlap warnings were detected for the provided task hints.",
      instructions: ["Proceed normally and keep sending heartbeats for touched files."],
      warnings: [],
    },
  };
}
