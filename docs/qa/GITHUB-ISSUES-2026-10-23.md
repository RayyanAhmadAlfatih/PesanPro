# Temuan & Perbaikan — 23 Oktober 2026 (Fase 0)

Sesi ini mengerjakan **Fase 0: membereskan error yang masih terbuka** sebelum bab QA baru.
Semua perbaikan ada di branch `workbuddy-fase0-qa-2026-10-23`, satu commit per item.
Belum di-deploy: status live masih memakai kode lama sampai pemilik menjalankan deploy.

---

## [P1] Koneksi WhatsApp mati diam-diam — sudah diperbaiki di kode

**Dampak:** Status sesi tetap `CONNECTED`, API tetap menjawab, tidak ada error di log,
tetapi pesan masuk berhenti diproses. Pelanggan kehilangan chat, balasan otomatis, dan
webhook selama berjam-jam tanpa tahu (kejadian 21 Oktober: ±3,5 jam).

**Reproduksi / bukti masih terbuka sebelum fix:**
- Kode `src/modules/whatsapp/instance.ts` hanya mengandalkan event `connection.update`.
  Tidak ada pemeriksaan berkala terhadap socket, dan status di database tidak pernah
  diverifikasi ulang.
- Bila transport sudah tertutup tanpa event `close`, tidak ada jalur kode yang menyadarinya.
- Kejadian live 21 Oktober tercatat di `GITHUB-ISSUES-2026-10-21.md`.

**Root cause:** Aplikasi mempercayai status tersimpan (`CONNECTED`) dan event Baileys saja.
Tidak ada pemeriksa kesehatan yang (a) melihat keadaan transport, (b) mengirim ping
protokol dan menunggu jawaban, atau (c) memaksa reconnect ketika jawabannya tidak datang.

**File yang diubah:**
- `src/modules/whatsapp/instance.ts` — menambah pemeriksa kesehatan 60 detik, ping
  protokol dengan batas 20 detik, reconnect paksa, dan penjaga agar event dari socket
  lama tidak menimpa status socket baru.
- `src/modules/whatsapp/instance-health.test.ts` (baru) — tes untuk empat jalur:
  transport tertutup, ping dijawab, ping gagal dua kali, sesi dihentikan.

**Perbaikan:** Setiap 60 detik selama status `CONNECTED`, aplikasi memeriksa apakah
transport masih terbuka. Kalau tertutup, sesi langsung disambung ulang. Kalau terbuka,
aplikasi mengirim ping protokol; dua kegagalan berturut-turut memicu reconnect paksa.
Selama reconnect, status di database dan dashboard ikut diubah ke `RECONNECTING`
sehingga tidak ada lagi status `CONNECTED` yang basi.

**Verifikasi:**
- `npx vitest run src/modules/whatsapp/instance-health.test.ts` → 4/4 lolos.
- `tsc --noEmit` → 0 error; `eslint` file terkait → 0 error.
- Belum bisa dibuktikan di server live karena butuh deploy (lihat paket pemilik).

**Status:** DIPERBAIKI — MENUNGGU DEPLOY.

---

## [P2] Reaksi tidak bisa menyasar pesan sendiri — sudah diperbaiki di kode

**Dampak:** Pelanggan tidak bisa memberi reaksi ke pesan yang ia kirim sendiri. API tetap
membalas `200`, tetapi reaksi tidak mengenai pesan yang benar.

**Root cause:** `src/app/api/messages/[sessionId]/[jid]/[messageId]/react/route.ts`
memaku `fromMe: false` pada key pesan. Route `star` sudah menerima `fromMe` dari body,
jadi reaksi sekarang disamakan.

**File yang diubah:**
- `src/app/api/messages/[sessionId]/[jid]/[messageId]/react/route.ts` — menerima
  `fromMe` boolean (default `false`, sehingga pemanggil lama tidak berubah), menolak
  nilai non-boolean dengan `400`, dan memakai nilai itu pada key reaksi.
- `src/lib/legacy-react-route.test.ts` (baru) — tes reaksi ke pesan sendiri, kompatibilitas
  pemanggil lama, dan penolakan `fromMe` yang bukan boolean.

**Verifikasi:** 3/3 tes lolos; `tsc` dan `eslint` bersih.
**Status:** DIPERBAIKI — MENUNGGU DEPLOY.

---

## [P2] Sesi `LOGGED_OUT` tanpa pemberitahuan — sudah diperbaiki di kode

**Dampak:** Sesi bisa keluar sendiri dari akun WhatsApp; pelanggan baru tahu setelah
pengiriman gagal `503`.

**Root cause:** Cabang `LOGGED_OUT` hanya menulis log dan status database. Tidak ada
pemberitahuan ke pemilik akun. Hal yang sama terjadi saat sesi berhenti setelah tiga kali
gagal reconnect.

**File yang diubah:**
- `src/lib/session-alerts.ts` (baru) — membuat notifikasi `WARNING` untuk pemilik sesi
  dan mengirim event realtime `notification:new` ke room `user:<id>` (lonceng dashboard).
- `src/lib/session-alerts.test.ts` (baru) — tes isi notifikasi, event realtime, dan
  kegagalan database yang tidak boleh mengganggu alur sesi.
- `src/modules/whatsapp/instance.ts` — memanggil pemberitahuan saat `LOGGED_OUT`,
  saat sesi berhenti setelah reconnect habis, dan saat pemulihan otomatis gagal.
- `src/modules/whatsapp/manager.ts` — menandai logout yang dilakukan pemilik sendiri
  agar tidak memicu alarm palsu.

**Perbaikan:** Saat sesi keluar sendiri atau berhenti, pemilik akun menerima notifikasi
di lonceng dashboard (dan toast realtime) berisi nama sesi, akibatnya, dan tautan ke
halaman Sesi. Logout yang sengaja dilakukan pemilik tidak memicu notifikasi.

**Verifikasi:** 3/3 tes lolos; `tsc` dan `eslint` bersih.
**Status:** DIPERBAIKI — MENUNGGU DEPLOY.

---

## [P3] Unggahan melebihi batas ditolak nginx dengan HTML — masih terbuka, butuh pemilik

**Dampak:** Pemanggil API menerima halaman HTML `413 Request Entity Too Large`, bukan
JSON seperti endpoint lain. Pesan error tidak bisa dibaca aplikasi klien.

**Reproduksi (23 Oktober 2026, live):**
```
POST https://wagateway.kingofcoding.my.id/api/v1/media
berkas 51 MB
→ HTTP 413, Content-Type: text/html, 176 byte
  <html><head><title>413 Request Entity Too Large</title></head>...
```

**Root cause:** Batas `client_max_body_size` nginx tercapai sebelum permintaan masuk ke
aplikasi, sehingga handler JSON aplikasi tidak pernah berjalan. Aplikasi sendiri punya
batas 50 MB (`MAX_UPLOAD_SIZE_MB`) dan sudah membalas JSON untuk berkas yang sedikit
melewati batas — tetapi nginx memotong lebih dulu.

**Perbaikan:** Tidak bisa dari source code. Butuh perubahan konfigurasi nginx
(lihat paket BLOCKED-PEMILIK di bawah).

**Status:** MENUNGGU-PEMILIK.

---

## [P3] Format balas `{"message":"teks"}` ditolak — sudah diperbaiki di kode

**Dampak:** Pengguna API yang mengirim teks langsung menerima `400 "message is required"`,
padahal bentuk objek `{"message":{"text":"..."}}` diterima. Membingungkan dan tidak
konsisten dengan `/send` yang sudah menerima string.

**Root cause:** `parseOutgoingMessage` di `src/lib/whatsapp-message.ts` hanya menerima
objek. Fungsi ini dipakai kedua route balas (`/reply` dan `/[messageId]/reply`), sedangkan
`/send` punya parser sendiri yang sudah menerima string.

**File yang diubah:**
- `src/lib/whatsapp-message.ts` — menerima string biasa sebagai `{ text }`, menolak
  string kosong, dan tetap menerima bentuk objek seperti sebelumnya.
- `src/lib/whatsapp-message.test.ts` (baru) — tes kedua bentuk, mentions, dan input cacat.

**Perbaikan:** Kedua route balas sekarang menerima `{"message":"teks"}` maupun
`{"message":{"text":"teks"}}` dengan hasil yang sama. Kontrak lama tidak berubah.

**Verifikasi:** 5/5 tes lolos; `tsc` dan `eslint` bersih.
**Status:** DIPERBAIKI — MENUNGGU DEPLOY.

---

## Pensiun "teruskan pesan" — pembersihan selesai di kode

**Konteks:** Fitur ini diputuskan dipensiunkan (server tidak menyimpan isi pesan), tetapi
endpoint-nya masih ada dan selalu membalas `500`.

**File yang diubah:**
- `src/app/api/messages/[sessionId]/forward/route.ts` — dihapus.
- `src/lib/qa-fixes-regression.test.ts` — tes T-7 untuk endpoint itu dihapus karena
  endpoint-nya tidak ada lagi.

**Verifikasi:** Tidak ada lagi referensi `forward` di `src/` selain `forwardRef` UI dan
teks "diteruskan ke webhook" di landing page (bukan fitur ini). `tsc` bersih setelah
folder build lama dipindahkan. Endpoint akan menjadi `404` setelah deploy.

**Status:** SELESAI DI KODE — MENUNGGU DEPLOY.

---

# Paket BLOCKED-PEMILIK

## 1. Deploy perbaikan Fase 0

**Tindakan:** deploy branch `workbuddy-fase0-qa-2026-10-23` ke server produksi, lalu
restart aplikasi.

**Perintah persis (contoh, sesuaikan dengan alur deploy yang biasa dipakai):**
```bash
su - pesanpro -c "cd /www/wwwroot/PesanPro && git fetch origin && git checkout workbuddy-fase0-qa-2026-10-23 && npm ci && npx prisma generate && npm run build"
su - pesanpro -c "pm2 restart pesanpro"
```

**Durasi:** build ±7 menit + restart ±30 detik. Saat restart, pengiriman yang sedang
berjalan akan ditunda dan dilanjutkan worker (sudah diuji di L6/L9).

**Dampak:** tidak ada perubahan database, tidak ada perubahan env. Setelah deploy:
- sesi yang mati diam-diam akan terdeteksi dalam ≤2 menit dan disambung ulang;
- reaksi ke pesan sendiri berfungsi;
- notifikasi muncul saat sesi keluar/berhenti;
- balasan menerima format string;
- endpoint `forward` menjadi `404`.

**Verifikasi setelah deploy (bisa dijalankan pemilik atau saya):**
1. Kirim satu pesan uji ke `6283877315731`, pastikan masuk dan auto-reply tetap jalan.
2. Cek dashboard: status sesi `CONNECTED`, tidak ada notifikasi palsu.
3. `POST /api/messages/<sesi>/<jid>/<id>/reply` dengan `{"message":"tes"}` → `202`.

## 2. Perbaikan nginx untuk unggahan besar

**Tindakan:** di server block `wagateway.kingofcoding.my.id`, tambahkan:

```nginx
client_max_body_size 60m;

error_page 413 = @payload_too_large;
location @payload_too_large {
    default_type application/json;
    return 413 '{"status":false,"error":"PAYLOAD_TOO_LARGE","message":"Ukuran berkas melebihi batas 50 MB"}';
}
```

**Perintah persis:**
```bash
nginx -t && systemctl reload nginx
```

**Durasi:** ±2 menit. **Dampak:** reload nginx, tanpa downtime dan tanpa restart aplikasi.

**Verifikasi:** unggah berkas 51 MB → `413 application/json` (bukan HTML); unggah 55 MB
juga JSON; unggah 10 MB tetap berhasil seperti biasa.

## 3. `TRUST_PROXY` (sisa L14-18, masih terbuka)

Masih menunggu keputusan pemilik: tambah `TRUST_PROXY="true"` dan `TRUST_PROXY_HOPS="1"`
ke `.env` produksi lalu restart. Panduan lengkap sudah ada di
`docs/qa/PANDUAN-TRUST-PROXY-2026-10-22.md`. Dampak: allowlist IP API key berfungsi,
limit per IP tidak lagi global, audit log mencatat IP asli.

---

# L16 — Billing, Plans & Commercial (live, 23 Oktober 2026)

Akun: **Tenant A** (`testingusera@gmail.com`, sesi `27092015`). Status sesi WhatsApp
saat pengujian: **STOPPED** (sudah begitu sebelum sesi ini; tidak diubah karena L16
tidak membutuhkan pengiriman). Sumber kedua: `GET /api/billing/summary`, `GET /api/plans`,
`GET /api/webhooks/27092015`.

| ID | Hasil | Bukti ringkas |
| --- | --- | --- |
| L16-01 | **PASS** | Plan aktif `TRIAL` (plan code `TRIAL`), tampil di dashboard dan `/api/billing/summary`. |
| L16-02 | **PASS** | Hak akses dari `PLAN`: API_KEYS 2, DEVICES 1, MESSAGES 500, API_REQUESTS 1000, SCHEDULED 10, BROADCASTS 2, WEBHOOKS 1, RPM 15, media 100 MB — sama di dashboard dan API, dan sesuai definisi `plan_trial` di migrasi. |
| L16-03 | **PASS** | Pemakaian `MESSAGES_MONTHLY` 1/500 dan `API_REQUESTS_MONTHLY` 28/1000; angka dashboard = angka API. |
| L16-04 | **PASS** | Batas `WEBHOOKS` 1: webhook pertama `201`, webhook kedua `429 QUOTA_EXCEEDED`. Webhook uji dihapus; daftar akhir kosong. |
| L16-05 | **N/A** | Tidak ada plan dengan kuota pesan tak terbatas. `API_ACCESS` memang tak terbatas dan sudah aktif di trial, tetapi bukan "unlimited plan". |
| L16-06 | **PASS** | Trial 7 hari tepat: mulai 17/10/2026 09:07 WIB, berakhir 24/10/2026 09:07 WIB (dashboard + API). |
| L16-07 | **BLOCKED-PEMILIK** | Butuh langganan kedaluwarsa terkontrol (ubah tanggal di DB) untuk melihat grace period. |
| L16-08 | **PASS** | Tiga plan aktif: Starter 75.000/750.000, Bisnis 149.000/1.490.000, Pro 299.000/2.990.000. Plan trial (harga 0) tidak ditawarkan. |
| L16-09 | **BLOCKED-PEMILIK** | Pengajuan bukti bayar akan meninggalkan baris `PENDING` yang tidak bisa dihapus tenant; butuh admin untuk menolak/membersihkan. |
| L16-10 | **PASS** | `planId` tidak valid → `404 Active plan not found`; daftar pengajuan tetap 0 (tidak ada baris baru). |
| L16-11 s/d L16-23 | **BLOCKED-PEMILIK** | Semua langkah ini butuh akun `SUPERADMIN` (lihat, setujui, tolak, assign subscription, ubah plan, override, set default, nonaktifkan plan). Browser yang tersedia hanya login tenant. |

**Catatan desain L16-15:** kode saat ini **mengaktifkan plan otomatis saat pembayaran
disetujui** (`reviewPaymentVerificationInTransaction` membuat/memperbarui subscription).
Ini sesuai brief harga 12 Oktober ("pembayaran tahunan yang disetujui memberi masa aktif
12 bulan"), tetapi berbeda dari kalimat lama di roadmap ("approval tidak auto-assign
plan"). Perlu konfirmasi pemilik: perilaku mana yang final. Belum diubah.

**Catatan kecil (bukan bug):** kuota habis dibalas `429 QUOTA_EXCEEDED`, sama dengan
kode rate limit. Kontrak ini sudah dipakai di seluruh produk; kalau dokumentasi API
ditulis, sebutkan bahwa `429` bisa berarti kuota bulanan habis, bukan hanya terlalu
banyak permintaan.

---

# Deploy Fase 0 — 23 Oktober 2026, 19:26 WIB

**Commit:** `2e79bab` (branch `workbuddy-fase0-qa-2026-10-23`).

**Hasil:**
- `npm run build` pertama **gagal** karena kehabisan memori (script memaku heap 2048).
  Build ulang dengan `node --max-old-space-size=3072 node_modules/next/dist/bin/next build --webpack`
  berhasil dalam 2,2 menit; TypeScript dan 64 halaman statis selesai.
- `pm2 restart pesanpro` → status `online`. Sempat `502` ±30 detik saat proses mulai,
  lalu normal.
- `GET /api/health/live` → `200 {"status":"ok"}`; `GET /api/health/ready` → `200 ok:true`
  (diverifikasi dari VPS dan dari mesin QA).
- Halaman `/`, `/auth/login`, `/terms`, `/privacy` → `200`.
- Route `/api/messages/[sessionId]/forward` **tidak ada lagi** di manifest build server
  (bukti pensiunnya endpoint). Tanpa login, jalur itu tetap dibalas `401` oleh
  middleware, jadi `404` hanya terlihat oleh pemanggil terautentikasi.

**Yang belum bisa dibuktikan setelah deploy:**
- Perilaku watchdog koneksi (#1), reaksi `fromMe` (#2), notifikasi `LOGGED_OUT` (#3),
  dan format balas string (#5) belum dijalankan live karena sesi WhatsApp Tenant A
  berstatus `STOPPED` dan sesi login browser sudah berakhir (dashboard meminta login).
- Perbaikan nginx 413 masih menunggu pemilik.

**Tindakan lanjutan:** login ulang dashboard (atau buat API key uji) lalu start sesi
WhatsApp; setelah itu #2, #3, #5 bisa diuji dan #1 bisa diamati stabilitasnya.

---

# Verifikasi live setelah deploy — 23 Oktober 2026, 21:01 WIB

Akun: **Tenant B** (`testinguserb@gmail.com`, sesi `qa-b-session`, status `CONNECTED`).

**#5 Format balas — LOLOS-SETELAH-FIX.**
`POST /api/messages/qa-b-session/6283877315731@s.whatsapp.net/PPCA9B176EC7581A324DBC69F8DBB930/reply`
dengan body `{"message":"uji-format-L16-20261023-2107"}` (string biasa) →
`202 Reply queued successfully`, job `cmvl1ge2b03em3dziwelpc4ri`.
Sumber kedua: job menjadi `READ`, `whatsappMessageId PPBB43DF906836B86DCDEF5F939CA45A`,
attempt 1/5, tanpa error — dan baris yang sama tampil `READ` di Antrian Pesan dashboard.
Hanya satu pesan dikirim, ke nomor uji `6283877315731`.

**#2 Reaksi ke pesan sendiri — LOLOS-SETELAH-FIX (sebagian).**
`POST .../PPBB43DF906836B86DCDEF5F939CA45A/react` dengan `{"emoji":"👍","fromMe":true}`
→ `200 Reaction sent`. Reaksi uji kemudian dihapus (`emoji:""`, `fromMe:true` → 200).
Yang terbukti: parameter `fromMe:true` diterima dan diteruskan tanpa error. Tampilan
reaksi di HP tidak dapat saya lihat dari sini; pemilik bisa memastikan visualnya.

**#1 Watchdog — terpasang, belum ada kejadian untuk dibuktikan.**
Sesi `qa-b-session` tetap `CONNECTED` dan pengiriman berjalan normal. Watchdog hanya
bekerja saat socket benar-benar berhenti; tidak ada cara aman memicunya tanpa merusak
sesi produksi.

**#3 Notifikasi `LOGGED_OUT` — terpasang, belum dipicu live.**
Dipicu hanya oleh logout/berhenti yang nyata. Sengaja tidak dipaksa karena berisiko
membuat sesi harus scan QR ulang. Bukti saat ini: unit test jalur notifikasi.

**#6 Forward — TERVERIFIKASI.** Route tidak ada di manifest build server.

**#4 nginx 413 — masih MENUNGGU-PEMILIK.** Panduan rule sudah diberikan; begitu
diterapkan, uji ulang dengan berkas 51 MB.

---

# #4 Unggahan melebihi batas — LOLOS-SETELAH-FIX (23 Oktober 2026, 21:07 WIB)

Rule nginx sudah aktif di vhost `wagateway.kingofcoding.my.id`
(`client_max_body_size 60m` + `error_page 413` JSON). Hasil uji:

| Uji | Hasil | Arti |
| --- | --- | --- |
| 51 MB, tanpa login | `401 application/json` | nginx **tidak lagi** memotong di 51 MB; aplikasi yang menjawab |
| 51 MB, login Tenant B | `413 application/json` `{"code":"MEDIA_TOO_LARGE","message":"Media exceeds the 50 MB limit"}` | Batas aplikasi 50 MB bekerja dan pesannya JSON, bukan HTML |
| 61 MB (di atas batas nginx) | `413 application/json` `{"status":false,"error":"PAYLOAD_TOO_LARGE",...}` | `error_page 413` nginx bekerja |

Sebelumnya 51 MB menghasilkan `413 text/html` 176 byte dari nginx. Sekarang seluruh
jalur menghasilkan JSON.

**Catatan operasional:** rule dipasang di config website (vhost utama), bukan di
`/www/server/panel/vhost/nginx/extension/...`. Kalau aaPanel menyimpan ulang vhost,
rule ini bisa hilang. Disarankan memindahkannya ke file extension
`payload-limit.conf` saat ada kesempatan.
