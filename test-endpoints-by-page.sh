#!/bin/bash
# =============================================================================
# Data360 - Test Register → Sign-in → Token sur toutes les pages et sous-pages
# Liste complète des endpoints par page avec statut et message d'erreur.
#
# Usage:
#   ./test-endpoints-by-page.sh [API_BASE]
#   TEST_ACCOUNT=MyOrg TEST_USERNAME=user TEST_PASSWORD=pass ./test-endpoints-by-page.sh
#   TEST_TOKEN=jwt_here ./test-endpoints-by-page.sh   # skip register/login
# =============================================================================

API_BASE="${1:-http://127.0.0.1:8000}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
TEST_USER="${TEST_USERNAME:-testuser_${TIMESTAMP}}"
TEST_ORG="${TEST_ACCOUNT:-TestOrg_${TIMESTAMP}}"
TEST_EMAIL="${TEST_EMAIL:-test.${TIMESTAMP}@example.com}"
TEST_PASS="${TEST_PASSWORD:-TestPass123!}"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# CSV output: PAGE|SUBPAGE|ENDPOINT|METHOD|STATUS|ERROR
RESULTS=()
record() { RESULTS+=("$1|$2|$3|$4|$5|$6"); }

# Curl with auth headers, returns status and body (first 300 chars of body for errors)
run_request() {
  local method="$1"
  local path="$2"
  local token="$3"
  local account="$4"
  local username="$5"
  local body="${6:-}"
  local extra_query="${7:-}"
  local url="${API_BASE}${path}${extra_query}"
  local timeout_opt=""
  [[ "$path" == *"cache/stream"* ]] && timeout_opt="--max-time 2"
  local out
  if [ "$method" = "GET" ]; then
    if [ -n "$token" ]; then
      out=$(curl -s -w "\n%{http_code}" $timeout_opt -X GET "$url" \
        -H "Accept: application/json" \
        -H "Authorization: Bearer ${token}" \
        ${account:+-H "X-Account-Name: ${account}"} \
        ${username:+-H "X-Username: ${username}"} 2>/dev/null)
    else
      out=$(curl -s -w "\n%{http_code}" $timeout_opt -X GET "$url" -H "Accept: application/json" 2>/dev/null)
    fi
  else
    if [ -n "$token" ]; then
      out=$(curl -s -w "\n%{http_code}" -X "$method" "$url" \
        -H "Content-Type: application/json" -H "Accept: application/json" \
        -H "Authorization: Bearer ${token}" \
        ${account:+-H "X-Account-Name: ${account}"} \
        ${username:+-H "X-Username: ${username}"} \
        ${body:+-d "$body"} 2>/dev/null)
    else
      out=$(curl -s -w "\n%{http_code}" -X "$method" "$url" \
        -H "Content-Type: application/json" -H "Accept: application/json" \
        ${body:+-d "$body"} 2>/dev/null)
    fi
  fi
  echo "$out"
}

# Test one endpoint and record result. Usage: test_one PAGE SUBPAGE ENDPOINT METHOD [BODY]
test_one() {
  local page="$1"
  local subpage="$2"
  local path="$3"
  local method="${4:-GET}"
  local body="${5:-}"
  local query="${6:-}"
  local name="${page} / ${subpage} / ${path}"
  echo -n "  ${path} (${method}) ... "
  local out
  out=$(run_request "$method" "$path" "$TOKEN" "$ACCOUNT_NAME" "$USERNAME" "$body" "$query")
  local code
  code=$(echo "$out" | tail -n1)
  local resp_body
  resp_body=$(echo "$out" | sed '$d')
  local err_msg=""
  if [[ ! "$code" =~ ^(200|201|204)$ ]]; then
    err_msg=$(echo "$resp_body" | head -c 300 | tr '\n' ' ' | sed 's/|/ /g')
  fi
  if [[ "$code" =~ ^(200|201|204)$ ]]; then
    echo -e "${GREEN}${code}${NC}"
    record "$page" "$subpage" "$path" "$method" "$code" ""
  else
    echo -e "${RED}${code}${NC} ${err_msg:0:60}"
    record "$page" "$subpage" "$path" "$method" "$code" "$err_msg"
  fi
}

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  Data360 - Register → Sign-in → Token → Tous endpoints par page${NC}"
echo -e "${BLUE}  Base: $API_BASE${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

TOKEN="${TEST_TOKEN}"
ACCOUNT_NAME=""
USERNAME=""

# --- 1. Register (skip if TEST_TOKEN set OR if TEST_ACCOUNT/TEST_USERNAME/TEST_PASSWORD provided) ---
USE_PROVIDED_CREDS=""
[ -n "${TEST_ACCOUNT}" ] && [ -n "${TEST_USERNAME}" ] && [ -n "${TEST_PASSWORD}" ] && USE_PROVIDED_CREDS=1

if [ -z "$TOKEN" ] && [ -z "$USE_PROVIDED_CREDS" ]; then
  echo -e "${YELLOW}[1] Register${NC}"
  REG_BODY="{\"organisation_name\":\"${TEST_ORG}\",\"username\":\"${TEST_USER}\",\"email\":\"${TEST_EMAIL}\",\"password\":\"${TEST_PASS}\",\"confirm_password\":\"${TEST_PASS}\"}"
  out=$(run_request POST "/user/register/" "" "" "" "$REG_BODY")
  REG_CODE=$(echo "$out" | tail -n1)
  REG_BODY_RESP=$(echo "$out" | sed '$d')
  if [[ "$REG_CODE" =~ ^(200|201)$ ]]; then
    echo -e "  /user/register/ ... ${GREEN}${REG_CODE} OK${NC}"
    record "Auth" "Sign-up" "/user/register/" "POST" "$REG_CODE" ""
  else
    echo -e "  /user/register/ ... ${RED}${REG_CODE}${NC} $(echo "$REG_BODY_RESP" | head -c 80)"
    record "Auth" "Sign-up" "/user/register/" "POST" "$REG_CODE" "$(echo "$REG_BODY_RESP" | head -c 200)"
  fi
  echo ""
fi

# --- 2. Login ---
if [ -z "$TOKEN" ]; then
  echo -e "${YELLOW}[2] Sign-in (Login)${NC}"
  if [ -n "$USE_PROVIDED_CREDS" ]; then
    LOGIN_BODY="{\"account_name\":\"${TEST_ACCOUNT}\",\"username\":\"${TEST_USERNAME}\",\"password\":\"${TEST_PASSWORD}\"}"
  else
    LOGIN_BODY="{\"account_name\":\"${TEST_ORG}\",\"username\":\"${TEST_USER}\",\"password\":\"${TEST_PASS}\"}"
  fi
  out=$(run_request POST "/user/login/" "" "" "" "$LOGIN_BODY")
  LOGIN_CODE=$(echo "$out" | tail -n1)
  LOGIN_BODY_RESP=$(echo "$out" | sed '$d')
  if [[ "$LOGIN_CODE" == "200" ]]; then
    TOKEN=$(echo "$LOGIN_BODY_RESP" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
    ACCOUNT_NAME=$(echo "$LOGIN_BODY_RESP" | grep -o '"account_name":"[^"]*"' | cut -d'"' -f4)
    USERNAME=$(echo "$LOGIN_BODY_RESP" | grep -o '"username":"[^"]*"' | cut -d'"' -f4)
    echo -e "  /user/login/ ... ${GREEN}200 OK${NC} (token + account_name + username)"
    record "Auth" "Sign-in" "/user/login/" "POST" "200" ""
  else
    echo -e "  /user/login/ ... ${RED}${LOGIN_CODE}${NC}"
    record "Auth" "Sign-in" "/user/login/" "POST" "$LOGIN_CODE" "$(echo "$LOGIN_BODY_RESP" | head -c 200)"
    if [ -n "$TEST_TOKEN" ]; then
      TOKEN="$TEST_TOKEN"
      echo -e "  ${YELLOW}Using TEST_TOKEN from env.${NC}"
    fi
  fi
  echo ""
fi

if [ -z "$TOKEN" ]; then
  echo -e "${YELLOW}No token: authenticated endpoints will return 401. Set TEST_ACCOUNT, TEST_USERNAME, TEST_PASSWORD or TEST_TOKEN.${NC}"
  echo ""
fi

# --- 3. Endpoints by page (full list) ---
echo -e "${CYAN}[3] User & modules${NC}"
test_one "User" "Modules" "/user/me/modules" "GET"
echo ""

echo -e "${CYAN}[4] Dashboard (main)${NC}"
test_one "Dashboard" "Gouvernance" "/gouvernance/client/dashboard" "GET"
test_one "Dashboard" "Activity" "/gouvernance/dashboard/activity" "GET" "" "?start_date=2025-01-01T00:00:00&end_date=2025-12-31T23:59:59"
test_one "Dashboard" "Workflows" "/workflow/get_workflows/" "GET"
test_one "Dashboard" "Scheduled deployments" "/mapping/get_scheduled_deployments/" "GET"
test_one "Dashboard" "Approve deployment" "/mapping/approve_deployment/" "POST" '{"workflow_name":"dummy","approved_by":"test"}'
test_one "Dashboard" "Reject deployment" "/mapping/reject_deployment/" "POST" '{"workflow_name":"dummy","rejected_by":"test"}'
test_one "Dashboard" "Activate deployment" "/mapping/activate_deployment/" "POST" '{"workflow_name":"dummy","activated_by":"test"}'
echo ""

echo -e "${CYAN}[5] Gouvernance - Storage & DWH${NC}"
test_one "Gouvernance" "Stage storage" "/gouvernance/get_stage_storage_info" "GET"
test_one "Gouvernance" "DWH storage" "/gouvernance/get_dwh_storage_info" "GET" "" "?database_name=CP_DATA360&schema_name=RETAIL_DW"
test_one "Gouvernance" "DWH schemas" "/gouvernance/get_dwh_schemas" "GET"
test_one "Gouvernance" "DWH health" "/gouvernance/get_dwh_health_info" "GET" "" "?schema_name=RETAIL_DW"
test_one "Gouvernance" "User info" "/gouvernance/get_user_info" "GET"
test_one "Gouvernance" "Connectors" "/gouvernance/info" "GET"
test_one "Gouvernance" "MFA status" "/gouvernance/user/mfa/status" "GET" "" "?username=test"
echo ""

echo -e "${CYAN}[6] Gouvernance - Users${NC}"
test_one "Gouvernance" "Users list" "/gouvernance/users" "GET"
test_one "Gouvernance" "Users with roles" "/gouvernance/users-with-roles" "GET"
test_one "Gouvernance" "Grants" "/gouvernance/grants" "GET"
echo ""

echo -e "${CYAN}[7] Gouvernance - Roles${NC}"
test_one "Gouvernance" "Roles list" "/gouvernance/roles" "GET"
test_one "Gouvernance" "Update grants" "/gouvernance/update-grants" "PUT" '{"role_name":"DUMMY_ROLE","modules":[]}'
echo ""

echo -e "${CYAN}[8] Gouvernance - Security Matrix${NC}"
test_one "Gouvernance" "Security matrix init" "/gouvernance/security-matrix/init" "POST" "{}"
test_one "Gouvernance" "Security matrix" "/gouvernance/security-matrix" "GET"
test_one "Gouvernance" "Security axes" "/gouvernance/security-axes" "GET"
test_one "Gouvernance" "RLS policies" "/gouvernance/rls-policies" "GET"
echo ""

echo -e "${CYAN}[9] Gouvernance - Policies (backend)${NC}"
test_one "Gouvernance" "Policies row-access list" "/gouvernance/policies/row-access/list" "GET"
test_one "Gouvernance" "Policies masking list" "/gouvernance/policies/masking/list" "GET"
test_one "Gouvernance" "Policies network list" "/gouvernance/policies/network/list" "GET"
test_one "Gouvernance" "Policies tags list" "/gouvernance/policies/tags/list" "GET"
test_one "Gouvernance" "Policies objects databases" "/gouvernance/policies/objects/databases" "GET"
test_one "Gouvernance" "Policies health" "/gouvernance/policies/health" "GET"
echo ""

echo -e "${CYAN}[10] Mapping - Discovery${NC}"
test_one "Mapping" "Databases" "/mapping/databases" "GET"
test_one "Mapping" "Schemas" "/mapping/schemas/CP_DATA360" "GET"
test_one "Mapping" "Tables" "/mapping/tables/CP_DATA360/RETAIL_DW" "GET"
test_one "Mapping" "Table columns" "/mapping/get_table_columns/" "GET" "" "?database_name=CP_DATA360&schema_name=RETAIL_DW&table_name=CUSTOMERS"
echo ""

echo -e "${CYAN}[11] Mapping - Projects & state${NC}"
test_one "Mapping" "Get projects" "/mapping/get_projects" "POST" "{}"
test_one "Mapping" "Get scheduled deployments" "/mapping/get_scheduled_deployments/" "GET"
test_one "Mapping" "Describe selected columns" "/mapping/describe-selected-columns" "GET"
test_one "Mapping" "Constraints" "/mapping/constraints" "GET" "" "?database_name=CP_DATA360&schema_name=RETAIL_DW"
test_one "Mapping" "Details" "/mapping/details" "GET"
echo ""

echo -e "${CYAN}[12] Mapping - Actions (POST)${NC}"
test_one "Mapping" "Create project" "/mapping/create_project" "POST" '{"project_name":"test_e2e","database_name":"CP_DATA360","schema_name":"RETAIL_DW"}'
test_one "Mapping" "Add event" "/mapping/add-event/" "POST" '{"project_id":"00000000-0000-0000-0000-000000000000","event_type":"TEST","payload":{}}'
test_one "Mapping" "Log event" "/mapping/log_event/" "POST" '{"project_id":"00000000-0000-0000-0000-000000000000","module_name":"TEST","event_type":"TEST","status":"SUCCESS"}'
test_one "Mapping" "Get steps event" "/mapping/get-steps-event/" "POST" '{"project_id":"00000000-0000-0000-0000-000000000000"}'
echo ""

echo -e "${CYAN}[13] Workflow${NC}"
test_one "Workflow" "Get workflows" "/workflow/get_workflows/" "GET"
test_one "Workflow" "Create workflow" "/workflow/create_workflow/" "POST" '{"workflow_name":"test_e2e","steps":[]}'
test_one "Workflow" "Execute workflow" "/workflow/execute_workflow/" "POST" "" "?workflow_name=test_e2e"
test_one "Workflow" "Schedule workflow" "/workflow/schedule_workflow/" "POST" '{"workflow_name":"test_e2e","cron_schedule":"daily"}'
test_one "Workflow" "Setup init tables" "/workflow/setup/initialize-tables" "POST" "{}"
echo ""

echo -e "${CYAN}[14] Org Accounts - Dashboard${NC}"
test_one "Org Accounts" "Dashboard" "/org-accounts/dashboard" "GET"
test_one "Org Accounts" "Overview" "/org-accounts/dashboard/overview" "GET"
test_one "Org Accounts" "Usage" "/org-accounts/dashboard/usage" "GET"
test_one "Org Accounts" "Trends" "/org-accounts/dashboard/trends" "GET" "" "?days=30"
test_one "Org Accounts" "Activity" "/org-accounts/dashboard/activity" "GET"
echo ""

echo -e "${CYAN}[15] Org Accounts - Accounts & credits${NC}"
test_one "Org Accounts" "Accounts list" "/org-accounts/accounts" "GET"
test_one "Org Accounts" "Credits" "/org-accounts/credits" "GET" "" "?days=30"
test_one "Org Accounts" "Credits top" "/org-accounts/credits/top" "GET" "" "?days=30&limit=10"
test_one "Org Accounts" "Credits trend" "/org-accounts/credits/trend" "GET" "" "?days=30"
test_one "Org Accounts" "Storage" "/org-accounts/storage" "GET"
test_one "Org Accounts" "Storage trend" "/org-accounts/storage/trend" "GET" "" "?days=30"
test_one "Org Accounts" "Warehouses" "/org-accounts/warehouses" "GET" "" "?days=30"
test_one "Org Accounts" "Balance" "/org-accounts/balance" "GET"
test_one "Org Accounts" "Health" "/org-accounts/health" "GET"
test_one "Org Accounts" "Alerts" "/org-accounts/alerts" "GET" "" "?days=7"
test_one "Org Accounts" "Reader accounts" "/org-accounts/reader-accounts" "GET"
test_one "Org Accounts" "Shares" "/org-accounts/shares" "GET"
echo ""

echo -e "${CYAN}[16] Observability${NC}"
test_one "Observability" "KPIs" "/observability/kpis" "GET"
test_one "Observability" "Dashboard" "/observability/dashboard" "GET"
test_one "Observability" "Health" "/observability/health" "GET"
test_one "Observability" "Compliance GDPR" "/observability/compliance/gdpr" "GET"
test_one "Observability" "Compliance SOC2" "/observability/compliance/soc2" "GET"
test_one "Observability" "Lineage" "/observability/lineage" "GET"
test_one "Observability" "Activity summary" "/observability/activity/summary" "GET" "" "?days=7"
test_one "Observability" "Activity heatmap" "/observability/activity/heatmap" "GET" "" "?days=7"
test_one "Observability" "Security posture" "/observability/security/posture" "GET"
test_one "Observability" "Security sensitive-data" "/observability/security/sensitive-data" "GET"
test_one "Observability" "Cost warehouse-usage" "/observability/cost/warehouse-usage" "GET" "" "?days=30"
test_one "Observability" "Cost daily-credits" "/observability/cost/daily-credits" "GET" "" "?days=30"
test_one "Observability" "Cost storage" "/observability/cost/storage" "GET"
test_one "Observability" "Performance metrics" "/observability/performance/metrics" "GET" "" "?days=7"
test_one "Observability" "Performance slow-queries" "/observability/performance/slow-queries" "GET" "" "?days=7"
echo ""

echo -e "${CYAN}[17] Explore Design${NC}"
test_one "Explore Design" "Validate events" "/explore-design/events/validate" "POST" "{\"events\":[]}"
test_one "Explore Design" "Schema clone preview" "/explore-design/schema-clone/preview" "POST" "{\"source_database\":\"CP_DATA360\",\"source_schema\":\"RETAIL_DW\"}"
echo ""

echo -e "${CYAN}[18] Connect (Datalake)${NC}"
test_one "Connect" "Integration" "/connect/integration" "GET"
test_one "Connect" "Databases browse" "/connect/databases/browse" "GET"
test_one "Connect" "Snowflake databases" "/connect/snowflake_lake/databases" "GET"
test_one "Connect" "Stages" "/connect/stages" "GET"
echo ""

echo -e "${CYAN}[19] Cache (SSE)${NC}"
test_one "Cache" "Stream" "/api/cache/stream" "GET" "" ""  # may timeout
echo ""

echo -e "${CYAN}[20] Cortex${NC}"
test_one "Cortex" "KPIs" "/cortex/kpis" "GET"
test_one "Cortex" "Query" "/cortex/query" "POST" '{"prompt":"test"}'
echo ""

# --- Report ---
REPORT_DIR="$(dirname "$0")/docs"
mkdir -p "$REPORT_DIR"
REPORT="${REPORT_DIR}/ENDPOINTS_FULL_TEST_REPORT.md"
{
  echo "# Data360 – Rapport complet des tests d’endpoints par page"
  echo ""
  echo "**Date:** $(date -Iseconds)"
  echo "**Base URL:** \`$API_BASE\`"
  echo "**Token utilisé:** $([ -n "$TOKEN" ] && echo "Oui (Register→Login ou TEST_TOKEN)" || echo "Non")"
  echo ""
  echo "---"
  echo ""
  echo "## Résumé par page"
  echo ""

  # Group by PAGE
  current_page=""
  for r in "${RESULTS[@]}"; do
    IFS='|' read -r page subpage endpoint method status err <<< "$r"
    if [ "$page" != "$current_page" ]; then
      current_page="$page"
      echo "### $page"
      echo ""
      echo "| Sous-page | Endpoint | Méthode | Statut | Erreur |"
      echo "|-----------|----------|---------|--------|--------|"
    fi
    echo "| $subpage | \`$endpoint\` | $method | $status | ${err:0:80} |"
  done

  echo ""
  echo "---"
  echo ""
  echo "## Liste complète (CSV-style)"
  echo ""
  echo "| Page | Sous-page | Endpoint | Méthode | Statut | Erreur |"
  echo "|------|-----------|----------|---------|--------|--------|"
  for r in "${RESULTS[@]}"; do
    IFS='|' read -r page subpage endpoint method status err <<< "$r"
    echo "| $page | $subpage | \`$endpoint\` | $method | $status | ${err:0:120} |"
  done

  echo ""
  echo "---"
  echo "Généré par \`test-endpoints-by-page.sh\`"
} > "$REPORT"

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  Rapport écrit: $REPORT${NC}"
echo -e "${BLUE}============================================${NC}"
