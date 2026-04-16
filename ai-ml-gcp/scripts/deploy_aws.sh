#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy_aws.sh — Deploy / redeploy Souli to EC2 instance
#
# Usage:
#   ./scripts/deploy_aws.sh                          # uses .env values
#   ./scripts/deploy_aws.sh <public_ip> [key_path]   # explicit args
#
# Connection methods:
#   1. If your SSH key is added to the instance (by your lead), just set
#      AWS_PUBLIC_IP in .env — no key file needed.
#   2. If using a .pem key file, set EC2_KEY_FILE in .env or pass as arg.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# Load .env if present
[ -f .env ] && source .env

PUBLIC_IP="${1:-${AWS_PUBLIC_IP:-}}"
KEY_FILE="${2:-${EC2_KEY_FILE:-}}"
SSH_USER="${EC2_SSH_USER:-ubuntu}"
REMOTE_DIR="/opt/souli/ai-ml-gcp"

# Build SSH/SCP options
SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=10"
if [ -n "$KEY_FILE" ]; then
    SSH_OPTS="$SSH_OPTS -i $KEY_FILE"
fi

if [ -z "$PUBLIC_IP" ]; then
    echo "Error: No public IP specified."
    echo "Set AWS_PUBLIC_IP in .env or pass as first argument."
    echo "Usage: ./scripts/deploy_aws.sh <public_ip> [key_file]"
    exit 1
fi

echo "============================================================"
echo "  Deploying to EC2: ${SSH_USER}@${PUBLIC_IP}"
echo "============================================================"

# ── 1. Sync source code ───────────────────────────────────────────────────────
echo "[1/4] Syncing source code..."
scp $SSH_OPTS -r \
    souli_pipeline configs Dockerfile requirements.txt pyproject.toml \
    docker-compose.aws.yml app.py \
    "${SSH_USER}@${PUBLIC_IP}:${REMOTE_DIR}/"

# ── 2. Sync .env file ────────────────────────────────────────────────────────
echo "[2/4] Syncing .env and data files..."
scp $SSH_OPTS \
    .env \
    "${SSH_USER}@${PUBLIC_IP}:${REMOTE_DIR}/"

# Sync data files (optional — might not exist locally)
scp $SSH_OPTS \
    "data/Souli_EnergyFramework_PW (1).xlsx" \
    data/videos.csv \
    "${SSH_USER}@${PUBLIC_IP}:${REMOTE_DIR}/data/" 2>/dev/null || echo "  (data files not found locally, skipping)"

# ── 3. Rebuild souli container ────────────────────────────────────────────────
echo "[3/4] Rebuilding souli container on EC2..."
ssh $SSH_OPTS "${SSH_USER}@${PUBLIC_IP}" \
    "cd ${REMOTE_DIR} && docker compose -f docker-compose.aws.yml build souli"

# ── 4. Restart services ───────────────────────────────────────────────────────
echo "[4/4] Restarting services..."
ssh $SSH_OPTS "${SSH_USER}@${PUBLIC_IP}" \
    "cd ${REMOTE_DIR} && docker compose -f docker-compose.aws.yml up -d"

echo ""
echo "============================================================"
echo "  ✓ Deployed to ${PUBLIC_IP}"
echo ""
echo "  Check status:"
echo "    ssh ${SSH_USER}@${PUBLIC_IP} 'cd ${REMOTE_DIR} && docker compose -f docker-compose.aws.yml ps'"
echo ""
echo "  View logs:"
echo "    ssh ${SSH_USER}@${PUBLIC_IP} 'cd ${REMOTE_DIR} && docker compose -f docker-compose.aws.yml logs -f --tail=100'"
echo ""
echo "  Access services:"
echo "    Streamlit UI:  http://${PUBLIC_IP}:8501"
echo "    FastAPI:       http://${PUBLIC_IP}:8000"
echo "    Dev UI:        http://${PUBLIC_IP}:8502"
echo "============================================================"
