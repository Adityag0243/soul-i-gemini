# GCP to AWS Migration Guide for Souli AI/ML Pipeline

## Overview

Your Souli pipeline is **100% compatible with AWS EC2**. This guide walks you through migrating from GCP (Compute Engine) to AWS EC2.

## Quick Comparison

| Aspect | GCP | AWS |
|--------|-----|-----|
| **Service** | Compute Engine (GCE) | Elastic Compute Cloud (EC2) |
| **GPU Instance** | n1-standard-4 + T4 | g4dn.xlarge |
| **Cost/hr** | $0.54 | $0.60 |
| **Configuration** | `docker-compose.gcp.yml` | `docker-compose.aws.yml` ✅ (new) |
| **Deployment** | gcloud CLI | AWS CLI + SSH |
| **Setup Script** | `scripts/setup_gce.sh` | `scripts/setup_ec2.sh` ✅ (new) |

---

## What Changed?

### ✅ **New Files Created**
1. **`docker-compose.aws.yml`** — AWS-specific compose file
2. **`configs/pipeline.aws.yaml`** — AWS-specific config
3. **`scripts/setup_ec2.sh`** — EC2 setup script
4. **`scripts/create_ec2.sh`** — EC2 instance creation
5. **`scripts/deploy_ec2.sh`** — Deployment script for EC2

### ✅ **Updated Files**
- **`.env.example`** — Now includes AWS variables
- **`Makefile`** — Added AWS targets (`aws-vm`, `aws-deploy`, etc.)

### ✅ **No Changes Needed**
- Docker image (runs on both)
- Python code
- Dependencies (requirements.txt)
- Configuration logic (pipeline.yaml is 99% same)

---

## Step-by-Step Migration

### **Phase 1: Prepare Your Environment (Local Machine)**

### 1️⃣ **Install AWS CLI v2**

```bash
# macOS
curl "https://awscli.amazonaws.com/awscli-exe-macos.zip" -o "awscliv2.zip" && unzip awscliv2.zip && sudo ./aws/install

# Linux
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" && unzip awscliv2.zip && sudo ./aws/install

# Windows (PowerShell)
msiexec.exe /i https://awscli.amazonaws.com/AWSCLIV2.msi
```

### 2️⃣ **Configure AWS Credentials**

```bash
aws configure --profile default
# Enter: Access Key ID
# Enter: Secret Access Key
# Region: us-east-1 (or your preferred region)
# Output format: json
```

Or manually edit `~/.aws/credentials`:

```
[default]
aws_access_key_id = YOUR_ACCESS_KEY
aws_secret_access_key = YOUR_SECRET_KEY

[production]
aws_access_key_id = PROD_ACCESS_KEY
aws_secret_access_key = PROD_SECRET_KEY
```

### 3️⃣ **Copy & Update .env File**

```bash
cp .env.example .env
```

Edit `.env`:

```yaml
# Choose your platform
CLOUD_PLATFORM=aws

# AWS settings
AWS_REGION=us-east-1
AWS_PROFILE=default
EC2_INSTANCE_NAME=souli-instance
EC2_INSTANCE_TYPE=g4dn.xlarge          # or g4dn.2xlarge for faster
EC2_KEY_PAIR_NAME=souli-key
EC2_DISK_SIZE=100

# Common settings
OLLAMA_CHAT_MODEL=llama3.1
SOULI_CONFIG_PATH=/app/configs/pipeline.aws.yaml
LIVEKIT_URL=wss://your-project.livekit.cloud
```

### **Phase 2: Create & Setup EC2 Instance**

### 1️⃣ **Create the EC2 Instance**

```bash
# Make script executable
chmod +x scripts/create_ec2.sh

# Create instance
bash scripts/create_ec2.sh
```

Or use the Makefile:

```bash
make aws-vm
```

**What it does:**
- Creates AWS key pair (saved as `souli-key.pem`)
- Creates security group with ports 22, 8501, 8000, 11434, 6333, 6334
- Launches g4dn.xlarge EC2 instance with 100GB EBS volume
- Returns public IP and connection info

**Expected output:**
```
Instance Details:
  Instance ID:    i-0123456789abcdef0
  Instance Type:  g4dn.xlarge
  Region:         us-east-1
  Public IP:      54.123.45.67
  Private IP:     172.31.0.123
  Key Pair:       ./souli-key.pem

Connect via SSH:
  ssh -i ./souli-key.pem ubuntu@54.123.45.67
```

### 2️⃣ **Run One-Time Setup on EC2**

```bash
# Option A: Manual (if you have the IP)
ssh -i ./souli-key.pem ubuntu@54.123.45.67 'bash -s' < scripts/setup_ec2.sh

# Option B: Using Makefile
make aws-setup
```

**What it does:**
- Installs NVIDIA drivers (detects GPU automatically)
- Installs Docker + Docker Compose
- Installs NVIDIA Container Toolkit
- Clones your repository
- Pre-downloads Ollama models (5-10 minutes)

**Expected output (partial):**
```
[1/6] Installing system packages...
[2/6] Installing Docker...
[3/6] Installing NVIDIA drivers (if GPU present)...
  NVIDIA GPU detected!
  NVIDIA Container Toolkit installed.
[4/6] Installing Docker Compose v2...
[5/6] Setting up /opt/souli...
[6/6] Pre-downloading Ollama models...
  Pulling llama3.1...
  Pulling qwen2.5:1.5b...

✓ Setup complete!
```

### **Phase 3: Deploy Your Application**

### 1️⃣ **Deploy the Code**

```bash
# Option A: Manual
bash scripts/deploy_ec2.sh ubuntu@54.123.45.67

# Option B: If instance name in .env
bash scripts/deploy_ec2.sh

# Option C: Using Makefile
make aws-deploy
```

**What it does:**
- Syncs source code via rsync
- Copies data files (videos.csv, Excel files)
- Builds Souli container
- Starts all services

### 2️⃣ **SSH into Instance & Start Interactive Session**

```bash
ssh -i ./souli-key.pem ubuntu@54.123.45.67

# On the instance:
cd /opt/souli

# View logs
docker compose -f docker-compose.aws.yml logs -f --tail=50

# Check service status
docker compose -f docker-compose.aws.yml ps

# Verify Ollama models loaded
docker exec souli-ollama ollama list
```

### **Phase 4: Verify Everything Works**

### 1️⃣ **Check Services Are Running**

```bash
# On EC2 instance
docker compose -f docker-compose.aws.yml ps

# Should show:
# souli-ollama    Running
# souli-qdrant    Running
# souli           Running (Streamlit)
# souli-api       Running (FastAPI)
```

### 2️⃣ **Test API Health**

```bash
# From local machine or instance
curl -s http://54.123.45.67:8000/health | python3 -m json.tool

# Expected:
# {
#   "status": "ok",
#   "services": {
#     "ollama": "ok",
#     "qdrant": "ok"
#   }
# }
```

### 3️⃣ **Access Web UIs**

- **Streamlit**: `http://54.123.45.67:8501`
- **FastAPI Docs**: `http://54.123.45.67:8000/docs`
- **Qdrant Dashboard**: `http://54.123.45.67:6333/dashboard`

---

## Running Jobs on AWS

### **Full Pipeline (Energy + YouTube)**

```bash
# Option A: SSH and run directly
ssh -i ./souli-key.pem ubuntu@54.123.45.67
cd /opt/souli
docker compose -f docker-compose.aws.yml exec -T souli \
  souli run all \
    --config /app/configs/pipeline.aws.yaml \
    --videos-csv /app/data/videos.csv \
    --excel-path /app/data/Souli_EnergyFramework_PW\ \(1\).xlsx \
    --merge

# Option B: Using Makefile
make aws-pipeline
```

### **Ingest YouTube Chunks into Qdrant**

```bash
# SSH and run
ssh -i ./souli-key.pem ubuntu@54.123.45.67
cd /opt/souli
docker compose -f docker-compose.aws.yml exec -T souli \
  souli ingest --config /app/configs/pipeline.aws.yaml
```

### **Start Interactive Chat**

```bash
ssh -i ./souli-key.pem ubuntu@54.123.45.67
cd /opt/souli
docker compose -f docker-compose.aws.yml exec souli \
  souli chat --config /app/configs/pipeline.aws.yaml \
    --excel /app/data/Souli_EnergyFramework_PW\ \(1\).xlsx
```

---

## Cost Optimization

### **Instance Types & Pricing (us-east-1)**

| Instance | vCPU | GPU | RAM | Cost/hr | Best For |
|----------|------|-----|-----|---------|----------|
| **g4dn.xlarge** | 4 | 1x T4 | 16GB | $0.52 | Default choice |
| g4dn.2xlarge | 8 | 2x T4 | 32GB | $1.04 | Heavy inference |
| **m5.2xlarge** | 8 | None | 32GB | $0.38 | CPU-only (slow) |
| p3.2xlarge | 8 | 1x V100 | 61GB | $3.06 | Training (expensive) |

### **Memory Considerations**

- **Ollama models**: 7B = ~14GB, 13B = ~26GB
- **With llama3.1 + qwen2.5:1.5b**: Needs ~20GB
- **g4dn.xlarge (16GB)**: Works but tight; consider g4dn.2xlarge if slow

### **Save Money**

```bash
# Stop instance when not in use
make aws-stop-vm

# Start it again
make aws-start-vm

# Or use AWS CLI
aws ec2 stop-instances --instance-ids i-0123456789abcdef0 --region us-east-1
aws ec2 start-instances --instance-ids i-0123456789abcdef0 --region us-east-1
```

### **Estimate Monthly Cost**

```
g4dn.xlarge: 24 hrs/day × $0.52/hr × 30 days = $374.40
EBS 100GB gp3: $10/month
Total: ~$384/month (always on)

Or stop when not in use: 8 hrs/day × $0.52 × 30 = ~$124/month
```

---

## Troubleshooting

### **Can't SSH to Instance**

```bash
# Check security group allows SSH (port 22)
aws ec2 authorize-security-group-ingress \
  --group-name souli-sg \
  --protocol tcp \
  --port 22 \
  --cidr 0.0.0.0/0 \
  --region us-east-1

# Check key file permissions
chmod 400 souli-key.pem

# Try verbose SSH
ssh -vv -i souli-key.pem ubuntu@54.123.45.67
```

### **Ollama Not Responding**

```bash
# On instance
docker logs souli-ollama
docker compose -f docker-compose.aws.yml restart ollama

# Wait for GPU initialization (can take 30s)
sleep 30
docker exec souli-ollama ollama list
```

### **Out of Memory (OOM)**

```bash
# Check available memory
docker exec souli-ollama free -h

# Use smaller models
OLLAMA_CHAT_MODEL=llama2:7b-chat
OLLAMA_TAGGER_MODEL=qwen:4b
```

### **EBS Volume Filling Up**

```bash
# Check disk usage
df -h /opt/souli

# Clean Docker cache
docker system prune -a

# Move old outputs to S3 (optional)
aws s3 sync /opt/souli/outputs s3://my-bucket/souli-outputs/
```

---

## Security Best Practices

### **Restrict SSH Access**

```bash
# Get your IP
curl https://checkip.amazonaws.com

# Allow only your IP
aws ec2 modify-security-group \
  --group-name souli-sg \
  --inbound-rules \
  "IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges=[{CidrIp=YOUR_IP/32}]" \
  --region us-east-1
```

### **Use IAM Roles (Not Access Keys)**

Instead of hardcoding AWS credentials, use an EC2 IAM role attached to the instance.

### **Encrypt EBS Volumes**

Enable encryption when creating new instances (check "Encrypted" box in console).

### **Use Secrets Manager for API Keys**

```bash
# Store LiveKit secrets in AWS Secrets Manager
aws secretsmanager create-secret \
  --name souli/livekit \
  --secret-string '{"api_key":"...","api_secret":"..."}'
```

---

## Next Steps

1. **[Optional] Use S3 for Data** — Store large datasets in S3 instead of EBS
2. **[Optional] Auto-Scaling** — Create AMI image and auto-scaling group
3. **[Optional] CloudWatch Monitoring** — Monitor CPU/GPU usage
4. **[Optional] RDS for Database** — If adding Postgres backend

---

## FAQ

**Q: Can I use existing AWS infrastructure?**  
A: Yes, if you have VPC/subnets already. Set `EC2_SUBNET_ID` in `.env`.

**Q: How do I switch regions?**  
A: Change `AWS_REGION` in `.env` before creating instance.

**Q: Can I use Spot instances?**  
A: Yes, manually create via AWS console for 60-70% discount (but instances can be interrupted).

**Q: Should I use Ubuntu or Amazon Linux?**  
A: Both work. Scripts auto-detect OS. Ubuntu is recommended.

**Q: Can models persistent across instance stops?**  
A: Yes! EBS volume is preserved. Restart instance and volumes remount automatically.

---

## Support

- Check logs: `docker compose logs -f`
- SSH and check `/opt/souli` directory
- AWS Status: https://status.aws.amazon.com
