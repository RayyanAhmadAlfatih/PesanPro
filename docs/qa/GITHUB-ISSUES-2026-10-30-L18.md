# L18 — Resilience / Production Gate (30 Okt 2026)

Phase terakhir sebelum klaim production-ready. Tes dipisah: **yang bisa dari luar**
(sudah dijalankan) dan **yang wajib di VPS** (butuh restart/kill/DB/backup).

## Sudah PASS dari luar (tanpa akses VPS)

| ID | Status | Bukti |
| --- | --- | --- |
| L18-21 | PASS | Scan `src/` untuk log rahasia: 9 kecocokan hanya boolean/nama (`secret=yes/no`, `secretType`, `tokenCount`, `cookieName`), tidak ada nilai secret |
| L18-22 | PASS | `/.env`, `/.env.local`, `/.git/config`, `/prisma/schema.prisma`, `/package.json`, `/backup.sql`, `/docker-compose.yml` → **404** |
| L18-23 | PASS | Payload rusak ke `/api/auth/register|forgot-password|reset-password` → error generik, tanpa stack trace/path |
| L18-24 | PASS | iPhone 14 (390x844): dashboard render normal (banner + kartu), tidak ada UI terblokir |
| L18-25 | PASS | Desktop (settings, pengumuman, users) & mobile (dashboard) flow normal |
| L18-26 | PASS (sebagian) | Console: `Socket connected for notifications`, tanpa error. Observasi singkat, bukan berjam-jam |

## Wajib di VPS (L18-01 s.d. L18-20)

Semua tes di bawah butuh akses proses/DB di server. Jalankan sebagai `pesanpro`
(kecuali yang butuh root).

### A. Restart dengan pekerjaan di antrean (L18-01..06)

```bash
# Siapkan 1 pesan uji ke nomor QA (6283877315731) lewat API/UI, lalu:
su - pesanpro && cd /www/wwwroot/PesanPro

# L18-01: restart app saat ada job QUEUED/PROCESSING
pm2 restart pesanpro
# bukti: job tetap ada, tidak hilang, tidak dobel (cek /api/v1/messages atau dashboard Antrian)

# L18-02..06: worker embedded ikut restart bersama app.
# Verifikasi tiap worker pulih:
pm2 logs pesanpro --lines 200 --nostream | grep -E "Stopped embedded|recovered|connected and synced"
```

Bukti yang dicari: `recovered N claim(s)`, tidak ada baris ganda, `MessageJob` tidak hilang.

### B. Kill saat PROCESSING (L18-07/08)

```bash
# Cukup kill -9 proses Node saat ada job PROCESSING, lalu PM2 menyalakan ulang
pm2 list
kill -9 <PID_PESANPRO>
sleep 15
pm2 logs pesanpro --lines 100 --nostream | grep -iE "stale|lease|recover|PROCESSING"
```
Bukti: job yang tadinya PROCESSING kembali ke QUEUED/retry, **tidak** dobel terkirim.

### C. DB disconnect / reconnect (L18-09/10)

```bash
# Hentikan DB sebentar (root)
systemctl stop mariadb     # atau: mysqladmin shutdown
sleep 20
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/health/ready   # harus gagal anggun
systemctl start mariadb
sleep 20
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/health/ready   # harus 200
pm2 logs pesanpro --lines 100 --nostream | grep -iE "Can't reach|recover|connected"
```

### D. Backup / restore drill (L18-12/13)

```bash
# Backup
mysqldump --single-transaction --routines --triggers pesanpro > /root/pesanpro-$(date +%F).sql
ls -lh /root/pesanpro-$(date +%F).sql

# Restore ke DB uji (JANGAN ke DB produksi)
mysql -e "CREATE DATABASE pesanpro_restore_test"
mysql pesanpro_restore_test < /root/pesanpro-$(date +%F).sql
mysql pesanpro_restore_test -e "SELECT COUNT(*) FROM User; SELECT COUNT(*) FROM Session;"
# verifikasi angka masuk akal, lalu drop DB uji
mysql -e "DROP DATABASE pesanpro_restore_test"
```

### E. Queue backlog 100 job (L18-15)

Buat 100 pesan uji ke nomor QA lewat API (jangan ke pelanggan), lalu pantau:
```bash
pm2 logs pesanpro --lines 200 --nostream | grep -iE "error|dead.?letter|retry"
```
Bukti: tidak crash, tidak ada dead-letter baru yang tak terkendali.

### F. Quota & idempotency (L18-16/17)

- **Quota:** pakai API key tenant uji, kirim paralel melebihi kuota → harus ditolak, tidak overshoot.
- **Idempotency:** kirim 2 request identik paralel dengan `Idempotency-Key` sama → hanya 1 operasi logis.

### G. Webhook down → up (L18-18)

Arahkan webhook tenant uji ke `https://webhook.site/<token>`, matikan receiver,
kirim event, lalu hidupkan lagi. Bukti: delivery `RETRYING` → `SUCCESS`, tidak dobel.

### H. WA disconnect → reconnect (L18-19)

Putuskan koneksi WhatsApp (matikan jaringan/`logout`), lalu sambungkan lagi.
Bukti: sesi kembali `CONNECTED`, job yang tertunda diproses, tidak dobel.

### I. Tenant isolation regression (L18-20)

Login tenant A & B, lalu tukar-tukar ID resource (session, message, webhook,
autoreply, media, broadcast). Semua akses silang harus **403/404 generik**.
(Ini butuh kredensial tenant A/B; bisa dijalankan lewat UI atau curl.)

## Catatan

- Tes A–E menyentuh proses/DB produksi. Jalankan di jam sepi dan siapkan
  `pm2 restart pesanpro` bila app macet.
- Insiden 30 Okt (php-fpm storm → MariaDB tidak terjangkau → 502) menunjukkan
  tes C (DB disconnect) **sudah terbukti secara tidak sengaja**: app gagal
  anggun dan pulih setelah DB kembali.
