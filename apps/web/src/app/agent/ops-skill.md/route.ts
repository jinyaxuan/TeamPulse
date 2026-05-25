function buildOpsSkillMarkdown(appUrl: string) {
  return `---
name: teampulse-ops-control
description: Operate the TeamPulse CI/CD release console from an agent. Use when the user asks to list deployable services, check release status, trigger a Gitea Actions deployment, or coordinate GitOps rollout from TeamPulse. Requires a TeamPulse admin session or admin bearer token.
---

# TeamPulse Ops Control

Use this skill to operate the TeamPulse CI/CD release console without opening
multiple dashboards. The API is intentionally permission-gated: requests must
authenticate as a TeamPulse admin, either through a browser session cookie or a
TeamPulse bearer token owned by an admin user.

TeamPulse server URL: ${appUrl}

## Auth

For terminal-capable agents, read the TeamPulse bearer token from the local
connector credentials and pass it as an Authorization header. Never print the
token in chat or logs.

\`\`\`bash
TOKEN="$(node -e 'const fs=require("fs"); const p=process.env.HOME+"/.teampulse/credentials.json"; const c=JSON.parse(fs.readFileSync(p,"utf8")); console.log(c.token || c.access_token || "")')"
test -n "$TOKEN"
\`\`\`

If the token is missing or the API returns 403, ask the user to bind or approve
this agent under an admin TeamPulse account.

## List Services And Status

\`\`\`bash
curl -fsS \\
  -H "Authorization: Bearer $TOKEN" \\
  "${appUrl}/api/v1/ops/services"
\`\`\`

The response contains a \`services[]\` array. Each item includes:

- \`key\`: stable service key used for deploy calls
- \`repo\` / \`workflow\` / \`ref\`: the Gitea Actions target
- \`namespace\` / \`deployment\` / \`argocdApp\`: the GitOps/K3s target
- \`workflowState\`: latest known workflow state

## Trigger Deployment

\`\`\`bash
curl -fsS -X POST \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{}' \\
  "${appUrl}/api/v1/ops/services/<service-key>/deploy"
\`\`\`

To deploy a non-default ref:

\`\`\`bash
curl -fsS -X POST \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"ref":"main"}' \\
  "${appUrl}/api/v1/ops/services/<service-key>/deploy"
\`\`\`

## Operating Rules

- Check \`GET /api/v1/ops/services\` before triggering a deploy.
- Do not trigger a deploy if \`workflowState.state\` is \`running\` unless the
  user explicitly asks to retry.
- Prefer services with configured \`workflow\`; items marked \`not-integrated\`
  need CI setup first.
- Deployment still flows through Gitea Actions -> k3s-manifests -> ArgoCD.
  Do not bypass GitOps with direct cluster mutation for normal releases.
- If a deploy fails, inspect the Gitea run first, then ArgoCD app health, then
  K3s pods.
`;
}

export function GET(request: Request) {
  const requestOrigin = new URL(request.url).origin;
  const appUrl = (process.env.PUBLIC_APP_URL ?? requestOrigin).replace(/\/$/, "");

  return new Response(buildOpsSkillMarkdown(appUrl), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
