## In progress

*Special note: now temporarily main development is in [`./app`](./app) folder. After refactor it'll be in root. Root contents is a design structuring outcome used for prompting and demo only.*

**`./app` structure (active development area):**
- `app` - Expo/React Telegram Mini App client (web/mobile screens, navigation, UI logic).
- `bot` - TypeScript Telegram bot service and runtime entrypoints.
- `database` - database startup/migration/service scripts.
- `ai` - AI assistant service logic and model integration points.
- `api` - backend API handlers and server-side endpoints.
- `blockchain` - TON/blockchain interaction logic and related helpers.
- `telegram` - Telegram-specific integration utilities and adapters.
- `windows` - Electron desktop shell, NSIS installer config, and auto-update flow.
- `scripts` - developer/ops scripts (local run, migration, release helpers).
- `docs` - project and operational documentation.
- `assets` - static assets used by app, installer, and branding.

## How to fork and contribute?

1. Install GitHub CLI and authorize to GitHub from CLI for instant work

```
winget install --id GitHub.cli
gh auth login
```

2. Fork the repo, clone it and create a new branch and switch to it

```
gh repo fork https://github.com/HyperlinksSpace/HyperlinksSpaceBot.git --clone
git checkout -b new-branch-for-an-update
git switch -c new-branch-for-an-update
```

3. Make a commit

```
git add . # Stage changes on this branch
git commit -m "Describe your change" # Commit on this branch
```

You can as well address unassigned issues if any.

3. After making a commit, make a pull request, gh tool will already know the upstream remote

```
gh pr create --title "My new PR" --body "It is my best PR"
```

4. For subsequent commits (sync `main`, create a fresh branch, and commit there)

```
git checkout main # Return to main
git fetch upstream # Fully sync with upstream main
git reset --hard upstream/main # Reset local main to upstream/main
git push origin main # Keep your fork main in sync too
git switch -c new-branch-for-next-update # Create and switch to a new feature branch
```

**Move in loops starting from the step 3.**