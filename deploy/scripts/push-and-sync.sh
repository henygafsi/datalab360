#!/usr/bin/env bash
# One-shot: push all code + sync branches (front GitHub, backend GitLab).
# Safe by default: pushes the WORKING branches + catches them up from prod; the
# prod-promoting merges (→ dev / → main) run only with --promote. Stops cleanly on
# any conflict so you resolve it, then re-run.
#
#   deploy/scripts/push-and-sync.sh              # push working branches + catch-up only
#   deploy/scripts/push-and-sync.sh --promote    # also merge feat/backlog-v1→dev and backlog-v1→main (⚠ production)
#
# Must run from a normal shell (git is TCC-blocked inside the Claude sandbox).
set -uo pipefail
PROMOTE=0; [ "${1:-}" = "--promote" ] && PROMOTE=1
FRONT=/Users/datalab360/Documents/data360_pro/datalab360Front
BACK=/Users/datalab360/Documents/data360_pro/backend
say(){ printf '\n\033[1;34m== %s ==\033[0m\n' "$1"; }
die(){ printf '\n\033[1;31m✗ %s\033[0m\n' "$1"; exit 1; }
merge_or_stop(){ git merge --no-edit "$1" || die "conflict merging $1 — resolve, 'git add -A && git commit', then re-run"; }

# ── FRONT (GitHub) — feat/backlog-v1 ↔ dev ──
say "FRONT: clean + commit + push feat/backlog-v1"
cd "$FRONT" || die "no front repo"
[ -x deploy/scripts/audit-unused.sh ] && deploy/scripts/audit-unused.sh --apply || true
rm -f apps/data360/.env.local.bak-* 2>/dev/null || true
git fetch origin || die "front fetch failed"
git checkout feat/backlog-v1 || die "checkout feat/backlog-v1"
git add -A
git diff --cached --quiet || git commit -m "chore: prod deploy package (Docker + preventive CI), MCP config, prune artifacts"
merge_or_stop origin/dev                 # catch up with prod
git push origin feat/backlog-v1 || die "front push failed"
if [ $PROMOTE -eq 1 ]; then
  say "FRONT: promote feat/backlog-v1 → dev (⚠ deploys to production)"
  git checkout dev && git pull --ff-only origin dev
  merge_or_stop origin/feat/backlog-v1
  git push origin dev || die "push dev failed"
  git checkout feat/backlog-v1
fi

# ── BACKEND (GitLab) — backlog-v1 ↔ main ──
if [ -d "$BACK/.git" ]; then
  say "BACKEND: sync backlog-v1 with main"
  cd "$BACK"
  git fetch origin || die "backend fetch failed"
  git checkout backlog-v1 || die "checkout backend backlog-v1"
  merge_or_stop origin/main                # catch up; NEVER commit app/.env
  git status --short | grep -q '\.env$' && die "app/.env is staged — 'git rm --cached app/.env' + rotate first"
  git push origin backlog-v1 || die "backend push failed"
  if [ $PROMOTE -eq 1 ]; then
    say "BACKEND: promote backlog-v1 → main (⚠ production)"
    git checkout main && git pull --ff-only origin main
    merge_or_stop origin/backlog-v1
    git push origin main || die "push main failed"
    git checkout backlog-v1
  fi
else
  printf '\n\033[33m⚠ backend repo not found at %s — skipped\033[0m\n' "$BACK"
fi

say "DONE"
[ $PROMOTE -eq 0 ] && echo "Working branches pushed + caught up. Re-run with --promote to merge to dev/main (production)."
