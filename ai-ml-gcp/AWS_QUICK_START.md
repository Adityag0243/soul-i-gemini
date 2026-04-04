# AWS Migration Quick-Start Checklist

## Pre-Migration (Local Machine)

- [ ] Installed AWS CLI v2
- [ ] Ran `aws configure` with AWS credentials
- [ ] Copied `.env.example` to `.env`
- [ ] Updated `.env` with AWS settings:
  - [ ] `AWS_REGION` (e.g., `us-east-1`)
  - [ ] `AWS_PROFILE` (e.g., `default`)
  - [ ] `EC2_INSTANCE_NAME` (e.g., `souli-instance`)
  - [ ] `EC2_INSTANCE_TYPE` (e.g., `g4dn.xlarge`)
  - [ ] `SOULI_REPO_URL` (your GitHub repo)
  - [ ] `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (if using voice)
- [ ] Made scripts executable: `chmod +x scripts/*.sh`

## Instance Creation Phase

- [ ] Run: `bash scripts/create_ec2.sh` or `make aws-vm`
- [ ] Wait for completion (~2 minutes)
- [ ] Note down:
  - [ ] Instance ID: `i-xxxxxxxxxx`
  - [ ] Public IP: `XX.XXX.XX.XX`
  - [ ] Key file saved: `souli-key.pem`
- [ ] Update `.env` with `EC2_INSTANCE_ID` (optional but recommended for `make aws-stop-vm`)

## EC2 Setup Phase

- [ ] Run: `ssh -i souli-key.pem ubuntu@XX.XXX.XX.XX 'bash -s' < scripts/setup_ec2.sh`
  - Or: `make aws-setup`
- [ ] Wait for completion (~10-15 minutes, mostly downloading models)
- [ ] Verify output shows:
  - [ ] NVIDIA drivers installed (if GPU instance)
  - [ ] Docker installed
  - [ ] Docker Compose v2 installed
  - [ ] Repository cloned to `/opt/souli`
  - [ ] Ollama models downloading

## Deployment Phase

- [ ] Run: `bash scripts/deploy_ec2.sh` or `make aws-deploy`
- [ ] Wait for completion (~5 minutes)
- [ ] Verify services started:
  ```bash
  ssh -i souli-key.pem ubuntu@XX.XXX.XX.XX
  cd /opt/souli
  docker compose -f docker-compose.aws.yml ps
  ```
- [ ] All 4 services should show `running`:
  - [ ] `souli-ollama`
  - [ ] `souli-qdrant`
  - [ ] `souli` (Streamlit)
  - [ ] `souli-api` (FastAPI)

## Verification Phase

- [ ] Test API health:
  ```bash
  curl -s http://XX.XXX.XX.XX:8000/health | python3 -m json.tool
  ```
  Should return: `{"status": "ok", "services": {...}}`

- [ ] Access web UIs:
  - [ ] Streamlit: `http://XX.XXX.XX.XX:8501` (should load)
  - [ ] FastAPI Docs: `http://XX.XXX.XX.XX:8000/docs` (should show API docs)
  - [ ] Qdrant: `http://XX.XXX.XX.XX:6333/dashboard` (optional)

- [ ] Verify Ollama models loaded:
  ```bash
  ssh -i souli-key.pem ubuntu@XX.XXX.XX.XX
  docker exec souli-ollama ollama list
  ```
  Should show:
  - [ ] `llama3.1` (or your chosen chat model)
  - [ ] `qwen2.5:1.5b` (or your chosen tagger)

## Running Jobs

- [ ] Uploaded test data:
  - [ ] `data/videos.csv`
  - [ ] `data/Souli_EnergyFramework_PW (1).xlsx`

- [ ] Test pipeline:
  ```bash
  # Option A: Via SSH
  ssh -i souli-key.pem ubuntu@XX.XXX.XX.XX
  cd /opt/souli
  docker compose -f docker-compose.aws.yml exec -T souli \
    souli run youtube --config /app/configs/pipeline.aws.yaml --youtube-url "https://youtu.be/VIDEO_ID"
  
  # Option B: Via Makefile
  make aws-pipeline
  ```

- [ ] Verified outputs are generated in `/app/outputs`

## Cost Management

- [ ] Set reminder to review AWS billing
- [ ] Tested stop/start:
  ```bash
  # Stop when not in use
  make aws-stop-vm
  
  # Start again
  make aws-start-vm
  ```
- [ ] Configured CloudWatch alarms (optional)

## Documentation

- [ ] Read [AWS_MIGRATION_GUIDE.md](./AWS_MIGRATION_GUIDE.md) for detailed reference
- [ ] Bookmarked AWS EC2 console: https://console.aws.amazon.com/ec2
- [ ] Saved connection command for quick SSH access:
  ```bash
  ssh -i souli-key.pem ubuntu@XX.XXX.XX.XX
  ```

## Optional: Advanced Setup

- [ ] [Optional] Set up S3 bucket for backups:
  ```bash
  aws s3 mb s3://souli-backups-$(date +%s) --region us-east-1
  ```

- [ ] [Optional] Enable EBS encryption for new volumes

- [ ] [Optional] Create CloudWatch dashboard for monitoring

- [ ] [Optional] Set up SNS alerts for instance state changes

---

## Troubleshooting Commands

```bash
# If something goes wrong, use these:

# SSH into instance
ssh -i souli-key.pem ubuntu@XX.XXX.XX.XX

# Check service status
docker compose -f docker-compose.aws.yml ps

# View full logs
docker compose -f docker-compose.aws.yml logs -f --tail=100

# Restart all services
docker compose -f docker-compose.aws.yml restart

# Check resource usage
docker stats

# Verify GPU
nvidia-smi

# Check disk space
df -h

# Check Ollama status
docker exec souli-ollama ollama list
docker exec souli-ollama ps aux
```

---

## Rollback to GCP (if needed)

If you want to keep running GCP alongside:

1. Update `.env`: `CLOUD_PLATFORM=gcp`
2. Use `docker-compose.gcp.yml`:
   ```bash
   docker compose -f docker-compose.gcp.yml up -d
   ```
3. Use `pipeline.gcp.yaml`:
   ```bash
   SOULI_CONFIG_PATH=/app/configs/pipeline.gcp.yaml
   ```

---

## Summary of New Files

| File | Purpose |
|------|---------|
| `docker-compose.aws.yml` | AWS compose configuration |
| `configs/pipeline.aws.yaml` | AWS-specific pipeline config |
| `scripts/setup_ec2.sh` | EC2 one-time setup |
| `scripts/create_ec2.sh` | Create EC2 instance |
| `scripts/deploy_ec2.sh` | Deploy to EC2 |
| `AWS_MIGRATION_GUIDE.md` | Full migration documentation |
| `.env.example` | Updated with AWS variables |
| `Makefile` | Added `aws-*` targets |

## Comparison: Old vs New Workflow

### GCP Workflow
```bash
bash scripts/create_vm.sh           # Create GCE VM
gcloud compute ssh ... setup_gce.sh # Setup GCE VM
bash scripts/deploy.sh              # Deploy to GCE
make gcp-logs                       # Check logs
```

### AWS Workflow
```bash
bash scripts/create_ec2.sh          # Create EC2 instance
ssh ... setup_ec2.sh                # Setup EC2 instance
bash scripts/deploy_ec2.sh          # Deploy to EC2
make aws-logs                       # Check logs
```

---

✅ **You're ready to deploy on AWS!**

Start with: `bash scripts/create_ec2.sh`
