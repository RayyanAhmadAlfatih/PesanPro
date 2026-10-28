# Pemulihan VPS setelah OOM — 27 Oktober 2026

## Yang terlihat dari luar (bukti)

| Waktu | Pemeriksaan | Hasil |
| --- | --- | --- |
| 18:23 | `/api/health/live`, `/auth/login`, `/` | timeout total (60 detik tanpa respons) |
| 18:23 | Permintaan langsung ke `43.156.166.93` | tidak ada respons; SSH `timed out during banner exchange` |
| 18:23 | Ping ke IP server | 26 ms, 0% loss → mesin hidup |
| 18:23 | Port 22, 80, 443, 7800 | terbuka; port **3000 tertutup** |
| 18:30 | `/api/health/live` | **502 dalam 0,14 detik** (nginx sudah sehat) |
| 18:30 | Port 3000 | masih tertutup → proses Node mati |

Kesimpulan: fase thrash sudah lewat (nginx kembali menjawab cepat), yang tersisa
adalah **aplikasi Node mati** — kemungkinan besar dibunuh OOM killer saat build.
Ini bukan nginx mati: nginx hidup dan menjawab `502` karena tidak ada yang
mendengarkan di port 3000.

Catatan akses: SSH ke `43.156.166.93` sekarang merespons, tetapi tidak ada kunci
di mesin ini yang diizinkan (`Permission denied (publickey)` untuk root maupun
`pesanpro`). Jadi langkah di bawah perlu dijalankan dari sisi Anda.

---

## Langkah 1 — Masuk ke server

SSH seharusnya sudah bisa lagi sekarang (mesin sudah tidak menggantung). Kalau
masih menggantung, pakai **konsol penyedia VPS (VNC)** atau **terminal aaPanel**
di `https://43.156.166.93:7800`.

---

## Langkah 2 — Diagnosa 60 detik (setelah masuk)

```bash
free -m
swapon --show
dmesg -T | grep -iE "out of memory|killed process" | tail -15
ps aux --sort=-%mem | head -8
df -h /
ls -ld /www/wwwroot/PesanPro/.next*
pm2 status
```

Yang dicari:

- `dmesg` menyebut `Killed process ... (node)` → OOM killer membunuh build atau aplikasi.
- `free -m` menunjukkan `available` hampir 0 dan `swap` penuh.
- `.next` hilang atau `.next.prev-*` ada → build terhenti di tengah.

---

## Langkah 3 — Hidupkan situs dulu, jangan build lagi

```bash
su - pesanpro
cd /www/wwwroot/PesanPro
pm2 status
pkill -f "next build" 2>/dev/null   # kalau build masih menggantung
ls -l .next/BUILD_ID 2>/dev/null && echo "BUILD UTUH" || echo "BUILD TIDAK ADA"
ls -dt .next.prev-* | head -3
```

Pilih satu:

**a. `BUILD UTUH`** (`.next/BUILD_ID` ada) — kasus paling ringan, pulih ±30 detik:

```bash
pm2 start pesanpro
sleep 20
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/health/live
```

**b. `BUILD TIDAK ADA`** (`.next` hilang atau build terhenti):

```bash
mv .next .next.gagal-$(date +%s) 2>/dev/null
mv .next.prev-<ANGKA-TERBARU> .next
pm2 start pesanpro
sleep 20
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/health/live
```

Target: `200` dari health lokal, lalu `200` dari URL publik. **Situs harus hidup
dulu sebelum build ulang.**

---

## Langkah 4 — Tambah swap (sekali saja, permanen)

Cek dulu: `swapon --show`. Kalau sudah ada swap ≥2 GB, lewati langkah ini.

```bash
fallocate -l 4G /swapfile-pesanpro || dd if=/dev/zero of=/swapfile-pesanpro bs=1M count=4096
chmod 600 /swapfile-pesanpro
mkswap /swapfile-pesanpro
swapon /swapfile-pesanpro
free -m
grep -q swapfile-pesanpro /etc/fstab || echo '/swapfile-pesanpro none swap sw 0 0' >> /etc/fstab
```

Tanpa swap, build Next.js dengan heap 3072 MB akan OOM lagi di VPS ini — sudah
terbukti dua kali (24 Okt dan hari ini).

---

## Langkah 5 — Build ulang dengan aman

```bash
su - pesanpro
cd /www/wwwroot/PesanPro

pm2 stop pesanpro                                  # bebas ±750 MB selama build
mv .next .next.prev-$(date +%s)
node --max-old-space-size=3072 node_modules/next/dist/bin/next build --webpack > /tmp/pesanpro-build.log 2>&1; echo "EXIT=$?"
tail -5 /tmp/pesanpro-build.log
```

- `EXIT=0` + baris `Compiled successfully` → lanjut.
- Selain itu → rollback: `mv .next .next.gagal-$(date +%s) && mv .next.prev-<ANGKA> .next && pm2 start pesanpro`.

Kalau sukses:

```bash
pm2 start pesanpro
sleep 25
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/health/live
```

Kalau build **masih** OOM meski sudah ada swap 4 GB: naikkan swap ke 6–8 GB
(`swapoff /swapfile-pesanpro && rm /swapfile-pesanpro` lalu ulangi langkah 4
dengan `8G`), dan pastikan tidak ada proses lain (backup, cron) berjalan
bersamaan.

---

## Catatan penting

- `ecosystem.config.cjs` memasang `max_memory_restart: 750M` pada proses
  `pesanpro`. Saat memori server sempit, PM2 akan terus me-restart aplikasi —
  kalau `pm2 status` menunjukkan restart naik terus tanpa henti, penyebabnya
  tekanan memori server, bukan bug aplikasi.
- Aplikasi berjalan lewat `tsx` (`node_modules/tsx/dist/cli.mjs src/server/index.ts`)
  dengan heap 512 MB, jadi kebutuhan RAM normal ±300–500 MB. Yang berat hanya
  proses build.
- Setelah semuanya pulih, baru lanjut tes L13 (edit/hapus pesan) satu per satu.
  L13-31 (restart worker) tetap paling akhir.

---

## Bagian 6 — Build masih dibunuh (EXIT=137), 27 Okt 18:40

Fakta dari sesi pemilik:

- `pm2 stop all` sudah dilakukan, jadi bukan aplikasi yang menekan memori.
- `free -m`: RAM 3659 MB (available 2833), **swap 4035 MB sudah ada** (1212 MB terpakai).
- `mv .next .next.prev-<ts>` berhasil, artinya `.next` ada — tetapi `.next/BUILD_ID`
  tidak ada, jadi build lama memang **tidak utuh** (build sebelumnya menimpa
  `.next` yang sedang dipakai → itu sebab 502 pertama).
- Build heap 3072 → `Killed`, `EXIT=137` (SIGKILL).
- `pm2 start pesanpro` → status `online` tetapi port 3000 tetap tertutup:
  aplikasi tidak bisa melayani tanpa `.next`.

`next.config.mjs` sudah memaksa hemat memori (`experimental.cpus: 1`,
`webpackMemoryOptimizations: true`, `config.parallelism = 1`), jadi penyebabnya
bukan paralelisme build.

### Cek siapa yang membunuh (30 detik)

```bash
dmesg -T | grep -iE "out of memory|killed process" | tail -5
journalctl -u systemd-oomd --since "30 min ago" 2>/dev/null | tail -10
cat /sys/fs/cgroup/memory.max 2>/dev/null
cat /sys/fs/cgroup/memory.swap.max 2>/dev/null
```

- `Killed process ... node` → OOM killer kernel.
- `Killed /user.slice/... due to memory pressure` → **systemd-oomd** (Ubuntu
  22.04+). Ini yang paling mungkin: swap membuat thrash, tekanan memori naik,
  oomd membunuh build walau masih ada RAM bebas.
- `memory.max` ≈ 4 GB dan `memory.swap.max` = 0 → swap tidak boleh dipakai
  service; peak harus diturunkan, bukan swap ditambah.

### Urutan percobaan

**A. Turunkan peak (coba dulu, 5–13 menit)**

```bash
cd /www/wwwroot/PesanPro
pm2 stop pesanpro
mv .next .next.gagal-$(date +%s) 2>/dev/null
node --max-old-space-size=2560 --max-semi-space-size=16 \
  node_modules/next/dist/bin/next build --webpack > /tmp/pesanpro-build.log 2>&1; echo "EXIT=$?"
tail -5 /tmp/pesanpro-build.log
```

**B. Kalau masih `Killed`** — matikan systemd-oomd hanya selama build:

```bash
sudo systemctl stop systemd-oomd systemd-oomd.socket
# ulangi perintah build di A
sudo systemctl start systemd-oomd systemd-oomd.socket
```

**C. Kalau masih `Killed`** — build dengan Turbopack (heap jauh lebih kecil):

```bash
node --max-old-space-size=2048 node_modules/next/dist/bin/next build --turbopack
```

Kalau Turbopack menolak konfigurasi proyek, kembali ke webpack dan naikkan swap
lewat root: `fallocate -l 8G /swapfile2 && chmod 600 /swapfile2 && mkswap /swapfile2
&& swapon /swapfile2` (butuh root, bukan user `pesanpro`).

### Setelah build sukses

```bash
pm2 start pesanpro
sleep 25
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/health/live
```

Kalau `pm2` bilang `online` tetapi port tetap tertutup:
`pm2 logs pesanpro --lines 30 --nostream` — biasanya
`Could not find a production build in the '.next' directory`.

### Update 18:55 — heap 2560 juga dibunuh

`node --max-old-space-size=2560 --max-semi-space-size=16 ... build --webpack`
→ `Killed`, `EXIT=137`, log berhenti di `Creating an optimized production build ...`
(mati sangat awal, RAM host baru terpakai 26,7%).

Kalau proses mati sebelum memori sempat naik, penyebabnya bukan kebutuhan heap
Node, melainkan **pembunuh eksternal**: cgroup `memory.max`, `systemd-oomd`, atau
penjaga proses dari panel/penyedia. Karena itu urutannya sekarang: diagnosa dulu,
lalu Turbopack, lalu tambah swap dari root.

---

## Bagian 7 — 28 Okt 07:00: memori sudah habis sebelum build

`free -m` di server:

```
Mem: 3659 total, 3411 used, 125 free, available 248
Swap: 4035 total, 3789 used, 246 free
```

Artinya mesin **sudah kehabisan memori sebelum build dimulai** (swap 94% terpakai,
sisa 248 MB). Itu sebabnya build mati dalam hitungan detik: bukan heap Node,
tetapi tidak ada ruang sama sekali. Sebelum build apa pun, memori harus dibebaskan.

`dmesg` dan `/sys/fs/cgroup/memory.max` tidak bisa dibaca sebagai user `pesanpro`
(perlu root; di mesin ini cgroup v1 sehingga path-nya berbeda).

### Bebaskan memori dulu

```bash
ps aux --sort=-%mem | head -8
pkill -9 -f "next build"
pkill -9 -f "next/dist/bin/next"
pm2 list
free -m
```

Yang biasanya memakan tempat: sisa proses build yang menggantung, `mysqld`,
panel, atau proses aplikasi yang restart terus. Target: `available` ≥ 2,5 GB
sebelum build.

Kalau `mysqld` yang besar dan situs sedang mati, MySQL boleh dihentikan sementara
selama build (`systemctl stop mysql`), lalu dinyalakan lagi sebelum
`pm2 start pesanpro`.

---

## Bagian 8 — Opsi "numpang build" di VPS lain

Boleh, dan ini cara yang paling aman kalau RAM 3,6 GB memang tidak cukup.
Syaratnya ketat supaya hasil build bisa dipakai di produksi:

| Syarat | Alasan |
| --- | --- |
| Commit yang sama (`e626746`) | kode dan hash build harus identik |
| Node **major** sama (v22.x) | format output dan perilaku runtime |
| `.env` produksi dibawa ke mesin build | `NEXT_PUBLIC_*` ikut dibakar ke bundle klien |
| Hanya `.next` yang dipindah | `node_modules` produksi sudah benar (modul native Linux) |
| Ekstrak sebagai user `pesanpro` | kalau root, file jadi milik root dan app gagal menulis cache |

### Di VPS build (Ubuntu, RAM ≥ 4 GB, Node 22)

```bash
git clone git@github.com:RayyanAhmadAlfatih/PesanPro.git /tmp/pp-build
cd /tmp/pp-build
git checkout e626746
npm ci
scp pesanpro@43.156.166.93:/www/wwwroot/PesanPro/.env .env   # butuh akses SSH ke prod
node --max-old-space-size=3072 node_modules/next/dist/bin/next build --webpack
ls -l .next/BUILD_ID
```

### Pindahkan ke produksi

```bash
# dari VPS build
rsync -az --delete /tmp/pp-build/.next/ pesanpro@43.156.166.93:/www/wwwroot/PesanPro/.next/

# di produksi
cd /www/wwwroot/PesanPro
pm2 stop pesanpro
ls -l .next/BUILD_ID
pm2 start pesanpro
sleep 25
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/health/live
```

Kalau `prisma/schema.prisma` berubah sejak instalasi terakhir, jalankan
`npx prisma generate` di produksi setelah `.next` dipindah. Untuk deploy ini
schemanya tidak berubah, jadi tidak perlu.

**Jangan** menyalin `node_modules` dari VPS build — modul native (`sharp`,
`bcryptjs`) harus yang terpasang di produksi.
