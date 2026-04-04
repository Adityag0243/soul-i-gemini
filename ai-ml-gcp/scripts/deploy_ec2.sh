#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy_ec2.sh — Deploy / redeploy Souli to AWS EC2 instance
#
# Usage:
#   ./scripts/deploy_ec2.sh ubuntu@1.2.3.4          # direct by IP
#   ./scripts/deploy_ec2.sh souli-instance           # using instance name from .env
#   ./scripts/deploy_ec2.sh ubuntu@ip us-east-1     # with region
#
# Requires:
#   SSH access (key pair in current dir or specified in .env)
#   EC2_KEY_PAIR_NAME and EC2_INSTANCE_NAME in .env
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# Load .env if present
[ -f .env ] && source .env || true

# Parameters
DESTINATION="${1:-${EC2_INSTANCE_NAME:-souli-instance}}"
REGION="${2:-${AWS_REGION:-us-east-1}}"
PROFILE="${3:-${AWS_PROFILE:-default}}"
KEY_FILE="${4:-${EC2_KEY_PAIR_NAME:-.}/$(basename ${EC2_KEY_PAIR_NAME:-souli-key}).pem}"

# Handle case where DESTINATION is already an SSH address (user@ip)
if [[ "$DESTINATION" == *"@"* ]]; then
    SSH_ADDRESS="$DESTINATION"
    KEY_FILE="${KEY_FILE:-.}/$(basename ${EC2_KEY_PAIR_NAME:-souli-key}).pem}"
else
    # Otherwise, look up instance by name
    echo "Looking up instance: $DESTINATION in region $REGION..."
    
    INSTANCE_INFO=$(aws ec2 describe-instances \
        --filters "Name=tag:Name,Values=$DESTINATION" "Name=instance-state-name,Values=running" \
        --region "$REGION" \
        --profile "$PROFILE" \
        --query 'Reservations[0].Instances[0]' \
        --output json)
    
    PUBLIC_IP=$(echo "$INSTANCE_INFO" | jq -r '.PublicIpAddress // empty')
    
    if [ -z "$PUBLIC_IP" ]; then
        echo "ERROR: Instance '$DESTINATION' not found or not running in region $REGION"
        exit 1
    fi
    
    SSH_ADDRESS="ubuntu@${PUBLIC_IP}"
fi

# Determine key file
if [ ! -f "$KEY_FILE" ]; then
    FALLBACK_KEY="${EC2_KEY_PAIR_NAME:-.}/souli-key.pem"
    if [ ! -f "$FALLBACK_KEY" ]; then
        echo "ERROR: Key file not found. Tried:"
        echo "  $KEY_FILE"
        echo "  $FALLBACK_KEY"
        echo "Place your key file and set EC2_KEY_PAIR_NAME in .env"
        exit 1
    fi
    KEY_FILE="$FALLBACK_KEY"
fi

REMOTE_DIR="/opt/souli"

echo "=========================================================="
echo "  Deploying to EC2 Instance"
echo "=========================================================="
echo "SSH Address:    $SSH_ADDRESS"
echo "Key File:       $KEY_FILE"
echo "Remote Dir:     $REMOTE_DIR"
echo ""

# Test SSH connection
echo "[1/4] Testing SSH connection..."
if ! ssh -i "$KEY_FILE" -o ConnectTimeout=5 -o StrictHostKeyChecking=no "$SSH_ADDRESS" "echo OK" &> /dev/null; then
    echo "ERROR: Cannot connect to $SSH_ADDRESS"
    echo "Check:"
    echo "  - Key file: $KEY_FILE"
    echo "  - Instance IP/address: $SSH_ADDRESS"
    echo "  - Security group allows port 22"
    exit 1
fi
echo "  ✓ SSH connection OK"

# ── 2. Sync source code ───────────────────────────────────────────────────────
echo "[2/4] Syncing source code..."

ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no "$SSH_ADDRESS" "mkdir -p $REMOTE_DIR"

rsync -avz --delete \
    -e "ssh -i $KEY_FILE -o StrictHostKeyChecking=no" \
    --exclude '.git' \
    --exclude '__pycache__' \
    --exclude '.venv' \
    --exclude 'outputs/*' \
    --exclude '*.pyc' \
    souli_pipeline configs Dockerfile requirements.txt pyproject.toml \
    docker-compose.aws.yml Makefile scripts .env \
    "${SSH_ADDRESS}:${REMOTE_DIR}/" || echo "  (some files may have been skipped)"

echo "  ✓ Source code synced"

# ── 3. Sync data files ────────────────────────────────────────────────────────
echo "[3/4] Syncing data files..."

# Only sync if files exist locally
if [ -f "souli_pipeline/data/videos.csv" ]; then
    ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no "$SSH_ADDRESS" "mkdir -p $REMOTE_DIR/data"
    
    rsync -avz \
        -e "ssh -i $KEY_FILE -o StrictHostKeyChecking=no" \
        souli_pipeline/data/ \
        "${SSH_ADDRESS}:${REMOTE_DIR}/data/" || echo "  (data sync complete with some skips)"
    
    echo "  ✓ Data files synced"
else
    echo "  (skipping data — not found locally)"
fi

# ── 4. Rebuild and restart services ─────────────────────────────────────────
echo "[4/4] Rebuilding and restarting services on EC2..."

ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no "$SSH_ADDRESS" << 'REMOTE_SCRIPT'
    set -euo pipefail
    
    cd /opt/souli
    
    echo "  Building souli container..."
    docker compose -f docker-compose.aws.yml build souli
    
    echo "  Starting all services..."
    docker compose -f docker-compose.aws.yml up -d
    
    echo "  Checking service status..."
    sleep 5
    docker compose -f docker-compose.aws.yml ps
    
    echo "  ✓ Services restarted"
REMOTE_SCRIPT

echo ""
echo "=========================================================="
echo "  ✓ Deployment Complete!"
echo "=========================================================="
echo ""
echo "Access the application:"
echo "  SSH: ssh -i ${KEY_FILE} ${SSH_ADDRESS}"
echo "  Streamlit:  http://$(echo ${SSH_ADDRESS} | cut -d'@' -f2):8501"
echo "  FastAPI:    http://$(echo ${SSH_ADDRESS} | cut -d'@' -f2):8000/docs"
echo ""
echo "View logs:"
echo "  ssh -i ${KEY_FILE} ${SSH_ADDRESS} 'cd /opt/souli && docker compose -f docker-compose.aws.yml logs -f'"
echo ""
