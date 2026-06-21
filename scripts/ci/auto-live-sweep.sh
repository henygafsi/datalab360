#!/usr/bin/env bash
# AUTO-LIVE-SWEEP — runs the FULL live verification the moment the backend is up.
# Designed to be polled (by the agent across the 24h loop, or by cron). If the
# backend is down it exits 2 (no-op, "still waiting"); if up it runs everything
# and writes a dated results doc to the vault.
#
# Backend MUST be launched from a terminal with SVC env (or the dev fallback):
#   cd /Users/datalab360/Documents/data360_pro/backend
#   CACHE_READ_ALLOW_USER_FALLBACK=1 <your usual uvicorn launch>
#
# Usage:  bash scripts/ci/auto-live-sweep.sh          # full sweep if backend up
#         PROVISION=1 bash scripts/ci/auto-live-sweep.sh   # also provision RBAC personas (mutation)
set -uo pipefail
FRONT=/Users/datalab360/Documents/data360_pro/datalab360Front
VAULT=/Users/datalab360/Documents/data360_pro/vault/data360_realtime_cache_map
API=${E2E_API:-http://127.0.0.1:8000}
APP=${APP_BASE:-http://localhost:3000}
OUT="$VAULT/_LIVE_VERIFICATION_RESULTS.md"
LOG=/tmp/auto-live-sweep.log
cd "$FRONT" || exit 1

say(){ echo "$@" | tee -a "$OUT"; }

# --- 0. gate on backend up -------------------------------------------------
code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$API/docs" 2>/dev/null || echo 000)
if [ "$code" != "200" ]; then
  echo "[auto-live-sweep] backend DOWN ($code) — no-op, still waiting." >> "$LOG"
  exit 2
fi

# --- header (fresh file each run) ------------------------------------------
: > "$OUT"
say "# Live Verification Results"
say ""
say "Backend reachable at $API ($code). Run started. (All numbers below are LIVE.)"
say ""

# --- 1. backend health matrix re-run (the 494-endpoint board) --------------
say "## 1. API health matrix"
if [ -f e2e/ux-audit/_admin-endpoints-test.mjs ]; then
  E2E_API="$API" node e2e/ux-audit/_admin-endpoints-test.mjs 2>&1 | tee -a "$LOG" | tail -40 >> "$OUT" || say "(health matrix harness errored — see $LOG)"
else
  say "(no _admin-endpoints-test.mjs; re-run the FE /admin/api-health board + POST /admin/api-health/runs to persist a release)"
fi
say ""

# --- 2. start FE (render-fast needs it) ------------------------------------
say "## 2. Frontend"
fe_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 "$APP" 2>/dev/null || echo 000)
if [ "$fe_code" != "200" ] && [ "$fe_code" != "307" ]; then
  rm -rf apps/data360/.next
  ( pnpm iso:dev >/tmp/fe-dev.log 2>&1 & echo $! > /tmp/fe-dev.pid )
  for i in $(seq 1 120); do
    c=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 "$APP" 2>/dev/null || echo 000)
    { [ "$c" = "200" ] || [ "$c" = "307" ]; } && { fe_code=$c; break; }
    sleep 2
  done
fi
say "FE status: $fe_code"
say ""

# --- 3. page render sweep (access + render-state per route) -----------------
say "## 3. Page render sweep (all routes)"
node e2e/ux-audit/render_all.mjs 2>&1 | tee -a "$LOG" | tail -40 >> "$OUT" || say "(render_all errored — see $LOG)"
say ""

# --- 4. render-FAST proof (per-page + per-endpoint timing) ------------------
say "## 4. Render-fast timing (cold vs warm)"
node e2e/ux-audit/front_perf.mjs 2>&1 | tee -a "$LOG" | tail -40 >> "$OUT" || say "(front_perf errored — see $LOG)"
say ""

# --- 5. role-aware cache + RBAC + data-access ------------------------------
say "## 5. Role-aware cache + RBAC + data access"
E2E_API="$API" node e2e/ux-audit/_role-cache-rbac-e2e.mjs 2>&1 | tee -a "$LOG" | tail -50 >> "$OUT" || say "(role-cache-rbac errored — see $LOG)"
say ""

# --- 6. RBAC persona matrix (RLS/masking/policy isolation) — optional mut ---
say "## 6. RBAC persona matrix (RLS / masking / policy isolation)"
if [ "${PROVISION:-0}" = "1" ]; then
  if [ -f e2e/ux-audit/_provision-and-audit.mjs ]; then
    E2E_API="$API" node e2e/ux-audit/_provision-and-audit.mjs 2>&1 | tee -a "$LOG" | tail -60 >> "$OUT" || say "(persona matrix errored — see $LOG)"
  else
    say "(persona provisioner not built yet — see _RBAC_TEST_MATRIX.md for the manual sequence)"
  fi
else
  say "(skipped — set PROVISION=1 to provision the 3 personas + run the isolation matrix; it mutates the local Snowflake account, reversible via drop-users/roles-batch)"
fi
say ""
say "---"
say "Run complete. Raw log: $LOG"
echo "[auto-live-sweep] DONE — results at $OUT" >> "$LOG"
