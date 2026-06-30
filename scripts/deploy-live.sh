#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Data360 — live-test orchestrator (Track A → B → C) on Snowflake SPCS.
# Idempotent-ish, step-gated. NOTHING runs without a valid connection + a
# dedicated short-lived PAT exported in the environment (never hardcoded).
#
# Prereqs: `snow` CLI (>=3), `docker`, `terraform`, an ACCOUNTADMIN-capable role.
# Required env (export before running — use a DEDICATED short-lived PAT):
#   SNOWFLAKE_ORGANIZATION_NAME, SNOWFLAKE_ACCOUNT_NAME=KY11038,
#   SNOWFLAKE_USER=ORGAADMIN_USER, SNOWFLAKE_AUTHENTICATOR=PROGRAMMATIC_ACCESS_TOKEN,
#   SNOWFLAKE_TOKEN=<pat>, SNOWFLAKE_ROLE=ACCOUNTADMIN, SNOWFLAKE_WAREHOUSE=COMPUTE_WH
#
# Usage:  scripts/deploy-live.sh <step>
#   check     read-only connection + privilege/SPCS availability probe
#   infra     terraform apply (schema, repo, pool, EAI, secret, monitor)
#   image     docker build + push frontend image to the image repo
#   service   Track A: CREATE SERVICE directly + print public URL
#   app       Track B: snow app run (Native App package + install) + URL
#   listing   Track C: create an Organizational Listing (private, org-internal)
#   smoke     curl the public endpoint
#   all       check → infra → image → service → smoke
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
DB="${SNOWFLAKE_DATABASE:-CP_DATA360}"
SCHEMA="APP_TEST"
REPO="DATA360_REPO"
IMAGE="data360-frontend"
TAG="${IMAGE_TAG:-dev}"
POOL="DATA360_POOL"
SERVICE="DATA360_FRONTEND"
step="${1:-help}"

need() { command -v "$1" >/dev/null || { echo "✗ missing tool: $1"; exit 1; }; }

case "$step" in
  check)
    need snow
    echo "▶ read-only connection probe (no objects created)…"
    snow sql -q "SELECT CURRENT_ACCOUNT(), CURRENT_ORGANIZATION_NAME(), CURRENT_ROLE(), CURRENT_REGION();"
    echo "▶ privileges of current role (need CREATE COMPUTE POOL / IMAGE REPOSITORY):"
    snow sql -q "SHOW GRANTS TO ROLE IDENTIFIER(CURRENT_ROLE());"
    echo "▶ SPCS availability:"
    snow sql -q "SHOW COMPUTE POOLS;" || echo "  (compute pools not listable with this role)"
    ;;
  infra)
    need terraform; need snow
    : "${TF_VAR_nextauth_secret:?export TF_VAR_nextauth_secret (e.g. openssl rand -base64 32)}"
    ( cd infra/terraform && terraform init && terraform apply )
    echo "▶ creating EAI via SQL (no terraform resource exists for it)…"
    snow sql -q "CREATE EXTERNAL ACCESS INTEGRATION IF NOT EXISTS DATA360_BACKEND_EAI
      ALLOWED_NETWORK_RULES = (${DB}.${SCHEMA}.DATA360_BACKEND_EGRESS)
      ENABLED = TRUE
      COMMENT = 'Egress to Data360 backend for the SPCS frontend';"
    ;;
  image)
    need docker; need snow
    echo "▶ resolving image repository URL…"
    REPO_URL="$(snow spcs image-repository url "${DB}.${SCHEMA}.${REPO}")"
    echo "  repo: ${REPO_URL}"
    snow spcs image-registry login
    DOCKER_BUILDKIT=1 docker build -f Dockerfile.spcs -t "${REPO_URL}/${IMAGE}:${TAG}" .
    docker push "${REPO_URL}/${IMAGE}:${TAG}"
    ;;
  service)
    need snow
    echo "▶ uploading service spec to @${DB}.${SCHEMA}.SPECS …"
    snow stage copy snowflake-app/specs/data360-frontend.yaml "@${DB}.${SCHEMA}.SPECS" --overwrite
    echo "▶ Track A — CREATE SERVICE directly from spec…"
    snow sql -q "CREATE SERVICE IF NOT EXISTS ${DB}.${SCHEMA}.${SERVICE}
      IN COMPUTE POOL ${POOL}
      FROM @${DB}.${SCHEMA}.SPECS SPECIFICATION_FILE='data360-frontend.yaml'
      EXTERNAL_ACCESS_INTEGRATIONS=(DATA360_BACKEND_EAI);" || true
    echo "▶ waiting for endpoint (provisioning can take a few minutes)…"
    snow sql -q "SHOW ENDPOINTS IN SERVICE ${DB}.${SCHEMA}.${SERVICE};"
    echo "  ↑ patch NEXTAUTH_URL to the ingress_url, then re-run 'service' to apply."
    ;;
  app)
    need snow
    echo "▶ Track B — Native App package + install (provider account, debug)…"
    cd snowflake-app && snow app run
    ;;
  listing)
    need snow
    echo "▶ Track C — Organizational Listing (private, org-internal)… [À VÉRIFIER DOC]"
    snow sql -q "CREATE ORGANIZATION LISTING DATA360_INTERNAL
      APPLICATION PACKAGE DATA360_APP_PKG
      AS '{ \"title\": \"Data360 (internal test)\", \"visibility\": \"PRIVATE\" }';" \
      || echo "  Org listing DDL not accepted — use Provider Studio UI (see RUNBOOK)."
    ;;
  smoke)
    : "${APP_URL:?export APP_URL=<public ingress url>}"
    echo "▶ smoke test ${APP_URL} (no -f, no redirect-follow)"
    code=$(curl -sS -o /dev/null -w "%{http_code}" "$APP_URL" || true)
    loc=$(curl -sS -o /dev/null -D - "$APP_URL" 2>/dev/null | awk 'tolower($1)=="location:"{print $2}')
    echo "  HTTP ${code}  redirect→ ${loc:-none}"
    echo "  ⚠ The SPCS public endpoint is behind Snowflake OAuth. A 302/200 to a"
    echo "    Snowflake login page means 'reachable', NOT 'app reached'. Real"
    echo "    validation needs a browser login (or completing the OAuth flow)."
    ;;
  all)
    "$0" check && "$0" infra && "$0" image && "$0" service && echo "Now patch NEXTAUTH_URL + run smoke."
    ;;
  *)
    sed -n '1,40p' "$0"; ;;
esac
