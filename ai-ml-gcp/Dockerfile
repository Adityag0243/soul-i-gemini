# ─────────────────────────────────────────────────────────────────────────────
# Souli Pipeline — Production Dockerfile
# Runs on EC2/GCE VM alongside Ollama + Qdrant containers via docker-compose
# Use docker-compose.aws.yml (default) or docker-compose.gcp.yml
# ─────────────────────────────────────────────────────────────────────────────
FROM nvidia/cuda:12.8.0-runtime-ubuntu22.04

RUN rm -f /etc/apt/sources.list.d/cuda*.list

# System deps + Python 3.11
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 \
    python3.11-dev \
    python3-pip \
    ffmpeg \
    git \
    curl \
    mpg123 \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && ln -sf /usr/bin/python3.11 /usr/bin/python3 \
WORKDIR /app
# Install Python deps first (layer cache)
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
# Copy source
COPY . /app

# Install the souli package (registers the `souli` CLI entrypoint)
RUN pip install .

# Create data and outputs directories
RUN mkdir -p /app/data /app/outputs
ENV PYTHONUNBUFFERED=1
ENV SOULI_LOG_LEVEL=INFO
ENV SOULI_CONFIG=/app/configs/pipeline.aws.yaml
CMD ["souli", "--help"]
