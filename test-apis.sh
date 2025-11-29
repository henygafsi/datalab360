#!/bin/bash

# API Test Script for Data360
# Tests all governance APIs

API_BASE="https://api.datalab360.io:8443"
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6ImhhbW1tb3VkYSIsImFjY291bnRfbmFtZSI6IkhBTU1NT1VEQSIsInJvbGUiOiJBQ0NPVU5UQURNSU4iLCJpdGVtcyI6WzEsMiwzLDQsNV0sImV4cCI6MTc2Mzg3NTAyMX0.OP9Wtoc7H_vPCZZ29h-67mOy_GPIoCBMEHalpFfZFMU"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "======================================"
echo "  Data360 API Testing Suite"
echo "======================================"
echo ""

# Function to test API endpoint
test_api() {
    local name=$1
    local endpoint=$2
    local method=${3:-GET}

    echo -n "Testing $name... "

    response=$(curl -s -w "\n%{http_code}" -X "$method" \
        "${API_BASE}${endpoint}" \
        -H "accept: application/json" \
        -H "Authorization: Bearer ${TOKEN}")

    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" = "200" ]; then
        echo -e "${GREEN}✓ PASS${NC} (200 OK)"
        echo "  Response: $(echo "$body" | jq -c '.' 2>/dev/null || echo "$body" | head -c 100)"
    else
        echo -e "${RED}✗ FAIL${NC} ($http_code)"
        echo "  Error: $(echo "$body" | jq -r '.detail' 2>/dev/null || echo "$body")"
    fi
    echo ""
}

echo "=== GOUVERNANCE APIs ==="
echo ""

# Dashboard APIs
test_api "Client Dashboard Info" "/gouvernance/client/dashboard"
test_api "Dashboard Activity (All)" "/gouvernance/dashboard/activity?start_date=2025-10-21T23:59:59&end_date=2025-11-21T23:59:59"
test_api "Dashboard Activity (Filtered)" "/gouvernance/dashboard/activity?username=hammmouda&start_date=2025-10-21T23:59:59&end_date=2025-11-21T23:59:59"

# Storage APIs
test_api "Stage Storage Info" "/gouvernance/get_stage_storage_info"
test_api "DWH Storage Info" "/gouvernance/get_dwh_storage_info?database_name=CP_DATA360&schema_name=RETAIL_DW"
test_api "Source Table Storage" "/gouvernance/get_src_table_storage_info"

# Schema APIs
test_api "DWH Schemas" "/gouvernance/get_dwh_schemas"
test_api "DWH Health Info" "/gouvernance/get_dwh_health_info?schema_name=RETAIL_DW"

# User Activity
test_api "User Info" "/gouvernance/get_user_info"

# Connectors
test_api "Connectors Info" "/gouvernance/info"

echo "======================================"
echo "  API Testing Complete"
echo "======================================"
