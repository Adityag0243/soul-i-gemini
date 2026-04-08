#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# create_ec2.sh — Create an EC2 instance for Souli (with GPU)
#
# Usage:
#   ./scripts/create_ec2.sh
#
# Requires:
#   AWS CLI v2 installed and configured (aws configure)
#   EC2 quota for GPU instances approved (request via AWS Service Quotas)
#
# Reads from .env:
#   AWS_REGION, EC2_INSTANCE_NAME, EC2_INSTANCE_TYPE, EC2_KEY_PAIR_NAME,
#   EC2_SECURITY_GROUP, EC2_DISK_SIZE
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

[ -f .env ] && source .env

REGION="${AWS_REGION:-ap-south-1}"
INSTANCE_NAME="${EC2_INSTANCE_NAME:-souli-ai-vm}"
INSTANCE_TYPE="${EC2_INSTANCE_TYPE:-g5.2xlarge}"
KEY_NAME="${EC2_KEY_PAIR_NAME:-souli-ai-key}"
SG_NAME="${EC2_SECURITY_GROUP:-souli-ai-sg}"
DISK_SIZE="${EC2_DISK_SIZE:-80}"
KEY_DIR="./keys"

echo "============================================================"
echo "  Souli — EC2 Instance Creation"
echo "============================================================"
echo "  Region:        $REGION"
echo "  Instance Name: $INSTANCE_NAME"
echo "  Instance Type: $INSTANCE_TYPE"
echo "  Key Pair:      $KEY_NAME"
echo "  Security Group:$SG_NAME"
echo "  Disk Size:     ${DISK_SIZE}GB"
echo ""

# ── 1. Create SSH key pair (if it doesn't exist) ─────────────────────────────
echo "[1/4] Setting up SSH key pair..."
mkdir -p "$KEY_DIR"
if ! aws ec2 describe-key-pairs --key-names "$KEY_NAME" --region "$REGION" &>/dev/null; then
    aws ec2 create-key-pair \
        --key-name "$KEY_NAME" \
        --region "$REGION" \
        --query 'KeyMaterial' \
        --output text > "${KEY_DIR}/${KEY_NAME}.pem"
    chmod 400 "${KEY_DIR}/${KEY_NAME}.pem"
    echo "  ✓ Key pair created: ${KEY_DIR}/${KEY_NAME}.pem"
else
    echo "  Key pair '$KEY_NAME' already exists."
fi

# ── 2. Create security group (if it doesn't exist) ───────────────────────────
echo "[2/4] Setting up security group..."

# Get default VPC
VPC_ID=$(aws ec2 describe-vpcs \
    --region "$REGION" \
    --filters "Name=isDefault,Values=true" \
    --query 'Vpcs[0].VpcId' --output text)

SG_ID=$(aws ec2 describe-security-groups \
    --region "$REGION" \
    --filters "Name=group-name,Values=$SG_NAME" "Name=vpc-id,Values=$VPC_ID" \
    --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null || echo "None")

if [ "$SG_ID" = "None" ] || [ -z "$SG_ID" ]; then
    SG_ID=$(aws ec2 create-security-group \
        --group-name "$SG_NAME" \
        --description "Souli AI - SSH, Streamlit, API, LiveKit" \
        --vpc-id "$VPC_ID" \
        --region "$REGION" \
        --query 'GroupId' --output text)
    echo "  ✓ Security group created: $SG_ID"

    # Inbound rules
    echo "  Adding inbound rules..."
    # SSH
    aws ec2 authorize-security-group-ingress --group-id "$SG_ID" --region "$REGION" \
        --protocol tcp --port 22 --cidr 0.0.0.0/0 2>/dev/null || true
    # Streamlit UI
    aws ec2 authorize-security-group-ingress --group-id "$SG_ID" --region "$REGION" \
        --protocol tcp --port 8501 --cidr 0.0.0.0/0 2>/dev/null || true
    # FastAPI
    aws ec2 authorize-security-group-ingress --group-id "$SG_ID" --region "$REGION" \
        --protocol tcp --port 8000 --cidr 0.0.0.0/0 2>/dev/null || true
    # Dev UI
    aws ec2 authorize-security-group-ingress --group-id "$SG_ID" --region "$REGION" \
        --protocol tcp --port 8502 --cidr 0.0.0.0/0 2>/dev/null || true
    # LiveKit HTTP + TURN/TCP
    aws ec2 authorize-security-group-ingress --group-id "$SG_ID" --region "$REGION" \
        --protocol tcp --port 7880 --cidr 0.0.0.0/0 2>/dev/null || true
    aws ec2 authorize-security-group-ingress --group-id "$SG_ID" --region "$REGION" \
        --protocol tcp --port 7881 --cidr 0.0.0.0/0 2>/dev/null || true
    # LiveKit WebRTC UDP
    aws ec2 authorize-security-group-ingress --group-id "$SG_ID" --region "$REGION" \
        --protocol udp --port 50100-50200 --cidr 0.0.0.0/0 2>/dev/null || true
    # Ollama (internal network only — keep restricted)
    aws ec2 authorize-security-group-ingress --group-id "$SG_ID" --region "$REGION" \
        --protocol tcp --port 11434 --cidr 0.0.0.0/0 2>/dev/null || true
    echo "  ✓ Inbound rules added."
else
    echo "  Security group '$SG_NAME' already exists: $SG_ID"
fi

# ── 3. Find latest Ubuntu 22.04 AMI ──────────────────────────────────────────
echo "[3/4] Finding latest Ubuntu 22.04 AMI..."
AMI_ID="${EC2_AMI_ID:-}"
if [ -z "$AMI_ID" ]; then
    AMI_ID=$(aws ec2 describe-images \
        --region "$REGION" \
        --owners 099720109477 \
        --filters "Name=name,Values=ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*" \
                  "Name=state,Values=available" \
        --query 'Images | sort_by(@, &CreationDate) | [-1].ImageId' \
        --output text)
fi
echo "  AMI: $AMI_ID"

# ── 4. Launch EC2 instance ────────────────────────────────────────────────────
echo "[4/4] Launching EC2 instance..."
INSTANCE_ID=$(aws ec2 run-instances \
    --region "$REGION" \
    --image-id "$AMI_ID" \
    --instance-type "$INSTANCE_TYPE" \
    --key-name "$KEY_NAME" \
    --security-group-ids "$SG_ID" \
    --block-device-mappings "DeviceName=/dev/sda1,Ebs={VolumeSize=${DISK_SIZE},VolumeType=gp3,DeleteOnTermination=true}" \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=${INSTANCE_NAME}}]" \
    --count 1 \
    --query 'Instances[0].InstanceId' \
    --output text)

echo "  Instance ID: $INSTANCE_ID"
echo "  Waiting for instance to be running..."
aws ec2 wait instance-running --instance-ids "$INSTANCE_ID" --region "$REGION"

# Get public IP
PUBLIC_IP=$(aws ec2 describe-instances \
    --instance-ids "$INSTANCE_ID" \
    --region "$REGION" \
    --query 'Reservations[0].Instances[0].PublicIpAddress' \
    --output text)

echo ""
echo "============================================================"
echo "  ✓ EC2 Instance Created!"
echo ""
echo "  Instance ID: $INSTANCE_ID"
echo "  Public IP:   $PUBLIC_IP"
echo ""
echo "  Update your .env with:"
echo "    EC2_INSTANCE_ID=$INSTANCE_ID"
echo "    AWS_PUBLIC_IP=$PUBLIC_IP"
echo ""
echo "  Connect via SSH:"
echo "    ssh -i ${KEY_DIR}/${KEY_NAME}.pem ubuntu@${PUBLIC_IP}"
echo ""
echo "  Next: Run the setup script on the instance:"
echo "    ssh -i ${KEY_DIR}/${KEY_NAME}.pem ubuntu@${PUBLIC_IP} 'bash -s' < scripts/setup_ec2.sh"
echo "============================================================"
