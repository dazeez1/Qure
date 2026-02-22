#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

API_URL="http://localhost:5001/api"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Testing Organization Endpoints${NC}"
echo -e "${BLUE}========================================${NC}\n"

# Step 1: Register a test staff user (primary) with unique hospital name
TIMESTAMP=$(date +%s)
HOSPITAL_NAME="Test Hospital ${TIMESTAMP}"
TEST_EMAIL="testadmin${TIMESTAMP}@qure.com"

echo -e "${YELLOW}Step 1: Registering test primary staff user...${NC}"
echo -e "${BLUE}Hospital: ${HOSPITAL_NAME}${NC}"
echo -e "${BLUE}Email: ${TEST_EMAIL}${NC}\n"

REGISTER_RESPONSE=$(curl -s -X POST "${API_URL}/auth/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"firstName\": \"Test\",
    \"lastName\": \"Admin\",
    \"email\": \"${TEST_EMAIL}\",
    \"phone\": \"+1234567890\",
    \"password\": \"Test123!@#\",
    \"role\": \"STAFF\",
    \"hospitalName\": \"${HOSPITAL_NAME}\"
  }")

echo "$REGISTER_RESPONSE" | jq .

# Check if registration was successful or if user already exists
REGISTER_SUCCESS=$(echo "$REGISTER_RESPONSE" | jq -r '.success // false')

if [ "$REGISTER_SUCCESS" = "true" ]; then
  echo -e "${GREEN}✓ User registered successfully${NC}\n"
else
  echo -e "${YELLOW}⚠ User might already exist, continuing...${NC}\n"
fi

# Step 2: Login to get JWT token
echo -e "${YELLOW}Step 2: Logging in to get JWT token...${NC}"
LOGIN_RESPONSE=$(curl -s -X POST "${API_URL}/auth/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"${TEST_EMAIL}\",
    \"password\": \"Test123!@#\",
    \"role\": \"STAFF\"
  }")

TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.data.token // empty')
USER_DATA=$(echo "$LOGIN_RESPONSE" | jq -r '.data.user // {}')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo -e "${RED}✗ Failed to get token${NC}"
  echo "$LOGIN_RESPONSE" | jq .
  exit 1
fi

echo -e "${GREEN}✓ Login successful${NC}"
echo -e "${BLUE}Token: ${TOKEN:0:50}...${NC}\n"
echo "$LOGIN_RESPONSE" | jq '.data.user | {id, email, role, isPrimary, isVerified, hospitalId}'

# Check if user is verified and is primary
IS_VERIFIED=$(echo "$LOGIN_RESPONSE" | jq -r '.data.user.isVerified // false')
IS_PRIMARY=$(echo "$LOGIN_RESPONSE" | jq -r '.data.user.isPrimary // false')
HOSPITAL_ID=$(echo "$LOGIN_RESPONSE" | jq -r '.data.user.hospitalId // empty')

echo -e "${BLUE}User Status:${NC}"
echo -e "  - isPrimary: ${IS_PRIMARY}"
echo -e "  - isVerified: ${IS_VERIFIED}"
echo -e "  - hospitalId: ${HOSPITAL_ID}\n"

if [ "$IS_VERIFIED" = "false" ]; then
  if [ "$IS_PRIMARY" = "true" ]; then
    echo -e "${GREEN}✓ User is primary staff (auto-verified)${NC}\n"
  else
    echo -e "\n${YELLOW}⚠ User is not verified. Need to verify access code first.${NC}"
    echo -e "${YELLOW}Please verify the access code manually, then run this test again.${NC}"
    exit 1
  fi
fi

if [ -z "$HOSPITAL_ID" ] || [ "$HOSPITAL_ID" = "null" ]; then
  echo -e "${RED}✗ User has no hospital linked${NC}"
  exit 1
fi

# Step 3: Test GET /api/settings/organization
echo -e "\n${YELLOW}Step 3: Testing GET /api/settings/organization...${NC}"
GET_RESPONSE=$(curl -s -X GET "${API_URL}/settings/organization" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json")

echo "$GET_RESPONSE" | jq .

GET_SUCCESS=$(echo "$GET_RESPONSE" | jq -r '.success // false')
if [ "$GET_SUCCESS" = "true" ]; then
  echo -e "${GREEN}✓ GET organization successful${NC}\n"
else
  echo -e "${RED}✗ GET organization failed${NC}\n"
fi

# Step 4: Test PUT /api/settings/organization (Update)
echo -e "${YELLOW}Step 4: Testing PUT /api/settings/organization (Update)...${NC}"
PUT_RESPONSE=$(curl -s -X PUT "${API_URL}/settings/organization" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Test Hospital",
    "address": "1234 Main St., Abuja",
    "timeZone": "GMT+1",
    "logoUrl": "https://example.com/logo.png"
  }')

echo "$PUT_RESPONSE" | jq .

PUT_SUCCESS=$(echo "$PUT_RESPONSE" | jq -r '.success // false')
if [ "$PUT_SUCCESS" = "true" ]; then
  echo -e "${GREEN}✓ PUT organization successful${NC}\n"
else
  echo -e "${RED}✗ PUT organization failed${NC}\n"
fi

# Step 5: Verify the update by GET again
echo -e "${YELLOW}Step 5: Verifying update with GET...${NC}"
GET_AFTER_UPDATE=$(curl -s -X GET "${API_URL}/settings/organization" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json")

echo "$GET_AFTER_UPDATE" | jq '.data.organization'

UPDATED_NAME=$(echo "$GET_AFTER_UPDATE" | jq -r '.data.organization.name // empty')
if [ "$UPDATED_NAME" = "Updated Test Hospital" ]; then
  echo -e "${GREEN}✓ Update verified successfully${NC}\n"
else
  echo -e "${RED}✗ Update verification failed${NC}\n"
fi

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Testing Complete${NC}"
echo -e "${BLUE}========================================${NC}"
