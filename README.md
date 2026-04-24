# TeamPulse

Team AI coordination platform. See who's doing what in Claude Code sessions
across your team, with cross-device memory sync.

## Structure

```
apps/web/            Next.js 14 app (UI + API route handlers in one codebase)
packages/plugin/     Claude Code plugin (hooks + MCP server, no CLI)
docker-compose.yml   Local Postgres for development
```

## Development setup

```bash
# 1. Start Postgres
docker-compose up -d postgres

# 2. Install deps
pnpm install

# 3. Push schema
pnpm db:push        # or: pnpm db:migrate to apply migrations

# 4. Create first admin
pnpm create-admin
#    → enter name / email / display name / password

# 5. Run Next.js
pnpm dev
# → http://localhost:3000
```

## User flow

### Admin onboarding (one-time)

1. Run `pnpm create-admin` to create the first admin account.
2. Log in at `http://localhost:3000/login`.
3. Visit `/admin/devices` — new devices register here and wait for approval.

### Developer onboarding (zero-config)

1. Install the TeamPulse plugin in Claude Code.
2. Open Claude Code in a git repo. The plugin auto-registers a device and
   displays a 6-char claim code (e.g. `AB-CD-EF`) in the session context.
3. Share the claim code with an admin.
4. Admin approves on `/admin/devices`, typing the developer's username.
5. Plugin polls the server, receives a bearer token, and saves it to
   `~/.teampulse/credentials.json`. From then on, every Claude Code session in
   this repo reports activity automatically.

No passwords, no manual file moves for developers.

## Architecture highlights

- **Web-first**: the dashboard is the product. The plugin is a thin integration.
- **Presence, not conflict detection**: we show who's doing what. Humans and
  Claude decide what to do with that info.
- **Single-process backend**: Next.js 14 App Router handles both UI and API.
  SSE uses an in-process `EventEmitter` (no Redis). Good for ~50 concurrent devs.
- **No ML dependencies**: no embedding, no pgvector, no LLM judge.
  Postgres + Drizzle + shadcn-style Tailwind.
- **Device-first auth**: no per-dev passwords. Plugin self-registers, admin
  approves, plugin gets a bearer token. Magic links for occasional web access
  by developers.

## Project layout (Phase 1 + Phase 2)

```
apps/web/
  src/
    app/
      layout.tsx                     Root
      page.tsx                       Home dashboard
      login/                         Admin password login
      admin/
        layout.tsx                   Admin nav + auth guard
        devices/page.tsx             Device approval page
      projects/
        page.tsx                     All projects list
        [id]/page.tsx                Project detail (active + history)
        [id]/project-live.tsx        SSE live-update subscriber
      activity/page.tsx              Team activity feed + CSV export
      team/page.tsx                  Member activity bars
      api/v1/
        auth/{login,logout}/
        devices/{register,claim-code/[code]}/
        admin/devices/{,[id]/approve,[id]/revoke}/
        projects/{,resolve,[id]}/
        tasks/{,[id],active,history,heartbeat,end-session}/
        activity/export/
        stream/                      SSE fanout
    components/
      app-shell.tsx                  Nav + layout
      logout-button.tsx
    db/
      schema.ts                      7 Drizzle tables
      index.ts                       Drizzle client
      migrate.ts                     pnpm db:migrate entrypoint
      migrations/                    Generated SQL
    lib/
      auth.ts                        Session + bearer + Argon2
      api.ts                         handler() + ApiError
      presence.ts                    EventEmitter bus
      env.ts
      utils.ts
  scripts/create-admin.ts

packages/plugin/
  .claude-plugin/plugin.json         Hooks + MCP declaration
  skills/teampulse/SKILL.md            LLM behavior + onboarding
  hooks/
    session-start.js                 Register device OR inject active tasks
    on-prompt.js                     Fire-and-forget report intent
    on-tool-use.js                   Heartbeat + files_touched
    on-stop.js                       End session tasks
    _stdin.js
  mcp-server/
    index.js                         6 MCP tools
    api-client.js                    HTTPS client
    auth.js                          Credentials + device registration
```

## What's done

- ✅ Phase 1: Auth, device registration, admin approval flow, plugin skeleton
- ✅ Phase 2: Projects API, tasks CRUD, SSE fanout, core web pages, activity feed
- ✅ Phase 3:
  - LWW memory sync (`/api/v1/memory/:projectId` with ETag, conflict detection)
  - Plugin memory-sync module (pull on SessionStart, push on Stop, conflict file)
  - Magic link login (`/api/v1/auth/magic` + `/magic` page)
  - `/settings/profile`, `/settings/devices`, `/settings/memory`
  - `/admin/users` with promote/demote/revoke
  - User self-revoke `DELETE /api/v1/devices/:id`
  - Abandoned task sweep (60s interval, 15min cutoff)
  - `.teampulse.json` project override + paused_until file support
- ✅ Deployment:
  - Multi-stage Dockerfile (Next.js standalone output)
  - `docker-compose.prod.yml` (postgres + migrate + app + caddy + nightly backup)
  - Caddyfile with auto-TLS and SSE-friendly proxy
  - `.env.prod.example` template

## Deployment

```bash
# 1. Copy env template, edit values
cp .env.prod.example .env.prod
${EDITOR:-vim} .env.prod

# 2. Build the image
docker build -f apps/web/Dockerfile -t teampulse-web:latest .

# 3. Start the stack (migrations run as an init container)
docker-compose --env-file .env.prod -f docker-compose.prod.yml up -d

# 4. Create the first admin inside the running app container
docker exec -it teampulse-web sh -c \
  "TEAMPULSE_ADMIN_NAME=admin TEAMPULSE_ADMIN_EMAIL=you@company.com \
   TEAMPULSE_ADMIN_PASSWORD='your-strong-password' \
   node -e \"require('./apps/web/scripts/create-admin.js')\""

# 5. Point DNS at the host, let Caddy get a cert
# → open https://teampulse.internal.company.com
```

Backups land in `./backups/` every 24h (retained 14 days). Mount that to your
real backup target for off-site copies.

## Troubleshooting

### Docker not running
```bash
# macOS with Colima
colima start --cpu 2 --memory 4 --disk 20
docker-compose up -d postgres

# macOS with Docker Desktop
open -a Docker && sleep 15
docker-compose up -d postgres
```

### Schema mismatch
```bash
pnpm db:push   # applies schema.ts directly (dev-only)
# or
pnpm db:generate && pnpm db:migrate   # proper migration flow
```

### Port conflict
Postgres runs on 5432. Change via `docker-compose.yml` and `.env.local` if needed.
