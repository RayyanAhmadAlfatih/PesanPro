# GitHub Issues — Temuan BATCH 3 (2026-10-18)

Sumber: live test BATCH 3 pada `https://wagateway.kingofcoding.my.id`
(tenant B, session `qa-b-session`, nomor QA `6283877315731`).
Token/secret disensor. Semua temuan di bawah **belum diperbaiki** — perlu keputusan produk/scope.

---

## [P1] Nomor format lokal `08…` tidak dinormalisasi → API balas 202 tetapi pesan tidak pernah sampai

**STATUS: FIXED + DEPLOYED + VERIFIED (2026-10-18).** Branch
`workbuddy-normalize-recipient-2026-10-18` (commit `c2594d1`), deploy 21:21 WIB.
Retest: kirim ke `083877315731` → tersimpan sebagai `6283877315731@s.whatsapp.net`
→ `DELIVERED` dalam <1 detik.

**Dampak pengguna:** Pengirim yang memakai format nomor Indonesia umum (`08xxxxxxxxxx`)
mendapat respons sukses (`202` + jobId) dan status `SENT`, tetapi pesan **tidak pernah
diterima** penerima. Kegagalan senyap: tidak ada error, tidak ada retry, status tidak
pernah `FAILED`. Sangat berbahaya untuk integrasi pelanggan.

**Repro:**
1. Kirim text ke `recipient: "083877315731"` (nomor valid yang sama dengan `6283877315731`).
2. Respons `202`, `recipient` tersimpan sebagai `083877315731@s.whatsapp.net`.
3. Job berubah `QUEUED → PROCESSING (±2 menit) → SENT`, `deliveredAt` tetap `null`.

**Bukti (live 2026-10-18):**
- `cmvdukb251kia6lov27v2hzv2` (kirim `6283877315731`): `DELIVERED`, sent 13:14:20 → delivered 13:14:21.
- `cmvdukpra1kka6lovbw7gt62t` (kirim `083877315731`): `SENT` pada 13:16:38, `deliveredAt: null` setelah >4 menit.
- **Konfirmasi pemilik nomor:** hanya "Tes PesanPro QA 1" yang masuk; "Tes normalisasi" tidak pernah diterima.

**Penyebab terverifikasi (source):** `normalizeRecipient` (`src/lib/message-recipient.ts`)
hanya menghapus spasi dan tanda `+`, lalu menambahkan `@s.whatsapp.net`. Tidak ada konversi
`0…` → `62…`. Nomor lokal lolos validasi regex `^\+?\d{7,20}$` sehingga dianggap JID sah.

**Saran perbaikan (perlu keputusan produk):** normalisasi `08…` → `628…` sebelum validasi,
atau tolak dengan `422 INVALID_RECIPIENT` agar tidak ada sukses palsu. Perlu juga
pertimbangkan validasi keberadaan nomor (`onWhatsApp`) sebelum `202`, dengan biaya latensi.

---

## [P1 — WORKAROUND AKTIF] Upload media via `POST /api/v1/media` mengembalikan 500

**STATUS: teratasi sementara** — pemilik memindahkan `MEDIA_STORAGE_DRIVER` dari `b2`
ke penyimpanan lokal dan me-restart aplikasi. Retest 2026-10-18 21:15 WIB: upload
`201` + mediaId, kirim IMAGE → `DELIVERED` (~4 detik). **Akar masalah B2 belum
teridentifikasi** karena jalur ini tidak mencatat error.

**Dampak pengguna:** Semua pengiriman media (IMAGE/VIDEO/AUDIO/DOCUMENT) tidak bisa dimulai
karena upload selalu gagal. Fitur media praktis mati di produksi.

**Repro:**
1. `POST /api/v1/media` dengan `multipart/form-data`, field `file`, PNG 240×240 (3.969 byte).
2. Respons: `500 INTERNAL_ERROR` (`requestId ffc716cf-b8b4-42f5-92d5-9d53a9030da7`).

**Yang sudah dieliminasi:**
- Validasi tanda tangan file **bekerja**: file teks yang di-rename `.jpg` → `422 MEDIA_SIGNATURE_MISMATCH`.
- `sharp` **bukan** penyebab: `prepareMediaForStorage` menangkap error sharp dan memakai buffer asli.
- Kuota storage **bukan** penyebab: `QuotaExceededError` dipetakan ke `429`, bukan `500`.
- B2 belum terkonfigurasi akan memberi `503 B2_NOT_CONFIGURED`, bukan `500`.

**Sisa kandidat (urut kemungkinan):**
1. `MEDIA_STORAGE_DRIVER=b2` → `PutObjectCommand` gagal (kredensial/bucket/endpoint/jaringan).
2. Driver lokal → penulisan `data/private-media` ditolak (permission/path) — `writeFile` dengan `flag: "wx"`, mode `0600`.
3. `prisma.privateMedia.create` gagal karena migrasi DB tertinggal.

**Temuan pendamping [P2] — error 500 tidak tercatat:** `apiV1Exception` dan seluruh jalur
`storePrivateMedia` tidak memanggil logger, sehingga kegagalan ini tidak muncul di
`pm2 logs`. Operator tidak punya jejak untuk mendiagnosis. Perlu log error terstruktur
(minimal `requestId` + nama error) tanpa membocorkan detail sensitif ke klien.

**Langkah berikutnya (jalankan di VPS):**
```bash
grep -E "^MEDIA_STORAGE_DRIVER|^PRIVATE_MEDIA_PATH|^B2_BUCKET|^B2_ENDPOINT" /www/wwwroot/PesanPro/.env | sed 's/=.*/=<set>/'
ls -ld /www/wwwroot/PesanPro/data /www/wwwroot/PesanPro/data/private-media 2>&1
cd /www/wwwroot/PesanPro && npx prisma migrate status 2>&1 | tail -15
```

---

## [P1 — OPERASIONAL] Migration drift: perbaikan `AuthState.encValue` belum aktif di produksi

**Dampak:** migrasi `20261017000000_authstate_encvalue_longtext` (memperlebar
`AuthState.encValue` dari TEXT 64KB ke LONGTEXT) **belum dijalankan** di DB produksi.
Tanpa migrasi ini, sesi WhatsApp berumur panjang bisa gagal menyimpan auth state
(MySQL error 1406). Kegagalannya ditangkap dan hanya dicatat, sehingga sesi tetap
jalan dengan state basi sampai restart memaksa scan QR ulang.

**Bukti (`npx prisma migrate status` di VPS, 2026-10-18):**
- Migrasi terakhir yang sama-sama dikenal: `20261012020000_yearly_pricing_and_trial`.
- Belum diterapkan di DB: `20261017000000_authstate_encvalue_longtext`.
- Ada di DB tetapi tidak ada di repo branch ini: `20260927100000_chatgpt_private_media_cleanup`,
  `20260928143000_email_worker_runtime_heartbeat` (berasal dari branch `d41adc4 chatgpt-release`).

**Risiko:** schema produksi berasal dari branch lain, sehingga branch QA ini tidak lagi
mencerminkan DB secara utuh. Setiap deploy yang menyertakan migrasi baru wajib
memeriksa drift ini lebih dulu; jangan menjalankan `prisma migrate dev` (berpotensi reset).

**Tindakan (perlu persetujuan pemilik):**
1. Terapkan migrasi tertunda: `npx prisma migrate deploy` (ALTER TABLE aditif, aman).
2. Putuskan apakah dua migrasi DB-only perlu di-backfill ke repo agar riwayat konsisten.

---

## Catatan PASS dari BATCH 3 (bukan issue)

- **B3-04** kirim text ke `6283877315731` → `202`, job `DELIVERED` dalam ~2 detik.
- **B3-06** idempotency: replay key sama + payload sama → `200`, jobId sama, `idempotent: true`
  (tidak ada pesan kedua); key sama + payload beda → `409 IDEMPOTENCY_CONFLICT`.
- **B3-09** MIME spoof → `422 MEDIA_SIGNATURE_MISMATCH`.
- **B2-01/02/05** tenant isolation PASS (lihat `ROADMAP-LIVE-TEST.md`).
