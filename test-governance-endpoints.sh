#!/bin/bash

# Test script for Governance Policies API
# This script tests all governance policy endpoints

# Configuration
API_BASE="http://localhost:8000"
TOKEN="YOUR_JWT_TOKEN_HERE"  # Replace with your actual JWT token

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🧪 Testing Governance Policies API"
echo "=================================="
echo ""

# Function to test endpoint
test_endpoint() {
    local name=$1
    local url=$2
    local expected_status=${3:-200}

    echo -n "Testing $name... "

    response=$(curl -s -w "\n%{http_code}" -X GET "$url" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json")

    status_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | head -n -1)

    if [ "$status_code" -eq "$expected_status" ]; then
        echo -e "${GREEN}✓ PASS${NC} (HTTP $status_code)"
        echo "Response: $(echo $body | jq -c '.' 2>/dev/null || echo $body)"
    else
        echo -e "${RED}✗ FAIL${NC} (HTTP $status_code, expected $expected_status)"
        echo "Response: $body"
    fi
    echo ""
}

# Health Check
echo "📋 Health Check"
echo "----------------"
test_endpoint "Health Check" "$API_BASE/gouvernance/policies/health"

# Object Selection Endpoints
echo "📦 Object Selection Endpoints"
echo "------------------------------"
test_endpoint "Get Databases" "$API_BASE/gouvernance/policies/objects/databases"
test_endpoint "Get Schemas (CP_DATA360)" "$API_BASE/gouvernance/policies/objects/schemas/CP_DATA360"
test_endpoint "Get Tables (CP_DATA360.PUBLIC)" "$API_BASE/gouvernance/policies/objects/tables/CP_DATA360/PUBLIC"

# Policy List Endpoints
echo "📜 Policy List Endpoints"
echo "-------------------------"
test_endpoint "RLS Policies" "$API_BASE/gouvernance/policies/row-access/list?schema=gouvernance"
test_endpoint "Masking Policies" "$API_BASE/gouvernance/policies/masking/list?schema=gouvernance"
test_endpoint "Aggregation Policies" "$API_BASE/gouvernance/policies/aggregation/list?schema=gouvernance"
test_endpoint "Network Policies" "$API_BASE/gouvernance/policies/network/list"
test_endpoint "Tags" "$API_BASE/gouvernance/policies/tags/list?schema=gouvernance"
test_endpoint "Password Policies" "$API_BASE/gouvernance/policies/password/list?schema=gouvernance"
test_endpoint "Session Policies" "$API_BASE/gouvernance/policies/session/list?schema=gouvernance"

# Validate Response Structure
echo "🔍 Validating Response Structures"
echo "-----------------------------------"

echo -n "Checking databases response format... "
db_response=$(curl -s -X GET "$API_BASE/gouvernance/policies/objects/databases" \
    -H "Authorization: Bearer $TOKEN")

# Check if response has correct structure
if echo "$db_response" | jq -e '.data.databases | type == "array"' >/dev/null 2>&1; then
    if echo "$db_response" | jq -e '.data.databases[0] | has("name")' >/dev/null 2>&1; then
        echo -e "${GREEN}✓ CORRECT FORMAT${NC} (array of objects with 'name' field)"
    else
        echo -e "${RED}✗ WRONG FORMAT${NC} (expected objects with 'name' field)"
        echo "Response: $(echo $db_response | jq '.data.databases[0]' 2>/dev/null)"
    fi
else
    echo -e "${RED}✗ WRONG FORMAT${NC} (expected array)"
    echo "Response: $(echo $db_response | jq '.data.databases' 2>/dev/null)"
fi
echo ""

echo -n "Checking RLS policies response format... "
rls_response=$(curl -s -X GET "$API_BASE/gouvernance/policies/row-access/list?schema=gouvernance" \
    -H "Authorization: Bearer $TOKEN")

if echo "$rls_response" | jq -e '.data | type == "array"' >/dev/null 2>&1; then
    echo -e "${GREEN}✓ CORRECT FORMAT${NC} (array)"
    policy_count=$(echo "$rls_response" | jq '.data | length')
    echo "Found $policy_count policies"
else
    echo -e "${RED}✗ WRONG FORMAT${NC} (expected array)"
    echo "Response: $(echo $rls_response | jq '.data' 2>/dev/null)"
fi
echo ""

echo "=================================="
echo "✅ Testing Complete!"
echo ""
echo "Next Steps:"
echo "1. Fix any failing endpoints in your backend"
echo "2. Ensure all responses return arrays of objects (not arrays of strings)"
echo "3. Test the frontend UI to confirm 500 errors are gone"
echo ""
