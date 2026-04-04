.PHONY: install fmt lint run \
        gcp-vm gcp-setup gcp-deploy gcp-ssh gcp-logs gcp-status \
        gcp-pipeline gcp-ingest gcp-chat gcp-start-vm gcp-stop-vm \
        aws-vm aws-setup aws-deploy aws-ssh aws-logs aws-status \
        aws-pipeline aws-ingest aws-chat aws-start-vm aws-stop-vm \
        compose-up compose-down compose-ps compose-logs \
        pull-models build \
        api api-logs api-test

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

# ── Docker Compose (GCP) ──────────────────────────────────────────────────────
build:
	docker compose -f docker-compose.gcp.yml build

compose-up:
	docker compose -f docker-compose.gcp.yml --env-file .env up -d

compose-down:
	docker compose -f docker-compose.gcp.yml down

compose-ps:
	docker compose -f docker-compose.gcp.yml ps

compose-logs:
	docker compose -f docker-compose.gcp.yml logs -f --tail=100

# Stream logs for just the API container
api-logs:
	docker compose -f docker-compose.gcp.yml logs -f souli-api

# ── Docker Compose (AWS) ───────────────────────────────────────────────────────
compose-up-aws:
	docker compose -f docker-compose.aws.yml --env-file .env up -d

compose-down-aws:
	docker compose -f docker-compose.aws.yml down

compose-ps-aws:
	docker compose -f docker-compose.aws.yml ps

compose-logs-aws:
	docker compose -f docker-compose.aws.yml logs -f --tail=100

api-logs-aws:
	docker compose -f docker-compose.aws.yml logs -f souli-api

pull-models:
	@echo "Pulling llama3.1 and qwen2.5:1.5b into Ollama..."
	docker compose -f docker-compose.gcp.yml exec ollama ollama pull llama3.1
	docker compose -f docker-compose.gcp.yml exec ollama ollama pull qwen2.5:1.5b

pull-models-aws:
	@echo "Pulling llama3.1 and qwen2.5:1.5b into Ollama (AWS)..."
	docker compose -f docker-compose.aws.yml exec ollama ollama pull llama3.1
	docker compose -f docker-compose.aws.yml exec ollama ollama pull qwen2.5:1.5b

pull-models:
	@echo "Pulling llama3.1 and qwen2.5:1.5b into Ollama..."
	docker compose -f docker-compose.gcp.yml exec ollama ollama pull llama3.1
	docker compose -f docker-compose.gcp.yml exec ollama ollama pull qwen2.5:1.5b




# Dynamic IP fetching and API testing
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

# ── GCP VM management ─────────────────────────────────────────────────────────
include .env
export


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

# ═══════════════════════════════════════════════════════════════════════════════
# ── AWS EC2 Management ────────────────────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════════

aws-vm:
	@echo "Creating AWS EC2 instance..."
	bash scripts/create_ec2.sh

aws-setup:
	@echo "Running one-time setup on EC2 instance..."
	bash scripts/setup_ec2.sh

aws-deploy:
	@echo "Deploying to AWS EC2 instance..."
	bash scripts/deploy_ec2.sh

aws-ssh:
	@echo "Use: ssh -i <key-file> ubuntu@<instance-ip>"
	@echo "Or set EC2_INSTANCE_NAME in .env and find the instance automatically"

aws-logs:
	@bash -c 'read -p "Enter EC2 SSH address (ubuntu@IP): " addr; ssh -i $$(grep EC2_KEY_PAIR_NAME .env | cut -d= -f2).pem $$addr "cd /opt/souli && docker compose -f docker-compose.aws.yml logs -f --tail=100"'

aws-api-logs:
	@bash -c 'read -p "Enter EC2 SSH address (ubuntu@IP): " addr; ssh -i $$(grep EC2_KEY_PAIR_NAME .env | cut -d= -f2).pem $$addr "cd /opt/souli && docker compose -f docker-compose.aws.yml logs -f souli-api"'

aws-status:
	@bash -c 'read -p "Enter EC2 SSH address (ubuntu@IP): " addr; ssh -i $$(grep EC2_KEY_PAIR_NAME .env | cut -d= -f2).pem $$addr "cd /opt/souli && docker compose -f docker-compose.aws.yml ps"'

# ── Run pipeline on AWS ────────────────────────────────────────────────────────
aws-pipeline:
	@echo "Running full pipeline on EC2 (energy + all videos)..."
	@bash -c 'read -p "Enter EC2 SSH address (ubuntu@IP): " addr; ssh -i $$(grep EC2_KEY_PAIR_NAME .env | cut -d= -f2).pem $$addr "cd /opt/souli && docker compose -f docker-compose.aws.yml exec -T souli souli run all --config /app/configs/pipeline.aws.yaml --videos-csv /app/data/videos.csv --excel-path /app/data/Souli_EnergyFramework_PW\ \(1\).xlsx --merge"'

aws-ingest:
	@echo "Ingesting YouTube chunks into Qdrant on EC2..."
	@bash -c 'read -p "Enter EC2 SSH address (ubuntu@IP): " addr; ssh -i $$(grep EC2_KEY_PAIR_NAME .env | cut -d= -f2).pem $$addr "cd /opt/souli && docker compose -f docker-compose.aws.yml exec -T souli souli ingest --config /app/configs/pipeline.aws.yaml"'

aws-chat:
	@echo "Starting chat session on EC2..."
	@bash -c 'read -p "Enter EC2 SSH address (ubuntu@IP): " addr; ssh -i $$(grep EC2_KEY_PAIR_NAME .env | cut -d= -f2).pem $$addr "cd /opt/souli && docker compose -f docker-compose.aws.yml exec souli souli chat --config /app/configs/pipeline.aws.yaml --excel /app/data/Souli_EnergyFramework_PW\ \(1\).xlsx"'

aws-start-vm:
	@echo "Starting EC2 instance..."
	@bash -c 'instance_id=$$(grep EC2_INSTANCE_ID .env 2>/dev/null | cut -d= -f2); region=$$(grep AWS_REGION .env | cut -d= -f2); if [ -n "$$instance_id" ]; then aws ec2 start-instances --instance-ids $$instance_id --region $$region; fi'

aws-stop-vm:
	@echo "Stopping EC2 instance to save costs..."
	@bash -c 'instance_id=$$(grep EC2_INSTANCE_ID .env 2>/dev/null | cut -d= -f2); region=$$(grep AWS_REGION .env | cut -d= -f2); if [ -n "$$instance_id" ]; then aws ec2 stop-instances --instance-ids $$instance_id --region $$region; fi'