.PHONY: install fmt lint run \
        compose-up compose-down compose-ps compose-logs \
        pull-models build \
        api api-logs api-test \
        gcp-vm gcp-setup gcp-deploy gcp-ssh gcp-logs gcp-status \
        gcp-pipeline gcp-ingest gcp-chat gcp-start-vm gcp-stop-vm \
        aws-vm aws-setup aws-deploy aws-ssh aws-logs aws-status \
        aws-pipeline aws-ingest aws-chat aws-start-vm aws-stop-vm

# ── Load .env ─────────────────────────────────────────────────────────────────
include .env
export

# ── Dynamic compose file selection ────────────────────────────────────────────
# Set CLOUD_PLATFORM=aws in .env (default) or CLOUD_PLATFORM=gcp to switch
COMPOSE_FILE := docker-compose.$(CLOUD_PLATFORM).yml

# ── SSH settings for AWS ──────────────────────────────────────────────────────
EC2_USER ?= ubuntu
EC2_SSH_OPTS := -o StrictHostKeyChecking=no -o ConnectTimeout=10
ifdef EC2_KEY_FILE
  EC2_SSH_OPTS += -i $(EC2_KEY_FILE)
endif
EC2_HOST := $(EC2_USER)@$(AWS_PUBLIC_IP)
EC2_DIR := /opt/souli/ai-ml-gcp

# ── Local dev ─────────────────────────────────────────────────────────────────
install:
	pip install -r requirements.txt

fmt:
	python -m pip install -q ruff && ruff format .

lint:
	python -m pip install -q ruff && ruff check .

run:
	souli --help

# ── Run API locally (for development) ────────────────────────────────────────
api:
	uvicorn souli_pipeline.api:app --host 0.0.0.0 --port 8000 --reload

# Quick health check against local API
api-test:
	curl -s http://localhost:8000/health | python3 -m json.tool

# ── Docker Compose (uses CLOUD_PLATFORM from .env) ───────────────────────────
build:
	docker compose -f $(COMPOSE_FILE) build

compose-up:
	docker compose -f $(COMPOSE_FILE) --env-file .env up -d

compose-down:
	docker compose -f $(COMPOSE_FILE) down

compose-ps:
	docker compose -f $(COMPOSE_FILE) ps

compose-logs:
	docker compose -f $(COMPOSE_FILE) logs -f --tail=100

# Stream logs for just the API container
api-logs:
	docker compose -f $(COMPOSE_FILE) logs -f souli-api

pull-models:
	@echo "Pulling llama3.1 and qwen2.5:1.5b into Ollama..."
	docker compose -f $(COMPOSE_FILE) exec ollama ollama pull llama3.1
	docker compose -f $(COMPOSE_FILE) exec ollama ollama pull qwen2.5:1.5b


# ═══════════════════════════════════════════════════════════════════════════════
# AWS — EC2 Management
# ═══════════════════════════════════════════════════════════════════════════════

aws-vm:
	@echo "Creating EC2 instance..."
	bash scripts/create_ec2.sh

aws-setup:
	@echo "Running one-time setup on EC2 instance..."
	ssh $(EC2_SSH_OPTS) $(EC2_HOST) 'bash -s' < scripts/setup_ec2.sh

aws-deploy:
	@echo "Deploying to EC2 instance..."
	bash scripts/deploy_aws.sh $(AWS_PUBLIC_IP)

aws-ssh:
	ssh $(EC2_SSH_OPTS) $(EC2_HOST)

aws-logs:
	ssh $(EC2_SSH_OPTS) $(EC2_HOST) \
	    'cd $(EC2_DIR) && docker compose -f docker-compose.aws.yml logs -f --tail=100'

aws-api-logs:
	ssh $(EC2_SSH_OPTS) $(EC2_HOST) \
	    'cd $(EC2_DIR) && docker compose -f docker-compose.aws.yml logs -f souli-api'

aws-status:
	ssh $(EC2_SSH_OPTS) $(EC2_HOST) \
	    'cd $(EC2_DIR) && docker compose -f docker-compose.aws.yml ps'

# ── Run pipeline on AWS ──────────────────────────────────────────────────────
aws-pipeline:
	@echo "Running full pipeline on EC2 instance (energy + all videos)..."
	ssh $(EC2_SSH_OPTS) $(EC2_HOST) \
	    'cd $(EC2_DIR) && docker compose -f docker-compose.aws.yml exec -T souli \
	     souli run all \
	       --config /app/configs/pipeline.aws.yaml \
	       --videos-csv /app/data/videos.csv \
	       --excel-path "/app/data/Souli_EnergyFramework_PW (1).xlsx" \
	       --merge'

aws-ingest:
	@echo "Ingesting YouTube chunks into Qdrant on EC2 instance..."
	ssh $(EC2_SSH_OPTS) $(EC2_HOST) \
	    'cd $(EC2_DIR) && docker compose -f docker-compose.aws.yml exec -T souli \
	     souli ingest --config /app/configs/pipeline.aws.yaml'

aws-chat:
	@echo "Starting chat session on EC2 instance..."
	ssh $(EC2_SSH_OPTS) $(EC2_HOST) \
	    'cd $(EC2_DIR) && docker compose -f docker-compose.aws.yml exec souli \
	     souli chat --config /app/configs/pipeline.aws.yaml \
	       --excel "/app/data/Souli_EnergyFramework_PW (1).xlsx"'

aws-start-vm:
	@echo "Starting EC2 instance..."
	aws ec2 start-instances --instance-ids $(EC2_INSTANCE_ID) --region $(AWS_REGION)
	@echo "Waiting for instance to be running..."
	aws ec2 wait instance-running --instance-ids $(EC2_INSTANCE_ID) --region $(AWS_REGION)
	@echo "✓ Instance started."

aws-stop-vm:
	@echo "Stopping EC2 instance to save costs..."
	aws ec2 stop-instances --instance-ids $(EC2_INSTANCE_ID) --region $(AWS_REGION)
	@echo "Waiting for instance to stop..."
	aws ec2 wait instance-stopped --instance-ids $(EC2_INSTANCE_ID) --region $(AWS_REGION)
	@echo "✓ Instance stopped."

# Dynamic IP fetching for AWS
aws-get-ip:
	@aws ec2 describe-instances \
	    --instance-ids $(EC2_INSTANCE_ID) \
	    --region $(AWS_REGION) \
	    --query 'Reservations[0].Instances[0].PublicIpAddress' \
	    --output text

aws-api-test:
	@echo "Testing API at http://$(AWS_PUBLIC_IP):8000"
	curl -s http://$(AWS_PUBLIC_IP):8000/health | python3 -m json.tool


# ═══════════════════════════════════════════════════════════════════════════════
# GCP — GCE VM Management (legacy — kept for backward compatibility)
# ═══════════════════════════════════════════════════════════════════════════════

gcp-vm:
	@echo "Creating GCE VM..."
	bash scripts/create_vm.sh

gcp-setup:
	@echo "Running one-time setup on GCE VM..."
	gcloud compute ssh $(GCE_VM_NAME) --zone $(GCE_ZONE) --project $(GCE_PROJECT) \
	    -- 'bash -s' < scripts/setup_gce.sh

gcp-deploy:
	@echo "Deploying to GCE VM..."
	bash scripts/deploy.sh $(GCE_VM_NAME) $(GCE_ZONE) $(GCE_PROJECT)

gcp-ssh:
	gcloud compute ssh $(GCE_VM_NAME) --zone $(GCE_ZONE) --project $(GCE_PROJECT)

gcp-logs:
	gcloud compute ssh $(GCE_VM_NAME) --zone $(GCE_ZONE) --project $(GCE_PROJECT) \
	    -- 'cd /opt/souli && docker compose -f docker-compose.gcp.yml logs -f --tail=100'

gcp-api-logs:
	gcloud compute ssh $(GCE_VM_NAME) --zone $(GCE_ZONE) --project $(GCE_PROJECT) \
	    -- 'cd /opt/souli && docker compose -f docker-compose.gcp.yml logs -f souli-api'

gcp-status:
	gcloud compute ssh $(GCE_VM_NAME) --zone $(GCE_ZONE) --project $(GCE_PROJECT) \
	    -- 'cd /opt/souli && docker compose -f docker-compose.gcp.yml ps'

# ── Run pipeline on GCP ───────────────────────────────────────────────────────
gcp-pipeline:
	@echo "Running full pipeline on GCE VM (energy + all videos)..."
	gcloud compute ssh $(GCE_VM_NAME) --zone $(GCE_ZONE) --project $(GCE_PROJECT) -- \
	    'cd /opt/souli && docker compose -f docker-compose.gcp.yml exec -T souli \
	     souli run all \
	       --config /app/configs/pipeline.gcp.yaml \
	       --videos-csv /app/data/videos.csv \
	       --excel-path "/app/data/Souli_EnergyFramework_PW (1).xlsx" \
	       --merge'

gcp-ingest:
	@echo "Ingesting YouTube chunks into Qdrant on GCE VM..."
	gcloud compute ssh $(GCE_VM_NAME) --zone $(GCE_ZONE) --project $(GCE_PROJECT) -- \
	    'cd /opt/souli && docker compose -f docker-compose.gcp.yml exec -T souli \
	     souli ingest --config /app/configs/pipeline.gcp.yaml'

gcp-chat:
	@echo "Starting chat session on GCE VM..."
	gcloud compute ssh $(GCE_VM_NAME) --zone $(GCE_ZONE) --project $(GCE_PROJECT) -- \
	    'cd /opt/souli && docker compose -f docker-compose.gcp.yml exec souli \
	     souli chat --config /app/configs/pipeline.gcp.yaml \
	       --excel "/app/data/Souli_EnergyFramework_PW (1).xlsx"'

gcp-start-vm:
	gcloud compute instances start $(GCE_VM_NAME) --zone $(GCE_ZONE) --project $(GCE_PROJECT)

gcp-stop-vm:
	@echo "Stopping VM to save costs..."
	gcloud compute instances stop $(GCE_VM_NAME) --zone $(GCE_ZONE) --project $(GCE_PROJECT)

# Dynamic IP fetching for GCP
get-ip:
	@gcloud compute instances describe $(GCE_VM_NAME) \
	  --zone=$(GCE_ZONE) --project=$(GCE_PROJECT) \
	  --format="get(networkInterfaces[0].accessConfigs[0].natIP)"

api-test-gcp:
	$(eval VM_IP := $(shell gcloud compute instances describe $(GCE_VM_NAME) \
	  --zone=$(GCE_ZONE) --project=$(GCE_PROJECT) \
	  --format="get(networkInterfaces[0].accessConfigs[0].natIP)"))
	@echo "Testing API at http://$(VM_IP):8000"
	curl -s http://$(VM_IP):8000/health | python3 -m json.tool