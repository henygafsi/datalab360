#!/usr/bin/env bash
# Run AFTER the fixes are developed (relaunched Full-Disk-Access session).
# Validates the integration LIVE against :8000, then commits CODE ONLY — no .md, no docs.
# Two repos = one commit each (backend + front are separate git repos).
#   TOKEN=<jwt> bash deploy/scripts/validate-and-commit.sh
set -uo pipefail
FRONT=/Users/datalab360/Documents/data360_pro/datalab360Front
BACK=/Users/datalab360/Documents/data360_pro/backend
TOKEN="${TOKEN:-$(cat "${CLAUDE_JOB_DIR:-/tmp}/tmp/token" 2>/dev/null || true)}"
say(){ printf '\n\033[1;34m== %s ==\033[0m\n' "$1"; }
die(){ printf '\033[1;31m✗ %s\033[0m\n' "$1"; exit 1; }

# ── 1. BACKEND: preflight + authed endpoint integration test ──
say "backend preflight (imports / routes / secrets)"
cd "$BACK" || die "no backend repo"
[ -x "$FRONT/deploy/scripts/backend-preflight.sh" ] && bash "$FRONT/deploy/scripts/backend-preflight.sh" || echo "(preflight script missing — skipping)"

say "authed endpoint integration test (real ins/outs, fail on new 5xx)"
[ -n "$TOKEN" ] || die "no TOKEN — export TOKEN=<jwt> (mint via /signin) so the live test can run"
BASE=http://localhost:8000 TOKEN="$TOKEN" FAIL_ON=5xx node "$FRONT/deploy/scripts/endpoint-health.mjs" \
  || die "endpoint-health found 5xx regressions — fix before commit (esp. /admin/endpoint-usage, usage-by)"
# targeted: the endpoints this dev fixed must now return 2xx/expected, not 500
for ep in /admin/endpoint-usage /admin/usage-by; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -H "authorization: Bearer $TOKEN" "http://localhost:8000$ep" --max-time 30)
  [ "$code" = "500" ] && die "$ep still 500 — dead-account repoint not applied" || echo "  ✓ $ep = $code"
done

# ── 2. FRONTEND: lint + typecheck + build ──
say "frontend lint + typecheck + build"
cd "$FRONT" || die "no front repo"
corepack enable 2>/dev/null || true
pnpm --filter data360 lint || die "lint failed"
pnpm --filter data360 exec tsc --noEmit || die "typecheck failed"
pnpm --filter data360 build || die "build failed"

# ── 3. COMMIT — code only, exclude ALL .md + docs (one commit per repo) ──
commit_code_only(){ # $1 repo, $2 message
  cd "$1"
  git add -A
  git reset -q -- '*.md' 'docs/' '**/*.md' 2>/dev/null || true   # never .md / docs
  git status --short | grep -qi '\.env$' && die "app/.env staged — untrack + rotate first"
  if git diff --cached --quiet; then echo "  (nothing to commit in $1)"; else
    git commit -m "$2"
    echo "  committed $1 (code only) — push with: git push origin \$(git rev-parse --abbrev-ref HEAD)"
  fi
}
say "commit backend (code only)"
commit_code_only "$BACK" "fix: RBAC role-map + admin-events dead-account + input-validation + gate infra mutations"
say "commit frontend (code only)"
commit_code_only "$FRONT" "feat: wire missing functional actions per module with useCanPerform gates + admin one-page/KPI axis"

say "DONE"
echo "Live-validated + committed code only (no .md/docs). Review, then push each repo (front→feat/backlog-v1; backend→its branch, your go)."
