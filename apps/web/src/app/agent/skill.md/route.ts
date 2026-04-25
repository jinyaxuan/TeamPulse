function buildSkillMarkdown(appUrl: string) {
  const connectorUrl = `${appUrl}/agent/teampulse-connect.mjs`;

  return `---
name: teampulse-agent
description: Connect an AI coding agent to TeamPulse without requiring the TeamPulse source repo. Use when a user asks to register an agent/device with TeamPulse, bind a claim code to their account, poll for the issued token, write ~/.teampulse/credentials.json, or check TeamPulse connection status from Codex, Claude Code, OpenClaw, Skillhub, or another terminal-capable agent.
---

# TeamPulse Agent

Use this skill to connect the current machine or agent runtime to TeamPulse.
Do not require the TeamPulse project source, pnpm, or repo-local packages.

TeamPulse server URL: ${appUrl}
Connector script URL: ${connectorUrl}

## Install Connector

Download the public connector script:

\`\`\`bash
mkdir -p "$HOME/.teampulse/bin"
curl -fsSL "${connectorUrl}" -o "$HOME/.teampulse/bin/teampulse-connect.mjs"
chmod 700 "$HOME/.teampulse/bin/teampulse-connect.mjs"
\`\`\`

## First-Time Connection

Register the local device:

\`\`\`bash
node "$HOME/.teampulse/bin/teampulse-connect.mjs" register --server-url ${appUrl}
\`\`\`

Return only the printed claim_code to the user. Do not paste device_secret.

After the user confirms that they bound the claim_code in TeamPulse, poll for the token:

\`\`\`bash
node "$HOME/.teampulse/bin/teampulse-connect.mjs" poll --server-url ${appUrl}
\`\`\`

Confirm that credentials were written to ~/.teampulse/credentials.json.

## Status

\`\`\`bash
node "$HOME/.teampulse/bin/teampulse-connect.mjs" status
\`\`\`

## Rules

- Treat device_secret, returned token, and ~/.teampulse/credentials.json as sensitive.
- Do not paste the token into chat unless the user explicitly asks.
- Do not bind the claim code to the wrong TeamPulse account. The account that submits the code owns the device.
- If poll returns pending, tell the user the claim code still needs to be bound on ${appUrl}/settings/connect.
`;
}

export function GET(request: Request) {
  const requestOrigin = new URL(request.url).origin;
  const appUrl = (process.env.PUBLIC_APP_URL ?? requestOrigin).replace(/\/$/, "");

  return new Response(buildSkillMarkdown(appUrl), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
