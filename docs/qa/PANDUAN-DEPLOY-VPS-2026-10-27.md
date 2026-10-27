# Panduan Deploy VPS — user `pesanpro`, direktori `/www/wwwroot/PesanPro`

Dibuat: 27 Oktober 2026. Dipakai untuk menarik branch
`workbuddy-fase0-qa-2026-10-23` (commit terakhir `6db1acb`) ke server produksi.

**Tidak ada migrasi database** pada deploy ini, jadi cukup pull → build → restart.

---

## Aturan keselamatan (baca dulu)

1. **Login SSH sebagai `pesanpro`, bukan root.** Proses PM2 milik user `pesanpro`;
   kalau dijalankan sebagai root, `pm2` akan menampilkan daftar proses yang salah.
   Kalau Anda sedang root, pakai `su - pesanpro` dulu.
2. **Jangan restart sebelum build terbukti selesai.** Kejadian 24 Okt: `.next`
   dipindah, build gagal, aplikasi 502 karena tidak ada build untuk dijalankan.
3. **Jangan tutup sesi SSH selama build.** Build 5–13 menit; kalau koneksi putus,
   proses ikut mati.
4. Kalau `git status` menunjukkan perubahan lokal yang tidak Anda kenal, **stop**
   dan lapor — jangan `git checkout -- .` atau `git reset --hard`.

---

## Langkah 1 — Catat keadaan sekarang

```bash
su - pesanpro
cd /www/wwwroot/PesanPro

git branch --show-current
git rev-parse --short HEAD
git status --short
pm2 status pesanpro
```

Yang diharapkan: branch `workbuddy-fase0-qa-2026-10-23`, `git status` kosong.
Catat commit hash-nya — kalau ada masalah, ini patokan rollback.

---

## Langkah 2 — Tarik kode terbaru

```bash
git fetch origin
git checkout workbuddy-fase0-qa-2026-10-23
git pull --ff-only origin workbuddy-fase0-qa-2026-10-23
git log --oneline -6
```

Yang diharapkan: `git log` menampilkan `6db1acb` di daftar teratas (kalau commit
panduan ikut tertarik, `fa0764f` muncul paling atas — tidak berpengaruh ke build),
lalu `e08fbb1`, `3f3f74d`, `4402f8b`.

Kalau `git pull` menolak karena ada perubahan lokal, **berhenti** dan lapor isi
`git status --short`. Jangan dipaksa dengan `git reset`.

---

## Langkah 3 — Cek apakah perlu install / migrasi

```bash
git diff --name-only HEAD@{1} HEAD | grep -E 'package(-lock)?\.json|prisma/schema\.prisma' || echo "tidak ada perubahan dependensi/skema"
```

- Kalau **tidak ada** keluaran (kondisi deploy ini): lanjut ke langkah 4.
- Kalau `package-lock.json` berubah: `npm ci` (2–4 menit).
- Kalau `prisma/schema.prisma` berubah: `npx prisma migrate deploy && npx prisma generate`.

---

## Langkah 4 — Siapkan ruang

```bash
df -h . | tail -1
free -m | head -2
mv .next .next.prev-$(date +%s)
ls -d .next.prev-* | tail -3
```

Syarat aman: sisa disk **≥ 3 GB**, RAM tersedia **≥ 2,5 GB**. Kalau kurang,
hentikan dan lapor.

---

## Langkah 5 — Build (5–13 menit)

```bash
node --max-old-space-size=3072 node_modules/next/dist/bin/next build --webpack > /tmp/pesanpro-build.log 2>&1; echo "EXIT=$?"
tail -12 /tmp/pesanpro-build.log
```

Jangan pakai `npm run build` — script-nya memaku heap 2048 dan OOM di server ini.

**Build dianggap berhasil hanya kalau `EXIT=0`** dan log memuat baris
`Compiled successfully` atau tabel `Route (app)`.

Kalau gagal → langsung ke bagian **Rollback**, jangan restart.

---

## Langkah 6 — Restart dan verifikasi

```bash
pm2 restart pesanpro
pm2 status pesanpro
sleep 25
curl -s -o /dev/null -w "health=%{http_code}\n" http://127.0.0.1:3000/api/health/live
```

Lalu dari komputer Anda:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://wagateway.kingofcoding.my.id/api/health/live
curl -s -o /dev/null -w "%{http_code}\n" https://wagateway.kingofcoding.my.id/auth/login
```

Yang diharapkan: `200` untuk keduanya. Sekitar 30 detik setelah restart biasanya
sempat muncul 502 — itu normal, tunggu lalu cek ulang.

Terakhir, buka dashboard dan pastikan sesi WhatsApp kembali `CONNECTED`
(butuh ±10–30 detik; pemulihan otomatis akan mencoba sendiri).

---

## Rollback (kalau build gagal)

```bash
cd /www/wwwroot/PesanPro
mv .next .next.gagal-$(date +%s)
mv .next.prev-<angka-yang-dicatat-di-langkah-4> .next
pm2 restart pesanpro
pm2 status pesanpro
```

Setelah itu `git checkout <commit-hash-lama>` bila kode baru ikut bermasalah.

---

## Setelah selesai

Kirim ke saya: hasil `EXIT`, 6 baris `git log`, dan status health. Saya lanjut
retest L13-15 (edit) dan L13-16 (hapus) memakai HP.

**L13-31 (restart worker) belum dilakukan di sini** — tes itu dijalankan paling
akhir, satu per satu, setelah tes lain selesai.
