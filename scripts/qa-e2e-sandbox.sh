#!/usr/bin/env bash
# QA E2E battery for the 3 Nov findings, executed against a LOCAL sandbox
# instance (own MariaDB, own seeded tenant). No real WhatsApp: the durable
# worker is not running, so every enqueued job stays QUEUED and nothing is sent.
set -u
BASE="http://localhost:3000"
API_KEY="wag_qa_test_key_0001"
JAR="/tmp/qa-cookies.txt"
rm -f "$JAR"
PASS=0
FAIL=0
RUN=$RANDOM

check() { # check <name> <expected> <actual>
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "PASS  $1 (got $3)"; else FAIL=$((FAIL+1)); echo "FAIL  $1 (want $2, got $3)"; fi
}
contains() { # contains <name> <needle> <haystack-file>
  if grep -q "$2" "$3"; then PASS=$((PASS+1)); echo "PASS  $1"; else FAIL=$((FAIL+1)); echo "FAIL  $1 (missing: $2)"; fi
}

echo "== Login (dashboard session) =="
# Sign-in is rate limited at 5 attempts per 15 minutes per IP+email, so repeated
# runs of this battery hit CredentialsSignin for reasons unrelated to the code
# under test. Clear the sandbox buckets before logging in.
sudo mysql pesanpro -e "DELETE FROM RateLimitBucket;"
CSRF=$(curl -s -c "$JAR" "$BASE/api/auth/csrf" | sed 's/.*"csrfToken":"\([^"]*\)".*/\1/')
LOGIN_CODE=$(curl -s -o /tmp/qa-login.out -w '%{http_code}' -b "$JAR" -c "$JAR" -X POST "$BASE/api/auth/callback/credentials" \
  --data-urlencode "csrfToken=$CSRF" --data-urlencode "email=qa-tenant@example.com" --data-urlencode "password=QaTenant#2026" \
  --data-urlencode "callbackUrl=$BASE/dashboard")
if [ "$LOGIN_CODE" = "200" ] || [ "$LOGIN_CODE" = "302" ]; then PASS=$((PASS+1)); echo "PASS  login dashboard (got $LOGIN_CODE)"; else FAIL=$((FAIL+1)); echo "FAIL  login dashboard (got $LOGIN_CODE)"; fi

echo "== KRITIS 1: CSRF =="
# 1. Session cookie + foreign origin + text/plain content type => rejected
CODE=$(curl -s -o /tmp/qa-csrf.out -w '%{http_code}' -b "$JAR" -X POST "$BASE/api/v1/messages/text" \
  -H "Origin: https://evil.example.com" -H "Content-Type: text/plain" \
  -d '{"sessionId":"cs-qa-1","recipient":"628123456789","text":"uji csrf"}')
check "foreign origin + session cookie rejected" "403" "$CODE"
grep -q "CSRF_ORIGIN_REJECTED" /tmp/qa-csrf.out && { PASS=$((PASS+1)); echo "PASS  rejection names CSRF origin rule"; } || { FAIL=$((FAIL+1)); echo "FAIL  rejection names CSRF origin rule"; }
# 2. Same-origin fetch with session cookie => accepted (dashboard keeps working)
CODE=$(curl -s -o /tmp/qa-sameorigin.out -w '%{http_code}' -b "$JAR" -X POST "$BASE/api/v1/messages/text" \
  -H "Origin: $BASE" -H "Content-Type: application/json" -H "Idempotency-Key: qa-same-origin-$RUN" \
  -d '{"sessionId":"cs-qa-1","recipient":"628123456789","text":"uji dashboard sama-origin"}')
check "same-origin + session cookie accepted" "202" "$CODE"
# 3. x-api-key valid => accepted from any origin
CODE=$(curl -s -o /tmp/qa-apikey.out -w '%{http_code}' -X POST "$BASE/api/v1/messages/text" \
  -H "x-api-key: $API_KEY" -H "Origin: https://anywhere.example.com" -H "Content-Type: application/json" \
  -H "Idempotency-Key: qa-key-send-$RUN" \
  -d '{"sessionId":"cs-qa-1","recipient":"628123456789","text":"uji api key"}')
check "valid x-api-key accepted" "202" "$CODE"
# 4. Invalid x-api-key + session cookie => 401 (no session fallback)
CODE=$(curl -s -o /tmp/qa-badkey.out -w '%{http_code}' -b "$JAR" -X POST "$BASE/api/v1/messages/text" \
  -H "x-api-key: wag_totally_invalid" -H "Content-Type: application/json" \
  -H "Idempotency-Key: qa-bad-key-$RUN" \
  -d '{"sessionId":"cs-qa-1","recipient":"628123456789","text":"uji key salah"}')
check "invalid x-api-key rejected even with cookie" "401" "$CODE"
# 5. No auth at all => 401
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/v1/messages/text" \
  -H "Content-Type: application/json" -d '{"sessionId":"cs-qa-1","recipient":"628123456789","text":"x"}')
check "no auth rejected" "401" "$CODE"

echo "== KRITIS 2: docs 09 =="
curl -s "$BASE/docs" -o /tmp/qa-docs-list.html
if grep -q "09-paket-dan-margin" /tmp/qa-docs-list.html; then FAIL=$((FAIL+1)); echo "FAIL  docs list still contains 09"; else PASS=$((PASS+1)); echo "PASS  docs list hides 09"; fi
CODE=$(curl -s -o /tmp/qa-doc09.out -w '%{http_code}' "$BASE/docs/09-paket-dan-margin")
check "direct docs/09 URL for anonymous" "404" "$CODE"
CODE=$(curl -s -o /tmp/qa-doc10.out -w '%{http_code}' "$BASE/docs/10-panduan-admin")
check "direct docs/10 URL for anonymous still 404" "404" "$CODE"

echo "== TINGGI 3: schedules + autoreplies contract =="
# Create schedule exactly as doc 05 shows (no Idempotency-Key header)
SCHED=$(curl -s -X POST "$BASE/api/v1/schedules" -H "x-api-key: $API_KEY" -H "Content-Type: application/json" \
  -d '{"sessionId":"cs-qa-1","recipient":"628123456789","text":"Pengingat QA","localDateTime":"2026-11-05T08:00","timezone":"Asia/Jakarta","kind":"ONE_TIME","missedRunPolicy":"SEND_LATE","misfireGraceSeconds":300}')
contains "schedule create matches doc schema" '"kind":"ONE_TIME"' <(echo "$SCHED")
SCHED_ID=$(echo "$SCHED" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
# DELETE without sessionId => 422 with exact message
curl -s -o /tmp/qa-scheddel.out -w '%{http_code}' -X DELETE "$BASE/api/v1/schedules/$SCHED_ID" -H "x-api-key: $API_KEY" > /tmp/qa-scheddel.code
check "schedule delete without sessionId = 422" "422" "$(cat /tmp/qa-scheddel.code)"
contains "delete error names sessionId" "sessionId query parameter is required" /tmp/qa-scheddel.out
# DELETE with sessionId => 200
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/api/v1/schedules/$SCHED_ID?sessionId=cs-qa-1" -H "x-api-key: $API_KEY")
check "schedule delete with sessionId = 200" "200" "$CODE"
# Auto-reply create (doc body), delete without sessionId
AR=$(curl -s -X POST "$BASE/api/v1/autoreplies" -H "x-api-key: $API_KEY" -H "Content-Type: application/json" \
  -d '{"sessionId":"cs-qa-1","name":"Harga","keyword":"harga","matchType":"CONTAINS","response":"Daftar harga QA","triggerType":"PRIVATE","priority":150,"timezone":"Asia/Jakarta","isEnabled":true}')
AR_ID=$(echo "$AR" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
CODE=$(curl -s -o /tmp/qa-ardel.out -w '%{http_code}' -X DELETE "$BASE/api/v1/autoreplies/$AR_ID" -H "x-api-key: $API_KEY")
check "autoreply delete without sessionId = 422" "422" "$CODE"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/api/v1/autoreplies/$AR_ID?sessionId=cs-qa-1" -H "x-api-key: $API_KEY")
check "autoreply delete with sessionId = 200" "200" "$CODE"

echo "== TINGGI 5: delete terminal jobs & broadcasts =="
# Job QUEUED: DELETE (no mode) = cancel
JOB=$(curl -s -X POST "$BASE/api/v1/messages/text" -H "x-api-key: $API_KEY" -H "Content-Type: application/json" -H "Idempotency-Key: qa-del-1-$RUN" \
  -d '{"sessionId":"cs-qa-1","recipient":"628123456789","text":"uji hapus queued"}')
JOB_ID=$(echo "$JOB" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
CODE=$(curl -s -o /tmp/qa-cancel.out -w '%{http_code}' -X DELETE "$BASE/api/v1/messages/$JOB_ID" -H "x-api-key: $API_KEY")
check "queued job delete (no mode) = cancel 200" "200" "$CODE"
# Job READ (terminal via SQL flip): DELETE ?mode=delete => hard delete
JOB2=$(curl -s -X POST "$BASE/api/v1/messages/text" -H "x-api-key: $API_KEY" -H "Content-Type: application/json" -H "Idempotency-Key: qa-del-2-$RUN" \
  -d '{"sessionId":"cs-qa-1","recipient":"628123456789","text":"uji hapus read"}')
JOB2_ID=$(echo "$JOB2" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
sudo mysql pesanpro -e "UPDATE MessageJob SET status='READ', sentAt=NOW(), deliveredAt=NOW(), readAt=NOW() WHERE id='$JOB2_ID';"
CODE=$(curl -s -o /tmp/qa-harddel.out -w '%{http_code}' -X DELETE "$BASE/api/v1/messages/$JOB2_ID?mode=delete" -H "x-api-key: $API_KEY")
check "terminal job mode=delete = 200" "200" "$CODE"
contains "hard delete reports deleted true" '"deleted":true' /tmp/qa-harddel.out
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/v1/messages/$JOB2_ID" -H "x-api-key: $API_KEY")
check "deleted job now 404" "404" "$CODE"
# QUEUED job must NOT be deletable via mode=delete
JOB3=$(curl -s -X POST "$BASE/api/v1/messages/text" -H "x-api-key: $API_KEY" -H "Content-Type: application/json" -H "Idempotency-Key: qa-del-3-$RUN" \
  -d '{"sessionId":"cs-qa-1","recipient":"628123456789","text":"uji proteksi queued"}')
JOB3_ID=$(echo "$JOB3" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
CODE=$(curl -s -o /tmp/qa-prot.out -w '%{http_code}' -X DELETE "$BASE/api/v1/messages/$JOB3_ID?mode=delete" -H "x-api-key: $API_KEY")
check "queued job mode=delete rejected 409" "409" "$CODE"
# Broadcast: create, flip COMPLETED, delete
BC=$(curl -s -X POST "$BASE/api/v1/broadcasts" -H "x-api-key: $API_KEY" -H "Content-Type: application/json" -H "Idempotency-Key: qa-bc-$RUN" \
  -d '{"sessionId":"cs-qa-1","name":"QA Broadcast","recipients":["628123456789"],"message":"Halo QA","delayMinMs":10000,"delayMaxMs":20000}')
echo "  broadcast create: $(echo "$BC" | head -c 300)"
BC_ID=$(echo "$BC" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
sudo mysql pesanpro -e "UPDATE BroadcastLog SET status='COMPLETED' WHERE id='$BC_ID';"
CODE=$(curl -s -o /tmp/qa-bcdel.out -w '%{http_code}' -X DELETE "$BASE/api/v1/broadcasts/$BC_ID?mode=delete" -H "x-api-key: $API_KEY")
check "completed broadcast mode=delete = 200" "200" "$CODE"
contains "broadcast delete reports deleted true" '"deleted":true' /tmp/qa-bcdel.out

echo "== TINGGI 4/RENDAH 12: webhook contract & error detail =="
WH=$(curl -s -X POST "$BASE/api/webhooks/cs-qa-1" -H "x-api-key: $API_KEY" -H "Content-Type: application/json" \
  -d '{"name":"QA WH","url":"https://example.com/hook","events":["message.received"]}')
contains "webhook create 201 path works" '"id"' <(echo "$WH")
echo "  webhook create: $(echo "$WH" | head -c 300)"
WH_ID=$(echo "$WH" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
CODE=$(curl -s -o /tmp/qa-whdel.out -w '%{http_code}' -X DELETE "$BASE/api/webhooks/cs-qa-1/$WH_ID" -H "x-api-key: $API_KEY")
check "webhook delete = 200" "200" "$CODE"
contains "webhook delete reports deleted" '"deleted":true' /tmp/qa-whdel.out
# Failed create surfaces a real reason (empty events)
curl -s -o /tmp/qa-whbad.out -w '%{http_code}' -X POST "$BASE/api/webhooks/cs-qa-1" -H "x-api-key: $API_KEY" -H "Content-Type: application/json" \
  -d '{"name":"QA WH bad","url":"not-a-url","events":["message.received"]}' > /tmp/qa-whbad.code
check "invalid webhook url rejected 422" "422" "$(cat /tmp/qa-whbad.code)"
contains "invalid url error explains itself" "VALIDATION_ERROR" /tmp/qa-whbad.out

echo "== SEDANG 9: storage quota enforcement =="
sudo mysql pesanpro -e "UPDATE Entitlement SET limitValue=1 WHERE feature='MEDIA_STORAGE_BYTES' AND planId=(SELECT id FROM Plan WHERE code='BISNIS');"
printf '\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xd9' > /tmp/qa-tiny.jpg
CODE=$(curl -s -o /tmp/qa-quota.out -w '%{http_code}' -X POST "$BASE/api/v1/media" -H "x-api-key: $API_KEY" -F "file=@/tmp/qa-tiny.jpg;type=image/jpeg")
check "upload over quota rejected 429" "429" "$CODE"
contains "quota error names media storage" "Media storage quota" /tmp/qa-quota.out
sudo mysql pesanpro -e "UPDATE Entitlement SET limitValue=5368709120 WHERE feature='MEDIA_STORAGE_BYTES' AND planId=(SELECT id FROM Plan WHERE code='BISNIS');"
CODE=$(curl -s -o /tmp/qa-quota2.out -w '%{http_code}' -X POST "$BASE/api/v1/media" -H "x-api-key: $API_KEY" -F "file=@/tmp/qa-tiny.jpg;type=image/jpeg")
check "upload under quota accepted 201" "201" "$CODE"

echo "== Docs: google forms zip download =="
CODE=$(curl -s -o /tmp/qa-gf.zip -w '%{http_code}' "$BASE/api/public/integration/google-forms")
check "google forms zip download = 200" "200" "$CODE"
file /tmp/qa-gf.zip | grep -q "Zip" && { PASS=$((PASS+1)); echo "PASS  google forms artifact is a ZIP"; } || { FAIL=$((FAIL+1)); echo "FAIL  google forms artifact is not a ZIP"; }

echo "== Regresi cepat: health, docs list, health ready =="
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/health/live")
check "health live = 200" "200" "$CODE"
CODE=$(curl -s -o /tmp/qa-docs2.html -w '%{http_code}' "$BASE/docs")
check "docs list = 200" "200" "$CODE"
contains "docs list still shows 05" "05-api-developer" /tmp/qa-docs2.html

echo ""
echo "RESULT: PASS=$PASS FAIL=$FAIL"
