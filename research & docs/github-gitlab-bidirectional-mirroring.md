# GitHub and GitLab Repository Mirroring

This document describes how to keep a Git repository synchronized between GitHub and GitLab, including **bidirectional** setups, the problems that appear in practice, **automation guards** that reduce loops and wasted work, and **automatic escalation** when the automation must not guess (for example, divergent histories).

It is guidance for operators and automation authors; it is not specific to application code in this repository.

## Terminology

- **Canonical remote:** The single place where humans are expected to push day-to-day changes (or where merge commits land after review). Everything else is a **mirror**.
- **One-way mirror:** After a push to A, automation updates B. Humans do not push to B for the same branches (or B is protected so only the mirror bot can push).
- **Bidirectional mirror:** Automation tries to propagate pushes from A→B and B→A. This is workable only with strict guards and a clear policy when histories **diverge**.
- **Escalate:** Stop silent auto-fix; surface the condition to people or ticketing (failed job, alert, issue). See [Automatic escalation](#automatic-escalation).

## Recommended default: one canonical remote + one-way mirror

For most teams, the lowest-risk approach is:

1. Choose **one** platform as the source of truth for each protected branch (usually `main`).
2. Mirror to the other platform with **fast-forward-only** pushes and **short-circuit** when tips already match.

Typical implementations (pick **one** row: canonical host is where humans push; the arrow is where commits are **copied** next):

| Canonical | Replication direction | How |
|---|---|---|
| **GitHub** | GitHub → GitLab | GitHub Actions on `push`: fetch GitLab, compare SHAs, `git push` to GitLab using a [GitLab deploy key](https://docs.gitlab.com/ee/user/project/deploy_keys/) or [project access token](https://docs.gitlab.com/ee/user/project/settings/project_access_tokens.html). |
| **GitLab** | GitHub ← GitLab | [GitLab repository push mirroring](https://docs.gitlab.com/ee/user/project/repository/mirror/) so GitLab pushes to GitHub after receiving commits. |

The two directions are **not** used together for the same branch in this pattern: they are **alternatives** depending on which platform is source of truth. (Using both at once without guards is how bidirectional mirroring starts.)

Official overview: [GitLab repository mirroring](https://docs.gitlab.com/ee/user/project/repository/mirror/), [GitHub Actions push trigger](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#push).

This gives **near-instant** propagation from the moment the canonical host accepts the push, without fighting bidirectional edge cases.

## Bidirectional mirroring: when it is used and what breaks

Bidirectional setups appear when both platforms must accept pushes (different teams, migration, or CI only on one side). They are **not** “set and forget.”

| Risk | What goes wrong | Why it matters |
|---|---|---|
| **Loop / ping-pong** | A push to GitHub triggers sync to GitLab; GitLab triggers sync back to GitHub; repeat or duplicate work | Duplicate CI, wasted API calls, flaky pipelines |
| **New objects from automation** | Mirror job merges, rebases, or force-pushes to “fix” state | New commits or rewritten history; harder audits; can feed loops |
| **Divergence** | Two different commits on `main` at each host, neither is ancestor of the other | `git push` rejects (non-fast-forward) unless someone force-pushes |
| **Duplicate CI** | Same tree built twice because both hosts run pipelines on the same logical change | Cost and noise; confusing status checks |
| **Credential exposure** | Tokens in logs, overly broad PATs, shared user accounts | Security and compliance issues |

## Guards in automation (layered)

Use several of these together; one guard rarely covers every failure mode.

### 1. Event and scheduling guards

- **SHA equality short-circuit:** After fetching both remotes, if `github/main` and `gitlab/main` are the **same commit OID**, exit successfully without pushing.
- **Ancestor / fast-forward check before push:** Only push from A to B if B’s tip is an **ancestor** of A’s tip (pure fast-forward). If not, do not force-push; treat as divergence and [escalate](#automatic-escalation).
- **Mirror bot identity:** Perform mirror pushes with a **dedicated** bot user or deploy key. On the receiving side, webhook or pipeline logic can **skip enqueuing reverse sync** when the actor matches the mirror bot (where the platform exposes this).
- **Idempotency:** Persist “last mirrored OID per branch” (CI cache, KV, issue comment, etc.) and skip if the incoming event’s `after` SHA was already mirrored.
- **Debounce / concurrency:** One in-flight sync per branch (GitHub Actions `concurrency`, GitLab `resource_group`, or a lock) to avoid stacked identical jobs from webhook retries.

### 2. Git protocol guards

- **No `--force` on mirrored branches** unless you have an explicit, rare break-glass procedure. Non-fast-forward should **fail** and escalate.
- **Narrow refspecs:** Mirror only agreed branches (for example `refs/heads/main`, `refs/heads/release/*`), not all refs.
- **Atomic multi-ref push** when supported (`git push --atomic`) to avoid half-updated mirror state.

### 3. Loop-specific logic

- **Directional rule:** GitHub→GitLab runs only when GitHub is strictly ahead of GitLab (fast-forward). GitLab→GitHub runs only when GitLab is strictly ahead. If **both** are ahead of the common ancestor (diverged), **neither** direction should force-sync; escalate.
- **Cooldown:** If the same `(branch, OID)` was mirrored within N seconds, exit (reduces double webhook storms).

### 4. CI noise controls

Mirroring duplicates pipelines if both hosts run on every push.

- Prefer **one** platform for **required** checks; treat the other as informational or limit runs (for example scheduled smoke only).
- Where policy allows, use host-specific **skip directives** for mirror-only pushes (conventions vary; confirm org rules).
- **Path filters** help only when mirror commits change nothing meaningful; usually both sides see the same files.

### 5. Security guards

- **Least privilege:** Repo-scoped tokens or deploy keys; no org-wide admin tokens for mirroring.
- **Branch protection** on both sides: block force-push to mirrored branches; restrict who may push to protected branches.
- **Secrets hygiene:** Mask remotes in logs; disable interactive prompts (`GIT_TERMINAL_PROMPT=0`); store credentials only in CI secrets.

## Automatic escalation

**Escalate** means: the automation **detects a condition it must not resolve alone**, marks the run as failed or blocked, and **notifies** or **files a ticket** with enough context for a human to decide.

This is the opposite of silently force-pushing or auto-merging without policy.

### When to escalate automatically

Typical conditions:

- **Divergence:** `main` on GitHub and GitLab point to different commits and neither is an ancestor of the other (merge-base exists but both tips have unique commits).
- **Non-fast-forward push rejected:** Mirror push fails with non-FF; do not retry with force.
- **Repeated failures:** Same branch fails N times in a row (may indicate permission, quota, or hook problems).
- **Unexpected ref state:** Missing branch, empty repo, or OID mismatch after push (verify step fails).

### What “automatic escalation” can do (concrete patterns)

Implement one or more of the following from the same job that detected the problem:

1. **Fail the pipeline** with a clear title and non-zero exit code so the default branch protection and dashboards show breakage.
2. **Post a structured comment** on a pinned tracking issue (GitHub Issues / GitLab issue) including: branch name, both OIDs, link to the failed pipeline, and a one-line `git` hint (`git merge-base`, `git log --left-right`) for the on-call engineer.
3. **Send chat or email** via webhook (Slack incoming webhook, Microsoft Teams, email SMTP API) with the same summary fields.
4. **Open a new issue** (if API token allows) with label `mirror-divergence` so work is tracked and deduplicated (search for open issues with the same branch before creating).
5. **Set a repository flag** (for example GitHub Actions variable or GitLab CI variable via API) `MIRROR_HALTED=true` and have sync jobs check it at the start so you do not amplify divergence while humans fix it.

### Content to include in escalation messages

- Repository identifiers (both URLs or slugs).
- Branch (or ref) name.
- **OID on side A** and **OID on side B** (full hashes avoid ambiguity).
- **Pipeline run URL** and job name.
- Short **runbook pointer** (internal doc link) for “how we pick canonical history” and “who may force-push if ever.”

### After humans resolve divergence

Runbook should require:

1. Agreement on which tip (or merged result) is correct.
2. A single deliberate push to the **canonical** remote (or fast-forward merge on one side then sync).
3. Clear `MIRROR_HALTED` reset and verification that both tips match before re-enabling bidirectional automation.

## Implementation sketches (non-prescriptive)

### GitHub Actions (push to GitLab)

- Trigger: `on: push` for selected branches.
- Steps: clone with depth sufficient for ancestry check (or full clone for simplicity), add GitLab remote with token in secret, `fetch` GitLab, compare OIDs / ancestry, `git push` only on fast-forward.
- On divergence or push failure: exit 1 and call a small script that opens an issue or posts to Slack.

### GitLab push mirror to GitHub

- Configure in GitLab project settings; use a GitHub **fine-grained PAT** or deploy key with write access to the target repo.
- Complement with **branch protection** on GitHub and monitoring for mirror errors in GitLab.

### Webhook-driven bidirectional

- Each side receives push webhooks; each handler runs the same **guarded** sync script (SHA short-circuit, bot skip, fast-forward only, escalate on divergence).
- **Do not** run two independent scripts that both force-push without shared policy.

## Summary

- **Best default:** one canonical remote, **one-way** mirror with fast-forward-only pushes and OID short-circuit.
- **Bidirectional** is possible with **layered guards** (ancestor checks, bot identity, concurrency, no force).
- **Escalate automatically** on divergence and non-FF: fail visibly, notify, optionally open issues and halt further sync until humans reconcile.

## References

- [GitLab: Repository mirroring](https://docs.gitlab.com/ee/user/project/repository/mirror/)
- [GitHub Actions: Workflow triggers](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows)
- [GitLab: Deploy keys](https://docs.gitlab.com/ee/user/project/deploy_keys/)
- [GitLab: Project access tokens](https://docs.gitlab.com/ee/user/project/settings/project_access_tokens.html)
- [GitHub: Fine-grained personal access tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#creating-a-fine-grained-personal-access-token)
