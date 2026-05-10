---
name: github-robozephyr
version: 0.1.0
category: dev-tool
description: GitHub account "RoboZephyr" — SSH alias, git identity, and gh CLI conventions for projects under this account
homepage: https://github.com/RoboZephyr
tags: [github, git, multi-account]
applies_to:
  - any git push / pull / clone targeting RoboZephyr/* repos
  - any `gh` CLI operation that should run as RoboZephyr
  - initializing new local repos that will live under RoboZephyr/
  - troubleshooting "Permission denied" errors when wrong account's key is used
trove_spec: "0.1"

credentials:
  GITHUB_USER:
    type: text
    default: RoboZephyr
  GITHUB_USER_ID:
    type: text
    default: "276202023"
    help: "Numeric ID, used in the noreply email format"
  GITHUB_NOREPLY_EMAIL:
    type: text
    default: "276202023+RoboZephyr@users.noreply.github.com"
    help: "Use as git user.email — keeps real email out of public commit history"
  GITHUB_SSH_ALIAS:
    type: text
    default: github-robozephyr
    help: "Must match a Host entry in ~/.ssh/config that points to RoboZephyr's key"
  GITHUB_SSH_KEY_PATH:
    type: text
    default: "~/.ssh/id_ed25519_github_robozephyr"
    help: "Path to the private key for this account"
---

# GitHub Account: RoboZephyr — Multi-Account Setup Guide

When a project is owned by RoboZephyr, you MUST set up SSH alias + local git identity correctly, or you'll get "Permission denied" or commits attributed to the wrong account.

## ⚠️ Critical Constraints

1. **The default `git@github.com:...` SSH host uses whichever key your SSH agent picks first** — usually the wrong account if you have multiple. Always use the explicit alias `git@github-robozephyr:RoboZephyr/<repo>.git`
2. **`gh repo create --source . --push` defaults the remote URL to `git@github.com:owner/repo.git`** — this bypasses the SSH alias. Symptom: `ERROR: Permission to RoboZephyr/<repo>.git denied to <other-account>`. Fix below
3. **Global git identity is A404coder** (`94605465+A404coder@users.noreply.github.com`). For any RoboZephyr repo, set local user.email to keep commit attribution correct
4. **`gh auth status`** can show RoboZephyr as "Active account" while git is using A404coder's SSH key — these are two independent settings

## Setup checklist for a new RoboZephyr repo

```bash
# 1. Create the local repo (or already cloned)
mkdir my-new-project && cd my-new-project
git init -b main

# 2. Set local git identity (CRITICAL — global identity is for the OTHER account)
git config --local user.name "RoboZephyr"
git config --local user.email "276202023+RoboZephyr@users.noreply.github.com"

# 3. Verify gh CLI is on RoboZephyr
gh auth status   # confirm "Logged in to github.com account RoboZephyr ... Active account: true"
gh auth switch -u RoboZephyr   # if not active

# 4. Create remote repo + add remote (do NOT use --push if you want SSH alias)
gh repo create RoboZephyr/my-new-project --public --source . --description "..."
# This creates the repo and adds remote, but with WRONG URL (git@github.com:...)

# 5. Fix the remote URL to use SSH alias  ← THIS IS THE STEP EVERYONE FORGETS
git remote set-url origin git@github-robozephyr:RoboZephyr/my-new-project.git

# 6. Now push works
git add . && git commit -m "..." && git push -u origin main
```

## Cloning an existing RoboZephyr repo

```bash
# Always specify the alias when cloning, not the GitHub web URL
git clone git@github-robozephyr:RoboZephyr/<repo>.git
# NOT: git clone git@github.com:RoboZephyr/<repo>.git  (will fail or use wrong key)

# Then immediately set local identity:
cd <repo>
git config --local user.name "RoboZephyr"
git config --local user.email "276202023+RoboZephyr@users.noreply.github.com"
```

## Fix existing repo with wrong remote

```bash
# Inspect current
git remote -v

# Replace
git remote set-url origin git@github-robozephyr:RoboZephyr/<repo>.git

# Test
git fetch origin
```

## Detecting which account a repo belongs to

If you see `~/zephyrme/RoboZephyr/<something>/` in the path, it's almost certainly a RoboZephyr repo.
Other locations (e.g. `~/zephyrme/idea-business/`) belong to A404coder — see `@~/.trove/github-a404coder/module.md`.

If unsure: `git remote get-url origin` — the alias name (or owner in URL) tells you.

## Common error → fix

| Error | Cause | Fix |
|---|---|---|
| `Permission to RoboZephyr/X.git denied to A404coder` | wrong SSH key / wrong remote URL | `git remote set-url origin git@github-robozephyr:RoboZephyr/X.git` |
| Commits attributed to wrong account on github.com | local user.email is global default | run setup step 2 |
| `gh: command needs different account` | gh active account is A404coder | `gh auth switch -u RoboZephyr` |
| `Could not read from remote repository` after `gh repo create --push` | the well-known --push URL bug | run setup step 5 then push manually |
