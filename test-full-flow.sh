#!/bin/bash
# =============================================================================
# Data360 - Test complet : création de compte + login + endpoints par page
# Usage: ./test-full-flow.sh [API_BASE]
# Exemple: ./test-full-flow.sh http://127.0.0.1:8000
# =============================================================================

API_BASE="${1:-http://127.0.0.1:8000}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
TEST_USER="testuser_${TIMESTAMP}"
TEST_ORG="TestOrg_${TIMESTAMP}"
TEST_EMAIL="test_${TIMESTAMP}@datalab360.test"
TEST_PASS="TestPass123!"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

RESULTS=()

# Result: name, endpoint, method, status, detail
record() { RESULTS+=("$1|$2|$3|$4|$5"); }

# GET with optional auth
test_get() {
  local name="$1"
  local path="$2"
  local token="$3"
  local extra="${4:-}"
  echo -n "  $name ... "
  if [ -n "$token" ]; then
    resp=$(curl -s -w "\n%{http_code}" -X GET "${API_BASE}${path}" \
      -H "Accept: application/json" \
      -H "Authorization: Bearer ${token}" \
      $extra 2>/dev/null)
  else
    resp=$(curl -s -w "\n%{http_code}" -X GET "${API_BASE}${path}" \
      -H "Accept: application/json" $extra 2>/dev/null)
  fi
  code=$(echo "$resp" | tail -n1)
  body=$(echo "$resp" | sed '$d')
  if [[ "$code" =~ ^(200|201|204)$ ]]; then
    echo -e "${GREEN}${code} OK${NC}"
    record "$name" "$path" "GET" "$code" "OK"
  else
    echo -e "${RED}${code}${NC} $(echo "$body" | head -c 80)"
    record "$name" "$path" "GET" "$code" "FAIL"
  fi
}

# POST with optional auth and body
test_post() {
  local name="$1"
  local path="$2"
  local body="$3"
  local token="$4"
  echo -n "  $name ... "
  if [ -n "$token" ]; then
    resp=$(curl -s -w "\n%{http_code}" -X POST "${API_BASE}${path}" \
      -H "Content-Type: application/json" -H "Accept: application/json" \
      -H "Authorization: Bearer ${token}" \
      -d "$body" 2>/dev/null)
  else
    resp=$(curl -s -w "\n%{http_code}" -X POST "${API_BASE}${path}" \
      -H "Content-Type: application/json" -H "Accept: application/json" \
      -d "$body" 2>/dev/null)
  fi
  code=$(echo "$resp" | tail -n1)
  if [[ "$code" =~ ^(200|201|204)$ ]]; then
    echo -e "${GREEN}${code} OK${NC}"
    record "$name" "$path" "POST" "$code" "OK"
  else
    echo -e "${RED}${code}${NC}"
    record "$name" "$path" "POST" "$code" "FAIL"
  fi
}

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  Data360 - Test création compte + endpoints${NC}"
echo -e "${BLUE}  Base: $API_BASE${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# --- 1. Register ---
echo -e "${YELLOW}[1] Création de compte (Register)${NC}"
REG_BODY=$(cat <<EOF
{
  "organisation_name": "${TEST_ORG}",
  "username": "${TEST_USER}",
  "email": "${TEST_EMAIL}",
  "password": "${TEST_PASS}",
  "confirm_password": "${TEST_PASS}"
}
EOF
)
resp=$(curl -s -w "\n%{http_code}" -X POST "${API_BASE}/user/register/" \
  -H "Content-Type: application/json" -H "Accept: application/json" -d "$REG_BODY" 2>/dev/null)
REG_CODE=$(echo "$resp" | tail -n1)
REG_BODY_RESP=$(echo "$resp" | sed '$d')

if [[ "$REG_CODE" =~ ^(200|201)$ ]]; then
  echo -e "  Register ... ${GREEN}${REG_CODE} OK${NC}"
  record "User Register" "/user/register/" "POST" "$REG_CODE" "OK"
else
  echo -e "  Register ... ${RED}${REG_CODE}${NC} (note: peut échouer si Snowflake/GitLab non configurés)"
  record "User Register" "/user/register/" "POST" "$REG_CODE" "SKIP/FAIL"
fi
echo ""

# --- 2. Login ---
echo -e "${YELLOW}[2] Connexion (Login)${NC}"
# Try with test user; if register failed, use a placeholder token for remaining tests (they will 401)
LOGIN_BODY=$(cat <<EOF
{
  "account_name": "${TEST_ORG}",
  "username": "${TEST_USER}",
  "password": "${TEST_PASS}"
}
EOF
)
resp=$(curl -s -w "\n%{http_code}" -X POST "${API_BASE}/user/login/" \
  -H "Content-Type: application/json" -H "Accept: application/json" -d "$LOGIN_BODY" 2>/dev/null)
LOGIN_CODE=$(echo "$resp" | tail -n1)
LOGIN_BODY_RESP=$(echo "$resp" | sed '$d')
TOKEN=""

if [[ "$LOGIN_CODE" == "200" ]]; then
  TOKEN=$(echo "$LOGIN_BODY_RESP" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
  echo -e "  Login ... ${GREEN}200 OK${NC} (token reçu)"
  record "User Login" "/user/login/" "POST" "200" "OK"
else
  echo -e "  Login ... ${RED}${LOGIN_CODE}${NC}"
  record "User Login" "/user/login/" "POST" "$LOGIN_CODE" "FAIL"
  # Use token from env for rest of tests if provided (e.g. existing user)
  if [ -n "$TEST_TOKEN" ]; then
    TOKEN="$TEST_TOKEN"
    echo -e "  ${YELLOW}Utilisation de TEST_TOKEN pour la suite.${NC}"
  fi
fi
echo ""

if [ -z "$TOKEN" ]; then
  echo -e "${YELLOW}Pas de token: les appels authentifiés ci-dessous vont retourner 401.${NC}"
  echo -e "Exportez TEST_TOKEN=your_jwt pour tester avec un compte existant."
  echo ""
fi

# --- 3. Endpoints par zone (avec token si disponible) ---
echo -e "${YELLOW}[3] User${NC}"
test_get "User Me/Modules" "/user/me/modules" "$TOKEN"
echo ""

echo -e "${YELLOW}[4] Gouvernance / Dashboard${NC}"
test_get "Client Dashboard" "/gouvernance/client/dashboard" "$TOKEN"
test_get "Dashboard Activity" "/gouvernance/dashboard/activity?start_date=2025-01-01T00:00:00&end_date=2025-12-31T23:59:59" "$TOKEN"
test_get "Stage Storage" "/gouvernance/get_stage_storage_info" "$TOKEN"
test_get "DWH Storage" "/gouvernance/get_dwh_storage_info?database_name=CP_DATA360&schema_name=RETAIL_DW" "$TOKEN"
test_get "DWH Schemas" "/gouvernance/get_dwh_schemas" "$TOKEN"
test_get "User Info" "/gouvernance/get_user_info" "$TOKEN"
test_get "Connectors Info" "/gouvernance/info" "$TOKEN"
echo ""

echo -e "${YELLOW}[5] Gouvernance - Users / Roles${NC}"
test_get "Gouvernance Users" "/gouvernance/users" "$TOKEN"
test_get "Gouvernance Roles" "/gouvernance/roles" "$TOKEN"
echo ""

echo -e "${YELLOW}[6] Mapping${NC}"
test_get "Mapping Databases" "/mapping/databases" "$TOKEN"
# POST get_projects (front uses POST with body)
resp=$(curl -s -w "\n%{http_code}" -X POST "${API_BASE}/mapping/get_projects" \
  -H "Content-Type: application/json" -H "Authorization: Bearer ${TOKEN}" -d '{}' 2>/dev/null)
code=$(echo "$resp" | tail -n1)
if [[ "$code" =~ ^(200|201)$ ]]; then echo -e "  Mapping get_projects ... ${GREEN}${code} OK${NC}"; record "Mapping get_projects" "/mapping/get_projects" "POST" "$code" "OK"; else echo -e "  Mapping get_projects ... ${RED}${code}${NC}"; record "Mapping get_projects" "/mapping/get_projects" "POST" "$code" "FAIL"; fi
echo ""

echo -e "${YELLOW}[7] Workflow${NC}"
test_get "Workflow Get Workflows" "/workflow/get_workflows/" "$TOKEN"
echo ""

echo -e "${YELLOW}[8] Org Accounts (client accounts)${NC}"
test_get "Org Dashboard Overview" "/org-accounts/dashboard/overview" "$TOKEN"
test_get "Org Dashboard Usage" "/org-accounts/dashboard/usage" "$TOKEN"
test_get "Org Accounts List" "/org-accounts/accounts" "$TOKEN"
test_get "Org Health" "/org-accounts/health" "$TOKEN"
echo ""

echo -e "${YELLOW}[9] Observability${NC}"
test_get "Observability KPIs" "/observability/kpis" "$TOKEN"
test_get "Observability Dashboard" "/observability/dashboard" "$TOKEN"
test_get "Observability Health" "/observability/health" "$TOKEN"
echo ""

echo -e "${YELLOW}[10] Explore Design${NC}"
# POST validate (minimal body)
test_post "Explore Design Validate Events" "/explore-design/events/validate" '{"events":[]}' "$TOKEN"
echo ""

echo -e "${YELLOW}[11] Cache${NC}"
test_get "Cache Stream (SSE)" "/api/cache/stream" "$TOKEN" "--max-time 2" 2>/dev/null || true
echo ""

# --- Summary ---
echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  Résumé (pour doc backend)${NC}"
echo -e "${BLUE}============================================${NC}"
printf "%-40s %-8s %-50s %s\n" "Nom" "Méthode" "Endpoint" "Résultat"
echo "------------------------------------------------------------------------------------------------------------"
for r in "${RESULTS[@]}"; do
  IFS='|' read -r name path method status detail <<< "$r"
  printf "%-40s %-8s %-50s %s\n" "$name" "$method" "$path" "$status $detail"
done
# Write markdown report
REPORT_DIR="$(dirname "$0")/docs"
mkdir -p "$REPORT_DIR"
REPORT="${REPORT_DIR}/ENDPOINTS_TEST_RESULTS.md"
{
  echo "# Data360 - Résultats des tests d’endpoints (Backend)"
  echo ""
  echo "**Date:** $(date -Iseconds)"
  echo "**Base URL:** $API_BASE"
  echo ""
  echo "## Résumé des appels"
  echo ""
  echo "| Page / Zone | Endpoint | Méthode | Statut | Résultat |"
  echo "|--------------|----------|---------|--------|----------|"
  for r in "${RESULTS[@]}"; do
    IFS='|' read -r name path method status detail <<< "$r"
    echo "| $name | \`$path\` | $method | $status | $detail |"
  done
  echo ""
  echo "---"
  echo "Généré par \`test-full-flow.sh\`"
} > "$REPORT"
echo ""
echo "Rapport écrit: $REPORT"
