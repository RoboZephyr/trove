---
name: github-account
version: 0.1.0
category: dev-tool
description: GitHub account — gh keyring auth, local git identity, and optional SSH alias conventions. Template for multi-account setups; duplicate this module per account (e.g. `github-personal`, `github-work`).
homepage: https://docs.github.com/en/account-and-profile
tags: [github, git, multi-account]
applies_to:
  - any git push / pull / clone targeting this account's repos
  - any `gh` CLI operation that should run as this account
  - initializing new local repos that will live under this account
  - troubleshooting "Permission denied" errors when wrong account's key is used
trove_spec: "0.1"
last_verified: "production · RoboZephyr/robozephyr.com private repo bootstrap 2026-07-10 — gh create, SSH alias remote fix, REST visibility patch"

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
    required: false
    help: "Optional Host alias in ~/.ssh/config that maps to this account's SSH key (e.g. github-personal, github-work). Prefer HTTPS + gh keyring unless you specifically need SSH."
  GITHUB_SSH_KEY_PATH:
    type: text
    required: false
    help: "Path to the private key for this account (e.g. ~/.ssh/id_ed25519_github_<account>)"
---

# GitHub Account — Multi-Account Setup Guide

This module captures the operational knowledge needed to work with one GitHub account when you have multiple. **Duplicate this module once per account** (e.g. `github-personal` and `github-work`), with each having its own `credentials.json`. The module's `name:` field should match its directory name (e.g. `github-personal`).

Default recommendation: use `gh` multi-account login + HTTPS remotes for day-to-day work. Use SSH aliases only when you specifically need SSH keys, such as deploy-key style workflows or environments where HTTPS credential helpers are unavailable.

## ⚠️ Critical Constraints

1. **`gh` auth and git commit identity are separate** — `gh auth switch -u <user>` changes API / HTTPS credentials, but it does not change `git config user.name` or `user.email`. Switch both together.
2. **HTTPS remotes are the least surprising default for multi-account setups** — with `credential.https://github.com.helper = !gh auth git-credential`, git fetch / push follows the active `gh` account instead of whichever SSH key the agent picks.
3. **Device-flow browser pages can end on GitHub 404 after authorization** — do not judge success from the browser tab. Run `gh auth status`; if the command runs in a sandbox that cannot read macOS Keychain, rerun it in a normal terminal.
4. **Global git identity affects new repos only; local repo config wins** — pin long-lived repos with `git config --local user.email ...` so a global account switch does not pollute commit attribution.
5. **SSH remains valid but needs explicit aliases** — the default `git@github.com:...` host uses whichever key your SSH agent picks first. If you use SSH, use `git@<GITHUB_SSH_ALIAS>:<owner>/<repo>.git`, never the ambiguous host.

## One-time gh + Git setup

```bash
# 1. Login this account through GitHub CLI using HTTPS git protocol
gh auth login -h github.com -p https -w

# 2. Switch active gh account when multiple accounts exist
gh auth switch -h github.com -u <GITHUB_USER>

# 3. Make HTTPS git operations use gh's active account
git config --global credential.https://github.com.helper ''
git config --global credential.https://github.com.helper '!gh auth git-credential'

# 4. Set this account as the current global commit identity
git config --global user.name "<GITHUB_USER>"
git config --global user.email "<GITHUB_NOREPLY_EMAIL>"
```

If you regularly switch between accounts, create one alias per account. Example for a personal account:

```bash
git config --global alias.use-personal \
  '!gh auth switch -h github.com -u <GITHUB_USER> && git config --global user.name <GITHUB_USER> && git config --global user.email <GITHUB_NOREPLY_EMAIL> && echo active: <GITHUB_USER>'
```

Run it before working in repos for that account:

```bash
git use-personal
```

## Setup checklist for a new repo on this account

```bash
# 1. Switch gh + global git identity to this account
git use-<account-tag>

# 2. Create the local repo
mkdir my-new-project && cd my-new-project
git init -b main

# 3. Pin local identity for long-lived repos
git config --local user.name "<GITHUB_USER>"
git config --local user.email "<GITHUB_NOREPLY_EMAIL>"

# 4. Choose visibility deliberately, then create remote repo
#    Public website != public source repo. Use --private unless the source is intentionally OSS.
gh repo create <GITHUB_USER>/my-new-project --private --source . --remote origin --description "..."

# 5. Push after verifying the remote uses the intended account / protocol
git remote -v
git push -u origin main
```

If `gh repo create` leaves an SSH remote because global `gh` protocol was previously set to SSH, normalize it:

```bash
git remote set-url origin https://github.com/<GITHUB_USER>/my-new-project.git
git push -u origin main
```

If this account uses an SSH alias instead of HTTPS, do not leave the remote on ambiguous `git@github.com`. `gh repo create --source . --push` may create the GitHub repo successfully, then fail the push with the wrong local SSH identity. Create without `--push`, set the alias remote, then push:

```bash
gh repo create <GITHUB_USER>/my-new-project --private --source . --remote origin
git remote set-url origin git@<GITHUB_SSH_ALIAS>:<GITHUB_USER>/my-new-project.git
git push -u origin main
```

If the repo was created with the wrong visibility, fix it immediately and verify via REST. `gh repo edit --visibility private` can fail mid-PATCH with an `EOF` while leaving visibility unchanged; the REST call is a reliable fallback:

```bash
gh api repos/<GITHUB_USER>/my-new-project -X PATCH -F private=true
gh api repos/<GITHUB_USER>/my-new-project --jq '.visibility'  # private
```

## Cloning an existing repo on this account

```bash
git use-<account-tag>

# Prefer HTTPS with gh keyring
git clone https://github.com/<GITHUB_USER>/<repo>.git

cd <repo>
git config --local user.name "<GITHUB_USER>"
git config --local user.email "<GITHUB_NOREPLY_EMAIL>"
```

## Fix existing repo with wrong remote

```bash
git remote -v

# HTTPS default
git remote set-url origin https://github.com/<GITHUB_USER>/<repo>.git
git fetch origin
```

## Optional SSH config setup

Use this only when you want SSH instead of `gh`-managed HTTPS. If `<GITHUB_SSH_ALIAS>` isn't in your `~/.ssh/config` yet:

```
Host <GITHUB_SSH_ALIAS>
    HostName ssh.github.com
    User git
    Port 443
    IdentitiesOnly yes
    IdentityFile <GITHUB_SSH_KEY_PATH>
```

The key file referenced here is the **private** key for this account; the corresponding `.pub` is added to that account's GitHub SSH keys settings.

When using SSH, clone and fix remotes with the alias:

```bash
git clone git@<GITHUB_SSH_ALIAS>:<GITHUB_USER>/<repo>.git
git remote set-url origin git@<GITHUB_SSH_ALIAS>:<GITHUB_USER>/<repo>.git
```

## Common error → fix

| Error | Cause | Fix |
|---|---|---|
| `gh auth status` shows a browser auth 404 but login may have completed | GitHub device-flow authorize page expired after completing | Check `gh auth status` in a normal terminal; do not rely on the browser tab |
| `no oauth token found for github.com` inside an AI sandbox | sandbox cannot read macOS Keychain / credential store | Re-run the check outside the sandbox or grant keyring access |
| Commits attributed to wrong account on github.com | `user.email` is still another account's global value | set `git config --local user.email "<GITHUB_NOREPLY_EMAIL>"` |
| `gh: command needs different account` | gh active account is the other one | `gh auth switch -h github.com -u <GITHUB_USER>` or run your `git use-*` alias |
| `Permission to <owner>/X.git denied to <other-user>` | SSH remote uses the wrong key | switch remote to HTTPS, or use `git@<GITHUB_SSH_ALIAS>:<owner>/X.git` |
| New repo source accidentally public | `gh repo create --public` was copied from a template / habit | `gh api repos/<owner>/<repo> -X PATCH -F private=true`; then verify `gh api repos/<owner>/<repo> --jq '.visibility'` |
| Repo exists but first push says `Permission to <owner>/<repo>.git denied to <other-user>` | `gh repo create --source --push` added `git@github.com:<owner>/<repo>.git`, so SSH selected another account | `git remote set-url origin git@<GITHUB_SSH_ALIAS>:<owner>/<repo>.git && git push -u origin main` |

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

For repos that must remain on a specific identity even while the global account changes, pin local git identity once:

```bash
git config --local user.name "<GITHUB_USER>"
git config --local user.email "<GITHUB_NOREPLY_EMAIL>"
```
