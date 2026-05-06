#!/usr/bin/env bash
# Bundle source → ship to server → build + run a Docker container on :80.
# Idempotent: re-running rebuilds from latest sources.
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

echo "==> Bundling source (excluding node_modules, dist, secrets, examples)"
tar \
  --exclude='raceoverlay/node_modules' \
  --exclude='raceoverlay/dist' \
  --exclude='.git' \
  --exclude='.ssh' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='examples' \
  --exclude='docs' \
  -czf "$BUNDLE" \
  raceoverlay deploy

echo "==> Uploading bundle ($(du -h "$BUNDLE" | cut -f1))"
$SCP "$BUNDLE" "root@$DEPLOY_HOST:/tmp/raceoverlay-src.tar.gz"

echo "==> Installing Docker (idempotent), unpacking, building, running"
$SSH 'bash -s' <<'REMOTE_EOF'
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  echo "  Installing Docker..."
  curl -fsSL https://get.docker.com | sh
fi

rm -rf /opt/raceoverlay
mkdir -p /opt/raceoverlay
tar -xzf /tmp/raceoverlay-src.tar.gz -C /opt/raceoverlay
rm /tmp/raceoverlay-src.tar.gz

cd /opt/raceoverlay
echo "  Building image..."
docker build -t raceoverlay:latest -f deploy/Dockerfile .

echo "  Restarting container..."
docker rm -f raceoverlay >/dev/null 2>&1 || true
docker run -d --name raceoverlay --restart unless-stopped -p 80:80 raceoverlay:latest

echo "  Container status:"
docker ps --filter name=raceoverlay --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
REMOTE_EOF

rm -f "$BUNDLE"
echo "==> Deploy complete. Smoke-test:"
echo "    curl -I http://$DEPLOY_HOST"
