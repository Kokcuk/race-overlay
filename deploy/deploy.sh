#!/usr/bin/env bash
# Bundle source → ship to server → docker compose up.
# Idempotent: re-running rebuilds with the latest sources.
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  echo "ERROR: .env not found at repo root." >&2
  exit 1
fi

# shellcheck disable=SC1091
source .env

: "${DEPLOY_HOST:?DEPLOY_HOST not set in .env}"

SSH_KEY=".ssh/id_ed25519"
SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=accept-new"
SSH="ssh $SSH_OPTS root@$DEPLOY_HOST"
SCP="scp $SSH_OPTS"

BUNDLE=/tmp/raceoverlay-src.tar.gz

echo "==> Bundling source (excluding node_modules, dist, secrets, big media)"
tar \
  --exclude='raceoverlay/node_modules' \
  --exclude='raceoverlay/dist' \
  --exclude='backend/node_modules' \
  --exclude='.git' \
  --exclude='.ssh' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='examples' \
  --exclude='docs' \
  -czf "$BUNDLE" \
  raceoverlay backend deploy docker-compose.yml

echo "==> Uploading bundle ($(du -h "$BUNDLE" | cut -f1))"
$SCP "$BUNDLE" "root@$DEPLOY_HOST:/tmp/raceoverlay-src.tar.gz"

echo "==> Uploading .env (out-of-band, never in the tar bundle)"
$SCP .env "root@$DEPLOY_HOST:/tmp/raceoverlay.env"

echo "==> Installing Docker (idempotent), unpacking, building, running"
$SSH 'bash -s' <<'REMOTE_EOF'
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  echo "  Installing Docker..."
  curl -fsSL https://get.docker.com | sh
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "  Installing docker-compose-plugin..."
  apt-get update -qq
  apt-get install -y --no-install-recommends docker-compose-plugin
fi

# Stop any single-container deployment from earlier runs.
docker rm -f raceoverlay >/dev/null 2>&1 || true

rm -rf /opt/raceoverlay
mkdir -p /opt/raceoverlay
tar -xzf /tmp/raceoverlay-src.tar.gz -C /opt/raceoverlay
rm /tmp/raceoverlay-src.tar.gz

mv /tmp/raceoverlay.env /opt/raceoverlay/.env
chmod 600 /opt/raceoverlay/.env

cd /opt/raceoverlay
echo "  Building images + (re)starting compose stack..."
docker compose down --remove-orphans 2>/dev/null || true
docker compose build
docker compose up -d

echo "  Container status:"
docker compose ps
REMOTE_EOF

rm -f "$BUNDLE"
echo "==> Deploy complete. Smoke-test:"
echo "    curl -I http://$DEPLOY_HOST"
echo "    curl -s http://$DEPLOY_HOST/api/health"
