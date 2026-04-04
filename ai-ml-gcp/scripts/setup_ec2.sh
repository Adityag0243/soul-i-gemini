#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# setup_ec2.sh — One-time AWS EC2 setup script
#
# Run this ONCE after launching the EC2 instance:
#   ssh -i your-key.pem ec2-user@your-ec2-ip 'bash -s' < scripts/setup_ec2.sh
#
# What it does:
#   1. Installs NVIDIA GPU drivers + CUDA toolkit (if GPU instance)
#   2. Installs Docker + NVIDIA Container Toolkit (so Docker can use GPU)
#   3. Installs Docker Compose v2
#   4. Clones this repo to /opt/souli
#   5. Pulls Ollama models (llama3.1 + qwen2.5:1.5b)
#
# Recommended EC2 Instance:
#   AMI: Deep Learning Base AMI (Ubuntu 22.04) — comes with CUDA pre-installed
#   Instance Type: g4dn.xlarge (1x NVIDIA T4, 4 vCPU, 16 GB RAM) — ~$0.53/hr
#                  or g4dn.2xlarge for faster training
#   Root Volume: 100 GB gp3 (EBS) — for models + data
#
# Cost estimate: ~$0.53/hr (g4dn.xlarge) + EBS
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

echo "============================================================"
echo "  Souli AWS EC2 Setup"
echo "============================================================"

# Detect OS (Amazon Linux 2 vs Ubuntu)
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
else
    echo "ERROR: Unable to detect OS"
    exit 1
fi

echo "Detected OS: $OS"

# ── 1. System packages ────────────────────────────────────────────────────────
echo "[1/6] Installing system packages..."

if [ "$OS" == "amzn" ]; then
    # Amazon Linux 2
    sudo yum update -y
    sudo yum install -y \
        curl wget git unzip ca-certificates \
        ffmpeg mpg123
elif [ "$OS" == "ubuntu" ]; then
    # Ubuntu 22.04
    sudo apt-get update -qq
    sudo apt-get install -y --no-install-recommends \
        curl wget git unzip ca-certificates gnupg lsb-release \
        ffmpeg mpg123
else
    echo "Unsupported OS: $OS"
    exit 1
fi

# ── 2. Docker ─────────────────────────────────────────────────────────────────
echo "[2/6] Installing Docker..."

if ! command -v docker &> /dev/null; then
    if [ "$OS" == "amzn" ]; then
        # Amazon Linux 2
        sudo yum install -y docker
        sudo systemctl start docker
        sudo usermod -aG docker ec2-user
    else
        # Ubuntu
        curl -fsSL https://get.docker.com | sudo bash
        sudo usermod -aG docker "$USER"
    fi
    echo "Docker installed."
else
    echo "Docker already installed."
fi

# ── 3. NVIDIA GPU drivers ─────────────────────────────────────────────────────
echo "[3/6] Installing NVIDIA drivers (if GPU present)..."

if lspci | grep -i nvidia > /dev/null 2>&1; then
    echo "  NVIDIA GPU detected!"
    
    # Check if Deep Learning Base AMI (CUDA already installed)
    if command -v nvidia-smi &> /dev/null; then
        echo "  NVIDIA drivers already installed."
        nvidia-smi
    else
        # Manual install if not pre-installed
        echo "  Installing NVIDIA drivers..."
        if [ "$OS" == "amzn" ]; then
            sudo yum install -y https://developer.download.nvidia.com/compute/cuda/repos/rhel8/x86_64/cuda-repo-rhel8-12.8.0-1.el8.x86_64.rpm
            sudo yum install -y cuda-drivers
        else
            wget -q https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/cuda-keyring_1.1-1_all.deb
            sudo dpkg -i cuda-keyring_1.1-1_all.deb
            sudo apt-get update -qq
            sudo apt-get install -y --no-install-recommends cuda-drivers
        fi
    fi
    
    # NVIDIA Container Toolkit (lets Docker use GPU)
    echo "  Installing NVIDIA Container Toolkit..."
    curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
    curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
        sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
        sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
    
    if [ "$OS" == "ubuntu" ]; then
        sudo apt-get update -qq
        sudo apt-get install -y nvidia-container-toolkit
    fi
    
    sudo nvidia-ctk runtime configure --runtime=docker
    sudo systemctl restart docker
    echo "  NVIDIA Container Toolkit installed."
else
    echo "  No NVIDIA GPU detected — Ollama will run on CPU (slower)."
    echo "  Recommend: g4dn.xlarge or p3.2xlarge for production."
fi

# ── 4. Docker Compose v2 ──────────────────────────────────────────────────────
echo "[4/6] Installing Docker Compose v2..."

if ! docker compose version &> /dev/null 2>&1; then
    COMPOSE_VERSION="v2.27.1"
    sudo mkdir -p /usr/local/lib/docker/cli-plugins
    sudo curl -SL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-x86_64" \
        -o /usr/local/lib/docker/cli-plugins/docker-compose
    sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
    echo "Docker Compose installed."
else
    echo "Docker Compose already installed: $(docker compose version)"
fi

# ── 5. Clone / update repo ────────────────────────────────────────────────────
echo "[5/6] Setting up /opt/souli..."

REPO_DIR="/opt/souli"
REPO_URL="${SOULI_REPO_URL:-https://github.com/YOUR_ORG/souli-voice-pipeline.git}"

if [ ! -d "$REPO_DIR/.git" ]; then
    sudo git clone "$REPO_URL" "$REPO_DIR"
    sudo chown -R "$(whoami)":"$(whoami)" "$REPO_DIR"
    echo "Repo cloned to $REPO_DIR"
else
    cd "$REPO_DIR" && sudo git pull
    chown -R "$(whoami)":"$(whoami)" "$REPO_DIR"
    echo "Repo updated."
fi

cd "$REPO_DIR"

# Copy .env template if it doesn't exist
if [ ! -f .env ]; then
    echo ""
    echo "─────────────────────────────────────────────────────────"
    echo "Creating .env file from template..."
    echo "─────────────────────────────────────────────────────────"
    cat > .env << 'EOF'
# ── Docker Compose ────────────────────────────────────────────────────
COMPOSE_PROJECT_NAME=souli

# ── Ollama ─────────────────────────────────────────────────────────────
OLLAMA_CHAT_MODEL=llama3.1
OLLAMA_TAGGER_MODEL=qwen2.5:1.5b

# ── Qdrant ─────────────────────────────────────────────────────────────
QDRANT_COLLECTION=souli_chunks

# ── LiveKit (optional — remove if not using voice) ────────────────────
# Get free tier at: https://livekit.io
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret
LIVEKIT_ROOM=souli-room

# ── Logging & Config ───────────────────────────────────────────────────
SOULI_LOG_LEVEL=INFO
SOULI_CONFIG_PATH=/app/configs/pipeline.aws.yaml
EOF
    echo "✓ Created .env file. EDIT IT with your settings!"
else
    echo "✓ .env already exists"
fi

# ── 6. Download Ollama models ─────────────────────────────────────────────
echo "[6/6] Pre-downloading Ollama models (this takes ~5-10 min on first run)..."
echo ""
echo "Starting Ollama container to pull models..."

# Start Ollama in background
docker compose -f docker-compose.aws.yml up -d ollama

# Wait for Ollama to be ready
echo "Waiting for Ollama service..."
sleep 10

# Pull models
echo "Pulling llama3.1..."
docker exec souli-ollama ollama pull llama3.1 || echo "  (Ollama may still be initializing...)"

echo "Pulling qwen2.5:1.5b..."
docker exec souli-ollama ollama pull qwen2.5:1.5b || echo "  (Ollama may still be initializing...)"

echo ""
echo "============================================================"
echo "  ✓ Setup complete!"
echo "============================================================"
echo ""
echo "Next steps:"
echo "  1. Edit .env with your settings"
echo "  2. Verify Ollama models:"
echo "       docker exec souli-ollama ollama list"
echo "  3. Start all services:"
echo "       docker compose -f docker-compose.aws.yml up -d"
echo "  4. Check logs:"
echo "       docker compose -f docker-compose.aws.yml logs -f"
echo ""
echo "Access the app:"
echo "  Streamlit UI:  http://$(hostname -I | awk '{print $1}'):8501"
echo "  FastAPI docs: http://$(hostname -I | awk '{print $1}'):8000/docs"
echo ""
echo "SSH back to this machine:"
echo "  ssh -i your-key.pem ec2-user@$(ec2-metadata --public-ipv4 | cut -d' ' -f2) 2>/dev/null || ssh -i your-key.pem $(whoami)@$(hostname -I | awk '{print $1}')"
echo ""
