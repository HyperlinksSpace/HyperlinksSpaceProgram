# Instant App Updates Plan

This plan defines how to deliver near-instant updates for the app with minimal user friction, while keeping binary releases for native-level changes.

## 1) Update Strategy (Two Lanes)

- **Lane A: OTA updates (default, fast path)**
  - Use Expo EAS Update to deliver JavaScript/TypeScript and asset changes.
  - No reinstall required.
  - Target latency: minutes or less after publish.
- **Lane B: Binary releases (slow path)**
  - Use installer/store release only when native/runtime changes are required.
  - Triggered through `app/releases/**` and GitHub Release workflow.

Decision rule:

- JS/UI/business logic/assets changes -> OTA
- Native dependency/plugin/permission/runtime changes -> binary release

## 2) Current Project Baseline

Already configured:

- `app/app.json` has `updates.url`.
- `app/app.json` has `runtimeVersion.policy = appVersion`.
- `app/eas.json` has channels:
  - preview profile -> `main`
  - production profile -> `production`

Implication:

- Binaries built on a channel only receive updates from that same channel and compatible runtime version.

## 3) Target Architecture for "Instant" Updates

1. Developer merges code to branch.
2. CI publishes OTA update to EAS (`main` or `production` branch/channel).
3. App receives update check trigger (foreground/resume and optional push signal).
4. App fetches update, then applies at safe point (next app restart or immediate reload based on policy).

For binary-only updates:

1. `app/releases/build_MMDDYYYY_HHMM/` changes.
2. GitHub workflow dedupes and creates Release if new.
3. Workflow calls `POST /api/releases` webhook.
4. Backend notifies clients that binary update is available.

## 4) Server and CI Setup

### 4.1 GitHub Secrets

Add repository secrets:

- `EXPO_TOKEN` (required for EAS CLI in CI)
- `RELEASE_WEBHOOK_URL` (for binary-release notification)
- `RELEASE_WEBHOOK_TOKEN` (for endpoint auth)

### 4.2 OTA Workflow (GitHub Actions)

Create workflow `.github/workflows/eas-update.yml`:

- Trigger:
  - `push` to selected branches (`main`, optionally `release/*`)
  - Optional `workflow_dispatch`
- Path filters to avoid unnecessary publishes (example):
  - include app source and config paths
  - exclude `app/releases/**`
- Steps:
  1. checkout
  2. setup node
  3. install deps (`npm ci` in `app/`)
  4. publish OTA:
     - branch `main` for preview/internal
     - branch `production` for production
  5. output EAS update group id and URL

Recommended publish command:

- `npx eas update --branch <branch> --non-interactive --message "<commit message>"`

### 4.3 Binary Workflow (Already Planned)

Keep `app/releases/**` workflow with dedupe:

- If release exists, skip.
- If new, create GitHub Release and upload assets.
- Call `POST /api/releases`.

## 5) App Runtime Behavior

Implement client update behavior with `expo-updates`:

1. On app start and on foreground:
   - call `checkForUpdateAsync()`
2. If update exists:
   - call `fetchUpdateAsync()`
3. Apply policy:
   - silent + apply on next launch (default safe)
   - or prompt user and reload now (`reloadAsync()`)

Suggested policy:

- **Critical fixes:** prompt and reload now
- **Normal updates:** fetch silently and apply next launch

Minimum checks:

- On cold start
- On foreground if last check older than threshold (for example 10 minutes)

## 6) Push-Accelerated Detection (Optional but Preferred)

OTA itself is already fast, but to reduce time further:

- Add backend push trigger when CI publishes OTA.
- App receives push and immediately runs update check.

Channels you can use:

- Expo Push Notifications
- Firebase Cloud Messaging
- WebSocket/SSE (if app has persistent session)

Fallback remains foreground polling.

## 7) Versioning and Compatibility Rules

With `runtimeVersion.policy = appVersion`:

- OTA is only delivered to binaries with matching `expo.version`.
- When native changes occur:
  - bump app version
  - ship new binary
  - publish OTA for that new runtime afterward

Team rule:

- Do not bump app version for pure JS hotfixes unless intentionally creating a new runtime.

## 8) Security and Reliability

- Protect `/api/releases` using token and optional HMAC.
- Make webhook handler idempotent by `release_id`.
- Retry webhook delivery in workflow with backoff.
- Log update lifecycle:
  - CI publish success/failure
  - release webhook accepted/rejected
  - app check/fetch/apply events (client telemetry)

## 9) Rollout Plan

Phase 1 - Staging:

1. Implement OTA workflow for `main` channel only.
2. Add app-side check/fetch on startup + foreground.
3. Test with internal build on `main`.

Phase 2 - Production:

1. Add production publish workflow/manual gate.
2. Add push-accelerated trigger.
3. Monitor crash-free sessions and update adoption rate.

Phase 3 - Hardening:

1. Add kill switch/rollback procedure.
2. Add release dashboard with latest OTA and binary status.

## 10) Operational Playbook

### Publish OTA update

From `app/`:

- `npx eas update --branch main --message "fix: ..."`
- for production:
  - `npx eas update --branch production --message "fix: ..."`

### Publish binary update

1. Create `app/releases/build_MMDDYYYY_HHMM/` with installer files.
2. Push changes.
3. Workflow creates (or skips duplicate) GitHub Release and calls `/api/releases`.

### Rollback OTA

- Republish a known-good commit to the same branch/channel with a new OTA message.
- If needed, temporarily disable update checks via remote config flag.

## 11) Acceptance Criteria

- OTA updates reach active users without reinstall for JS/UI changes.
- Median time from CI publish to client fetch is within target SLA.
- Binary updates only occur for native/runtime changes.
- Duplicate `release_id` never creates duplicate GitHub Release.
- `/api/releases` accepts only authenticated requests.
- App always has fallback update detection even if push signal fails.

## 12) Next Implementation Tasks

1. Create `app/api/releases.ts` endpoint.
2. Add `.github/workflows/eas-update.yml`.
3. Add client update service wrapper (`check/fetch/apply` policy).
4. Add docs section in `build_and_install.md` linking OTA vs binary rules.
5. Add monitoring events for update checks and apply outcomes.
