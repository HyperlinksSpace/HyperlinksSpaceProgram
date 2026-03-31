# Hyperlinks Space Program

<u>**In progress.**</u>

*Special note: now temporarily main development is in [`./app`](./app) folder. After refactor it'll be in root. Root contents is a design structuring outcome used for prompting and demo only.*

##[`./app`](./app) active development area

- [`app`](./app/app) - Expo/React Telegram Mini App client (web/mobile screens, navigation, UI logic).
- [`bot`](./app/bot) - TypeScript Telegram bot service and runtime entrypoints.
- [`database`](./app/database) - database startup/migration/service scripts.
- [`ai`](./app/ai) - AI assistant service logic and model integration points.
- [`api`](./app/api) - backend API handlers and server-side endpoints.
- [`blockchain`](./app/blockchain) - TON/blockchain interaction logic and related helpers.
- [`telegram`](./app/telegram) - Telegram-specific integration utilities and adapters.
- [`windows`](./app/windows) - Electron desktop shell, NSIS installer config, and auto-update flow.
- [`scripts`](./app/scripts) - developer/ops scripts (local run, migration, release helpers).
- [`docs`](./app/docs) - project and operational documentation.
- [`assets`](./app/assets) - static assets used by app, installer, and branding.

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

3. Make a commit (address unassigned issue or think yourself)

```
git add . # Stage changes on this branch
git commit -m "Describe your change" # Commit on this branch
```

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

## Pull requests and commits requirements

- Give pull requests and commits a proper name and description
- Dedicate each pull request to an understandable area or field, each commit to a focused logical change
- Check file changes in every commit pulled, no arbitrary files modifications should persist such as LF/CRLF line-ending conversion, broken/garbled text diffs, BOM added or removed, accidental "invisible" corruption from text filters
- Add dependecies and packages step by step for security
- An issue creation before a pull request would be a good practice