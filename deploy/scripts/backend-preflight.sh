#!/usr/bin/env bash
# PREVENTIVE backend code-health gate — run in CI before building/shipping the image.
# Catches the failures rsync-deploy never caught: broken imports, dropped routes,
# missing deps, syntax errors. Fast, no live Snowflake needed for the import graph.
#
#   cd backend && ../deploy/scripts/backend-preflight.sh
# Exit non-zero on any failure → blocks the pipeline.
set -uo pipefail
FAIL=0
say(){ printf '\n\033[1m== %s ==\033[0m\n' "$1"; }
ok(){ printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad(){ printf '  \033[31m✗\033[0m %s\n' "$1"; FAIL=1; }

PY=${PYTHON:-python3}
APP_MODULE=${APP_MODULE:-app.main:app}
MIN_ROUTES=${MIN_ROUTES:-800}   # contract has ~917 paths; alert if routes collapse

say "1. Python syntax (compile every .py — catches parse errors)"
if $PY -m compileall -q app 2>/tmp/compile.err; then ok "all modules compile"; else bad "syntax errors:"; cat /tmp/compile.err; fi

say "2. Dependency resolution"
if [ -f requirements.txt ]; then
  $PY -m pip check >/tmp/pipcheck.out 2>&1 && ok "no broken/conflicting deps" || { bad "pip check failed:"; cat /tmp/pipcheck.out; }
else ok "no requirements.txt (skip pip check)"; fi

say "3. App import graph (THE deploy-breaker — broken import = 100% down)"
IMPORT="import importlib,sys
mod,attr=('${APP_MODULE}'.split(':')+[None])[:2]
try:
    m=importlib.import_module(mod); app=getattr(m,attr) if attr else m
    print('  imported', '${APP_MODULE}')
except Exception as e:
    import traceback; traceback.print_exc(); sys.exit(3)"
if $PY -c "$IMPORT" 2>/tmp/import.err; then ok "app imports clean"; else bad "app import FAILED:"; tail -20 /tmp/import.err; fi

say "4. Route registration (detect dropped/renamed routes vs baseline)"
ROUTECODE="import importlib
mod,attr=('${APP_MODULE}'.split(':')+[None])[:2]
app=getattr(importlib.import_module(mod),attr)
routes=[r.path for r in app.routes if hasattr(r,'path')]
print(len(routes))
import json,os
if os.environ.get('ROUTE_BASELINE') and os.path.exists(os.environ['ROUTE_BASELINE']):
    base=set(json.load(open(os.environ['ROUTE_BASELINE'])))
    dropped=sorted(base-set(routes))
    if dropped:
        print('DROPPED:'+'|'.join(dropped[:40])); raise SystemExit(4)
open('routes.snapshot.json','w').write(json.dumps(sorted(set(routes))))"
RC=$($PY -c "$ROUTECODE" 2>/tmp/route.err); RCEXIT=$?
if [ $RCEXIT -eq 0 ]; then
  [ "${RC%%$'\n'*}" -ge "$MIN_ROUTES" ] 2>/dev/null && ok "$RC routes registered (≥$MIN_ROUTES)" || bad "only $RC routes (< $MIN_ROUTES — routers failed to load?)"
elif grep -q DROPPED /tmp/route.err; then bad "routes dropped vs baseline:"; grep DROPPED /tmp/route.err | tr '|' '\n' | head -20
else bad "route introspection failed:"; tail -10 /tmp/route.err; fi

say "5. Smoke tests (fast subset, if present)"
if $PY -c "import pytest" 2>/dev/null && [ -d tests ]; then
  $PY -m pytest -q -m "smoke or not slow" --maxfail=1 -x 2>/tmp/pytest.out && ok "smoke tests pass" || { bad "smoke tests failed:"; tail -25 /tmp/pytest.out; }
else ok "pytest/tests absent (skip)"; fi

say "6. Secret hygiene (block committed .env from shipping)"
if git ls-files 2>/dev/null | grep -qE '(^|/)\.env$'; then bad ".env is TRACKED in git — 'git rm --cached app/.env' + rotate + gitignore"; else ok "no tracked .env"; fi

echo
[ $FAIL -eq 0 ] && { printf '\033[32mPREFLIGHT PASS\033[0m\n'; exit 0; } || { printf '\033[31mPREFLIGHT FAIL — pipeline should stop here\033[0m\n'; exit 1; }
