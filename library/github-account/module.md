---
name: github-account
version: 0.1.0
category: dev-tool
description: GitHub account — SSH alias, local git identity, and gh CLI conventions. Template for multi-account setups; duplicate this module per account (e.g. `github-personal`, `github-work`).
homepage: https://docs.github.com/en/account-and-profile
tags: [github, git, multi-account]
applies_to:
  - any git push / pull / clone targeting this account's repos
  - any `gh` CLI operation that should run as this account
  - initializing new local repos that will live under this account
  - troubleshooting "Permission denied" errors when wrong account's key is used
trove_spec: "0.1"
last_verified: "production · daily git push / gh CLI by maintainer (identity-config, no API to smoke)"

credentials:
  GITHUB_USER:
    type: text
    required: true
    help: "Your GitHub username (e.g. octocat)"
  GITHUB_USER_ID:
    type: text
    required: true
    help: "Numeric user ID (curl https://api.github.com/users/<your-username> | jq .id). Used in the noreply email."
  GITHUB_NOREPLY_EMAIL:
    type: text
    required: true
    help: "Format: <USER_ID>+<USERNAME>@users.noreply.github.com. Use as git user.email to keep real email out of public commit history."
  GITHUB_SSH_ALIAS:
    type: text
    required: true
    help: "Host alias in ~/.ssh/config that maps to this account's SSH key (e.g. github-personal, github-work)"
  GITHUB_SSH_KEY_PATH:
    type: text
    required: false
    help: "Path to the private key for this account (e.g. ~/.ssh/id_ed25519_github_<account>)"
---

# GitHub Account — Multi-Account Setup Guide

This module captures the operational knowledge needed to work with one GitHub account when you have multiple. **Duplicate this module once per account** (e.g. `github-personal` and `github-work`), with each having its own `credentials.json`. The module's `name:` field should match its directory name (e.g. `github-personal`).

## ⚠️ Critical Constraints

1. **The default `git@github.com:...` SSH host uses whichever key your SSH agent picks first** — usually the wrong account if you have multiple. Always use the explicit alias from `~/.ssh/config` (e.g. `git@github-personal:...`)
2. **`gh repo create --source . --push` defaults the remote URL to `git@github.com:owner/repo.git`** — bypasses the SSH alias. Symptom: `ERROR: Permission to <owner>/<repo>.git denied to <other-account>`. Fix: `git remote set-url origin git@<alias>:<owner>/<repo>.git` after create, then push manually
3. **Global git identity is whichever account you set up first** (`git config --global user.email`). For repos under other accounts, set local user.email per repo or commits get attributed to the wrong account
4. **`gh auth status`** can show the right account as "Active" while git is using a different account's SSH key — these are two independent settings (gh API auth ≠ git SSH key selection)

## Setup checklist for a new repo on this account

```bash
# 1. Create the local repo (or already cloned)
mkdir my-new-project && cd my-new-project
git init -b main

# 2. Set local git identity (CRITICAL if your global identity is a different account)
git config --local user.name "<GITHUB_USER>"
git config --local user.email "<GITHUB_USER_ID>+<GITHUB_USER>@users.noreply.github.com"

# 3. Verify gh CLI is on this account
gh auth status
gh auth switch -u <GITHUB_USER>   # if not active

# 4. Create remote repo + add remote (do NOT use --push if you want SSH alias)
gh repo create <GITHUB_USER>/my-new-project --public --source . --description "..."
# This creates the repo and adds remote — but with WRONG URL (git@github.com:...)

# 5. Fix the remote URL to use SSH alias  ← THIS IS THE STEP EVERYONE FORGETS
git remote set-url origin git@<GITHUB_SSH_ALIAS>:<GITHUB_USER>/my-new-project.git

# 6. Now push works
git add . && git commit -m "..." && git push -u origin main
```

## Cloning an existing repo on this account

```bash
# Always specify the alias when cloning, not the GitHub web URL
git clone git@<GITHUB_SSH_ALIAS>:<GITHUB_USER>/<repo>.git
# NOT: git clone git@github.com:<GITHUB_USER>/<repo>.git  (will fail or use wrong key)

# Then immediately set local identity:
cd <repo>
git config --local user.name "<GITHUB_USER>"
git config --local user.email "<GITHUB_USER_ID>+<GITHUB_USER>@users.noreply.github.com"
```

## Fix existing repo with wrong remote

```bash
git remote -v
git remote set-url origin git@<GITHUB_SSH_ALIAS>:<GITHUB_USER>/<repo>.git
git fetch origin
```

## SSH config setup (one-time per account)

If `<GITHUB_SSH_ALIAS>` isn't in your `~/.ssh/config` yet:

```
Host <GITHUB_SSH_ALIAS>
    HostName ssh.github.com
    User git
    Port 443
    IdentitiesOnly yes
    IdentityFile <GITHUB_SSH_KEY_PATH>
```

The key file referenced here is the **private** key for this account; the corresponding `.pub` is added to that account's GitHub SSH keys settings.

## Common error → fix

| Error | Cause | Fix |
|---|---|---|
| `Permission to <owner>/X.git denied to <other-user>` | wrong SSH key / wrong remote URL | `git remote set-url origin git@<alias>:<owner>/X.git` |
| Commits attributed to wrong account on github.com | local user.email is global default | re-run setup step 2 |
| `gh: command needs different account` | gh active account is the other one | `gh auth switch -u <username>` |
| `Could not read from remote repository` after `gh repo create --push` | the well-known --push URL bug | re-run setup step 5 then push manually |

## Multi-account pattern in Trove

When you have N GitHub accounts, the Trove-native solution is **N named modules**, not one module with overrides:

```
~/.trove/
├── github-personal/    # e.g. for your personal projects (own + OSS)
│   ├── module.md       # name: github-personal
│   └── credentials.json
└── github-work/        # for company / org repos
    ├── module.md       # name: github-work
    └── credentials.json
```

Project's `trove.md` references the right one:

```markdown
@/Users/you/.trove/github-personal/module.md
```

The AI sees the reference and knows which SSH alias + identity to use for any git/gh operation in this project — without any per-command flags.
