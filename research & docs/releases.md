# GitHub Releases Automation Plan (Final)

This document defines the production plan for release detection, deduped GitHub Release publishing, and near-instant app update signaling.

## Goals

- Build the Windows installer on GitHub Actions (`windows-latest`) with `npm run build:win` (no `.exe` committed to git).
- Publish the installer to a GitHub Release only when that release tag does not already exist.
- Notify an app-update service immediately after a new release is published.
- Keep app-side update detection near-instant using push notification plus fallback polling.

## Source of Truth

- The **GitHub Release tag** is the release identity (`release_id`), for example `build_03252026_1929`.
- Locally, `windows/cleanup.cjs` moves the built installer to `releases/builder/build_MMDDYYYY_HHMM/HyperlinksSpaceProgramInstaller_<stamp>.exe` (other artifacts under `dev/`). In CI you can set `RELEASE_BUILD_ID` to match a chosen tag, or leave it unset so the folder name comes from build time.

## Workflow Trigger

- **Manual only:** `workflow_dispatch` (Actions → “Windows release (CI build)”).
- Optional input **release_id** (`build_MMDDYYYY_HHMM`). If empty, the tag is taken from the build output folder after `cleanup.cjs` runs.

Example trigger:

```yaml
on:
  workflow_dispatch:
    inputs:
      release_id:
        description: "Optional tag, e.g. build_03252026_1929"
        required: false
        default: ""
```

## Dedupe Rules (No Duplicate Releases)

1. Run `npm run build:win` (or use optional `RELEASE_BUILD_ID` so the output folder matches the intended tag).
2. Resolve `release_id` from the optional input or from `releases/builder/build_*/HyperlinksSpaceProgramInstaller_*.exe`.
3. Check whether GitHub Release/tag already exists for that `release_id`.
4. If it exists:
   - Exit successfully (`0`)
   - Do not upload assets
   - Do not send webhook notification
5. If it does not exist:
   - Create GitHub Release/tag
   - Upload all files from that folder as release assets
   - Continue to webhook notification

Recommended extra safety:

- Use workflow `concurrency` keyed by `release_id` to avoid race conditions.

## Endpoint Contract

- Webhook endpoint path: `api/releases.ts`
- Route URL: `POST /api/releases`
- Purpose: accept release-published events from GitHub Actions and fan out update notifications to app clients.

## Security

- GitHub Actions sends auth header:
  - `x-release-token: <secret>`
- Endpoint validates against:
  - `process.env.RELEASE_WEBHOOK_TOKEN`
- Optional hardening:
  - Add HMAC signature verification for request body.

If auth fails:

- Return `401` and do not process payload.

## Payload Shape

`POST /api/releases` expects JSON:

```json
{
  "release_id": "build_03252026_1929",
  "version": "1.0.0",
  "published_at": "2026-03-25T19:29:00Z",
  "platform": "windows",
  "assets": [
    {
      "name": "HyperlinksSpaceProgramInstaller.exe",
      "url": "https://github.com/<org>/<repo>/releases/download/build_03252026_1929/HyperlinksSpaceProgramInstaller.exe",
      "sha256": "<optional>"
    }
  ],
  "github_release_url": "https://github.com/<org>/<repo>/releases/tag/build_03252026_1929"
}
```

## Endpoint Behavior (`api/releases.ts`)

1. Accept only `POST`.
2. Validate auth token/signature.
3. Parse and validate required fields:
   - `release_id`, `published_at`, `assets`.
4. Enforce idempotency by `release_id`:
   - If already processed, return `200 { ok: true, duplicate: true }`.
5. Store/update latest release metadata in persistent storage.
6. Push update signal to clients (WebSocket/SSE/Firebase/Expo push).
7. Return quickly with `200 { ok: true }`.

## GitHub Actions Notification Step

After successful release creation and asset upload:

1. Read webhook URL and token from repository secrets:
   - `RELEASE_WEBHOOK_URL`
   - `RELEASE_WEBHOOK_TOKEN`
2. Send `POST` to `/api/releases` with release payload.
3. Retry webhook call with backoff on transient failures.

Important:

- Do not send webhook if release already existed (dedupe branch).

## When You Must Make a New Installer Release

Use this section as the decision rule between OTA update and installer release.

### Native/runtime changes (installer required)

Create a new installer release when a change affects native binaries or runtime compatibility, including:

- Installing, removing, or updating any package that forces you to rebuild the app.
- Changing app permissions or native capabilities (camera, notifications, background modes, deep links, etc.).
- Changing package identifiers, signing, entitlements, or other platform build settings.
- Changing Expo SDK or React Native version in a way that changes native runtime.
- Changing `runtimeVersion` policy/behavior or bumping app version when runtime compatibility changes.
- Any change that requires running a fresh native build to take effect.

### Non-native changes (OTA only, no installer)

Do not make a new installer release for:

- JavaScript/TypeScript business logic changes.
- UI/layout/style changes.
- Text/copy changes and static asset updates that are OTA-compatible.
- Server/API behavior changes that do not require new native modules in app.

### Exact release checklist

Make a new installer release if at least one statement is true:

1. "This change cannot work without rebuilding native binaries."
2. "This change modifies runtime compatibility between app binary and updates."
3. "This change touches native permissions/capabilities/config."

If all three are false, ship via OTA update instead of installer release.

### Team policy

- Prefer OTA by default for speed.
- Use installer releases only for native/runtime boundaries.
- When uncertain, treat as installer-required and verify in staging before production.

## App Update Strategy

Primary strategy:

- Real-time push signal from backend triggered by `/api/releases`.

Fallback strategy:

- App checks latest release on:
  - app foreground/resume
  - periodic interval (for example every 5-15 minutes)

Client behavior:

1. Compare local build/version with latest server metadata.
2. If newer exists:
   - Show "Update available" prompt or trigger controlled update flow.

## Reliability and Observability

- Idempotent handling on `release_id`.
- Structured logs for each stage:
  - detected -> published/skipped -> webhook sent -> app signal broadcast
- Alert on partial failure:
  - release created but webhook failed
- Keep webhook processing fast and non-blocking for external calls.

## Rollout Plan

1. Deploy `api/releases.ts` in staging.
2. Run workflow in dry-run mode to validate folder parsing and dedupe checks.
3. Enable real release creation for test folder.
4. Enable webhook call to staging endpoint.
5. Verify end-to-end with one client device.
6. Promote to production after stable validation.

## Acceptance Criteria

- A new `releases/builder/build_.../` folder produces exactly one GitHub Release.
- Re-running workflow for the same `release_id` does not create duplicates.
- Webhook is called only for newly created releases.
- `POST /api/releases` rejects unauthorized requests.
- Connected app receives update signal near-instantly in normal conditions.
- Fallback polling still discovers updates if push delivery fails.
