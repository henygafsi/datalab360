#!/usr/bin/env bash
# Consolidate every report/*.{txt,json,env} into a single markdown summary
# that GitLab will surface as the MR's "Quality Report" artifact.
set -u

DIR="${1:-reports}"

read_env() {
  local f="$1" key="$2" default="${3:-?}"
  [ -f "$f" ] || { echo "$default"; return; }
  grep -E "^${key}=" "$f" | head -1 | cut -d= -f2- | tr -d '"' || echo "$default"
}

echo "# Data360 Front — Quality Report"
echo
echo "_Generated $(date -u +%Y-%m-%dT%H:%M:%SZ)_"
echo

echo "## At-a-glance"
echo
echo "| Metric | Value |"
echo "|---|---|"
echo "| Lint     | $(grep -cE 'error|warning' "$DIR/eslint.txt" 2>/dev/null || echo '?') issues |"
echo "| TypeScript | $(read_env "$DIR/tsc.env" TSC_ERRORS 0) errors |"
echo "| Prettier | $(grep -cE 'Code style issues' "$DIR/prettier.txt" 2>/dev/null || echo 0) files unformatted |"
echo "| Dep audit | $(read_env "$DIR/dep.env" DEP_CRITICAL 0) critical · $(read_env "$DIR/dep.env" DEP_HIGH 0) high |"
echo "| Secret scan | $(read_env "$DIR/secret.env" SECRET_LEAKS 0) potential leaks |"
echo "| Dead routes | $(grep -cE '^  /' "$DIR/dead-routes.txt" 2>/dev/null || echo 0) |"
echo "| Build | $([ -f "$DIR/build.txt" ] && grep -qE 'Compiled successfully' "$DIR/build.txt" && echo 'OK' || echo 'check log') |"
echo

for sect in tsc eslint prettier pnpm-audit secrets dead-routes bundle vitest playwright axe build; do
  f="$DIR/${sect}.txt"
  [ -f "$f" ] || continue
  size=$(wc -c < "$f" 2>/dev/null || echo 0)
  if [ "$size" -lt 50 ]; then continue; fi
  echo "## ${sect}"
  echo
  echo '```'
  head -200 "$f"
  echo '```'
  echo
done
