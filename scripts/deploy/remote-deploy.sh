#!/usr/bin/env bash
set -euo pipefail

revision="${1:?revision required}"
archive_path="${2:?archive path required}"
deploy_dir="${3:-/opt/teampulse}"
parent_dir="$(dirname "$deploy_dir")"
app_name="$(basename "$deploy_dir")"
timestamp="$(date +%Y%m%dT%H%M%S)"
new_dir="${deploy_dir}.new.${revision:0:12}"
backup_dir="${deploy_dir}.prev.${timestamp}"
lock_file="/var/lock/teampulse-deploy.lock"

exec 9>"$lock_file"
flock -n 9 || {
  echo "another TeamPulse deployment is already running"
  exit 1
}

if [ ! -f "$archive_path" ]; then
  echo "archive not found: $archive_path"
  exit 1
fi

if [ ! -d "$deploy_dir" ]; then
  echo "deploy dir not found: $deploy_dir"
  exit 1
fi

rm -rf "$new_dir"
mkdir -p "$new_dir"
tar -xzf "$archive_path" -C "$new_dir"

for preserved in .env.prod .env.app docker-compose.deploy.yml; do
  if [ -f "$deploy_dir/$preserved" ]; then
    cp -a "$deploy_dir/$preserved" "$new_dir/$preserved"
  fi
done

if [ -d "$deploy_dir/backups" ]; then
  cp -a "$deploy_dir/backups" "$new_dir/backups"
fi

echo "$revision" > "$new_dir/REVISION"

mv "$deploy_dir" "$backup_dir"
mv "$new_dir" "$deploy_dir"

cd "$deploy_dir"
set -a
. ./.env.prod
set +a

app_port="${APP_PORT:-13002}"
base_path="${NEXT_PUBLIC_BASE_PATH:-}"

# Stop only legacy non-Docker TeamPulse next-server processes that used the
# same deploy tree. This avoids touching unrelated services on shared hosts.
legacy_pids="$(
  ss -ltnp |
    sed -n "s/.*:${app_port}.*pid=\([0-9][0-9]*\).*/\1/p" |
    sort -u
)"
for pid in $legacy_pids; do
  cwd="$(readlink "/proc/$pid/cwd" 2>/dev/null || true)"
  cmd="$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)"
  if [[ "$cwd" == "$deploy_dir"* || "$cwd" == "$backup_dir"* ]] && [[ "$cmd" == *next* ]]; then
    echo "stopping legacy TeamPulse process $pid"
    kill "$pid" || true
  fi
done

docker build -f apps/web/Dockerfile.base -t teampulse-node-base:22-bookworm .
docker build \
  -f apps/web/Dockerfile \
  --build-arg BASE_IMAGE=teampulse-node-base:22-bookworm \
  --build-arg PUBLIC_APP_URL="${PUBLIC_APP_URL:-http://localhost:3000}" \
  --build-arg NEXT_PUBLIC_BASE_PATH="${NEXT_PUBLIC_BASE_PATH:-}" \
  -t teampulse-web:latest .

compose_files=(-f docker-compose.prod.yml)
if [ -f docker-compose.deploy.yml ]; then
  compose_files+=(-f docker-compose.deploy.yml)
fi

docker compose --env-file .env.prod "${compose_files[@]}" up -d postgres migrate app

health_path="${base_path}/agent/skill.md"
if [ -z "$base_path" ]; then
  health_path="/agent/skill.md"
fi

for attempt in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${app_port}${health_path}" >/dev/null; then
    echo "TeamPulse deployed revision $revision"
    break
  fi
  if [ "$attempt" = "30" ]; then
    echo "health check failed for http://127.0.0.1:${app_port}${health_path}"
    docker compose --env-file .env.prod "${compose_files[@]}" ps || true
    docker logs teampulse-web --tail=120 2>&1 || true
    exit 1
  fi
  sleep 2
done

rm -f "$archive_path"

cd "$parent_dir"
ls -dt "${app_name}".prev.* 2>/dev/null | tail -n +4 | xargs -r rm -rf
