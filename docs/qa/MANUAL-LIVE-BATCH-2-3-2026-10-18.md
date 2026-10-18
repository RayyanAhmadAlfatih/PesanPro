# Batch 2 & 3 — Siap Jalankan (2026-10-18)

**Status:** BATCH 1 TUNTAS — B1-04 s/d B1-08 PASS, recovery B1-07 terverifikasi
(login normal tepat setelah window 15 menit berganti). B1-01 terbukti lewat
restart berulang; B1-02 N/A (worker embedded, tidak ada proses terpisah);
B1-03 N/A (registrasi di live sengaja dimatikan).

**Aturan berlaku dari dokumen 2026-10-16:** jangan tempel token/sesi penuh di
laporan — sensor `wag_xxxx...xxxx`. Jangan kirim password, webhook secret,
cookie, atau kredensial WhatsApp.

---

## 0. Prasyarat (5 menit — kerjakan dulu)

```bash
BASE=https://wagateway.kingofcoding.my.id
# TOKEN_B : SUDAH PUNYA (key baru, jangan tulis lengkap di laporan)
# TOKEN_A : REGENERATE — catatan lama hilang, nilai tak bisa dibaca ulang
#   1. Login tenant A (kalau password lupa: superadmin → /dashboard/users
#      → edit user A → set password baru)
#   2. /dashboard/developer → generate/rotate key → salin SEKALI
# Nomor penerima tes: HP KEDUA yang Anda kendalikan — JANGAN kontak nyata
PHONE=628XXXXXXXXX        # ganti nomor QA Anda
```

**Peta sesi (untuk semua tes):**

| SessionId | Pemilik | Status |
|---|---|---|
| `qa-b-session` | Tenant B | STOPPED (kredensial utuh, Start = langsung connect, tanpa QR) |
| `27092015` | Tenant A | STOPPED |
| `qa-a-session` | Tenant A | LOGGED_OUT (butuh pairing ulang) |

**Gate memori (wajib sebelum BATCH 3):** `free -h` → **available ≥ 1,5Gi**.
Kalau di bawah itu, jangan mulai BATCH 3 — laporkan dulu.

---

## 1. BATCH 2 — Tenant Isolation (P0 GATE, ±20 menit, TANPA WhatsApp)

Pakai TOKEN_A menyerang resource milik Tenant B. **Semua harus 403/404.**
Satu saja yang balas 200/202 dengan data = **P0 blocker** → stop semua batch.

```bash
# B2-01: tenant A coba kirim pesan lewat sesi milik B → 403/404 (BUKAN 202)
#        (aman: kalau ditolak, tidak ada job/pesan yang dibuat; nomor sengaja palsu)
curl -s -w "\n→ HTTP %{http_code}\n" -X POST "$BASE/api/v1/messages/text" \
  -H "x-api-key: $TOKEN_A" -H "content-type: application/json" \
  -d '{"sessionId":"qa-b-session","to":"628000000000","text":"probe isolation"}'
# Expected: HTTP 403 atau 404

# B2-02: tenant A tebak ID job milik B → 404
#        Ambil jobId asli B dulu: login tenant B → /dashboard/message-queue → salin satu job ID
curl -s -o /dev/null -w "→ HTTP %{http_code}\n" \
  "$BASE/api/v1/messages/<JOB_ID_MILIK_B>" -H "x-api-key: $TOKEN_A"
# Expected: HTTP 404

# B2-03: tenant A akses media milik B → 404
curl -s -o /dev/null -w "→ HTTP %{http_code}\n" \
  "$BASE/api/v1/media/<MEDIA_ID_MILIK_B>" -H "x-api-key: $TOKEN_A"
# Expected: HTTP 404

# B2-04: pola sama untuk resource B lain (semua 403/404):
#   GET  $BASE/api/v1/broadcasts/<ID_B>   -H "x-api-key: $TOKEN_A"
#   GET  $BASE/api/v1/schedules/<ID_B>     -H "x-api-key: $TOKEN_A"
#   GET  $BASE/api/v1/autoreplies/<ID_B>   -H "x-api-key: $TOKEN_A"
#   GET  $BASE/api/v1/webhooks... (resource B)
# Kalau belum ada resource B, B2-04 boleh dijalankan SETELAH BATCH 3
# (saat sudah ada job/media/broadcast asli milik B).

# B2-05: UI — login tenant A → buka URL dashboard resource milik B
#        (mis. /dashboard/message-queue?session=qa-b-session) →
#        redirect/403, tidak ada data B yang bocor
```

**Pass criteria BATCH 2:** tidak ada respons 200/202 yang memuat data tenant B.
Respons boleh menyertakan pesan error generik — itu justru benar.

---

## 2. BATCH 3 — Sesi WhatsApp & Messaging (±45 menit, BUTUH HP)

### 2A. Pre-flight (2 menit)

```bash
free -h                                   # available ≥ 1,5Gi
curl -s "$BASE/api/health/live"           # {"status":"ok"...}
pm2 logs pesanpro --lines 40 --nostream | grep -icE "history sync|syncing [0-9]+ historical"
# Expected: 0  (fix syncFullHistory aktif — tidak boleh ada tarikan riwayat)
```

### 2B. Start qa-b-session (tenant B) — SATU sesi saja

1. Login sebagai **Tenant B** → `/dashboard/sessions` → klik `qa-b-session` → **Start**
2. Status harus jadi CONNECTED **tanpa reload** (update realtime via socket)
3. **Pantau RAM 90 detik** — jalankan di terminal kedua:

```bash
for i in 1 2 3; do free -h | grep Mem; sleep 30; done
pm2 logs pesanpro --lines 30 --nostream | grep -iE "qa-b|history|synced" | tail -10
```

**Batas aman:** kalau `available` jatuh **di bawah 1Gi** atau CPU > 90%
lebih dari 1 menit → **Stop session dari dashboard segera** (rem darurat),
laporan ke saya. Itu bukan gagal tes — itu sistem pengaman bekerja.

### 2C. Tes messaging (TOKEN_B — pemilik sesi)

```bash
# B3-04: kirim text → 202 + jobId; lalu cek /dashboard/message-queue (tenant B)
curl -s -w "\n→ HTTP %{http_code}\n" -X POST "$BASE/api/v1/messages/text" \
  -H "x-api-key: $TOKEN_B" -H "content-type: application/json" \
  -d '{"sessionId":"qa-b-session","to":"'$PHONE'","text":"Tes PesanPro QA 1"}'
# Expected: 202, body berisi jobId; di HP penerima pesan MASUK;
#           status di queue: QUEUED→PROCESSING→SENT→DELIVERED

# B3-05: normalisasi nomor — kirim ke format 08xxx
curl -s -w "\n→ HTTP %{http_code}\n" -X POST "$BASE/api/v1/messages/text" \
  -H "x-api-key: $TOKEN_B" -H "content-type: application/json" \
  -d '{"sessionId":"qa-b-session","to":"08'"${PHONE#62}"'","text":"Tes normalisasi"}'
# Expected: 202 dan pesan tetap masuk ke nomor yang sama (tidak dobel 6208...)

# B3-06: idempotency — dua request, header sama, payload sama
curl -s -w "\n→ HTTP %{http_code}\n" -X POST "$BASE/api/v1/messages/text" \
  -H "x-api-key: $TOKEN_B" -H "content-type: application/json" \
  -H "Idempotency-Key: qa-test-001" \
  -d '{"sessionId":"qa-b-session","to":"'$PHONE'","text":"Tes idempotency"}'
# ulangi PERSIS → Expected: jobId yang SAMA (bukan job baru)
# lalu kirim ulang dengan Idempotency-Key sama tapi text berbeda → Expected: 409

# B3-07 (opsional): key read-only → kirim harus 403
#   Buat key baru dengan scope message:read saja (dashboard tenant B → Developer)
#   kirim text dengan key itu → Expected: 403 (SCOPE_FORBIDDEN)

# B3-08 (opsional): upload media lalu kirim sebagai IMAGE
curl -s -w "\n→ HTTP %{http_code}\n" -X POST "$BASE/api/v1/media" \
  -H "x-api-key: $TOKEN_B" -F "file=@/path/foto-qa.jpg"
# Expected: 201 + mediaId → pakai mediaId itu di POST /api/v1/messages/media

# B3-09 (opsional): MIME spoof — rename file teks jadi .jpg
#   Expected: 422
```

### 2D. Tes di dashboard (tanpa API)

| # | Langkah | Expected |
|---|---|---|
| B3-01 | Buat session baru (nama valid, ID custom unik) | Diterima; ID duplikat/invalid ditolak |
| B3-02 | Detail `qa-b-session` | Status CONNECTED, nomor benar, update tanpa reload |
| B3-11 | Stop `qa-b-session` dari UI | Status STOPPED, job QUEUED gagal aman (tidak hilang diam-diam) |
| B3-12 | Start lagi | Connect kembali, job retry sesuai kontrak |

### 2E. Setelah BATCH 3

```bash
free -h    # dokumentasikan available setelah semua tes
```

**Pairing-code test (B3-03) SENGAJA DITUNDA:** butuh pairing ulang
`qa-a-session` (LOGGED_OUT) = sesi WA kedua menyala = beban memori ganda.
Jalankan hanya kalau BATCH 2+3 hijau DAN available masih ≥ 1,5Gi — satu
sesi tambahan saja, pantau 60 detik.

---

## 3. Format laporan

```
B2-01 PASS — HTTP 404 (TOKEN_A → sesi B)
B2-02 PASS — HTTP 404
B3-04 PASS — HTTP 202, jobId pp_job_xxx...xxx, pesan masuk di HP QA
B3-04 FAIL — (tempel status HTTP + response body, sensor secret)
free -h sebelum/sesudah: available __ → __ Gi
```

Kalau ada FAIL: **stop**, jangan lanjut ke batch berikutnya, laporkan ke saya
dengan bukti (HTTP code + response body, sensor secret). Saya klasifikasi
PASS/FAIL/NEEDS-EVIDENCE, dan FAIL diselesaikan sampai RETEST PASS dulu.

---

## Catatan yang sudah diketahui (BUKAN temuan baru)

- **T-B**: approval pembayaran me-reset `startsAt` → sisa masa aktif hilang saat perpanjangan.
- **T-C**: MRR di operations masih dari `priceMonthly` saja (~16,7% overstate untuk pembeli tahunan).
- Issue P2 (login UX: pesan "Invalid email or password" saat suspend/rate-limit) dan P3 (email reset password tanpa branding) — draf lengkap di `docs/qa/GITHUB-ISSUES-2026-10-17.md`, perlu dibuat manual di GitHub.
