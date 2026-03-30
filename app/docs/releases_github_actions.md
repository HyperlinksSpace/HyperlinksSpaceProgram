# GitHub Releases Automation Plan (Final)

This document defines the production plan for release detection, deduped GitHub Release publishing, and near-instant app update signaling.

## Goals

- Build the Windows installer on GitHub Actions (`windows-latest`) with `npm run build:win` (no `.exe` committed to git).
- Publish the installer to a GitHub Release only when that release tag does not already exist.
- Notify an app-update service immediately after a new release is published.
- Keep app-side update detection near-instant using push notification plus fallback polling.

## Source of Truth

- The **GitHub Release tag** is the release identity (`release_id`), for example `build_03252026_1929`.
- Locally and in CI, `windows/cleanup.cjs` places the installer under `app/releases/builder/build_MMDDYYYY_HHMM/HyperlinksSpaceAppInstaller_<stamp>.exe` (other files under `dev/`). In CI, set `RELEASE_BUILD_ID` to pin the folder/tag, or omit it to use the timestamp from build time.

## When You Must Make a New Installer Release

Create a new installer/GitHub Release when a change is native/runtime-level and cannot be delivered safely by OTA update alone.

Native/runtime changes include:

- Adding, removing, or upgrading native libraries/modules (anything requiring a new Android/iOS/desktop binary).
- Changing app permissions or OS capabilities (camera, notifications, background modes, file access, etc.).
- Changing Expo config plugins or native project settings that affect the compiled binary.
- Upgrading Expo SDK/React Native/runtime where binary compatibility changes.
- Changing `runtimeVersion` strategy/value, or bumping app version when `runtimeVersion.policy` depends on it.
- Changing signing/notarization/install packaging behavior for distributed installers.
- Any fix that touches native code or build-time platform configuration.

Do not make a new installer release for:

- Pure JavaScript/TypeScript logic changes.
- UI changes in React components.
- Asset/text/content updates that are OTA-compatible.
- API integration changes that do not alter native dependencies.

Practical decision checklist:

1. Does this change require rebuilding a platform binary to work? If yes, make installer release.
2. Does this change alter native modules, permissions, SDK/runtime, or build config? If yes, make installer release.
3. If both answers are no, publish OTA update only and skip installer release.

## Workflow Trigger

- **Manual only:** `workflow_dispatch` (workflow “Windows release (CI build)”).
- Optional input **release_id** (`build_MMDDYYYY_HHMM`). If empty, the tag is taken from the build output after `cleanup.cjs`.

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

1. Run `npm run build:win` (optionally with `RELEASE_BUILD_ID` so the output folder matches the intended tag).
2. Resolve `release_id` from the workflow input or from `releases/builder/build_*/HyperlinksSpaceAppInstaller_*.exe`.
3. Check whether GitHub Release/tag already exists for that `release_id`.
4. If it exists:
   - Exit successfully (`0`)
   - Do not upload assets
   - Do not send webhook notification
5. If it does not exist:
   - Create GitHub Release/tag
   - Upload `HyperlinksSpaceAppInstaller.exe` as the release asset
   - Continue to webhook notification

Recommended extra safety:

- Use workflow `concurrency` keyed by `release_id` to avoid race conditions.

## Endpoint Contract

- Webhook endpoint path: `app/api/releases.ts`
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
      "name": "HyperlinksSpaceAppInstaller.exe",
      "url": "https://github.com/<org>/<repo>/releases/download/build_03252026_1929/HyperlinksSpaceAppInstaller.exe",
      "sha256": "<optional>"
    }
  ],
  "github_release_url": "https://github.com/<org>/<repo>/releases/tag/build_03252026_1929"
}
```

## Endpoint Behavior (`app/api/releases.ts`)

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

1. Deploy `app/api/releases.ts` in staging.
2. Run workflow in dry-run mode to validate folder parsing and dedupe checks.
3. Enable real release creation for test folder.
4. Enable webhook call to staging endpoint.
5. Verify end-to-end with one client device.
6. Promote to production after stable validation.

## Acceptance Criteria

- A new `app/releases/builder/build_.../` folder produces exactly one GitHub Release.
- Re-running workflow for the same `release_id` does not create duplicates.
- Webhook is called only for newly created releases.
- `POST /api/releases` rejects unauthorized requests.
- Connected app receives update signal near-instantly in normal conditions.
- Fallback polling still discovers updates if push delivery fails.
