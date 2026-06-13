#!/usr/bin/env bash
# Provision TDLib gateway on Google Cloud (Compute Engine + Artifact Registry + Secret Manager).
# Requires: gcloud auth login, .env with DATABASE_URL, TELEGRAM_API_ID, TELEGRAM_API_HASH
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

PROJECT_ID="${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${GCP_REGION:-us-central1}"
ZONE="${GCP_ZONE:-us-central1-a}"
REPO="tdlib"
IMAGE_NAME="tdlib-gateway"
VM_NAME="tdlib-gateway-vm"
DATA_DISK="tdlib-gateway-data"
STATIC_IP_NAME="tdlib-gateway-ip"
FIREWALL_RULE="allow-tdlib-gateway-8787"
IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${IMAGE_NAME}:latest"

if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" = "(unset)" ]; then
  echo "Set GCP project: gcloud config set project YOUR_PROJECT_ID"
  exit 1
fi

if [ ! -f .env ]; then
  echo "Missing .env in repo root (need DATABASE_URL, TELEGRAM_API_ID, TELEGRAM_API_HASH)."
  exit 1
fi

read_env() {
  local key="$1"
  local line val
  line="$(grep -E "^${key}=" .env | tail -1 || true)"
  val="${line#${key}=}"
  val="${val%\"}"
  val="${val#\"}"
  val="${val%\'}"
  val="${val#\'}"
  printf '%s' "$val"
}

DATABASE_URL="$(read_env DATABASE_URL)"
TELEGRAM_API_ID="$(read_env TELEGRAM_API_ID)"
TELEGRAM_API_HASH="$(read_env TELEGRAM_API_HASH)"
TDLIB_GATEWAY_SECRET="$(read_env TDLIB_GATEWAY_SECRET)"

# Allow overrides when not stored in .env (e.g. export before running).
TELEGRAM_API_ID="${TELEGRAM_API_ID:-${TELEGRAM_API_ID_OVERRIDE:-}}"
TELEGRAM_API_HASH="${TELEGRAM_API_HASH:-${TELEGRAM_API_HASH_OVERRIDE:-}}"

if [ -z "$DATABASE_URL" ]; then
  echo ".env must define DATABASE_URL"
  exit 1
fi

MISSING_TELEGRAM=0
if [ -z "$TELEGRAM_API_ID" ] || [ -z "$TELEGRAM_API_HASH" ]; then
  MISSING_TELEGRAM=1
  TELEGRAM_API_ID="${TELEGRAM_API_ID:-UNCONFIGURED}"
  TELEGRAM_API_HASH="${TELEGRAM_API_HASH:-UNCONFIGURED}"
  echo "WARNING: TELEGRAM_API_ID / TELEGRAM_API_HASH not in .env."
  echo "         Infra will deploy; update secrets in GCP Console before connect works."
  echo "         https://my.telegram.org/apps"
fi

if [ -z "$TDLIB_GATEWAY_SECRET" ]; then
  TDLIB_GATEWAY_SECRET="$(openssl rand -hex 32 2>/dev/null || python -c 'import secrets; print(secrets.token_hex(32))')"
  echo "Generated TDLIB_GATEWAY_SECRET (also add to Vercel env)."
fi

echo "==> Project: $PROJECT_ID  Region: $REGION  Zone: $ZONE"

echo "==> Enabling APIs..."
gcloud services enable \
  compute.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  --project="$PROJECT_ID"

echo "==> Artifact Registry repo..."
if ! gcloud artifacts repositories describe "$REPO" --location="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$REPO" \
    --repository-format=docker \
    --location="$REGION" \
    --description="TDLib gateway images" \
    --project="$PROJECT_ID"
fi

upsert_secret() {
  local name="$1" value="$2"
  if gcloud secrets describe "$name" --project="$PROJECT_ID" >/dev/null 2>&1; then
    printf '%s' "$value" | gcloud secrets versions add "$name" --data-file=- --project="$PROJECT_ID"
  else
    printf '%s' "$value" | gcloud secrets create "$name" --data-file=- --project="$PROJECT_ID"
  fi
}

echo "==> Secret Manager..."
upsert_secret tdlib-gateway-database-url "$DATABASE_URL"
upsert_secret tdlib-gateway-telegram-api-id "$TELEGRAM_API_ID"
upsert_secret tdlib-gateway-telegram-api-hash "$TELEGRAM_API_HASH"
upsert_secret tdlib-gateway-secret "$TDLIB_GATEWAY_SECRET"

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
for s in tdlib-gateway-database-url tdlib-gateway-telegram-api-id tdlib-gateway-telegram-api-hash tdlib-gateway-secret; do
  gcloud secrets add-iam-policy-binding "$s" \
    --project="$PROJECT_ID" \
    --member="serviceAccount:${COMPUTE_SA}" \
    --role="roles/secretmanager.secretAccessor" \
    --quiet >/dev/null 2>&1 || true
done

echo "==> Cloud Build (linux/amd64 image)..."
gcloud builds submit "$ROOT" \
  --project="$PROJECT_ID" \
  --tag="$IMAGE_URI" \
  --dockerfile="deploy/gcp/Dockerfile.tdlib-gateway" \
  --ignore-file="deploy/gcp/.dockerignore" \
  --gcs-log-dir="gs://${PROJECT_ID}_cloudbuild/logs"

echo "==> Static IP..."
if ! gcloud compute addresses describe "$STATIC_IP_NAME" --region="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud compute addresses create "$STATIC_IP_NAME" --region="$REGION" --project="$PROJECT_ID"
fi
GATEWAY_IP="$(gcloud compute addresses describe "$STATIC_IP_NAME" --region="$REGION" --project="$PROJECT_ID" --format='value(address)')"

echo "==> Firewall (tcp:8787, tag tdlib-gateway)..."
if ! gcloud compute firewall-rules describe "$FIREWALL_RULE" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud compute firewall-rules create "$FIREWALL_RULE" \
    --project="$PROJECT_ID" \
    --allow=tcp:8787 \
    --target-tags=tdlib-gateway \
    --source-ranges=0.0.0.0/0 \
    --description="TDLib gateway (protected by X-Gateway-Secret)"
fi

echo "==> Persistent disk..."
if ! gcloud compute disks describe "$DATA_DISK" --zone="$ZONE" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud compute disks create "$DATA_DISK" --size=20GB --zone="$ZONE" --project="$PROJECT_ID"
fi

STARTUP="$(mktemp)"
sed \
  -e "s|__PROJECT_ID__|${PROJECT_ID}|g" \
  -e "s|__REGION__|${REGION}|g" \
  -e "s|__IMAGE_URI__|${IMAGE_URI}|g" \
  -e "s|__DATA_DISK_NAME__|${DATA_DISK}|g" \
  "$ROOT/deploy/gcp/vm-startup.sh" > "$STARTUP"

echo "==> Compute Engine VM..."
if gcloud compute instances describe "$VM_NAME" --zone="$ZONE" --project="$PROJECT_ID" >/dev/null 2>&1; then
  echo "VM exists — resetting with new startup script and restarting..."
  gcloud compute instances add-metadata "$VM_NAME" \
    --zone="$ZONE" \
    --project="$PROJECT_ID" \
    --metadata-from-file=startup-script="$STARTUP"
  gcloud compute instances reset "$VM_NAME" --zone="$ZONE" --project="$PROJECT_ID"
else
  gcloud compute instances create "$VM_NAME" \
    --project="$PROJECT_ID" \
    --zone="$ZONE" \
    --machine-type=e2-small \
    --tags=tdlib-gateway \
    --address="$GATEWAY_IP" \
    --scopes=cloud-platform \
    --boot-disk-size=20GB \
    --image-family=ubuntu-2204-lts \
    --image-project=ubuntu-os-cloud \
    --disk="name=${DATA_DISK},mode=rw,boot=no,auto-delete=no" \
    --metadata-from-file=startup-script="$STARTUP"
fi

rm -f "$STARTUP"

GATEWAY_URL="http://${GATEWAY_IP}:8787"

echo ""
echo "=============================================="
echo " TDLib gateway provisioned on Google Cloud"
echo "=============================================="
echo " Console VM:     https://console.cloud.google.com/compute/instances?project=${PROJECT_ID}"
echo " Console secrets: https://console.cloud.google.com/security/secret-manager?project=${PROJECT_ID}"
echo " Gateway URL:    ${GATEWAY_URL}"
echo ""
echo " Add to Vercel (Settings → Environment Variables):"
echo "   TDLIB_GATEWAY_URL=${GATEWAY_URL}"
echo "   TDLIB_GATEWAY_SECRET=${TDLIB_GATEWAY_SECRET}"
if [ "$MISSING_TELEGRAM" = "1" ]; then
  echo "   TELEGRAM_API_ID=(from https://my.telegram.org/apps)"
  echo "   TELEGRAM_API_HASH=(from https://my.telegram.org/apps)"
  echo ""
  echo " Then update GCP Secret Manager (Console → Security → Secret Manager):"
  echo "   tdlib-gateway-telegram-api-id"
  echo "   tdlib-gateway-telegram-api-hash"
  echo " Reset VM after updating secrets: gcloud compute instances reset ${VM_NAME} --zone=${ZONE} --project=${PROJECT_ID}"
else
  echo "   TELEGRAM_API_ID=${TELEGRAM_API_ID}"
  echo "   TELEGRAM_API_HASH=(same as .env)"
fi
echo ""
echo " Wait ~3–5 min for startup script, then test:"
echo "   curl ${GATEWAY_URL}/v1/health"
echo "=============================================="
