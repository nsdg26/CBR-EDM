# Repo / deployment setup

This project lives across two GitHub repos and two accounts, on purpose:

- **`nsdg26/CBR-EDM-BUILD`** — the repo this Claude Code integration is
  connected to (`nsdg26` has the paid Claude/GitHub App link). All Claude
  Code sessions build, fix and commit here. This repo used to be named
  `CBR-EDM`; GitHub redirects the old URL, but the remote should be set to
  the `CBR-EDM-BUILD` name directly rather than relying on the redirect.
- **`nic-st/cbrdance`** — the owner's personal GitHub account. This is the
  repo Cloudflare Workers Builds actually watches for deployment: pushes
  here are what go live. It was originally a fork of the `nsdg26` repo;
  when `nsdg26` was made private, `nic-st` was added as a collaborator on
  it instead (so the fork relationship doesn't reflect current access).

**Workflow:** build and fix things here via Claude on `nsdg26/CBR-EDM-BUILD`
as normal. The owner then moves those changes across to `nic-st/cbrdance`
themselves (their desktop has separate local clones of each) -- that
second step is manual and outside this session. Pushing to
`nsdg26/CBR-EDM-BUILD`'s `main` does **not** by itself deploy anything;
nothing is live until it also reaches `nic-st/cbrdance`.

A Claude Code session can only work with repos under one GitHub account at
a time (no cross-account access in a single session), so this session
cannot see or push to `nic-st/cbrdance` directly -- that would need a
separate session started with `nic-st/cbrdance` as its source.

`scripts/sync-to-cbrdance.sh` does the actual moving-across step: run it
locally inside the `CBRDANCE` desktop folder to pull `nsdg26`'s `main`
into `nic-st/cbrdance`'s `main` and push it. It also fixes the common
failure mode where that folder's `origin` remote got pointed at the
`nsdg26` repo instead of `nic-st/cbrdance` (which is what makes GitHub
Desktop conflate the two folders and refuse to push).
