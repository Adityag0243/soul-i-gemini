#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# setup_ec2.sh — One-time EC2 instance setup script
#
# Run this ONCE after creating the instance:
#   ssh -i keys/<key>.pem ubuntu@<PUBLIC_IP> 'bash -s' < scripts/setup_ec2.sh
#
# Or if your lead added your SSH key to the instance:
#   ssh ubuntu@<PUBLIC_IP> 'bash -s' < scripts/setup_ec2.sh
#
# What it does:
#   1. Installs system packages (ffmpeg, curl, etc.)
#   2. Installs NVIDIA GPU drivers + CUDA toolkit
#   3. Installs Docker + NVIDIA Container Toolkit (so Docker can use the GPU)
#   4. Installs Docker Compose v2
#   5. Clones this repo to /opt/souli
#   6. Pulls Ollama models (llama3.1 + qwen2.5:1.5b)
#
# Recommended Instance: g5.2xlarge (A10G GPU) or g4dn.xlarge (T4 GPU)
#   g5.2xlarge:  ~$1.21/hr  (24GB VRAM, 8 vCPU, 32GB RAM)
#   g4dn.xlarge: ~$0.53/hr  (16GB VRAM, 4 vCPU, 16GB RAM)
#   EBS volume:  80 GB gp3 (for models + data)
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

echo "============================================================"
echo "  Souli EC2 Instance Setup"
echo "============================================================"

# ── 1. System packages ────────────────────────────────────────────────────────
echo "[1/6] Installing system packages..."
sudo apt-get update -qq
sudo apt-get install -y --no-install-recommends \
    curl wget git unzip ca-certificates gnupg lsb-release \
    ffmpeg mpg123

# ── 2. NVIDIA GPU drivers ─────────────────────────────────────────────────────
echo "[2/6] Installing NVIDIA drivers..."
# Check if GPU is present
if lspci | grep -i nvidia > /dev/null; then
    # Install CUDA keyring
    wget -q https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/cuda-keyring_1.1-1_all.deb
    sudo dpkg -i cuda-keyring_1.1-1_all.deb
    sudo apt-get update -qq
    sudo apt-get install -y --no-install-recommends cuda-drivers
    echo "NVIDIA drivers installed."
else
    echo "No NVIDIA GPU detected — skipping GPU driver install."
    echo "NOTE: Ollama will run on CPU (slower). Recommend GPU instance for production."
fi

# ── 3. Docker ─────────────────────────────────────────────────────────────────
echo "[3/6] Installing Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sudo bash
    sudo usermod -aG docker "$USER"
    echo "Docker installed. You may need to re-login for group changes."
else
    echo "Docker already installed."
fi

# NVIDIA Container Toolkit (lets Docker use GPU)
if lspci | grep -i nvidia > /dev/null; then
    echo "  Installing NVIDIA Container Toolkit..."
    curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
    curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
        sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
        sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
    sudo apt-get update -qq
    sudo apt-get install -y nvidia-container-toolkit
    sudo nvidia-ctk runtime configure --runtime=docker
    sudo systemctl restart docker
    echo "NVIDIA Container Toolkit installed."
fi

# ── 4. Docker Compose v2 ──────────────────────────────────────────────────────
echo "[4/6] Installing Docker Compose v2..."
if ! docker compose version &> /dev/null; then
    COMPOSE_VERSION="v2.27.1"
    sudo mkdir -p /usr/local/lib/docker/cli-plugins
    sudo curl -SL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-x86_64" \
        -o /usr/local/lib/docker/cli-plugins/docker-compose
    sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
    echo "Docker Compose $(docker compose version) installed."
else
    echo "Docker Compose already installed: $(docker compose version)"
fi

# ── 5. Clone / update repo ────────────────────────────────────────────────────
echo "[5/6] Setting up /opt/souli..."
REPO_DIR="/opt/souli"
REPO_URL="${SOULI_REPO_URL:-https://github.com/LeapX-Tech/soul-i.git}"
if [ ! -d "$REPO_DIR/.git" ]; then
    sudo git clone "$REPO_URL" "$REPO_DIR"
    sudo chown -R "$USER":"$USER" "$REPO_DIR"
    echo "Repo cloned to $REPO_DIR"
else
    cd "$REPO_DIR" && git pull
    echo "Repo updated."
fi

cd "$REPO_DIR/ai-ml-gcp"

# Copy .env if it doesn't exist
if [ ! -f .env ]; then
    cp .env.example .env
    echo ""
    echo "⚠️  Created .env from .env.example"
    echo "    Edit /opt/souli/ai-ml-gcp/.env and fill in keys before starting."
    echo ""
fi

# ── 6. Pull Ollama models ─────────────────────────────────────────────────────
echo "[6/6] Starting Ollama and pulling models..."

# Start just Ollama first
docker compose -f docker-compose.aws.yml up -d ollama

echo "  Waiting for Ollama to start..."
for i in $(seq 1 30); do
    if curl -sf http://localhost:11434/api/tags > /dev/null 2>&1; then
        echo "  Ollama is up."
        break
    fi
    sleep 3
done

echo "  Pulling llama3.1 (~4.7 GB)..."
docker compose -f docker-compose.aws.yml exec ollama ollama pull llama3.1

echo "  Pulling qwen2.5:1.5b (~1 GB)..."
docker compose -f docker-compose.aws.yml exec ollama ollama pull qwen2.5:1.5b

echo ""
echo "============================================================"
echo "  Setup complete!"
echo ""
echo "  Next steps:"
echo "  1. Edit /opt/souli/ai-ml-gcp/.env (fill in LIVEKIT_URL, keys, etc.)"
echo "  2. Upload your data files:"
echo "     scp 'Souli_EnergyFramework_PW (1).xlsx' ubuntu@<IP>:/opt/souli/ai-ml-gcp/data/"
echo "     scp data/videos.csv ubuntu@<IP>:/opt/souli/ai-ml-gcp/data/"
echo "  3. Start all services:"
echo "     cd /opt/souli/ai-ml-gcp && docker compose -f docker-compose.aws.yml up -d"
echo "  4. Run the full pipeline:"
echo "     docker compose -f docker-compose.aws.yml exec souli \\"
echo "       souli run all \\"
echo "       --config /app/configs/pipeline.aws.yaml \\"
echo "       --videos-csv /app/data/videos.csv \\"
echo "       --excel-path '/app/data/Souli_EnergyFramework_PW (1).xlsx' \\"
echo "       --merge"
echo "  5. Ingest into Qdrant:"
echo "     docker compose -f docker-compose.aws.yml exec souli \\"
echo "       souli ingest --config /app/configs/pipeline.aws.yaml"
echo "  6. Start a chat:"
echo "     docker compose -f docker-compose.aws.yml exec souli \\"
echo "       souli chat --config /app/configs/pipeline.aws.yaml \\"
echo "       --excel '/app/data/Souli_EnergyFramework_PW (1).xlsx'"
echo "============================================================"
