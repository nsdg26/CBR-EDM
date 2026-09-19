#!/usr/bin/env bash
# Pulls the latest fixes from nsdg26/CBR-EDM-BUILD (where Claude Code
# builds, via the paid integration) into nic-st/cbrdance (the repo
# Cloudflare Workers Builds actually deploys from). See CLAUDE.md for why
# these are two separate repos on two separate GitHub accounts.
#
# Run this from inside your local CBRDANCE folder on your desktop:
#   bash sync-to-cbrdance.sh
#
# It is safe to run more than once -- fetching and remote setup are
# idempotent, and it stops before touching anything if your working tree
# has uncommitted changes or the merge needs your input.

set -euo pipefail

UPSTREAM_URL="https://github.com/nsdg26/CBR-EDM-BUILD.git"
ORIGIN_URL="https://github.com/nic-st/cbrdance.git"

if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
  echo "Run this from inside your local CBRDANCE git folder." >&2
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "You have uncommitted changes here. Commit or stash them first, then re-run this." >&2
  exit 1
fi

# origin must point at nic-st/cbrdance -- this is the actual bug that
# breaks pushing from GitHub Desktop: if origin is still set to the
# nsdg26 repo (e.g. this folder was first cloned from the wrong place),
# every push tries to go to a repo you don't own.
current_origin="$(git remote get-url origin 2>/dev/null || echo '')"
if [ "$current_origin" != "$ORIGIN_URL" ]; then
  echo "origin is '$current_origin', not your own cbrdance repo -- fixing it."
  if git remote get-url origin > /dev/null 2>&1; then
    git remote set-url origin "$ORIGIN_URL"
  else
    git remote add origin "$ORIGIN_URL"
  fi
fi

if ! git remote get-url upstream > /dev/null 2>&1; then
  git remote add upstream "$UPSTREAM_URL"
fi

echo "Fetching nsdg26/CBR-EDM-BUILD and nic-st/cbrdance..."
git fetch upstream
git fetch origin

git checkout main
echo "Merging upstream/main into main..."
if ! git merge upstream/main; then
  echo
  echo "Merge stopped with conflicts (or unrelated histories) -- resolve them" >&2
  echo "by hand, then finish with: git add -A && git commit" >&2
  echo "Once that's done, push with: git push origin main" >&2
  exit 1
fi

echo "Pushing to origin (nic-st/cbrdance) main -- this is what Cloudflare deploys from..."
git push origin main

echo "Done. Cloudflare Workers Builds should pick this up automatically."
