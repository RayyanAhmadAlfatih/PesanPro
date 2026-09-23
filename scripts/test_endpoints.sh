#!/bin/bash

: "${PESANPRO_TEST_API_KEY:?Set PESANPRO_TEST_API_KEY to a disposable test credential}"
: "${PESANPRO_ALLOW_MUTATING_TESTS:?Set PESANPRO_ALLOW_MUTATING_TESTS=yes to acknowledge that this script changes data}"

if [ "$PESANPRO_ALLOW_MUTATING_TESTS" != "yes" ]; then
  echo "Refusing to run: PESANPRO_ALLOW_MUTATING_TESTS must equal yes." >&2
  exit 1
fi

API_KEY="$PESANPRO_TEST_API_KEY"
BASE_URL="${PESANPRO_TEST_BASE_URL:-http://127.0.0.1:3000/api}"

echo "Testing APIs against: $BASE_URL"
echo "Using API key from environment (value hidden)."

# Helper function for separator
sep() { echo -e "\n\n--------------------------------------------\n$1"; }

# 1. List Sessions
sep "1. GET /sessions"
curl -s -X GET "$BASE_URL/sessions" \
  -H "x-api-key: $API_KEY" | head -c 500

# 2. Create Session (Update: sessionId is optional)
sep "2. POST /sessions"
curl -s -X POST "$BASE_URL/sessions" \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "API Test Session", "sessionId": "api-test-1"}' | head -c 500

# 3. List Groups (Using query param per new format, though route supports both)
sep "3. GET /groups?sessionId=api-test-1"
curl -s -X GET "$BASE_URL/groups?sessionId=api-test-1" \
  -H "x-api-key: $API_KEY" | head -c 500

# 4. Create Auto Reply
sep "4. POST /autoreplies"
curl -s -X POST "$BASE_URL/autoreplies" \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "api-test-1",
    "keyword": "ping",
    "response": "pong",
    "matchType": "EXACT"
  }' | head -c 500

# 5. Create Webhook (with Session ID)
sep "5. POST /webhooks"
curl -s -X POST "$BASE_URL/webhooks" \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Webhook",
    "url": "https://example.com/webhook",
    "events": ["message.upsert"],
    "sessionId": "api-test-1"
  }' | head -c 500

# 6. Post Status (New Endpoint)
sep "6. POST /status/update"
curl -s -X POST "$BASE_URL/status/update" \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "api-test-1",
    "content": "Hello via API",
    "type": "TEXT",
    "backgroundColor": 4294901760 
  }' | head -c 500

# 7. Scheduler List (New Endpoint)
sep "7. GET /scheduler"
curl -s -X GET "$BASE_URL/scheduler?sessionId=api-test-1" \
  -H "x-api-key: $API_KEY" | head -c 500

# 8. Check System Updates (Admin)
sep "8. POST /system/check-updates"
curl -s -X POST "$BASE_URL/system/check-updates" \
  -H "x-api-key: $API_KEY" | head -c 500

echo -e "\n\nDone."
