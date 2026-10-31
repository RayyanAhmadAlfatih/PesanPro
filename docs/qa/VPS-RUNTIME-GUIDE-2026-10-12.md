# Panduan Runtime VPS — PesanPro

- Dibuat: 2026-10-12
- Untuk: branch `workbuddy-audit-privacy-branding-2026-10-11`
- Status VPS saat ini: **kode lama** (belum merge, belum pull, belum deploy)
- Semua perintah di bawah dijalankan **di VPS**, bukan di mesin lokal. Jangan test ke production.

---

## 1. Apa yang sebenarnya berubah (fakta terverifikasi)

| Item                       | Temuan                                                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Commit di atas `main`      | **20 commit**                                                                                               |
| Migrasi DB baru vs `main`  | **1 saja**: `20261011000000_contact_welcomed_at`                                                            |
| Env baru vs `main`         | **3**: `MESSAGE_RETENTION_DAYS` (default 30), `TRUST_PROXY` (default false), `TRUST_PROXY_HOPS` (default 1) |
| Skema baru                 | `Contact.welcomedAt DATETIME(3) NULL` + backfill                                                            |
| Cara deploy yang sudah ada | `start.sh` (PM2, proses `pesanpro`, fork mode, embedded workers)                                            |
| Gate preflight             | `npm run release:preflight`                                                                                 |
| Backup                     | `npm run backup:create` / `backup:verify` (restore dibatasi lingkungan kosong)                              |

`start.sh` sudah menjalankan urutan yang benar: cek `.env` → cek port → `npm install` → **`npx prisma migrate deploy && npx prisma generate`** → cek admin → `npm run build` → `pm2 startOrReload`. Migrasi jalan **sebelum** kode baru aktif. Pertahankan urutan itu.

---

## 2. Aturan keselamatan (jangan dilewati)

1. **Backup dulu**, jangan langsung deploy.
2. **Migrasi sebelum kode.** Kode baru membaca `Contact.welcomedAt`. Kalau kode jalan duluan, query kontak gagal.
3. **Jangan pakai `backup:restore` untuk rollback production.** Script-nya sengaja menolak restore ke DB yang tidak kosong (`Target database is not empty; restore is restricted to an isolated empty environment`). Rollback deploy = git + migrasi, bukan restore.
4. **Catat state sekarang** (commit hash, jumlah baris tabel penting) supaya bisa dibandingkan setelah deploy.
5. Kalau ada yang tidak sesuai harapan di tengah jalan: **stop, jangan lanjut**.

---

## 3. Bagian A — Sebelum deploy

### A1. Catat state VPS sekarang

```bash
cd /path/ke/pesanpro        # direktori app di VPS
git rev-parse HEAD          # catat hash kode yang sedang jalan
git status --short          # pastikan tidak ada perubahan lokal yang tidak disengaja
pm2 status                  # pastikan proses pesanpro online
pm2 describe pesanpro | grep -E "status|restarts|uptime"
```

### A2. Cek migrasi yang tertunda (JANGAN deploy dulu, hanya lihat)

```bash
npx prisma migrate status
```

Catat migrasi mana yang `not yet applied`. Kalau VPS sudah setara `main`, yang tertunda hanya `20261011000000_contact_welcomed_at`.

### A3. Backup database + media

```bash
npm run backup:create
# catat nama file backup yang dihasilkan (di folder BACKUP_DIR, default ./backups)
npm run backup:verify -- --file=<nama-file-backup>
```

Verifikasi harus `ok: true`. Kalau gagal, **jangan lanjut**.

### A4. Cek file `.env` VPS

Samakan dengan tabel di Bagian E. Minimal yang wajib dipastikan:

```bash
grep -E "^(NODE_ENV|BASE_URL|AUTH_SECRET|ENCRYPTION_KEY|DATABASE_URL|MEDIA_STORAGE_DRIVER|B2_BUCKET|SMTP_HOST|SMTP_FROM|RESEND_API_KEY|MESSAGE_RETENTION_DAYS|TRUST_PROXY)" .env
```

Catatan penting:

- `TRUST_PROXY` biarkan `false` **kecuali** VPS di belakang Nginx/Cloudflare/Traefik. Kalau di belakang proxy dan salah set, rate limit dan IP allowlist bisa dilewati/di-blok salah. Kalau di belakang proxy, set `TRUST_PROXY=true` dan `TRUST_PROXY_HOPS` = jumlah proxy.
- `MEDIA_STORAGE_DRIVER` default kode `local`, tapi `.env.example` dan `docker-compose.yml` memakai `b2`. Pastikan sesuai keputusan Anda; kalau `b2`, semua `B2_*` wajib terisi (env validation akan menolak start kalau kosong).
- `RESEND_API_KEY` vs `SMTP_*`: setelah FIX-01, reset password pakai SMTP bila `SMTP_HOST`+`SMTP_FROM` terisi, kalau tidak jatuh ke Resend. Isi salah satu.

---

## 4. Bagian B — Deploy

### B1. Putuskan soal 2 file perbaikan QA (penting)

Perbaikan hasil siklus QA (`src/lib/password-reset.ts` untuk BUG-01, `src/app/api/user/api-keys/route.ts` untuk BUG-02) **belum di-commit**. Deploy mengambil dari git, jadi kalau tidak di-commit, VPS tidak akan mendapatkannya.

```bash
# di mesin LOKAL
git add src/lib/password-reset.ts src/app/api/user/api-keys/route.ts docs/qa
git commit -m "fix(auth): deliver password reset over SMTP and require API key scopes"
git push origin workbuddy-audit-privacy-branding-2026-10-11
```

Kalau belum mau membawa perbaikan itu, lewati langkah ini dan deploy apa adanya.

### B2. Preflight di VPS (sebelum build)

```bash
npm run release:preflight
```

Harus `"ok": true`. Kalau ada `errors`, jangan lanjut.

### B3. Ambil kode

```bash
git fetch origin
git checkout workbuddy-audit-privacy-branding-2026-10-11
git pull --ff-only origin workbuddy-audit-privacy-branding-2026-10-11
git rev-parse HEAD          # catat hash baru
git diff --check            # tidak boleh ada whitespace error
```

### B4. Jalankan deploy

```bash
chmod +x start.sh
./start.sh
```

`start.sh` akan: `npm install` → `npx prisma migrate deploy` → `npx prisma generate` → cek admin → `npm run build` → `pm2 startOrReload`. Build bisa makan ~7 menit; jangan interrupt.

Kalau Anda lebih suka manual, **jaga urutan ini**:

```bash
npm install
npx prisma migrate deploy      # WAJIB sebelum kode baru
npx prisma generate
npm run build
pm2 startOrReload ecosystem.config.cjs --env production
```

### B5. Konfirmasi migrasi benar-benar jalan

```bash
npx prisma migrate status      # tidak boleh ada "not yet applied"
mysql -u <user> -p -e "SHOW COLUMNS FROM Contact LIKE 'welcomedAt';" <db>
```

Kolom `welcomedAt` harus ada dan tipe `datetime(3) NULL`.

---

## 5. Bagian C — Verifikasi runtime setelah deploy

Ini bagian yang **tidak bisa dijalankan di mesin lokal kemarin** (tanpa DB/runtime). Di VPS baru bisa.

### C1. Health & startup (dari `ROADMAP-LIVE-TEST.md` Phase L0)

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://<domain>/api/health/live
curl -s -o /dev/null -w "%{http_code}\n" https://<domain>/api/health/ready
curl -s https://<domain>/api/health
pm2 logs pesanpro --lines 100 --nostream     # cari error saat start
pm2 describe pesanpro | grep -E "status|restarts"
```

Lanjutkan L0-01..L0-16 sesuai roadmap Anda (buka domain, HTTPS, 404 acak, `/terms`, `/privacy`, refresh dashboard).

### C2. Verifikasi khusus deploy ini (wajib, karena ini yang berubah)

| #   | Yang dicek                     | Cara                                                                                                                   | Harapan                                                                               |
| --- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| V1  | Migrasi welcome                | `npx prisma migrate status`                                                                                            | Semua applied                                                                         |
| V2  | Backfill welcome               | `SELECT COUNT(*) FROM Contact WHERE welcomedAt IS NOT NULL;`                                                           | > 0 bila ada kontak lama yang sudah pernah bertukar pesan                             |
| V3  | Welcome tidak dobel            | Kirim pesan dari nomor baru ke device tenant, lalu kirim lagi dari nomor yang sama                                     | Welcome hanya sekali; cek `Contact.welcomedAt` tidak berubah pada pesan kedua         |
| V4  | Welcome tidak terkirim ke grup | Kirim pesan di grup                                                                                                    | Tidak ada welcome                                                                     |
| V5  | Isi pesan tidak tersimpan      | Kirim/terima pesan, lalu `SELECT COUNT(*) FROM Message WHERE content IS NOT NULL;`                                     | `0`                                                                                   |
| V6  | Retensi pesan aktif            | `grep MESSAGE_RETENTION_DAYS .env`; tunggu siklus purge harian (`runtime.ts` interval 24 jam) atau panggil maintenance | Baris `Message` lebih tua dari 30 hari terhapus; `Contact`/`Group` **tidak** terhapus |
| V7  | Reset password                 | Isi `SMTP_*` (tanpa Resend), request reset, cek inbox                                                                  | Email benar-benar masuk (ini FIX-01)                                                  |
| V8  | API key wajib scope            | `POST /api/user/api-keys` dengan `{"name":"x"}` (tanpa `scopes`) via session                                           | **400** (ini FIX-02)                                                                  |
| V9  | Route lama sudah hilang        | `curl -o /dev/null -w "%{http_code}" https://<domain>/api/media`                                                       | **404**                                                                               |
| V10 | Media upload ke B2             | Upload bukti bayar dari dashboard                                                                                      | 201, file muncul di bucket B2                                                         |

### C3. Lanjutkan phase berikutnya

Setelah C1–C2 hijau, lanjut ke L1 → L2 sesuai roadmap. **L2 (tenant isolation) adalah P0** — satu cross-tenant IDOR = blocker.

---

## 6. Bagian D — Rollback

Kalau deploy bermasalah:

```bash
cd /path/ke/pesanpro
git checkout <hash-lama-yang-dicatat-di-A1>
npm install
npx prisma generate
npm run build
pm2 startOrReload ecosystem.config.cjs --env production
```

Catatan penting soal rollback:

- **Kolom `welcomedAt` boleh dibiarkan.** Kolom nullable dan tidak dibaca kode lama, jadi aman tinggal.
- **Jangan** menjalankan `prisma migrate down` untuk membalik migrasi (akan kehilangan data backfill dan tidak diperlukan).
- **Jangan** memakai `backup:restore` untuk production (dibatasi lingkungan kosong).
- Kalau butuh membalik perubahan lain, balik via git, bukan via DB.

---

## 7. Bagian E — Checklist env VPS

| Variabel                                                         | Nilai yang benar                            | Catatan                                         |
| ---------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------- |
| `NODE_ENV`                                                       | `production`                                |                                                 |
| `BASE_URL`                                                       | `https://<domain>`                          | Dipakai untuk tautan reset password             |
| `PASSWORD_RESET_BASE_URL`                                        | `https://<domain>`                          | Opsional; fallback ke `BASE_URL`                |
| `AUTH_SECRET`                                                    | ≥32 char, bukan default                     | `start.sh` memperingatkan kalau default         |
| `ENCRYPTION_KEY`                                                 | 64 hex char                                 | Wajib; `openssl rand -hex 32`                   |
| `DATABASE_URL`                                                   | MySQL VPS                                   |                                                 |
| `MEDIA_STORAGE_DRIVER`                                           | `b2` (keputusan produk)                     | Kalau `b2`, semua `B2_*` wajib                  |
| `B2_ACCOUNT_ID` / `B2_ACCOUNT_KEY` / `B2_BUCKET` / `B2_ENDPOINT` | terisi                                      | Wajib saat driver `b2`                          |
| `SMTP_HOST` / `SMTP_FROM`                                        | terisi bila pakai SMTP                      | Wajib berpasangan                               |
| `SMTP_USER` / `SMTP_PASSWORD`                                    | terisi bersama atau kosong bersama          | Env validation menolak kalau hanya salah satu   |
| `RESEND_API_KEY` / `PASSWORD_RESET_FROM`                         | terisi bila pakai Resend                    | Fallback reset password                         |
| `MESSAGE_RETENTION_DAYS`                                         | `30` (atau `0` untuk simpan selamanya)      | **Baru**                                        |
| `TRUST_PROXY`                                                    | `false`, atau `true` bila di belakang proxy | **Baru**                                        |
| `TRUST_PROXY_HOPS`                                               | jumlah proxy                                | **Baru**, hanya dipakai bila `TRUST_PROXY=true` |
| `PRIVATE_MEDIA_RETENTION_DAYS`                                   | `30`                                        |                                                 |
| `TZ`                                                             | `Asia/Jakarta`                              |                                                 |

---

## 8. Risiko & catatan yang perlu Anda putuskan

1. **Backfill welcome menandai SEMUA kontak yang punya pesan sebagai "sudah disambut".** Konsekuensinya kontak yang belum pernah dapat welcome di bawah logika lama juga tidak akan dapat. Ini disengaja (mencegah spam massal), tapi perlu Anda sadari.
2. **Urutan deploy kritis.** Migrasi harus jalan sebelum kode. `start.sh` sudah benar; kalau deploy manual, jangan dibalik.


1. **Roadmap live-test Anda sebagian sudah basi.** `ROADMAP-LIVE-TEST.md` masih memuat phase yang dipensiunkan di branch ini:
   - **L5-01 "Search message"** → endpoint search sudah dihapus (REQ-05). Test ini tidak valid.
   - **L7 "Labels & Contacts"** → Contacts & Labels sudah dihapus (REQ-03). Tidak valid.
   - **L8 "Media Manager"** → Media Manager dihapus (REQ-01). Hanya upload media via API yang masih berlaku.
   - **L10 "Segment & Campaign"** → permukaan Campaigns sudah dipensiunkan. Mesinnya masih ada di `runtime.ts`, tapi tidak ada UI/API publik.
   - **L14** menyebut `segments`, `campaigns`, `contact-tags`, `contacts/profile` → endpoint ini sudah tidak ada.
   Sebaiknya roadmap diperbarui sebelum dijalankan, supaya tidak ada langkah QA untuk route yang tidak eksis.
2. **B2 milik operator, bukan tenant.** Upload lewat aplikasi (bukti bayar, gambar broadcast) tetap ke B2; media tenant tidak lagi diunduh otomatis.
3. **`npm audit` dan `npm run build` belum dijalankan di sesi QA kemarin** (build butuh ~7 menit). Jalankan `npm audit` di VPS sebagai bagian preflight.

---

## 9. Urutan ringkas (TL;DR)

```
A. backup:create → backup:verify → catat state → cek .env
B. (opsional) commit 2 file fix → release:preflight → git pull
   → ./start.sh (migrate DULU, baru build, baru pm2 reload)
C. curl health → cek V1..V10 → lanjut L0 → L1 → L2 (P0)
D. kalau gagal: git checkout hash-lama → build → pm2 reload (kolom welcomedAt dibiarkan)
```
