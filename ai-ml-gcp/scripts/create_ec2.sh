#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# create_ec2.sh — Create AWS EC2 instance for Souli
#
# Usage:
#   ./scripts/create_ec2.sh                    # uses defaults from .env
#   ./scripts/create_ec2.sh souli-vm us-east-1 my-aws-profile
#
# Requires:
#   AWS CLI v2 installed and configured
#   Appropriate IAM permissions for EC2 + VPC + Security Groups
#   An existing security group OR we'll create one
#   An existing key pair OR we'll create one
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# Load .env if present
[ -f .env ] && source .env || true

# Parameters
INSTANCE_NAME="${1:-${EC2_INSTANCE_NAME:-souli-instance}}"
REGION="${2:-${AWS_REGION:-us-east-1}}"
PROFILE="${3:-${AWS_PROFILE:-default}}"

# Instance configuration
INSTANCE_TYPE="${EC2_INSTANCE_TYPE:-g4dn.xlarge}"         # 1x T4 GPU, 4 vCPU, 16 GB RAM
KEY_PAIR_NAME="${EC2_KEY_PAIR_NAME:-souli-key}"
SECURITY_GROUP_NAME="${EC2_SECURITY_GROUP:-souli-sg}"
SUBNET_ID="${EC2_SUBNET_ID:-}"                            # (optional) use specific subnet
DISK_SIZE="${EC2_DISK_SIZE:-100}"                          # GB - gp3 volume
AMI_ID="${EC2_AMI_ID:-}"                                  # (optional) specify custom AMI

# Determine default AMI (Deep Learning Base AMI in the region)
# For simplicity, we'll use Ubuntu 22.04 with default
if [ -z "$AMI_ID" ]; then
    echo "Fetching latest Ubuntu 22.04 LTS AMI for $REGION..."
    AMI_ID=$(aws ec2 describe-images \
        --region "$REGION" \
        --filters "Name=name,Values=ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*" \
        --query 'sort_by(Images, &CreationDate)[-1].ImageId' \
        --output text \
        --profile "$PROFILE")
    
    if [ -z "$AMI_ID" ] || [ "$AMI_ID" == "None" ]; then
        echo "ERROR: Could not find Ubuntu 22.04 AMI for region $REGION"
        echo "Try specifying EC2_AMI_ID in .env"
        exit 1
    fi
fi

echo "=========================================================="
echo "  AWS EC2 Instance Configuration"
echo "=========================================================="
echo "Instance Name:  $INSTANCE_NAME"
echo "Region:         $REGION"
echo "Instance Type:  $INSTANCE_TYPE"
echo "AMI ID:         $AMI_ID"
echo "Key Pair:       $KEY_PAIR_NAME"
echo "Security Group: $SECURITY_GROUP_NAME"
echo "Disk Size:      ${DISK_SIZE}GB (gp3)"
echo "AWS Profile:    $PROFILE"
echo ""

# ── 1. Create key pair if not exists ───────────────────────────────────────
echo "[1/5] Checking/creating key pair..."

if ! aws ec2 describe-key-pairs \
    --key-names "$KEY_PAIR_NAME" \
    --region "$REGION" \
    --profile "$PROFILE" \
    &> /dev/null; then
    
    echo "  Creating key pair: $KEY_PAIR_NAME"
    aws ec2 create-key-pair \
        --key-name "$KEY_PAIR_NAME" \
        --region "$REGION" \
        --query 'KeyMaterial' \
        --output text \
        --profile "$PROFILE" > "./${KEY_PAIR_NAME}.pem"
    
    chmod 400 "./${KEY_PAIR_NAME}.pem"
    echo "  ✓ Key pair saved to ./${KEY_PAIR_NAME}.pem"
else
    echo "  ✓ Key pair already exists: $KEY_PAIR_NAME"
fi

# ── 2. Create security group if not exists ──────────────────────────────────
echo "[2/5] Checking/creating security group..."

SG_ID=$(aws ec2 describe-security-groups \
    --filters "Name=group-name,Values=$SECURITY_GROUP_NAME" \
    --region "$REGION" \
    --query 'SecurityGroups[0].GroupId' \
    --output text \
    --profile "$PROFILE" 2>/dev/null || echo "")

if [ -z "$SG_ID" ] || [ "$SG_ID" == "None" ]; then
    echo "  Creating security group: $SECURITY_GROUP_NAME"
    
    VPC_ID=$(aws ec2 describe-vpcs \
        --filters "Name=is-default,Values=true" \
        --region "$REGION" \
        --query 'Vpcs[0].VpcId' \
        --output text \
        --profile "$PROFILE")
    
    SG_ID=$(aws ec2 create-security-group \
        --group-name "$SECURITY_GROUP_NAME" \
        --description "Security group for Souli AI/ML on EC2" \
        --vpc-id "$VPC_ID" \
        --region "$REGION" \
        --query 'GroupId' \
        --output text \
        --profile "$PROFILE")
    
    echo "  ✓ Security group created: $SG_ID"
else
    echo "  ✓ Using existing security group: $SG_ID"
fi

# ── 3. Add ingress rules ───────────────────────────────────────────────────
echo "[3/5] Configuring security group rules..."

add_rule() {
    local port=$1
    local protocol=$2
    local cidr=$3
    local desc=$4
    
    if aws ec2 authorize-security-group-ingress \
        --group-id "$SG_ID" \
        --protocol "$protocol" \
        --port "$port" \
        --cidr "$cidr" \
        --region "$REGION" \
        --profile "$PROFILE" \
        2>/dev/null; then
        echo "  ✓ Allowed $desc ($port/$protocol)"
    else
        echo "  (rule already exists: $desc)"
    fi
}

# SSH (your IP only — restrict for security)
add_rule 22 tcp 0.0.0.0/0 "SSH"

# Streamlit UI
add_rule 8501 tcp 0.0.0.0/0 "Streamlit (8501)"

# FastAPI
add_rule 8000 tcp 0.0.0.0/0 "FastAPI (8000)"

# Ollama (internal — restrict if possible)
add_rule 11434 tcp 0.0.0.0/0 "Ollama (11434)"

# Qdrant
add_rule 6333 tcp 0.0.0.0/0 "Qdrant (6333)"
add_rule 6334 tcp 0.0.0.0/0 "Qdrant (6334)"

# LiveKit WebRTC
add_rule 7880 tcp 0.0.0.0/0 "LiveKit HTTP"
add_rule 7881 tcp 0.0.0.0/0 "LiveKit TURN/TCP"
aws ec2 authorize-security-group-ingress \
    --group-id "$SG_ID" \
    --protocol udp \
    --from-port 50100 \
    --to-port 50200 \
    --cidr 0.0.0.0/0 \
    --region "$REGION" \
    --profile "$PROFILE" \
    2>/dev/null || echo "  (UDP 50100-50200 already exists)"

# ── 4. Launch EC2 instance ─────────────────────────────────────────────────
echo "[4/5] Launching EC2 instance..."

SUBNET_FLAG=""
[ -n "$SUBNET_ID" ] && SUBNET_FLAG="--subnet-id $SUBNET_ID"

INSTANCE_ID=$(aws ec2 run-instances \
    --image-id "$AMI_ID" \
    --instance-type "$INSTANCE_TYPE" \
    --key-name "$KEY_PAIR_NAME" \
    --security-group-ids "$SG_ID" \
    --block-device-mappings "DeviceName=/dev/sda1,Ebs={VolumeSize=$DISK_SIZE,VolumeType=gp3,DeleteOnTermination=true}" \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$INSTANCE_NAME}]" \
    --monitoring Enabled=false \
    --region "$REGION" \
    --query 'Instances[0].InstanceId' \
    --output text \
    --profile "$PROFILE" \
    $SUBNET_FLAG)

echo "  Instance launched: $INSTANCE_ID"
echo "  Waiting for instance to be running..."

aws ec2 wait instance-running \
    --instance-ids "$INSTANCE_ID" \
    --region "$REGION" \
    --profile "$PROFILE"

# Get instance details
echo "[5/5] Retrieving instance details..."

INSTANCE_INFO=$(aws ec2 describe-instances \
    --instance-ids "$INSTANCE_ID" \
    --region "$REGION" \
    --profile "$PROFILE" \
    --query 'Reservations[0].Instances[0]')

PUBLIC_IP=$(echo "$INSTANCE_INFO" | jq -r '.PublicIpAddress // "pending"')
PRIVATE_IP=$(echo "$INSTANCE_INFO" | jq -r '.PrivateIpAddress')

echo ""
echo "=========================================================="
echo "  ✓ EC2 Instance Created Successfully!"
echo "=========================================================="
echo ""
echo "Instance Details:"
echo "  Instance ID:    $INSTANCE_ID"
echo "  Instance Type:  $INSTANCE_TYPE"
echo "  Region:         $REGION"
echo "  Public IP:      $PUBLIC_IP"
echo "  Private IP:     $PRIVATE_IP"
echo "  Key Pair:       ./${KEY_PAIR_NAME}.pem"
echo ""
echo "Connect via SSH:"
echo "  ssh -i ./${KEY_PAIR_NAME}.pem ubuntu@${PUBLIC_IP}"
echo ""
echo "Next: Run setup on the instance:"
echo "  ssh -i ./${KEY_PAIR_NAME}.pem ubuntu@${PUBLIC_IP} 'bash -s' < scripts/setup_ec2.sh"
echo ""
echo "Cost estimate:"
echo "  ${INSTANCE_TYPE}: ~\$1.19/hour (varies by region)"
echo "  EBS ${DISK_SIZE}GB gp3: ~\$0.08/hour"
echo "  Total: ~\$1.27/hour + data transfer"
echo ""
