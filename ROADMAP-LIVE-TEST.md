# Roadmap mentest fitur

# MASTER LIVE TEST PESANPRO

> **Audit cakupan (23 Okt 2026):** jumlah tes sebenarnya **490**, bukan 427 —
> selisih 63 tes: 37 tes L1 tambahan (umur sesi/OTP/harga), 12 tes CF7 di L15,
> dan 14 tes What's New di L17. Prosedur lanjutan + daftar celah per ID ada di
> `docs/qa/PROSEDUR-QA-LANJUTAN-2026-10-23.md`. **Belum ada tes baru yang dijalankan**
> untuk bab berikutnya.
>
> **L1-55 PASS (24 Okt):** setelah trial berakhir, login/dashboard/baca tetap bisa;
> operasi komersial ditolak `403 ENTITLEMENT_DENIED` dengan status `EXPIRED`.
> Tenant A & B diperpanjang 7 hari (31 Okt 09:14 WIB) lewat superadmin.
> Detail: `docs/qa/GITHUB-ISSUES-2026-10-24.md`.
>
> **L13 (24 Okt):** 13 PASS (01–06, 08, 22, 25–29). Tiga bug ditemukan dan sudah
> **DIPERBAIKI** di branch: P1 sesi `CONNECTED` basi setelah DB mati (`ffdd57c`),
> P2 dua event `message.sent` per pesan (`795926d`, **terverifikasi live**),
> P2 enam event `message.status` per pesan (`6f8e1a7`, menunggu deploy).
> L13-09 GAGAL sampai perbaikan status terpasang. Build lokal gagal karena batas
> memori lingkungan; build diverifikasi di VPS dengan heap 3072.

> **Fase 0 (update 2026-10-23):** lima error lama diverifikasi ulang. Empat diperbaiki
> di kode dan lolos gates lokal, satu tetap menunggu konfigurasi server.
> - **P1 koneksi WA mati diam-diam** → watchdog 60 detik + ping protokol + reconnect
>   paksa (`src/modules/whatsapp/instance.ts`); 4 tes baru lolos.
> - **P2 reaksi ke pesan sendiri** → `fromMe` diterima dari body, default `false`.
> - **P2 `LOGGED_OUT` tanpa pemberitahuan** → notifikasi lonceng + realtime ke pemilik
>   sesi (`src/lib/session-alerts.ts`); logout sengaja tidak memicu alarm.
> - **P3 format balas** → `{"message":"teks"}` diterima, hasil sama dengan bentuk objek.
> - **Forward** → endpoint dihapus; L5-06 tetap N/A.
> - **P3 unggahan 51 MB** → masih `413 text/html` dari nginx (direproduksi 23 Okt);
>   butuh `client_max_body_size` + `error_page 413` JSON. **MENUNGGU-PEMILIK.**
>
> **Deploy 23 Okt 19:26 WIB (commit `2e79bab`):** berhasil; health `200`, PM2 online.
> Build pertama OOM (script memaku heap 2048), build ulang dengan heap 3072 sukses.
> Status Fase 0 setelah deploy:
> #1 watchdog **terpasang** (belum ada kejadian untuk dibuktikan),
> #2 reaksi **lolos-sebagian** (200; visual di HP perlu pemilik),
> #3 notifikasi **terpasang** (belum dipicu, sengaja tidak dipaksa),
> #4 nginx 413 **LOLOS-SETELAH-FIX** (51 MB → `413 MEDIA_TOO_LARGE` JSON; 61 MB → `413 PAYLOAD_TOO_LARGE` JSON),
> #5 format balas **LOLOS-SETELAH-FIX** (202 → READ, dashboard cocok),
> #6 forward **terverifikasi** (route hilang dari manifest build).
> Detail: `docs/qa/GITHUB-ISSUES-2026-10-23.md`.
>
> **L14 (lanjutan) — 23 Okt:** tidak ada tes baru yang bisa dijalankan.
> L14-14 butuh satu slot key kosong (tenant A 2/2: `WorkBuddy-QA`, `qa-tenant-a`),
> L14-18 menunggu `TRUST_PROXY`, L14-20 butuh jalur IPv6 (mesin QA tidak punya),
> L14-30 butuh akun SUPERADMIN. Semua **BLOCKED-PEMILIK**.
>
> **L16 Billing — 23 Okt:** 7 PASS (01, 02, 03, 04, 06, 08, 10), 1 N/A (05 — tidak ada
> plan unlimited), 15 BLOCKED-PEMILIK (07 grace period, 09 pengajuan bukti bayar, dan
> 11–23 yang semuanya butuh SUPERADMIN). **L16-15 dikonfirmasi pemilik 24 Okt:**
> approval otomatis mengaktifkan plan dan mengirim email — kode saat ini sudah sesuai.
> Detail: `docs/qa/GITHUB-ISSUES-2026-10-23.md`.

> **Status live QA (update 2026-10-18):**
> - BATCH 1 (L0 + L1 auth) — **TUNTAS**: B1-04..B1-08 PASS, recovery B1-07
>   terverifikasi (login normal tepat setelah window 15 menit). B1-01 lewat
>   restart berulang; B1-02 N/A (worker embedded); B1-03 N/A (registrasi live
>   dimatikan sengaja).
> - Fix `syncFullHistory=false` sudah live di VPS (2026-10-17) → sync storm
>   riwayat chat tidak akan terulang; penarikan riwayat penuh = 0.
> - BATCH 2 (L2 tenant isolation, P0) — **PASS**: B2-01 (sesi B via API → 404
>   SESSION_FORBIDDEN), B2-02 (job asli milik B → 404 MESSAGE_JOB_NOT_FOUND,
>   kontrol positif job milik A sendiri → 200), B2-05 (UI: `?session=qa-b-session`
>   diabaikan tanpa kebocoran; detail sesi B → "Session not found"). B2-03/04
>   menunggu resource asli B setelah BATCH 3.
> - BATCH 3 (L3/L4 messaging) — **TUNTAS**: B3-04 text `62…` → DELIVERED, B3-05 `08…`
>   (FAIL → fixed `c2594d1` → deploy → DELIVERED), B3-06 idempotency 200/409,
>   B3-07 key read-only → 403, B3-08 media upload + IMAGE → DELIVERED, B3-09 MIME
>   spoof → 422, B3-01 validasi ID session, B3-02 detail realtime, B3-11 stop →
>   job retry `SESSION_NOT_READY`, B3-12 start → reconnect tanpa QR + job terkirim.
>   B3-03 (pairing code) sengaja ditunda — butuh sesi WA kedua.
> - BATCH 2 (L2) **TUNTAS**: B2-03 media B → 404 MEDIA_NOT_FOUND, B2-04 broadcast
>   B → 404, schedule B → 404 SESSION_FORBIDDEN. Autoreply tidak punya GET (405);
>   operasinya dibatasi sessionId + tenant di kode.
> - Migrasi `authstate_encvalue_longtext` **SUDAH DITERAPKAN** di produksi
>   (2026-10-19 08:57 WIB, backup 234 MB dibuat lebih dulu, `migrate status` = up to date).
> - L8 (private media) — **selesai 2026-10-20 kecuali L8-15**: N/A L8-01/02 (media masuk
>   tidak disimpan) dan L8-03..07 (Media Manager dipensiunkan). PASS L8-08 (hapus →
>   metadata `404`), L8-12 (tanpa kunci `401`, tebak path `404`, dengan kunci `200`),
>   L8-13 (mediaId terhapus → `404`), L8-09/10/11/14 (dari L4). L8-15 (media tetap
>   terpakai setelah restart) menunggu izin restart.
> - L5 (retained WhatsApp operations) — **selesai 2026-10-19**: PASS L5-04/05 (bintang),
>   L5-07 (kontak), L5-08 (lokasi), L5-09 (polling), L5-11 (balas kutipan → READ),
>   L5-12 (hapus untuk semua). **FAIL L5-06** (teruskan selalu 500 — kode mengirim isi
>   pesan kosong). L5-02/03 reaksi ke pesan masuk PASS; reaksi ke pesan sendiri tidak
>   bisa (fromMe dipaku false). L5-01 & L5-10 N/A (pensiun). Detail:
>   `docs/qa/GITHUB-ISSUES-2026-10-19.md`.
> - L4 (outbound messaging API) — **TUNTAS kecuali L4-17**: L4-11 video 201, L4-12 audio
>   201, L4-13 dokumen 201, L4-15 tipe tak didukung 415, L4-16 51MB → 413 (dari nginx,
>   balasan HTML bukan JSON), L4-18 metadata 200, L4-20 kirim VIDEO/AUDIO/DOCUMENT 202,
>   L4-21 mediaId tipe salah 404, L4-22 media tenant lain 404. L4-17 (429 saat unggahan
>   paralel) tidak terpicu pada 12 unggahan paralel — butuh nilai `MAX_CONCURRENT_MEDIA_UPLOADS`.
> - L6 (durable message queue) — **TUNTAS**: L6-01..05 alur status, L6-06/07 stop→job
>   bertahan→start→lanjut, L6-08 restart aplikasi saat 12 job antre → 12 job utuh, 0
>   duplikat, retry → DELIVERED, L6-09/10 disconnect/reconnect, L6-11 cancel QUEUED →
>   CANCELLED, L6-12 cancel DELIVERED → 409, L6-13 FAILED setelah 5 attempt dengan error
>   `SESSION_NOT_READY` tercatat, L6-14 retry → QUEUED (maxAttempts 5→10) → DELIVERED,
>   L6-15 status dari DB setelah reload, L6-16 double submit (2 request identik paralel)
>   → 1 job (`202` + `200` idempotent), L6-17 10 paralel → 10 job unik, L6-18 restart
>   di tengah 10 kiriman paralel → tidak ada loss/duplikat.
> - Media: driver dipindah ke local (B2 gagal, akar masalah belum teridentifikasi
>   karena jalur media tidak mencatat error).
> - Issue terbuka: P2 (login UX pesan menyesatkan) & P3 (branding email reset)
>   di `docs/qa/GITHUB-ISSUES-2026-10-17.md` — perlu dibuat manual di GitHub.
> - L14 (Developer API & API key) — **25 PASS, 1 FAIL, 1 N/A, 3 belum** (2026-10-22):
>   PASS L14-01/02 (secret tampil sekali, hilang setelah reload), 03/04 (tanpa key &
>   key ngawur → 401), 05, 06 (`message:read` → send 403), 07 (send 202 → READ),
>   08 (media read 200 / write 403 untuk read-only, write 201 untuk key penuh),
>   09 (schedule read 200, write 403), 10 (broadcast read 200, write 403),
>   12 (autoreply read 200, write 403), 13 (webhook GET 200, POST 403),
>   15 (revoke → 401 langsung), 16/17 (rotate: secret lama 401, baru 200),
>   19 (IP salah → 401), 21/22/23 (idempotency: 202 → 200 `idempotent:true` id sama;
>   payload beda → 409 `IDEMPOTENCY_CONFLICT`; hanya 1 job/1 WA id), 27 (5 request
>   paralel → pemakaian +5 tepat), 28 (limit 30/menit → request ke-31 `429`),
>   29 (`lastUsedAt` terisi; key yang ditolak tidak mengisi).
>   **FAIL L14-18**: IP allowlist tidak berfungsi — semua request terbaca dari
>   `127.0.0.1`, key dengan IP publik yang benar tetap `401` (issue P2
>   `docs/qa/GITHUB-ISSUES-2026-10-22.md`; akar: `TRUST_PROXY` mati di belakang nginx).
>   N/A L14-11 (endpoint campaign sudah dipensiunkan). **PASS L14-24/25/26** dengan
>   key tenant A: sesi B → `404 SESSION_FORBIDDEN`, media B → `404 MEDIA_NOT_FOUND`,
>   job B → `404 MESSAGE_JOB_NOT_FOUND`; kontrol key A sendiri → `200`.
>   Belum: L14-14 (kuota API key plan Starter penuh 2/2 — perlu satu slot kosong
>   atau ubah `expiresAt` di DB), L14-20 (mesin QA tidak punya jalur IPv6),
>   L14-30 (audit butuh akses superadmin).

Saya pecah menjadi **19 phase (L0–L18)**. Jangan langsung mengerjakan semuanya sekaligus. Kerjakan per phase dan kirim hasilnya kepada saya.

## Phase L0 — Production/Deployment Sanity

| ID                                       | Test live                                | Expected                                 |
| ---------------------------------------- | ---------------------------------------- | ---------------------------------------- |
| L0-01                                    | Buka domain utama PesanPro               | HTTP 200, halaman normal                 |
| L0-02                                    | HTTPS                                    | Tidak ada mixed-content/error sertifikat |
| L0-03                                    | `/api/health/live`                       | Healthy/200                              |
| L0-04                                    | `/api/health/ready`                      | Ready/200 jika dependency sehat          |
| L0-05                                    | `/api/health`                            | Database/runtime dependency sehat        |
| L0-06                                    | Restart aplikasi                         | Aplikasi kembali normal                  |
| L0-07                                    | Restart worker                           | Worker heartbeat kembali                 |
| L0-08                                    | Restart socket/server WA                 | Existing session recovery sesuai desain  |
| L0-09                                    | Browser console dashboard                | Tidak ada error berulang                 |
| L0-10                                    | Network dashboard                        | Tidak ada request 500 yang abnormal      |
| L0-11                                    | Refresh beberapa dashboard page          | Tidak logout/random error                |
| L0-12                                    | Direct URL `/dashboard/...`              | Tidak menghasilkan 404 yang salah        |
| L0-13                                    | `/terms`                                 | Bisa dibuka                              |
| L0-14                                    | `/privacy`                               | Bisa dibuka                              |
| L0-15                                    | 404 URL acak                             | Custom 404 bekerja                       |
| L0-16                                    | Simulasikan error aman                   | Error boundary tidak blank-screen        |

**Gate:** kalau health/database/runtime gagal, jangan lanjut messaging.

---

# Phase L1 — Authentication & Account

Repository mempunyai Login, Register, Forgot Password, Reset Password, account status dan login rate-limit.

| ID                                      | Test                                    | Expected                                |
| --------------------------------------- | --------------------------------------- | --------------------------------------- |
| L1-01                                   | Register user valid                     | Akun dibuat                             |
| L1-02                                   | Nama <2 karakter                        | Ditolak                                 |
| L1-03                                   | Email invalid                           | Ditolak                                 |
| L1-04                                   | Password <10 karakter                   | Ditolak                                 |
| L1-05                                   | Password tanpa uppercase                | Ditolak                                 |
| L1-06                                   | Password tanpa lowercase                | Ditolak                                 |
| L1-07                                   | Password tanpa angka                    | Ditolak                                 |
| L1-08                                   | Confirm password berbeda                | Ditolak                                 |
| L1-09                                   | Register email existing                 | Ditolak aman                            |
| L1-10                                   | Login benar                             | Masuk dashboard                         |
| L1-11                                   | Login password salah                    | Ditolak                                 |
| L1-12                                   | Login email nonexistent                 | Ditolak tanpa bocorkan keberadaan akun  |
| L1-13                                   | 5+ login gagal cepat                    | Rate limit bekerja                      |
| L1-14                                   | Logout                                  | Session login invalid dan kembali login |
| L1-15                                   | Buka dashboard setelah logout           | Redirect login                          |
| L1-16                                   | Forgot password akun valid              | Request diterima                        |
| L1-17                                   | Forgot password email tidak dikenal     | Tidak membocorkan account enumeration   |
| L1-18                                   | Reset link valid                        | Password berhasil berubah               |
| L1-19                                   | Reset token digunakan 2×                | Kedua ditolak                           |
| L1-20                                   | Reset token expired                     | Ditolak                                 |
| L1-21                                   | Password lama setelah reset             | Tidak bisa login                        |
| L1-22                                   | Password baru                           | Bisa login                              |
| L1-23                                   | SUPERADMIN suspend USER-A               | Login USER-A ditolak                    |
| L1-24                                   | Reactivate USER-A                       | Login kembali berhasil                  |
| L1-25                                   | Disable registration di Settings        | Registrasi baru ditolak                 |
| L1-26                                   | Enable registration lagi                | Registrasi berfungsi                    |

### Umur sesi (SESSION_TIMEOUT_HOURS + SESSION_ABSOLUTE_MAX_HOURS)

| ID      | Test                                                      | Expected                                                             |
| ------- | --------------------------------------------------------- | -------------------------------------------------------------------- |
| L1-27   | `SESSION_TIMEOUT_HOURS=1`, diamkan 1 jam lebih             | Sesi mati, bukan lagi 30 hari default NextAuth                        |
| L1-28   | Aktif sebelum idle window berakhir                         | Sesi diperpanjang, tidak logout                                       |
| L1-29   | Lewati batas absolut walau terus aktif                     | Logout paksa, harus login ulang                                       |
| L1-30   | Sesi yang dibuat sebelum deploy ini                        | Tetap jalan, tapi ikut dibatasi cap absolut sejak upgrade             |
| L1-31   | Set `SESSION_ABSOLUTE_MAX_HOURS` < `SESSION_TIMEOUT_HOURS` | Server menolak start, pesan validasi env jelas                        |
| L1-32   | Cek `Set-Cookie` pada login                                | `Max-Age` mengikuti `SESSION_TIMEOUT_HOURS`, bukan 30 hari            |

### Login OTP email

| ID      | Test                                                      | Expected                                                             |
| ------- | --------------------------------------------------------- | -------------------------------------------------------------------- |
| L1-33   | Tab "Email OTP", kirim kode ke email terdaftar             | Email masuk via SMTP di `.env`, berisi kode 6 digit                   |
| L1-34   | Masukkan kode benar                                        | Masuk dashboard                                                       |
| L1-35   | Kode salah 1 kali                                          | Ditolak, pesan menyebut kode tidak benar                              |
| L1-36   | Kode salah 3 kali                                          | Kode hangus, harus minta kode baru                                    |
| L1-37   | Kode dipakai setelah 10 menit                              | Ditolak karena kedaluwarsa                                            |
| L1-38   | Kode yang sama dipakai 2 kali                              | Percobaan kedua ditolak                                               |
| L1-39   | Kirim ulang kurang dari 60 detik                           | Ditolak, tombol kirim ulang menampilkan hitungan mundur               |
| L1-40   | 4 kali kirim dalam 15 menit untuk satu email               | Permintaan ke-4 ditolak (limit 3)                                     |
| L1-41   | 11 kali kirim dalam 1 jam dari satu IP                     | Permintaan ke-11 ditolak (limit 10)                                   |
| L1-42   | Email belum terdaftar                                      | Pesan jelas, tidak ada email terkirim                                 |
| L1-43   | Akun suspended minta kode                                  | Pesan sama seperti email tidak terdaftar, tidak ada email terkirim    |
| L1-44   | `SMTP_HOST` kosong                                         | Pesan "email delivery is not configured", tidak ada baris OtpChallenge |
| L1-45   | Minta kode baru saat kode lama masih hidup                 | Kode lama langsung tidak berlaku lagi                                 |
| L1-46   | Audit log permintaan & verifikasi                          | Ada baris `user.otp_request` dan `user.otp_verify`                    |
| L1-47   | Periksa DB setelah kirim kode                              | `OtpChallenge.codeHash` saja; `EmailOutbox` tidak memuat kode         |
| L1-48   | Mobile viewport tab OTP                                    | Terbaca, tombol minimal 44 px, input kode `inputMode=numeric`         |
| L1-49   | Keyboard saja (Tab, Enter)                                 | Fokus terlihat, form bisa disubmit                                    |
| L1-50   | Ganti tab bolak-balik setelah kode terkirim                | Tidak ada error konsol, kode tetap bisa diverifikasi                  |

### Harga tahunan dan free trial

| ID      | Test                                                      | Expected                                                             |
| ------- | --------------------------------------------------------- | -------------------------------------------------------------------- |
| L1-51   | Buka halaman harga publik                                  | Tampil 3 paket: Starter, Bisnis, Pro. Paket trial tidak muncul        |
| L1-52   | Baris "Bayar 12 bulan"                                     | Angka dari kolom harga tahunan: 750.000 / 1.490.000 / 2.990.000       |
| L1-53   | Baris "Hemat dibanding bayar bulanan"                      | Selisih harga bulanan x 12 dikurangi harga tahunan (±17%), ada persen |
| L1-54   | Daftar akun baru                                           | Subscription `TRIAL` pada paket trial, `trialEndsAt` = 7 hari         |
| L1-55   | Lewati 7 hari trial tanpa bayar                            | Login masih bisa, tapi fitur komersial ditolak (status `EXPIRED`)     |
| L1-56   | Kirim bukti bayar periode Bulanan                          | Nominal = harga bulanan paket, tidak bisa diubah dari sisi klien      |
| L1-57   | Kirim bukti bayar periode Tahunan                          | Nominal = harga tahunan paket                                         |
| L1-58   | Paket tanpa harga tahunan, pilih Tahunan                   | Tombol kirim nonaktif + pesan jelas; API balas 422                    |
| L1-59   | Admin setujui pembayaran tahunan                           | Subscription `ACTIVE`, `billingCycle=YEARLY`, `endsAt` = +12 bulan    |
| L1-60   | Admin setujui pembayaran bulanan                           | `billingCycle=MONTHLY`, `endsAt` = +1 bulan                           |
| L1-61   | Riwayat pembayaran di dashboard billing                    | Menampilkan label BULANAN / TAHUNAN per baris                         |
| L1-62   | Halaman Operasi Komersial                                  | Kartu paket menampilkan harga bulanan dan harga tahunan               |
| L1-63   | Ubah harga tahunan lewat editor paket superadmin           | Halaman harga publik ikut berubah, tanpa deploy ulang                 |

---

# Phase L2 — RBAC dan Tenant Isolation **P0**

Ini salah satu gate terpenting.

| ID                                           | Test                                         | Expected                                     |
| -------------------------------------------- | -------------------------------------------- | -------------------------------------------- |
| L2-01                                        | USER-A buka `/dashboard/users`               | Ditolak/redirect                             |
| L2-02                                        | USER-A buka `/dashboard/commercial`          | Ditolak                                      |
| L2-03                                        | USER-A buka `/dashboard/settings`            | Ditolak                                      |
| L2-04                                        | USER-A buka `/dashboard/system-monitor`      | Ditolak                                      |
| L2-05                                        | USER-A buka `/dashboard/notifications` admin | Ditolak                                      |
| L2-06                                        | Sidebar USER-A                               | Menu admin tidak muncul                      |
| L2-07                                        | SUPERADMIN                                   | Semua menu admin muncul                      |
| L2-08                                        | USER-A akses Session QA-B via URL            | 403/404, data tidak bocor                    |
| L2-09                                        | USER-A akses operasi pesan Session QA-B      | Ditolak                                      |
| L2-10                                        | USER-A akses media USER-B                    | Ditolak                                      |
| L2-11                                        | USER-A akses MessageJob USER-B               | Ditolak                                      |
| L2-12                                        | USER-A access Broadcast USER-B               | Ditolak                                      |
| L2-13                                        | USER-A access Campaign USER-B                | Ditolak                                      |
| L2-14                                        | USER-A access Segment USER-B                 | Ditolak                                      |
| L2-15                                        | USER-A access Schedule USER-B                | Ditolak                                      |
| L2-16                                        | USER-A access AutoReply USER-B               | Ditolak                                      |
| L2-17                                        | USER-A access Webhook USER-B                 | Ditolak                                      |
| L2-18                                        | USER-A access IntegrationToken USER-B        | Ditolak                                      |
| L2-19                                        | USER-A access API key USER-B                 | Ditolak                                      |
| L2-20                                        | USER-A menebak ID resource USER-B            | Tidak ada IDOR/data leak                     |
| L2-21                                        | USER-B tetap normal setelah percobaan        | Tidak ada resource berubah                   |

**Semua L2 wajib PASS.** Satu cross-tenant IDOR saja saya anggap **P0 blocker**.

---

# Phase L3 — Dashboard & WhatsApp Session

PesanPro mendukung create session, custom ID, QR, pairing code, start/stop/restart/logout/delete serta status real-time.

| ID                                       | Test                                     | Expected                                 |
| ---------------------------------------- | ---------------------------------------- | ---------------------------------------- |
| L3-01                                    | Dashboard baru                           | Statistik benar                          |
| L3-02                                    | Create session nama valid                | Session dibuat                           |
| L3-03                                    | Custom session ID valid                  | Diterima                                 |
| L3-04                                    | ID duplicate                             | Ditolak                                  |
| L3-05                                    | ID karakter invalid                      | Tidak diterima                           |
| L3-06                                    | Session muncul dashboard                 | Ya                                       |
| L3-07                                    | Pilih Session dari navbar                | Cookie/current session berubah           |
| L3-08                                    | Buka session detail                      | Informasi benar                          |
| L3-09                                    | Start session                            | Status berubah                           |
| L3-10                                    | QR muncul                                | Valid                                    |
| L3-11                                    | Scan QR dari WhatsApp                    | CONNECTED                                |
| L3-12                                    | Connected As                             | Nomor/account benar                      |
| L3-13                                    | Socket update                            | Status berubah tanpa reload manual       |
| L3-14                                    | Pair by phone number                     | Pairing code muncul                      |
| L3-15                                    | Copy pairing code                        | Benar                                    |
| L3-16                                    | Pairing code digunakan                   | CONNECTED                                |
| L3-17                                    | Restart session                          | Reconnect normal                         |
| L3-18                                    | Stop session                             | STOPPED                                  |
| L3-19                                    | Start kembali                            | Bisa connect                             |
| L3-20                                    | Logout WhatsApp                          | Credential/session keluar                |
| L3-21                                    | Connect kembali                          | QR/pairing dapat digunakan               |
| L3-22                                    | Delete session                           | Session + auth data hilang sesuai desain |
| L3-23                                    | Reload setelah delete                    | Session tidak muncul lagi                |
| L3-24                                    | USER-A punya 2 session                   | Selector switching benar                 |
| L3-25                                    | Operation pada QA-A                      | Tidak salah terkirim melalui QA-B        |

---

# Phase L4 — Outbound Messaging API

Standalone Chat UI dan sinkronisasi riwayat chat luas sudah dipensiunkan. Uji
pengiriman dilakukan melalui Developer/API dan statusnya dibuktikan melalui
Message Queue.

| ID    | Test                                                   | Expected                                      |
| ----- | ------------------------------------------------------ | --------------------------------------------- |
| L4-01 | Buka `/dashboard/developer`                             | Form dan dokumentasi API dapat digunakan      |
| L4-02 | Kirim text melalui `/api/v1/messages/text`              | HTTP 202 dan MessageJob dibuat                |
| L4-03 | Recipient `08...`                                       | Dinormalisasi ke format tujuan yang benar     |
| L4-04 | Recipient `628...`                                      | Tidak dinormalisasi ganda                     |
| L4-05 | Idempotency-Key sama dengan payload sama                | Mengembalikan job yang sama                   |
| L4-06 | Idempotency-Key sama dengan payload berbeda             | HTTP 409                                      |
| L4-07 | API key tanpa scope kirim                               | Ditolak                                       |
| L4-08 | Session milik tenant lain                               | 403/404 tanpa kebocoran data                  |
| L4-09 | Session tidak terkoneksi                                | Gagal aman atau retryable sesuai kontrak      |
| L4-10 | Upload image valid                                      | HTTP 201 dan mediaId tenant-scoped            |
| L4-11 | Upload video MP4 valid                                  | HTTP 201 dan tipe VIDEO                       |
| L4-12 | Upload audio valid                                      | HTTP 201 dan tipe AUDIO                       |
| L4-13 | Upload dokumen valid                                    | HTTP 201 dan tipe DOCUMENT                    |
| L4-14 | MIME tidak cocok dengan magic bytes                     | HTTP 422                                      |
| L4-15 | MIME yang tidak didukung                                | HTTP 415                                      |
| L4-16 | File melampaui `MAX_UPLOAD_SIZE_MB`                     | HTTP 413 tanpa lonjakan memori tak berbatas   |
| L4-17 | Unggahan paralel melebihi batas proses                  | HTTP 429 retryable                            |
| L4-18 | Metadata media langsung berdasarkan ID                  | Media lama tetap dapat ditemukan              |
| L4-19 | Kirim IMAGE dengan mediaId kompatibel                   | Job dibuat dan file tetap tersedia            |
| L4-20 | Kirim VIDEO/AUDIO/DOCUMENT dengan mediaId kompatibel    | Job dibuat dengan tipe yang benar             |
| L4-21 | mediaId dengan tipe tidak kompatibel                    | Ditolak                                       |
| L4-22 | mediaId tenant lain                                     | 403/404                                       |
| L4-23 | Ganti atau lepas unggahan sebelum form disimpan         | Lampiran lama dibersihkan atau kedaluwarsa    |
| L4-24 | Refresh setelah enqueue                                 | Status tetap bersumber dari database          |
| L4-25 | Pengiriman melalui dua session                          | Job dan tenant tidak tercampur                 |

---

# Phase L5 — Retained WhatsApp Operations / API

Fase ini hanya mencakup endpoint session-scoped yang masih ada. Operasi archive,
mute, pin, presence, dan Chat UI tidak lagi menjadi klaim produk aktif.

| ID    | Test                                      | Expected                           |
| ----- | ----------------------------------------- | ---------------------------------- |
| L5-01 | Search message                            | **N/A** — tidak ada endpoint pencarian; ikut pensiun bersama Chat UI (diverifikasi 2026-10-19) |
| L5-02 | React message                             | Reaction diterima                  |
| L5-03 | Remove atau ubah reaction                 | State benar                        |
| L5-04 | Star message                              | Berhasil                           |
| L5-05 | Unstar message                            | Berhasil                           |
| L5-06 | Forward message                           | **N/A (dipensiunkan, keputusan 2026-10-20)** — server tidak menyimpan isi pesan; penerusan lewat aplikasi WhatsApp |
| L5-07 | Send contact card                         | Kontak valid                       |
| L5-08 | Send location                             | Lokasi valid                       |
| L5-09 | Send poll                                 | Poll WhatsApp valid                |
| L5-10 | Download media berdasarkan messageId      | **N/A (retired)** — `410 MEDIA_DOWNLOAD_RETIRED`; media pesan tidak disimpan (diverifikasi 2026-10-19) |
| L5-11 | Reply melalui endpoint session-scoped     | Quote benar                        |
| L5-12 | Delete message sesuai kemampuan WhatsApp  | State konsisten                    |

Nanti saat kita sampai L5, saya bisa buat **curl/Postman commands satu per satu** dari live domain Anda.

---

# Phase L6 — Durable Message Queue **P0/P1**

Status yang tersedia di source: `QUEUED`, `PROCESSING`, `SENT`, `DELIVERED`, `READ`, `FAILED`, `CANCELLED`.

| ID                                     | Test                                   | Expected                               |
| -------------------------------------- | -------------------------------------- | -------------------------------------- |
| L6-01                                  | Send dari Developer/API                | Job dibuat                             |
| L6-02                                  | QUEUED→PROCESSING                      | Normal                                 |
| L6-03                                  | PROCESSING→SENT                        | Normal                                 |
| L6-04                                  | SENT→DELIVERED                         | Normal                                 |
| L6-05                                  | DELIVERED→READ                         | Normal bila recipient membaca          |
| L6-06                                  | Stop worker saat job QUEUED            | Job tidak hilang                       |
| L6-07                                  | Start worker lagi                      | Job dilanjutkan                        |
| L6-08                                  | Restart app saat queue                 | Tidak duplicate                        |
| L6-09                                  | Disconnect WA saat processing          | Retry/failure aman                     |
| L6-10                                  | Reconnect WA                           | Retry sukses                           |
| L6-11                                  | Cancel QUEUED                          | CANCELLED dan tidak terkirim           |
| L6-12                                  | Cancel SENT                            | Ditolak                                |
| L6-13                                  | Paksa FAILED                           | Error tercatat                         |
| L6-14                                  | Retry FAILED                           | Job baru/attempt aman                  |
| L6-15                                  | Refresh halaman                        | State tetap dari DB                    |
| L6-16                                  | Double click send                      | Tidak menghasilkan duplicate abnormal  |
| L6-17                                  | Parallel 10 sends                      | Semua memiliki job sendiri             |
| L6-18                                  | Restart worker di tengah parallel send | Tidak loss/duplicate                   |

---

# Phase L7 — Labels & Contacts

> **STATUS 2026-10-19: N/A — fitur Label dipensiunkan.** Diverifikasi: tidak ada
> halaman label di `/dashboard` dan tidak ada endpoint label di `/api`. Kedua belas
> tes di bawah dipertahankan hanya sebagai catatan sejarah; jangan dijalankan.

| ID                              | Test                            | Expected                        |
| ------------------------------- | ------------------------------- | ------------------------------- |
| L7-01                           | Create label                    | Berhasil                        |
| L7-02                           | Pilih warna                     | Warna tersimpan                 |
| L7-03                           | Rename label                    | Berubah                         |
| L7-04                           | Ubah warna                      | Berubah                         |
| L7-05                           | Search contact                  | Benar                           |
| L7-06                           | Assign chat ke label            | Assignment muncul               |
| L7-07                           | Assign beberapa label ke chat   | Semua ada                       |
| L7-08                           | Filter/list chat by label       | Hasil benar                     |
| L7-09                           | Remove label dari chat          | Hilang                          |
| L7-10                           | Delete label                    | Assignment ikut dibersihkan     |
| L7-11                           | Assign label milik session lain | Ditolak                         |
| L7-12                           | USER-A gunakan label USER-B     | Ditolak                         |

---

# Phase L8 — Private Media & Media Manager **P0**

| ID                                    | Test                                  | Expected                              |
| ------------------------------------- | ------------------------------------- | ------------------------------------- |
| L8-01                                 | Receive image                         | Masuk media storage/list              |
| L8-02                                 | Receive video/audio/document          | Masuk                                 |
| L8-03                                 | Search media                          | Benar                                 |
| L8-04                                 | Filter type                           | Benar                                 |
| L8-05                                 | Preview                               | File benar                            |
| L8-06                                 | Download                              | File utuh                             |
| L8-07                                 | Bulk select                           | Benar                                 |
| L8-08                                 | Delete media                          | Record/file hilang sesuai desain      |
| L8-09                                 | Private media upload API              | Berhasil                              |
| L8-10                                 | Reuse mediaId untuk message           | Berhasil                              |
| L8-11                                 | Media USER-A oleh USER-B              | **403/404**                           |
| L8-12                                 | Tebak URL/file name media tenant lain | Tidak bocor                           |
| L8-13                                 | Deleted mediaId digunakan             | Ditolak aman                          |
| L8-14                                 | Invalid/oversize file                 | Ditolak                               |
| L8-15                                 | Restart app                           | Private media tetap dapat digunakan   |

---

# Phase L9 — Broadcast

> **STATUS 2026-10-20: TUNTAS 32/32.** L9-28 (`STOP`) dan L9-29 (`BERHENTI`) masuk
> suppression `UNSUBSCRIBE` dengan `sourceMessageId` benar. L9-32 cross-tenant:
> broadcast tenant B → `404 BROADCAST_NOT_FOUND`, pause → `403`. L9-24 restart worker
> di tengah broadcast (jeda 60–120 dtk) → lanjut otomatis, 2/2 DELIVERED, 0 duplikat.
> Catatan: create broadcast **wajib** `Idempotency-Key`; paket menolak delay < 5 detik
> (`BROADCAST_DELAY_TOO_SHORT`).

Implementasi terbaru repository mendukung CSV, variables, Spintax, durable queue, suppression dan pause/resume.

| ID                                                    | Test                                                  | Expected                                              |
| ----------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------- |
| L9-01                                                 | Manual 2 nomor                                        | Broadcast dibuat                                      |
| L9-02                                                 | Duplicate nomor                                       | Otomatis dedupe                                       |
| L9-03                                                 | Group JID pada CSV                                    | Dilewati                                              |
| L9-04                                                 | Download CSV template                                 | File valid                                            |
| L9-05                                                 | Import CSV valid                                      | Recipient terdeteksi                                  |
| L9-06                                                 | Alias `phone`                                         | Terdeteksi                                            |
| L9-07                                                 | Alias `nomor_hp`                                      | Terdeteksi                                            |
| L9-08                                                 | CSV >2 MB                                             | Ditolak                                               |
| L9-09                                                 | \>5.000 rows                                          | Ditolak                                               |
| L9-10                                                 | \>20 columns                                          | Ditolak                                               |
| L9-11                                                 | Value >1000 chars                                     | Ditolak                                               |
| L9-12                                                 | `{{name}}`                                            | Dipersonalisasi per recipient                         |
| L9-13                                                 | `{{company}}`                                         | Benar                                                 |
| L9-14                                                 | Header `Invoice No`                                   | Menjadi `invoice_no`                                  |
| L9-15                                                 | Missing variable column                               | Create diblok                                         |
| L9-16                                                 | Spintax `{Halo|Hai}` preview                          | Valid                                                 |
| L9-17                                                 | Spintax + `{{name}}`                                  | Keduanya benar                                        |
| L9-18                                                 | CSV value `{Ayu|Budi}`                                | **Tidak dieksekusi sebagai Spintax**                  |
| L9-19                                                 | Delay min/max                                         | Sesuai rentang                                        |
| L9-20                                                 | Broadcast + mediaId                                   | Terkirim                                              |
| L9-21                                                 | Pause                                                 | Tidak enqueue baru                                    |
| L9-22                                                 | Resume                                                | Lanjut                                                |
| L9-23                                                 | Cancel                                                | Sisa recipient batal                                  |
| L9-24                                                 | Restart worker                                        | Broadcast lanjut tanpa duplicate                      |
| L9-25                                                 | Progress setelah refresh                              | Tetap benar                                           |
| L9-26                                                 | Manual suppression                                    | Recipient tidak terkirim                              |
| L9-27                                                 | Remove suppression                                    | Bisa menerima lagi                                    |
| L9-28                                                 | Recipient kirim `STOP`                                | Masuk suppression otomatis                            |
| L9-29                                                 | Recipient kirim `BERHENTI`                            | Masuk suppression                                     |
| L9-30                                                 | Opt-out setelah Broadcast dibuat tapi sebelum enqueue | **Tetap tidak terkirim**                              |
| L9-31                                                 | Duplicate create/idempotency                          | Tidak duplicate broadcast                             |
| L9-32                                                 | Cross-tenant Broadcast ID                             | Ditolak                                               |

---

# Phase L10 — Segment & Campaign

> **STATUS 2026-10-20: N/A — dipensiunkan di permukaan.** Diverifikasi: tidak ada halaman
> campaign/segment di `/dashboard` dan tidak ada route `/api/**/campaign*`. Mesin
> campaign masih ada di worker, tetapi tidak ada jalur pengguna untuk membuatnya.
> Jangan jalankan tes di bawah; hapus hanya jika mesinnya ikut dipensiunkan.

| ID                             | Test                           | Expected                       |
| ------------------------------ | ------------------------------ | ------------------------------ |
| L10-01                         | Segment berdasarkan source     | Preview benar                  |
| L10-02                         | Segment Contact Tag            | Benar                          |
| L10-03                         | Segment WhatsApp Label         | Benar                          |
| L10-04                         | Custom attribute `kota=...`    | Benar                          |
| L10-05                         | Consent UNKNOWN                | Benar                          |
| L10-06                         | Consent OPTED\_IN              | Benar                          |
| L10-07                         | Consent OPTED\_OUT             | Benar                          |
| L10-08                         | Kombinasi filter               | AND                            |
| L10-09                         | Save segment                   | Berhasil                       |
| L10-10                         | Edit segment                   | Version naik                   |
| L10-11                         | Delete unused segment          | Benar                          |
| L10-12                         | Create Campaign                | Berhasil                       |
| L10-13                         | Launch sekarang                | Recipient snapshot terkunci    |
| L10-14                         | Ubah segment setelah launch    | Campaign lama tidak berubah    |
| L10-15                         | requireOptIn aktif             | Opt-out dilewati               |
| L10-16                         | Campaign media                 | Berhasil                       |
| L10-17                         | Delay min/max                  | Benar                          |
| L10-18                         | Primary device disconnect      | Fallback sesuai policy         |
| L10-19                         | Fallback session               | Terkirim via device yang tepat |
| L10-20                         | Pause campaign                 | Berhenti aman                  |
| L10-21                         | Resume                         | Lanjut                         |
| L10-22                         | Cancel                         | Berhenti permanen              |
| L10-23                         | Schedule Campaign              | Berjalan pada waktunya         |
| L10-24                         | Timezone Asia/Jakarta          | Waktu benar                    |
| L10-25                         | Export campaign                | Data benar                     |
| L10-26                         | Restart worker                 | Campaign durable               |
| L10-27                         | Cross-tenant segment/campaign  | Ditolak                        |

---

# Phase L11 — Scheduler

> **STATUS 2026-10-20: TUNTAS 18/18.** Bukti utama: ONE_TIME 14:06 WIB → job `READ`;
> media `DELIVERED` (IMAGE); New York 05:42 → `09:42Z` (konversi benar); recurring
> `*/3` jalan 16:54/16:57/17:00 lalu cancel menghentikan run 17:03; edit menggeser
> `nextRunAt`; restart aplikasi sebelum jatuh tempo tetap terkirim; `SKIP` → dilewati,
> `CANCEL` → schedule `CANCELLED`, `SEND_LATE` → tetap dikirim; sesi WA mati → job
> `FAILED SESSION_NOT_READY` (terkontrol, bisa retry). API menolak jadwal masa lalu
> (`422 SCHEDULE_IN_PAST`) — jadi kebijakan terlewat hanya terpicu bila worker sempat
> mati. L11-18 memakai bukti B2-04b (schedule tenant B → `404 SESSION_FORBIDDEN`).

Scheduler mendukung `ONE_TIME`, recurring cron, timezone, media dan missed-run policy.

| ID                                         | Test                                       | Expected                                   |
| ------------------------------------------ | ------------------------------------------ | ------------------------------------------ |
| L11-01                                     | One-time + text                            | Dikirim tepat waktu                        |
| L11-02                                     | One-time + media                           | Dikirim                                    |
| L11-03                                     | Text + media                               | Benar                                      |
| L11-04                                     | Existing mediaId                           | Berhasil                                   |
| L11-05                                     | Local `Asia/Jakarta`                       | Waktu benar                                |
| L11-06                                     | Timezone lain                              | Conversion benar                           |
| L11-07                                     | Recurring cron                             | Berulang                                   |
| L11-08                                     | Edit schedule                              | Next run berubah                           |
| L11-09                                     | Cancel                                     | Tidak ada run berikut                      |
| L11-10                                     | Restart app sebelum waktunya               | Tetap terkirim                             |
| L11-11                                     | Worker mati melewati schedule + SEND\_LATE | Dikirim terlambat                          |
| L11-12                                     | Missed + SKIP                              | Occurrence dilewati                        |
| L11-13                                     | Missed + CANCEL                            | Schedule batal                             |
| L11-14                                     | Grace period boundary                      | Sesuai                                     |
| L11-15                                     | Invalid cron                               | Ditolak                                    |
| L11-16                                     | Invalid timezone                           | Ditolak                                    |
| L11-17                                     | Session disconnected                       | Failure/retry terkontrol                   |
| L11-18                                     | Cross-tenant schedule                      | Ditolak                                    |

---

# Phase L12 — Auto Reply

> **STATUS 2026-10-21: 25/27.** PASS lewat uji nyata & API: L12-01, 02 (tidak
> case-sensitive), 03, 04 (STARTS_WITH), 05 (REGEX), 06, 07, 08, 09/10, 11 (ALL jalan
> di grup `@g.us`), 12/13, 14/15, 16/17, 18 (rentang malam 22:00–06:00 lewat preview
> `at`), 19, 20 (2 balasan lalu `CONTACT_RATE_LIMITED`), 22 (media IMAGE → `READ`),
> 23, 24, 25, 26 (cooldown 10 menit **selamat melewati restart aplikasi**),
> 27 (log tenant B → `404`, milik sendiri → `200`).
> **BELUM:** L12-21 (max chain depth — butuh dua bot saling membalas, tidak bisa diuji
> dengan satu sesi). Semua aturan & key uji sudah dihapus/di-revoke.

Terdapat `EXACT`, `CONTAINS`, `STARTS_WITH`, safe `REGEX`, `FALLBACK`; audience PRIVATE/GROUP/ALL; active schedule; priority; cooldown; rate limit; chain depth.

| ID                                     | Test                                   | Expected                               |
| -------------------------------------- | -------------------------------------- | -------------------------------------- |
| L12-01                                 | EXACT `halo`                           | Balasan tepat                          |
| L12-02                                 | `HALO` case behavior                   | Sesuai rule                            |
| L12-03                                 | CONTAINS                               | Match                                  |
| L12-04                                 | STARTS\_WITH                           | Match                                  |
| L12-05                                 | REGEX valid                            | Match                                  |
| L12-06                                 | Unsafe regex                           | Ditolak                                |
| L12-07                                 | FALLBACK                               | Hanya ketika rule lain tidak match     |
| L12-08                                 | Dua rule match                         | Priority menentukan                    |
| L12-09                                 | PRIVATE                                | Group tidak trigger                    |
| L12-10                                 | GROUP                                  | Private tidak trigger                  |
| L12-11                                 | ALL                                    | Keduanya                               |
| L12-12                                 | Rule disabled                          | Tidak trigger                          |
| L12-13                                 | Toggle enabled                         | Trigger lagi                           |
| L12-14                                 | Preview tanpa kirim                    | Menunjukkan rule yang benar            |
| L12-15                                 | Preview group                          | Audience diperhitungkan                |
| L12-16                                 | Active days                            | Di luar hari tidak kirim               |
| L12-17                                 | Active hours                           | Di luar jam tidak kirim                |
| L12-18                                 | Overnight time range jika didukung     | Benar                                  |
| L12-19                                 | Cooldown                               | Message kedua diblok sesuai waktu      |
| L12-20                                 | Rate limit                             | Limit bekerja                          |
| L12-21                                 | Max chain depth                        | Loop bot dicegah                       |
| L12-22                                 | Auto Reply mediaId                     | Media terkirim                         |
| L12-23                                 | Edit rule                              | Version naik                           |
| L12-24                                 | Delete rule                            | Tidak trigger lagi                     |
| L12-25                                 | Trigger log                            | Sender/text/status/reason/job tercatat |
| L12-26                                 | Restart worker                         | Cooldown/log tetap durable             |
| L12-27                                 | Cross-tenant rule                      | Ditolak                                |

---

# Phase L13 — Webhook Engine

Event yang tersedia di source:

`message.received`, `message.sent`, `message.status`, `connection.update`, `group.update`, `group.participant`, `contact.update`, `status.update`, `message.edited`, `message.deleted`, `schedule.status`, `broadcast.status`, `campaign.status`.

| ID                                           | Test                                         | Expected                                     |
| -------------------------------------------- | -------------------------------------------- | -------------------------------------------- |
| L13-01                                       | Create endpoint HTTPS                        | Berhasil                                     |
| L13-02                                       | Create tanpa event                           | Ditolak                                      |
| L13-03                                       | Secret auto-generated                        | Tampil **sekali**                            |
| L13-04                                       | Custom secret                                | Bisa digunakan                               |
| L13-05                                       | Test webhook                                 | Receiver menerima                            |
| L13-06                                       | Signature verification                       | Valid                                        |
| L13-07                                       | Payload message.received                     | Benar                                        |
| L13-08                                       | message.sent                                 | Benar                                        |
| L13-09                                       | message.status                               | Benar                                        |
| L13-10                                       | connection.update                            | Benar                                        |
| L13-11                                       | group.update                                 | Benar                                        |
| L13-12                                       | group.participant                            | Benar                                        |
| L13-13                                       | contact.update                               | Benar                                        |
| L13-14                                       | status.update                                | Benar                                        |
| L13-15                                       | message.edited                               | Benar                                        |
| L13-16                                       | message.deleted                              | Benar                                        |
| L13-17                                       | schedule.status                              | Benar                                        |
| L13-18                                       | broadcast.status                             | Benar                                        |
| L13-19                                       | campaign.status                              | Benar                                        |
| L13-20                                       | Endpoint HTTP 500                            | Delivery FAILED/retry                        |
| L13-21                                       | Endpoint timeout                             | Retry aman                                   |
| L13-22                                       | Logs                                         | Payload, response, headers, latency terlihat |
| L13-23                                       | Replay failed delivery                       | Delivery baru dibuat                         |
| L13-24                                       | Replay success                               | Tidak mengubah log original                  |
| L13-25                                       | Disable webhook                              | Event berhenti                               |
| L13-26                                       | Enable kembali                               | Event masuk                                  |
| L13-27                                       | Edit URL/events                              | Efektif                                      |
| L13-28                                       | Rotate secret                                | New secret bekerja                           |
| L13-29                                       | Previous signature transition                | Sesuai 24h design                            |
| L13-30                                       | Delete                                       | Tidak menerima lagi                          |
| L13-31                                       | Restart webhook worker                       | Outbox tidak hilang/duplicate abnormal       |
| L13-32                                       | Cross-tenant webhook                         | Ditolak                                      |

---

# Phase L14 — Developer API & API Keys **P0**

Billing UI menunjukkan scope:

`device:read/write`, `message:read/send`, `media:read/write`, `schedule:read/write`, `broadcast:read/write`, `campaign:read/write`, `autoreply:read/write`, `webhook:read/write`.

| ID                                  | Test                                | Expected                            |
| ----------------------------------- | ----------------------------------- | ----------------------------------- |
| L14-01                              | Create key                          | Secret tampil sekali                |
| L14-02                              | Reload                              | Full secret tidak bisa dilihat lagi |
| L14-03                              | API tanpa key                       | 401                                 |
| L14-04                              | Invalid key                         | 401                                 |
| L14-05                              | Valid key                           | Berhasil                            |
| L14-06                              | `message:read` key mencoba send     | 403                                 |
| L14-07                              | `message:send`                      | Send allowed                        |
| L14-08                              | Media read/write boundary           | Benar                               |
| L14-09                              | Schedule scopes                     | Benar                               |
| L14-10                              | Broadcast scopes                    | Benar                               |
| L14-11                              | Campaign scopes                     | Benar                               |
| L14-12                              | AutoReply scopes                    | Benar                               |
| L14-13                              | Webhook scopes                      | Benar                               |
| L14-14                              | Expired key                         | Ditolak                             |
| L14-15                              | Revoke key                          | Langsung invalid                    |
| L14-16                              | Rotate key                          | Old secret invalid                  |
| L14-17                              | New rotated key                     | Valid                               |
| L14-18                              | IP allowlist correct IP             | Allowed                             |
| L14-19                              | IP allowlist wrong IP               | Denied                              |
| L14-20                              | IPv6 allowlist                      | Benar                               |
| L14-21                              | Idempotency key text message sama   | Satu logical job                    |
| L14-22                              | Idempotency key + payload berbeda   | Conflict/ditolak                    |
| L14-23                              | Duplicate HTTP retry                | Tidak duplicate WA                  |
| L14-24                              | USER-A key → USER-B session         | Ditolak                             |
| L14-25                              | USER-A key → USER-B media           | Ditolak                             |
| L14-26                              | USER-A key → USER-B job             | Ditolak                             |
| L14-27                              | Concurrent requests                 | Quota atomic                        |
| L14-28                              | Rate limit                          | Terukur dan tidak bypass mudah      |
| L14-29                              | lastUsedAt                          | Update                              |
| L14-30                              | Audit penggunaan credential         | Ada bila dirancang                  |

Endpoint v1 yang harus tersentuh minimal mencakup `messages`, `media`, `schedules`, `broadcasts`, `segments`, `campaigns`, `autoreplies`, `suppressions`, `contact-tags`, `contacts/profile` dan integration tokens.

---

# Phase L15 — Google Forms, CF7, WordPress/WooCommerce Integrations

> **STATUS 24 Okt 2026:** masuk lingkup QA — **24 tes** (12 Google Forms + 12 CF7).
> Pemilik memutuskan integrasi akan diperluas nanti (banyak connector, mudah
> dikonfigurasi dari dashboard), tetapi untuk QA sekarang hanya dua ini.
> Butuh situs WordPress + plugin CF7 dan akun/form Google uji.

Repository memang sudah memiliki connector Google Forms dan plugin Contact Form 7.

### Google Forms

| ID                                      | Test                                    | Expected                                |
| --------------------------------------- | --------------------------------------- | --------------------------------------- |
| L15-G01                                 | Create `GOOGLE_FORMS` integration token | `ppint_...` tampil sekali               |
| L15-G02                                 | Token terikat ke session milik tenant   | Benar                                   |
| L15-G03                                 | Script Properties configuration check   | PASS                                    |
| L15-G04                                 | Submit Google Form                      | Pesan WA masuk queue                    |
| L15-G05                                 | Dynamic recipient field                 | Nomor benar                             |
| L15-G06                                 | Static recipient                        | Nomor fixed benar                       |
| L15-G07                                 | Message field mapping                   | Konten benar                            |
| L15-G08                                 | Replay same submission                  | Tidak duplicate                         |
| L15-G09                                 | Temporary 500                           | Connector retry                         |
| L15-G10                                 | Invalid token                           | Ditolak                                 |
| L15-G11                                 | Revoked token                           | Ditolak                                 |
| L15-G12                                 | Token USER-A + session USER-B           | Tidak dapat dibuat/digunakan            |

### Contact Form 7

| ID                                   | Test                                 | Expected                             |
| ------------------------------------ | ------------------------------------ | ------------------------------------ |
| L15-C01                              | Install plugin connector             | Tidak fatal error                    |
| L15-C02                              | Configure HTTPS endpoint             | Valid                                |
| L15-C03                              | Configure token server-side          | Tidak terekspos browser              |
| L15-C04                              | Submit CF7                           | Queue local dibuat                   |
| L15-C05                              | WA MessageJob PesanPro dibuat        | Ya                                   |
| L15-C06                              | Same CF7 submission hook 2×          | Tidak duplicate                      |
| L15-C07                              | PesanPro offline sementara           | Local queue retry                    |
| L15-C08                              | PesanPro online kembali              | Queue terkirim                       |
| L15-C09                              | Worker/cron overlap                  | Tidak double-send                    |
| L15-C10                              | Stale PROCESSING > recovery interval | Recover                              |
| L15-C11                              | Site Health                          | Configuration check benar            |
| L15-C12                              | Retention cleanup                    | Old queue/log dibersihkan            |

Kemudian kita test route integration **WordPress** dan **WooCommerce** juga apabila memang akan dipublikasikan sebagai fitur resmi produk.

---

# Phase L16 — Billing, Plans & Commercial

| ID                                    | Test                                  | Expected                              |
| ------------------------------------- | ------------------------------------- | ------------------------------------- |
| L16-01                                | USER lihat current plan               | Benar                                 |
| L16-02                                | Entitlements                          | Sesuai plan                           |
| L16-03                                | Usage consumed                        | Bertambah sesuai penggunaan           |
| L16-04                                | Limit tercapai                        | Operasi berikutnya ditolak            |
| L16-05                                | Unlimited plan                        | Commercial quota unlimited            |
| L16-06                                | Trial                                 | End date benar                        |
| L16-07                                | Grace period                          | Behaviour benar                       |
| L16-08                                | List plan                             | Benar                                 |
| L16-09                                | Submit payment proof HTTPS            | PENDING                               |
| L16-10                                | Invalid proof URL                     | Ditolak                               |
| L16-11                                | SUPERADMIN lihat submission           | Ya                                    |
| L16-12                                | Approve tanpa note jika note required | Ditolak                               |
| L16-13                                | Approve + note                        | APPROVED                              |
| L16-14                                | Reject                                | REJECTED                              |
| L16-15                                | Approval otomatis mengaktifkan plan   | **Dikonfirmasi 24 Okt:** setelah approve, paket aktif + email terkirim |
| L16-16                                | SUPERADMIN assign subscription        | Aktif                                 |
| L16-17                                | Change plan                           | Entitlement berubah                   |
| L16-18                                | Entitlement override enable           | Efektif                               |
| L16-19                                | Override disable                      | Efektif                               |
| L16-20                                | Override limit                        | Efektif                               |
| L16-21                                | Expiring override                     | Kembali plan default                  |
| L16-22                                | Set default plan                      | Benar                                 |
| L16-23                                | Disable plan                          | Tidak ditawarkan ke user              |

---

# Phase L17 — Users, Settings, Notifications & Operations

| ID                                  | Test                                | Expected                            |
| ----------------------------------- | ----------------------------------- | ----------------------------------- |
| L17-01                              | SUPERADMIN list users               | Berhasil                            |
| L17-02                              | Edit name/email                     | Berubah                             |
| L17-03                              | Change password admin-side          | Password baru aktif                 |
| L17-04                              | USER→SUPERADMIN                     | Role berubah                        |
| L17-05                              | SUPERADMIN→USER                     | Permission berubah                  |
| L17-06                              | Suspend                             | User kehilangan akses               |
| L17-07                              | Reactivate                          | Pulih                               |
| L17-08                              | Delete user                         | Sesuai dependency policy            |
| L17-09                              | Change app name                     | Sidebar/title berubah               |
| L17-10                              | Change timezone                     | Scheduler menggunakan timezone baru |
| L17-11                              | Logo URL                            | Branding benar                      |
| L17-12                              | Favicon URL                         | Benar                               |
| L17-13                              | Send notification to one user       | Hanya target menerima               |
| L17-14                              | Broadcast notification              | Semua target menerima               |
| L17-15                              | Realtime toast/socket               | Muncul tanpa refresh                |
| L17-16                              | Inbox unread                        | Counter benar                       |
| L17-17                              | Mark one read                       | Berubah                             |
| L17-18                              | Mark all read                       | Semua berubah                       |
| L17-19                              | Delete notification                 | Hilang                              |
| L17-20                              | Notification href                   | Navigasi benar                      |
| L17-21                              | System Monitor runtime heartbeat    | Semua worker terlihat               |
| L17-22                              | MySQL latency                       | Muncul                              |
| L17-23                              | Private storage                     | Sehat                               |
| L17-24                              | CPU/memory/disk                     | Data realistis                      |
| L17-25                              | Queue stats                         | Cocok dengan queue                  |
| L17-26                              | Buat kondisi warning aman           | Operational alert muncul            |
| L17-27                              | Acknowledge                         | Status berubah                      |
| L17-28                              | Resolve                             | Hilang dari active alerts           |
| L17-29                              | Audit login/logout                  | Ada                                 |
| L17-30                              | Audit privileged actions            | Ada                                 |

### What's New popup (Pengumuman Pop-up)

| ID      | Test                                                        | Expected                                                        |
| ------- | ----------------------------------------------------------- | --------------------------------------------------------------- |
| L17-31  | Buat pengumuman sebagai draf                                | Tersimpan sebagai draf, tidak ada popup untuk siapa pun          |
| L17-32  | Tayangkan pengumuman                                        | Popup muncul sekali saat user membuka dashboard                  |
| L17-33  | Tutup popup lalu refresh                                    | Tidak muncul lagi                                                |
| L17-34  | Login dari browser atau perangkat lain                      | Tidak muncul lagi                                                |
| L17-35  | Tayangkan pengumuman baru                                   | Popup muncul lagi karena versinya lebih baru                     |
| L17-36  | Ubah pengumuman yang sudah tayang                           | Tidak memunculkan ulang popup ke user yang sudah menutupnya      |
| L17-37  | Tarik dari tayangan                                         | Popup tidak muncul untuk user yang belum melihatnya              |
| L17-38  | Buka `/dashboard/sessions` saat popup tertunda              | Popup tidak menutupi alur QR, muncul setelah pindah halaman      |
| L17-39  | Tarik draf dari `src/lib/changelog.ts`                      | Masuk sebagai draf, belum tayang                                 |
| L17-40  | USER biasa buka `/dashboard/announcements`                  | Dialihkan ke `/dashboard`                                        |
| L17-41  | Isi tautan detail dengan URL eksternal                      | Ditolak, hanya path di dalam aplikasi                            |
| L17-42  | Isi lebih dari 4 poin                                       | Ditolak dengan pesan batas poin                                  |
| L17-43  | Mobile viewport                                             | Popup tetap terbaca, tombol minimal 44 px                        |
| L17-44  | Keyboard saja (Tab, Enter, Escape)                          | Popup bisa ditutup, fokus terlihat jelas                         |

---

# Phase L18 — Resilience / Production Gate **WAJIB**

Ini phase terakhir sebelum kita mengatakan PesanPro siap public production.

| ID                                             | Test                                           | Expected                                       |
| ---------------------------------------------- | ---------------------------------------------- | ---------------------------------------------- |
| L18-01                                         | Restart Next.js dengan queue berisi pesan      | Tidak loss                                     |
| L18-02                                         | Restart message worker                         | Tidak duplicate                                |
| L18-03                                         | Restart schedule worker                        | Schedule tetap durable                         |
| L18-04                                         | Restart campaign/broadcast worker              | Lanjut aman                                    |
| L18-05                                         | Restart webhook worker                         | Delivery lanjut                                |
| L18-06                                         | Restart WA worker                              | Sessions recover                               |
| L18-07                                         | Kill process saat MessageJob PROCESSING        | Stale lease recover                            |
| L18-08                                         | Kill integration processor saat PROCESSING     | Stale recovery                                 |
| L18-09                                         | Database disconnect pendek                     | App fail gracefully                            |
| L18-10                                         | DB reconnect                                   | Worker recover                                 |
| L18-11                                         | Disk/storage temporary error                   | Tidak corrupt                                  |
| L18-12                                         | Backup database                                | Berhasil                                       |
| L18-13                                         | Restore backup di environment test             | Data usable                                    |
| L18-14                                         | Restore session/config                         | Sesuai security design                         |
| L18-15                                         | Queue backlog 100 controlled test jobs         | Tidak crash                                    |
| L18-16                                         | Concurrent quota boundary                      | Tidak overshoot                                |
| L18-17                                         | Same idempotency request parallel              | Satu logical operation                         |
| L18-18                                         | Webhook receiver down → up                     | Retry/recovery                                 |
| L18-19                                         | WA disconnected → reconnect                    | Job handling benar                             |
| L18-20                                         | Tenant isolation regression seluruh resource   | PASS                                           |
| L18-21                                         | Scan response/log untuk token/password/API key | Tidak bocor                                    |
| L18-22                                         | `.env`/secret tidak public                     | Tidak bisa diakses                             |
| L18-23                                         | Stack trace production                         | Tidak bocor ke browser                         |
| L18-24                                         | Responsive mobile dashboard                    | Tidak ada blocking UI                          |
| L18-25                                         | Chrome desktop/mobile                          | Critical flow normal                           |
| L18-26                                         | Long session penggunaan realtime               | Socket stabil                                  |

---

## Kriteria release

Saya baru akan menyebut **production-ready dari sisi live QA** setelah:

**semua P0 PASS**, seluruh tenant-isolation PASS, Auth PASS, Session/WA PASS, Message Queue durability PASS, Media IDOR PASS, Broadcast/Campaign/Scheduler/Auto Reply PASS, Webhook replay/retry PASS, API auth/scope/idempotency PASS, integrasi yang dipasarkan PASS, restart/recovery PASS, serta backup/restore drill PASS.

Source audit di repository sendiri juga sudah mencatat bahwa production-like E2E, controlled restart with queued work, backup/restore, webhook retry/replay, rate/quota concurrency, tenant-isolation regression, dan secret/log scanning masih merupakan release gate. Jadi live test di atas memang tahap penting berikutnya.

## Cara kirim report ke saya

Tidak usah mengerjakan 200-an pemeriksaan ini sekaligus. **Mulai sekarang dari Phase L0 → L1 → L2.** Untuk setiap test cukup kirim seperti:

```
L0-01 PASS
Bukti: https://pesanpro...

L0-03 PASS
Response:
{ ... }

L1-13 PASS
Percobaan 1–5: invalid credentials
Percobaan 6: blocked/rate limited

L2-08 FAIL
USER-A membuka session milik USER-B:
URL: ...
HTTP: 200
Response: ...
```

Screenshot juga boleh. Untuk kasus Network/API, **status HTTP + response body** lebih berguna daripada screenshot saja. Jangan kirim password, API secret, webhook secret, reset token, cookie/session token, atau credential WhatsApp secara utuh—sensor bagian rahasianya.

### Kita mulai

**Batch pertama yang saya ingin Anda jalankan adalah L0-01 sampai L0-16.** Setelah Anda kirim hasilnya, saya akan langsung klasifikasikan **PASS / FAIL / NEEDS EVIDENCE**, dan kalau ada FAIL kita selesaikan dulu sampai RETEST PASS sebelum pindah ke L1.
