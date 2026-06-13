# TDLib gateway on Google Cloud (Console + one command)

Billing must be enabled on the project before any of this works:

https://console.cloud.google.com/billing/linkedaccount?project=hyperlinksspacebot

After billing is on, the fastest path is still one local command (uses the same project as Console):

```bash
# Add to .env first (from https://my.telegram.org/apps):
# TELEGRAM_API_ID=...
# TELEGRAM_API_HASH=...

npm run gcp:tdlib-gateway
```

That script creates everything below via the Cloud APIs (same as clicking through Console).

---

## Manual Console checklist (project: `hyperlinksspacebot`)

### 1. Enable APIs

Console → **APIs & Services** → **Library** → enable:

- Compute Engine API
- Artifact Registry API
- Cloud Build API
- Secret Manager API

Or: https://console.cloud.google.com/apis/library?project=hyperlinksspacebot

### 2. Secret Manager

Console → **Security** → **Secret Manager** → **Create secret**

| Secret name | Value |
|-------------|--------|
| `tdlib-gateway-database-url` | Your Neon `DATABASE_URL` (same as Vercel) |
| `tdlib-gateway-telegram-api-id` | From https://my.telegram.org/apps |
| `tdlib-gateway-telegram-api-hash` | From https://my.telegram.org/apps |
| `tdlib-gateway-secret` | Long random string (shared with Vercel) |

Grant **Secret Manager Secret Accessor** to the default Compute Engine service account:

`PROJECT_NUMBER-compute@developer.gserviceaccount.com`

(IAM → find that SA → Grant Access → role **Secret Manager Secret Accessor**)

### 3. Artifact Registry + image

Console → **Artifact Registry** → **Create repository**

- Name: `tdlib`
- Format: Docker
- Region: `us-central1`

Build image (Cloud Build → **Submit build**), or run locally:

```bash
gcloud builds submit . \
  --tag us-central1-docker.pkg.dev/hyperlinksspacebot/tdlib/tdlib-gateway:latest \
  --dockerfile=deploy/gcp/Dockerfile.tdlib-gateway \
  --ignore-file=deploy/gcp/.dockerignore
```

### 4. Static IP

Console → **VPC network** → **IP addresses** → **Reserve external static address**

- Name: `tdlib-gateway-ip`
- Region: `us-central1`

Note the IP (e.g. `34.x.x.x`). Gateway URL will be `http://THAT_IP:8787`.

### 5. Firewall

Console → **VPC network** → **Firewall** → **Create firewall rule**

- Name: `allow-tdlib-gateway-8787`
- Targets: **Specified target tags** → `tdlib-gateway`
- Source: `0.0.0.0/0`
- Protocols: **tcp:8787**

(Connect routes require `X-Gateway-Secret`; health check is public.)

### 6. Persistent disk

Console → **Compute Engine** → **Disks** → **Create disk**

- Name: `tdlib-gateway-data`
- Region: `us-central1`
- Size: 20 GB

### 7. VM

Console → **Compute Engine** → **VM instances** → **Create instance**

- Name: `tdlib-gateway-vm`
- Region/zone: `us-central1` / `us-central1-a`
- Machine: `e2-small`
- Boot disk: Ubuntu 22.04 LTS, 20 GB
- **Additional disks**: attach `tdlib-gateway-data`
- **Networking**: External IPv4 → `tdlib-gateway-ip`
- **Network tags**: `tdlib-gateway`
- **Access scopes**: Allow full access to all Cloud APIs

Under **Advanced options** → **Management** → **Automation** → **Startup script**,
paste the contents of `deploy/gcp/vm-startup.sh` after replacing:

- `__PROJECT_ID__` → `hyperlinksspacebot`
- `__REGION__` → `us-central1`
- `__IMAGE_URI__` → `us-central1-docker.pkg.dev/hyperlinksspacebot/tdlib/tdlib-gateway:latest`
- `__DATA_DISK_NAME__` → `tdlib-gateway-data`

Create the VM. Startup takes ~3–5 minutes.

### 8. Vercel env

Vercel project **hsbexpo** → **Settings** → **Environment Variables**:

| Variable | Value |
|----------|--------|
| `TDLIB_GATEWAY_URL` | `http://STATIC_IP:8787` |
| `TDLIB_GATEWAY_SECRET` | Same as Secret Manager `tdlib-gateway-secret` |
| `TELEGRAM_API_ID` | Same as my.telegram.org |
| `TELEGRAM_API_HASH` | Same as my.telegram.org |

Redeploy Vercel after saving.

### 9. Verify

```bash
curl http://STATIC_IP:8787/v1/health
# expect: {"ok":true,...}
```

Then try **Connect Telegram** on https://hsbexpo.vercel.app

---

## Console links (hyperlinksspacebot)

- VMs: https://console.cloud.google.com/compute/instances?project=hyperlinksspacebot
- Secret Manager: https://console.cloud.google.com/security/secret-manager?project=hyperlinksspacebot
- Firewall: https://console.cloud.google.com/networking/firewalls/list?project=hyperlinksspacebot
- Artifact Registry: https://console.cloud.google.com/artifacts?project=hyperlinksspacebot
- Enable billing: https://console.cloud.google.com/billing/linkedaccount?project=hyperlinksspacebot
