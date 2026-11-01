# Windows desktop auth debug (Telegram OIDC)

Log file: `%APPDATA%\Hyperlinks Space Program\main.log`

## Healthy sign-in sequence

1. `oauth finish phase=… ok=true hasToken=true`
2. `welcome_telegram_oidc_redirect … hasSessionToken=true`
3. `desktop_auth_api_fetch transport=ipc_program_api … ipcSessionCookie=true` (or `ipcBearer=true`)
4. `[program-api-fetch] GET /api/auth/session status=200 bearer=… sessionCookie=…`
5. `auth_session_refresh … authenticated=true hasDesktopToken=true`
6. `index_route variant=home_authenticated … isAuthenticated=true` (stays; no immediate flip to welcome)

## Stuck on welcome after flash

Typical failure pattern:

- `index_route variant=home_authenticated` then within ~1s `auth_session_refresh authenticated=false` and `variant=welcome`
- OAuth still reports `hasToken=true`

Causes (fixed in current `main`):

- Main process stripped `Authorization` on `program.hyperlinks.space` (CORS reflect filter).
- Renderer `fetch` from `app://` never sends `hs_auth_session` cookies cross-site.

Fix path: main-process `hsp-program-api-fetch` (session cookies + optional Bearer) and do not optimistic `signIn()` on desktop until session GET succeeds.

## Grep helpers (PowerShell / Git Bash)

```bash
grep -E "oauth finish|welcome_telegram_oidc_redirect|auth_session_refresh|index_route|desktop_auth_api_fetch|program-api-fetch" \
  "$APPDATA/Hyperlinks Space Program/main.log" | tail -n 40
```

## Fields added for diagnosis

| Event | Fields |
|-------|--------|
| `auth_session_refresh` | `desktopShell`, `hasDesktopToken` |
| `desktop_auth_api_fetch` | `transport`, `hasStoredToken`, `ipcBearer`, `ipcSessionCookie`, `status` |
| Main `[program-api-fetch]` | `bearer=`, `sessionCookie=` (no token values logged) |
