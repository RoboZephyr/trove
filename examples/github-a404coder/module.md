---
name: github-a404coder
version: 0.1.0
category: dev-tool
description: GitHub account "A404coder" — SSH alias and git identity for projects under this account (idea-business, etc.)
homepage: https://github.com/A404coder
tags: [github, git, multi-account]
applies_to:
  - any git push / pull / clone targeting A404coder/* repos
  - any `gh` CLI operation that should run as A404coder
  - initializing new local repos that will live under A404coder/
trove_spec: "0.1"

credentials:
  GITHUB_USER:
    type: text
    default: A404coder
  GITHUB_USER_ID:
    type: text
    default: "94605465"
  GITHUB_NOREPLY_EMAIL:
    type: text
    default: "94605465+A404coder@users.noreply.github.com"
  GITHUB_SSH_ALIAS:
    type: text
    default: github-a404coder
    help: "Note: A404coder is also the GLOBAL git identity, so explicit alias is less critical here than for RoboZephyr — but still recommended for consistency"
  GITHUB_SSH_KEY_PATH:
    type: text
    default: "~/.ssh/id_ed25519_github"
---

# GitHub Account: A404coder — Multi-Account Setup Guide

A404coder is the **global default** git identity. For repos under this account, the global config "just works" — but be explicit about SSH alias for clarity and to avoid surprises if global config ever changes.

## Critical Constraints

1. **Default global git identity is A404coder** — `git config --global user.email` returns `94605465+A404coder@users.noreply.github.com`. So local override is optional but recommended for explicitness
2. **Don't confuse with RoboZephyr** — both accounts are logged into `gh auth`; check `gh auth status` before any `gh` operation
3. **idea-business is the main A404coder project** at `~/zephyrme/idea-business/`

## Setup checklist for a new A404coder repo

```bash
mkdir my-project && cd my-project
git init -b main

# Optional but explicit (matches global anyway)
git config --local user.name "zephyr"
git config --local user.email "94605465+A404coder@users.noreply.github.com"

# Confirm gh is on A404coder
gh auth switch -u A404coder

# Create + push (the default URL works for A404coder since global SSH key matches)
gh repo create A404coder/my-project --public --source . --push --description "..."
# This usually works without alias rewriting because the default SSH key IS A404coder's
```

## Cloning

```bash
git clone git@github-a404coder:A404coder/<repo>.git
# OR (also works because global SSH key is A404coder's)
git clone git@github.com:A404coder/<repo>.git
```

## When to use which account

- **A404coder** (this module) → idea-business and its subprojects
- **RoboZephyr** → atoms-case, lovebridge, vibe-check, classics-learning, trove (and other personal OSS) — see `@~/.trove/github-robozephyr/module.md`

## Common error → fix

| Error | Cause | Fix |
|---|---|---|
| Commit attributed to RoboZephyr in A404coder repo | local config left over from prior project | `git config --local user.email "94605465+A404coder@users.noreply.github.com"` |
| `gh: command needs different account` | gh active is RoboZephyr | `gh auth switch -u A404coder` |
