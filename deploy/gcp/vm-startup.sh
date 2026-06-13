#!/bin/bash
# Runs on first boot of the TDLib gateway VM (Ubuntu 22.04).
set -euo pipefail

PROJECT_ID="__PROJECT_ID__"
REGION="__REGION__"
IMAGE_URI="__IMAGE_URI__"
DATA_DISK_NAME="__DATA_DISK_NAME__"

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y docker.io google-cloud-cli jq
systemctl enable docker
systemctl start docker

DATA_DEV="/dev/disk/by-id/google-${DATA_DISK_NAME}"
if [ -b "${DATA_DEV}" ]; then
  if ! blkid "${DATA_DEV}" >/dev/null 2>&1; then
    mkfs.ext4 -F "${DATA_DEV}"
  fi
  mkdir -p /mnt/tdlib-data
  if ! mountpoint -q /mnt/tdlib-data; then
    mount "${DATA_DEV}" /mnt/tdlib-data
  fi
  if ! grep -q "${DATA_DISK_NAME}" /etc/fstab; then
    echo "${DATA_DEV} /mnt/tdlib-data ext4 defaults,nofail 0 2" >> /etc/fstab
  fi
else
  mkdir -p /mnt/tdlib-data
fi

gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

fetch_secret() {
  gcloud secrets versions access latest --secret="$1" --project="${PROJECT_ID}"
}

export DATABASE_URL
export TELEGRAM_API_ID
export TELEGRAM_API_HASH
export TDLIB_GATEWAY_SECRET
DATABASE_URL="$(fetch_secret tdlib-gateway-database-url)"
TELEGRAM_API_ID="$(fetch_secret tdlib-gateway-telegram-api-id)"
TELEGRAM_API_HASH="$(fetch_secret tdlib-gateway-telegram-api-hash)"
TDLIB_GATEWAY_SECRET="$(fetch_secret tdlib-gateway-secret)"

docker pull "${IMAGE_URI}"
docker stop tdlib-gateway 2>/dev/null || true
docker rm tdlib-gateway 2>/dev/null || true

docker run -d \
  --name tdlib-gateway \
  --restart unless-stopped \
  -p 8787:8787 \
  -v /mnt/tdlib-data:/data/tdlib \
  -e DATABASE_URL \
  -e TELEGRAM_API_ID \
  -e TELEGRAM_API_HASH \
  -e TDLIB_GATEWAY_SECRET \
  -e TDLIB_GATEWAY_HOST=0.0.0.0 \
  -e TDLIB_GATEWAY_PORT=8787 \
  -e TDLIB_DB_ROOT=/data/tdlib \
  "${IMAGE_URI}"

echo "[tdlib-gateway-vm] container started"
