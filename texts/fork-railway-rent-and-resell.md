# Fork a Railway-like host, run this project on it, and resell instances

This project uses Railway for one job: the long-running **TDLib gateway** (`deploy/railway/`, `TDLIB_GATEWAY_URL` on Vercel). Vercel cannot hold that process. The rest of the product stays on Vercel.

Railway the company cannot be hard-forked. The control plane and Railway Metal are proprietary. The name and logo are trademarks. Shipping a copy of their closed dashboard, or selling “Railway instances,” is not a fork you can legally operate.

What you can fork, run for this repo, and resell under your own name:

| Piece | Source | License | Use |
| --- | --- | --- | --- |
| Control plane (git push, domains, SSL, volumes, UI) | [Coolify](https://github.com/coollabsio/coolify) | Apache-2.0 | The product you operate and rebrand |
| Image builder | [railwayapp/railpack](https://github.com/railwayapp/railpack) | MIT | Same “repo in, image out” feel as Railway |
| Older builder, if Railpack does not fit a stack | Nixpacks | MIT | Fallback |
| This gateway | `deploy/railway/Dockerfile.tdlib-gateway` | this repo | Customer zero on your own machine |

Read the `LICENSE` file at the commit you fork. Coolify has stayed Apache-2.0; confirm that before you sell. Dokploy’s current app code is Apache-2.0, but anything under `/proprietary` is the Dokploy Source Available License, which forbids selling that code. Leave that directory out. CapRover (Apache-2.0) and Dokku (MIT) are also clean; Coolify is the closer dashboard.

The Railway CLI is MIT, and it only talks to Railway’s API. Forking it does not give you a host.

---

## Two different rents

**Replace Railway for this project.** One small Hetzner Cloud VM in Germany or Finland. About €6–9 per month. The gateway’s current Railway floor is 2 vCPU / 1 GB, and the README says to raise memory to 2 GB if sync OOMs. That VM is cheaper than a Railway bill for the same always-on process, and it is too small to be a hosting business.

**Sell instances.** One Hetzner **dedicated** server in Falkenstein or Helsinki, sliced with the forked control plane. This is the only rent in the list below where the gap versus Railway’s public rates pays for the box, the disks, and your time.

Do both on the same software. Do not buy the dedicated server until someone besides this project is paying, or until you have decided to fund the empty months yourself.

---

## What Railway charges, and why a reseller can undercut it

Public rates (Railway pricing page, checked September 2026). Billing is per second of **actual** use. A stopped service costs nothing. A service that stays up all month is billed as if it used the full month.

| Resource | Railway |
| --- | --- |
| CPU | $20 per vCPU-month |
| RAM | $10 per GB-month |
| Egress | $0.05 per GB |
| Volume | $0.15 per GB-month |
| Plan floor | Hobby $5 (includes $5 usage), Pro $20 per workspace (includes $20) |

A process that sits at the gateway’s documented minimum (2 vCPU and 1 GB, always on) is about **$50 per month** before egress and the volume. The same shape on a Hetzner Cloud CX23 is **€5.49 per month** before IPv4 and VAT.

The spread exists only for **always-on** work: bots, gateways, workers, small APIs that never sleep, and anything that pushes a lot of bytes. Railway already wins on idle and spiky HTTP, because a service that averages 0.05 vCPU is about $1 of CPU. Matching that price on hardware you pay for whether or not the container is busy loses money. Sell to the always-on customer. Leave the idle customer on Railway.

---

## Where to rent

Prices are Hetzner’s 15 June 2026 list for **new orders** (docs page last updated 8 July 2026). They exclude IPv4 and VAT. Add a primary IPv4. EU business customers often reverse-charge VAT; a private account in Germany pays 19%. Re-check the order page the day you buy. Limited and auction stock disappears.

### Rent here

**Falkenstein (Germany) or Helsinki (Finland), dedicated, when you are selling.**

| Box | When it is the right buy | Monthly, excl. IPv4 and VAT | Setup |
| --- | --- | --- | --- |
| Server Auction (older Ryzen, 64 GB class) | First look. Same idea, Dutch-auction price, often under the list below | varies, often the cheapest real metal | usually low |
| AX41-1-LTD | In stock. Best list price for a resale box | €57.30 | €0 |
| AX42-1-LTD | AX41 limited tier is gone | €77.30 | €39 |
| AX42-1 | You need a box this week and the limited tiers are empty | €97.30 ($117.10) | €49 ($59) |

AX42 hardware (Hetzner product page): AMD Ryzen 7 PRO 8700GE, 8 cores / 16 threads, 64 GB DDR5 ECC, 2×512 GB NVMe, 1 Gbit/s, unmetered traffic, locations Falkenstein and Helsinki. That unmetered port is the product. Railway meters egress at $0.05/GB; a tenant who moves a few terabytes a month is where your price is obviously better.

Helsinki and Falkenstein are also the right region for **this** gateway. Telegram’s European data centers are close, and the Vercel app only needs a stable HTTPS URL.

**One Cloud VM in the same cities, for this project only, before any resale.**

| Plan | Shape (order page) | New monthly price, Germany/Finland |
| --- | --- | --- |
| CX23 | 2 vCPU, 4 GB, 40 GB | €5.49 |
| CX33 | 4 vCPU, 8 GB, 80 GB | €8.49 |

CX23 covers the gateway, including the 2 GB bump. CX33 is the one to pick if TDLib in `full` storage mode or several sessions grow past a few gigabytes of disk and RAM. These are shared-CPU cloud machines. Fine for one sidecar. A bad place to pack strangers’ production apps.

### Do not rent these to resell

| Place | Why the resale does not pay |
| --- | --- |
| AWS, GCP, Azure | A general-purpose vCPU plus $0.05–$0.12/GB egress lands next to Railway’s retail. Support and card fees eat what is left. |
| Hetzner CPX / CCX (dedicated vCPU cloud) | After 15 June 2026 a small CCX13 in the EU is €42.99/month. Reselling that VM one-for-one has no room. |
| Hetzner USA (Ashburn, Hillsboro) | No AX42-class dedicated price on the EU list. US cloud starts higher (a small CPX is €17.49). Add a US machine only after paying EU customers ask for it. |
| Hetzner Singapore | Cheapest useful cloud there is about €15–54/month for sizes that are €5–43 in Falkenstein. The Railway gap closes. |
| Contabo and similar budget VPS as the first region | The sticker can be lower. Disk and neighbor noise show up as your outage, and you are the one who refunds. Use a second supplier after the Hetzner box is full, not as the brand’s only site. |

OVH / Kimsufi / So You Start can beat Hetzner on an old Xeon with a setup fee. Check the live configurator if you want a second European site. Do not start there: Hetzner’s 1 Gbit unmetered port and the Ryzen boxes above are the known-good margin.

---

## Where the sale is profitable

Sell **allocated** RAM, with a CPU share included, and with egress included up to a cap you enforce. Your cost is the whole server, every hour, so per-second idle pricing will not cover it.

A workable public price against Railway’s $10/GB and $20/vCPU:

- **$8 per GB-month** of reserved RAM
- **0.25 vCPU included** per GB (so a 2 GB instance has 0.5 vCPU)
- **extra vCPU at $8** if someone needs more compute than that
- **egress included** to a stated cap (for example 2 TB/month on a small instance), then you throttle or charge
- volume at about **$0.10/GB-month**, or included for the first 10 GB

On an AX42-1 you can sell about **56 GB** after keeping ~8 GB for the OS, Coolify, image builds, and a spare. Do not oversubscribe RAM. An OOM killer takes down a paying tenant. CPU can be oversubscribed about 2× because these apps are mostly waiting on Telegram, Postgres, or the network. RAM fills up first, so CPU oversubscribe is not what makes the month.

| Server you rent | Cost to cover (approx., excl. VAT, plus a few euros of IPv4) | GB you must sell at $8 to break even | Full at 56 GB sold |
| --- | --- | --- | --- |
| AX41-1-LTD | ~€57 ($67) | about 9 GB | on the order of $400 revenue |
| AX42-1-LTD | ~€77 ($90) | about 12 GB | same |
| AX42-1 | ~€97 ($117) | about 15 GB | about $450 revenue, ~$300 left before your time, backups, and Stripe |

Fifteen gigabytes is about fifteen small always-on apps, or seven or eight 2 GB apps. This project’s gateway is one of those slices (1–2 GB). It does not pay for a dedicated server by itself.

Who pays that $8:

- People running Telegram bots, MTProto sidecars, queue workers, and small APIs that are up 24 hours.
- People whose Railway invoice is mostly RAM and CPU that never scale to zero, or mostly egress.
- EU customers first. Falkenstein and Helsinki are a normal latency for them. The same box is acceptable for a Telegram gateway used from elsewhere, because the heavy hop is to Telegram, not to the user’s browser.

Who will not pay it:

- Hobby deploys that are idle most of the month. Railway’s $5 floor already covers them.
- Anyone who needs a US or Singapore POP for an interactive website. Do not promise that latency from Germany.

Add a Hetzner Storage Box (from about €3–4 for 1 TB on their current storage list; confirm at order) for off-server backups. One disk in the server is not a backup.

Stripe, refunds, and an hour of support per tenant per month are the real second cost. At fifteen tiny customers the hardware is paid and you are still poor. The plan starts to matter around a **full AX42** (on the order of forty to fifty 1 GB tenants, or fewer larger ones) or a second box. Until then, treat resale as a side line that also hosts this gateway, not as a salary.

---

## How to do it

### 1. Replace Railway for this repository

1. Create a Hetzner Cloud project. Location: Falkenstein or Helsinki. Image: Ubuntu LTS. Type: CX23, or CX33 if you want disk headroom. Add the primary IPv4 and an SSH key.
2. Install Docker. Put the TDLib data on a persistent disk mounted at `/data` (Hetzner volume, or a directory on the VM disk you do not rebuild).
3. Build and run the existing image from `deploy/railway/Dockerfile.tdlib-gateway`. Publish port 8787 only on localhost. Put Caddy or Traefik in front with Let’s Encrypt.
4. Set the same env the Railway README lists: `DATABASE_URL`, `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `TDLIB_GATEWAY_SECRET`, `TDLIB_DB_ROOT=/data/tdlib`, `TDLIB_GATEWAY_HOST=0.0.0.0`, `NODE_ENV=production`. Set `TDLIB_GATEWAY_PORT=8787` here. On Railway that variable stays unset because Railway injects `PORT`.
5. `curl https://your-host/v1/health` until it returns `"ok": true`.
6. Set Vercel Production `TDLIB_GATEWAY_URL` to that origin, no trailing slash. Redeploy Vercel.
7. Watch a real Telegram sync. Then delete the Railway service so you stop paying both.

Keep `deploy/railway/` as the Docker build. The folder name can stay; the runtime is no longer Railway.

### 2. Fork the control plane

1. Fork Coolify. Keep `LICENSE` and any `NOTICE`. Remove Railway trademarks from anything you ship. Pick a product name.
2. Pin a Coolify release and track upstream. You want their proxy, Let’s Encrypt, and GitHub app flow. Rebrand the UI; do not rewrite the orchestrator.
3. Add Railpack (MIT) as a build backend next to Dockerfile, so a pushed repo becomes an image the way Railway does. Keep the MIT copyright notice in that binary.
4. Deploy that fork onto the CX box first and run **only** this gateway through it. Customer zero should be you.

### 3. Sell slices of a dedicated server

Move to a dedicated box only when step 2 has been boring for a while.

1. Order from the auction or the LTD row in the table above. Location: Falkenstein or Helsinki. Install Ubuntu LTS yourself (Hetzner’s install image). You are the administrator. There is no managed panel in that price.
2. Move the forked Coolify and this gateway onto it. Attach a Storage Box and take a nightly restic (or equivalent) copy of volumes.
3. Isolation per tenant: one Docker network, memory and CPU limits in the container (`--memory`, `--cpus`), non-root user, no host Docker socket, no shared volume. A tenant who can mount the host can read everyone else’s Telegram sessions.
4. One hostname pattern (`app-xyz.yourdomain`), automatic certificates, a hard memory cap equal to what they bought.
5. Bill monthly in advance for the reserved GB. Stop the containers when the invoice fails. Per-second metering is how you end up cheaper than your rent.
6. Cap each tenant’s bandwidth. The server has one 1 Gbit port. One uncapped customer can saturate it.
7. Publish an acceptable-use policy that matches Hetzner’s: no spam, no open proxies, no attacks. You lose the server if a tenant does that from your IP.
8. Add a second region only when invoices from that region exceed what a local machine costs. That is not the first purchase.

### 4. What “done” costs for this project versus for a business

| Goal | Rent | Software | Monthly money |
| --- | --- | --- | --- |
| This gateway off Railway | Hetzner CX23 or CX33, Falkenstein or Helsinki | Docker + the existing Dockerfile | ~€6–9 plus IPv4 |
| A fork you could sell, still one customer (you) | same VM | Coolify fork + Railpack | same €6–9, plus your time |
| A resale box that can break even | AX41-1-LTD if listed, else AX42-1-LTD or AX42-1 | same fork, tenants isolated | €57–€97, break-even at roughly 9–15 GB sold at $8/GB |

The profitable rent is a Hetzner dedicated server in **Falkenstein or Helsinki**, bought from the auction or the limited tier when it is listed, and sold as always-on memory to people who are paying Railway’s full-month CPU and RAM rates. The profitable first rent, while it is only this repository, is a **€5.49 CX23** in one of those same two cities.
