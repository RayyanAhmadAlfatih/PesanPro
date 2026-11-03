#!/usr/bin/env bash
# Verify every example in docs/panduan/05-api-developer.md against the real API
# running in this sandbox. Tenant: qa-tenant@example.com, device cs-qa-1.
set -u
BASE="http://localhost:3000"
KEY="wag_qa_test_key_0001"
RUN=$RANDOM
PASS=0
FAIL=0

check() { # check <name> <expected> <actual>
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); printf 'PASS  %-56s %s\n' "$1" "$3"; else FAIL=$((FAIL+1)); printf 'FAIL  %-56s want %s got %s\n' "$1" "$2" "$3"; fi
}
show() { # show <name> <file>
  printf '      %s -> %s\n' "$1" "$(head -c 240 "$2" | tr -d '\n')"
}

echo "== Doc 05: Pesan messages =="
C=$(curl -s -o /tmp/d5a.out -w '%{http_code}' -X POST "$BASE/api/v1/messages/text" -H "x-api-key: $KEY" -H "Content-Type: application/json" -H "Idempotency-Key: doc05-text-$RUN" -d '{"sessionId":"cs-qa-1","recipient":"628123456789","text":"Halo Ayu, pesanan #1042 sudah kami terima."}')
check "POST /api/v1/messages/text" "202" "$C"
show "body" /tmp/d5a.out

C=$(curl -s -o /tmp/d5b.out -w '%{http_code}' -X POST "$BASE/api/v1/messages/text" -H "x-api-key: $KEY" -H "Content-Type: application/json" -d '{"sessionId":"cs-qa-1","recipient":"628123456789","text":"x"}')
check "missing Idempotency-Key => 422" "422" "$C"
show "body" /tmp/d5b.out

C=$(curl -s -o /tmp/d5c.out -w '%{http_code}' -X POST "$BASE/api/v1/messages/text" -H "x-api-key: $KEY" -H "Content-Type: application/json" -H "Idempotency-Key: doc05-recipient-$RUN" -d '{"sessionId":"cs-qa-1","recipient":"12345","text":"x"}')
check "invalid recipient => 422" "422" "$C"
show "body" /tmp/d5c.out

echo "== Doc 05: Jadwal (schedule) =="
C=$(curl -s -o /tmp/d5s1.out -w '%{http_code}' -X POST "$BASE/api/v1/schedules" -H "x-api-key: $KEY" -H "Content-Type: application/json" -d '{"sessionId":"cs-qa-1","recipient":"628123456789","text":"Pengingat: besok toko tutup pukul 12.00.","localDateTime":"2026-11-05T08:00:00","timezone":"Asia/Jakarta","kind":"ONE_TIME","missedRunPolicy":"SEND_LATE","misfireGraceSeconds":300}')
check "POST /api/v1/schedules ONE_TIME (doc body)" "201" "$C"
show "body" /tmp/d5s1.out
SCHED1=$(grep -o '"id":"[^"]*"' /tmp/d5s1.out | head -1 | cut -d'"' -f4)

C=$(curl -s -o /tmp/d5s2.out -w '%{http_code}' -X POST "$BASE/api/v1/schedules" -H "x-api-key: $KEY" -H "Content-Type: application/json" -d '{"sessionId":"cs-qa-1","recipient":"628123456789","text":"Pengingat harian: jangan lupa absen.","localDateTime":"2026-11-05T08:00:00","timezone":"Asia/Jakarta","kind":"RECURRING","cronExpression":"0 8 * * 1-5","missedRunPolicy":"SKIP","misfireGraceSeconds":300}')
check "POST /api/v1/schedules RECURRING (doc body)" "201" "$C"
show "body" /tmp/d5s2.out

# The old, wrong doc keys must still be rejected so nobody is misled by stale docs.
C=$(curl -s -o /tmp/d5s3.out -w '%{http_code}' -X POST "$BASE/api/v1/schedules" -H "x-api-key: $KEY" -H "Content-Type: application/json" -d '{"sessionId":"cs-qa-1","recipient":"628123456789","message":"x","runAt":"2026-11-05T08:00:00","scheduleType":"ONE_TIME"}')
check "legacy keys message/runAt/scheduleType rejected" "422" "$C"
show "body" /tmp/d5s3.out

C=$(curl -s -o /tmp/d5s4.out -w '%{http_code}' -X DELETE "$BASE/api/v1/schedules/$SCHED1" -H "x-api-key: $KEY")
check "DELETE schedule without sessionId => 422" "422" "$C"
grep -q "sessionId query parameter is required" /tmp/d5s4.out && { PASS=$((PASS+1)); echo "PASS  delete error names sessionId query parameter"; } || { FAIL=$((FAIL+1)); echo "FAIL  delete error names sessionId"; }

C=$(curl -s -o /tmp/d5s5.out -w '%{http_code}' -X DELETE "$BASE/api/v1/schedules/$SCHED1?sessionId=cs-qa-1" -H "x-api-key: $KEY")
check "DELETE schedule with sessionId => 200" "200" "$C"

C=$(curl -s -o /tmp/d5s6.out -w '%{http_code}' "$BASE/api/v1/schedules?sessionId=cs-qa-1" -H "x-api-key: $KEY")
check "GET /api/v1/schedules?sessionId=" "200" "$C"

echo "== Doc 05: Auto-reply =="
C=$(curl -s -o /tmp/d5ar.out -w '%{http_code}' -X POST "$BASE/api/v1/autoreplies" -H "x-api-key: $KEY" -H "Content-Type: application/json" -d '{"sessionId":"cs-qa-1","name":"Harga","keyword":"harga","matchType":"CONTAINS","response":"Daftar harga: https://toko.example.com/harga","triggerType":"PRIVATE","priority":150,"timezone":"Asia/Jakarta","isEnabled":true}')
check "POST /api/v1/autoreplies (doc body)" "201" "$C"
show "body" /tmp/d5ar.out
ARID=$(grep -o '"id":"[^"]*"' /tmp/d5ar.out | head -1 | cut -d'"' -f4)
C=$(curl -s -o /tmp/d5ar2.out -w '%{http_code}' -X DELETE "$BASE/api/v1/autoreplies/$ARID" -H "x-api-key: $KEY")
check "DELETE autoreply without sessionId => 422" "422" "$C"
C=$(curl -s -o /tmp/d5ar3.out -w '%{http_code}' -X DELETE "$BASE/api/v1/autoreplies/$ARID?sessionId=cs-qa-1" -H "x-api-key: $KEY")
check "DELETE autoreply with sessionId => 200" "200" "$C"

echo "== Doc 05: Broadcast =="
C=$(curl -s -o /tmp/d5bc.out -w '%{http_code}' -X POST "$BASE/api/v1/broadcasts" -H "x-api-key: $KEY" -H "Content-Type: application/json" -H "Idempotency-Key: doc05-bc-$RUN" -d '{"sessionId":"cs-qa-1","name":"Promo Oktober","recipients":["628123456789"],"message":"Halo, promo Oktober sudah dimulai.","delayMinMs":10000,"delayMaxMs":20000}')
check "POST /api/v1/broadcasts (doc body)" "201" "$C"
show "body" /tmp/d5bc.out
C=$(curl -s -o /tmp/d5bc2.out -w '%{http_code}' "$BASE/api/v1/broadcasts?sessionId=cs-qa-1" -H "x-api-key: $KEY")
check "GET /api/v1/broadcasts?sessionId=" "200" "$C"

echo "== Doc 05: Suppression =="
C=$(curl -s -o /tmp/d5sp.out -w '%{http_code}' -X POST "$BASE/api/v1/suppressions" -H "x-api-key: $KEY" -H "Content-Type: application/json" -d '{"recipient":"628123456789","reason":"MANUAL"}')
check "POST /api/v1/suppressions (doc body)" "201" "$C"
show "body" /tmp/d5sp.out
C=$(curl -s -o /tmp/d5sp2.out -w '%{http_code}' "$BASE/api/v1/suppressions" -H "x-api-key: $KEY")
check "GET /api/v1/suppressions" "200" "$C"
C=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/api/v1/suppressions/628123456789" -H "x-api-key: $KEY")
check "DELETE /api/v1/suppressions/{recipient}" "200" "$C"

echo "== Doc 05: Integration token =="
C=$(curl -s -o /tmp/d5it.out -w '%{http_code}' -X POST "$BASE/api/v1/integration-tokens" -H "x-api-key: $KEY" -H "Content-Type: application/json" -d '{"name":"Contact Form 7 - Toko Ayu","type":"CONTACT_FORM_7","sessionId":"cs-qa-1","mapping":{"recipientField":"whatsapp","messageTemplate":"Pesan baru dari {{field:nama}}: {{message}}"}}')
check "POST /api/v1/integration-tokens (doc body)" "201" "$C"
show "body" /tmp/d5it.out

echo "== Doc 05: Webhook paths =="
# The old doc path /api/v1/webhooks does not exist. The API edge has no handler
# to reach, so it denies with 403 SCOPE_FORBIDDEN rather than 404 (see doc 05).
C=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/v1/webhooks" -H "x-api-key: $KEY")
check "GET /api/v1/webhooks is gone (edge denies, old doc path)" "403" "$C"
C=$(curl -s -o /tmp/d5wh.out -w '%{http_code}' -X POST "$BASE/api/webhooks/cs-qa-1" -H "x-api-key: $KEY" -H "Content-Type: application/json" -d '{"name":"DOC05","url":"https://example.com/hook","events":["message.received"]}')
check "POST /api/webhooks/{sessionId} (doc path)" "201" "$C"
show "body" /tmp/d5wh.out
WHID=$(grep -o '"id":"[^"]*"' /tmp/d5wh.out | head -1 | cut -d'"' -f4)
C=$(curl -s -o /tmp/d5wh2.out -w '%{http_code}' -X DELETE "$BASE/api/webhooks/cs-qa-1/$WHID" -H "x-api-key: $KEY")
check "DELETE /api/webhooks/{sessionId}/{id}" "200" "$C"
show "body" /tmp/d5wh2.out

echo "== Doc 05: Media =="
printf '\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xd9' > /tmp/d5tiny.jpg
C=$(curl -s -o /tmp/d5m.out -w '%{http_code}' -X POST "$BASE/api/v1/media" -H "x-api-key: $KEY" -F "file=@/tmp/d5tiny.jpg;type=image/jpeg")
check "POST /api/v1/media upload" "201" "$C"
show "body" /tmp/d5m.out

echo "== Doc 05: health =="
C=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/health/live"); check "GET /api/health/live" "200" "$C"
# Readiness is 200 only when every expected worker reports a fresh heartbeat.
# This sandbox runs the web process alone, so 503 is the documented behaviour;
# assert the probe answers with a valid readiness envelope either way.
C=$(curl -s -o /tmp/d5ready.out -w '%{http_code}' "$BASE/api/health/ready")
if [ "$C" = "200" ] || [ "$C" = "503" ]; then PASS=$((PASS+1)); echo "PASS  GET /api/health/ready answers ($C)"; else FAIL=$((FAIL+1)); echo "FAIL  GET /api/health/ready (got $C)"; fi
grep -q '"check":"readiness"' /tmp/d5ready.out && { PASS=$((PASS+1)); echo "PASS  readiness envelope names the check"; } || { FAIL=$((FAIL+1)); echo "FAIL  readiness envelope names the check"; }

echo "== Doc 05: Authorization: Bearer must NOT work for API keys (doc claim) =="
C=$(curl -s -o /tmp/d5b.out -w '%{http_code}' -X POST "$BASE/api/v1/messages/text" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -H "Idempotency-Key: doc05-bearer-$RUN" -d '{"sessionId":"cs-qa-1","recipient":"628123456789","text":"x"}')
check "Authorization: Bearer API key rejected" "401" "$C"

echo "== Doc 11: auth model =="
# Foreign-origin state-changing request carrying only the session cookie.
JAR=/tmp/d5jar.txt; rm -f "$JAR"
CSRF=$(curl -s -c "$JAR" "$BASE/api/auth/csrf" | sed 's/.*"csrfToken":"\([^"]*\)".*/\1/')
curl -s -o /dev/null -b "$JAR" -c "$JAR" -X POST "$BASE/api/auth/callback/credentials" \
  --data-urlencode "csrfToken=$CSRF" --data-urlencode "email=qa-tenant@example.com" \
  --data-urlencode "password=QaTenant#2026" --data-urlencode "callbackUrl=$BASE/dashboard"
C=$(curl -s -o /tmp/d5x.out -w '%{http_code}' -b "$JAR" -X POST "$BASE/api/v1/messages/text" \
  -H "Origin: https://evil.example.com" -H "Content-Type: text/plain" \
  -d '{"sessionId":"cs-qa-1","recipient":"628123456789","text":"csrf"}')
check "foreign Origin + session cookie => 403" "403" "$C"
grep -q CSRF_ORIGIN_REJECTED /tmp/d5x.out && { PASS=$((PASS+1)); echo "PASS  rejection body names CSRF_ORIGIN_REJECTED"; } || { FAIL=$((FAIL+1)); echo "FAIL  CSRF rejection body"; }
C=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -X POST "$BASE/api/v1/messages/text" \
  -H "Origin: $BASE" -H "Content-Type: application/json" -H "Idempotency-Key: doc05-same-$RUN" \
  -d '{"sessionId":"cs-qa-1","recipient":"628123456789","text":"same origin ok"}')
check "same-origin dashboard cookie request => 202" "202" "$C"
C=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/v1/messages/text" \
  -H "x-api-key: $KEY" -H "Origin: https://anywhere.example.com" -H "Content-Type: application/json" \
  -H "Idempotency-Key: doc05-anyorigin-$RUN" \
  -d '{"sessionId":"cs-qa-1","recipient":"628123456789","text":"key any origin"}')
check "x-api-key works from any Origin => 202" "202" "$C"
C=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -X POST "$BASE/api/v1/messages/text" \
  -H "x-api-key: wag_invalid_key_zzz" -H "Content-Type: application/json" \
  -H "Idempotency-Key: doc05-badkey-$RUN" \
  -d '{"sessionId":"cs-qa-1","recipient":"628123456789","text":"bad key"}')
check "invalid x-api-key with cookie present => 401 (no session fallback)" "401" "$C"

echo ""
echo "RESULT: PASS=$PASS FAIL=$FAIL"
