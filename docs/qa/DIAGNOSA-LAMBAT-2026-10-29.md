# Kenapa wagateway terasa berat — hasil pengukuran 29 Oktober 2026

Keluhan: halaman berputar lama, terutama **Perangkat & QR** setelah logout.
Internet pengguna 100 Mbps kabel, bandwidth VPS baru terpakai 5,5 GB dari
1.536 GB.

Kesimpulan singkat: **bukan internet Anda dan bukan bandwidth.** Yang lambat
adalah pemrosesan di server — setiap permintaan butuh waktu lama sebelum data
pertama dikirim.

---

## Angka yang saya ukur (12:00–12:05 UTC)

| Yang diakses | Waktu sampai byte pertama |
| --- | --- |
| File CSS statis 125 KB | 0,21 – 1,01 detik |
| `/api/health/live` (tanpa database) | 0,55 – 1,56 detik |
| `/api/health/ready` (satu query) | 1,76 detik |
| `/api/plans` (ditolak 401) | 1,11 detik |
| `/api/billing/summary` | 4,25 detik |
| `/api/notifications` | 3,50 detik |
| **`/api/sessions` (halaman Perangkat & QR)** | **8,2 → 14,2 → 17,1 detik** |
| Situs marketing (aplikasi terpisah) | 0,78 detik |

Metrik server saat pengukuran:

| Metrik | Nilai |
| --- | --- |
| Latensi database (query kesiapan) | 584 ms → **1.891 ms** |
| CPU | 61 % |
| RAM terpakai | 75 % |
| Dead-letter webhook | **5.747** |
| Dead-letter auto-reply | 53 |

---

## Cara membacanya

- **File statis** pun butuh ±1 detik. File statis tidak menyentuh database, jadi
  lambatnya bukan soal query saja — proses Node-nya sendiri sedang sibuk.
- **Satu query sederhana** butuh 1,2–1,9 detik. Database lokal seharusnya
  menjawab dalam hitungan milidetik.
- Halaman yang menjalankan beberapa query berurutan jadi ikut menumpuk:
  Tagihan 4 detik, Notifikasi 3,5 detik, dan **Perangkat & QR 8–17 detik**.
- Halaman Perangkat & QR paling parah karena setiap sesi juga menghitung jumlah
  kontak, pesan, dan grup — query hitung pada tabel besar, diulang per sesi.

Bandwidth tidak berhubungan dengan ini. Bandwidth menentukan *berapa banyak* data
yang bisa lewat; keluhan Anda soal *berapa lama menunggu* — itu latency, dan
latency-nya ada di server, bukan di kabel Anda.

---

## Dugaan penyebab, berurutan dari paling mungkin

1. **Server kehabisan RAM dan memakai swap.** VPS ini 3,6 GB dan dipakai
   bersama MariaDB, php-fpm, panel, dan Node. Riwayat 27–28 Okt menunjukkan swap
   hampir penuh (3,7 GB dari 4 GB). Kalau data aplikasi terlempar ke swap,
   database melambat persis seperti ini.
2. **MariaDB tidak punya cukup cache.** Kalau `innodb_buffer_pool_size` kecil,
   setiap query membaca disk.
3. **Enam worker berjalan di proses yang sama dengan web**, masing-masing
   mengecek antrean tiap detik. Saat database lambat, worker memenuhi antrean
   query dan permintaan halaman ikut mengantre.
4. **Tabel webhook delivery menumpuk 5.747 baris dead-letter.** Ini bukan
   penyebab utama, tetapi menambah beban hitung dan sebaiknya dibersihkan.

---

## Yang perlu dijalankan di server (butuh akses Anda)

Saya tidak punya kunci SSH ke produksi, jadi ini perlu dijalankan sebagai root:

```bash
free -m
vmstat 1 5
iostat -x 1 3
```

Cara membaca:

- `free -m` → lihat baris **Swap: used**. Kalau hampir penuh, dugaan nomor 1
  benar.
- `vmstat 1 5` → lihat kolom **si** dan **so**. Kalau ada angka selain 0,
  server sedang memindahkan data ke/dari swap.
- `iostat -x 1 3` → lihat kolom **%util** pada disk. Kalau mendekati 100,
  disknya yang jadi botol.

Lalu database:

```bash
mysql -e "SHOW GLOBAL VARIABLES LIKE 'innodb_buffer_pool_size';"
mysql -e "SHOW GLOBAL STATUS LIKE 'Threads_connected';"
mysql -e "SHOW FULL PROCESSLIST;" | head -20
```

- `innodb_buffer_pool_size` di bawah 256 MB untuk database sebesar ini terlalu
  kecil.
- `Threads_connected` puluhan bersamaan menandakan koneksi menumpuk.
- `PROCESSLIST` menunjukkan apakah ada query yang menggantung.

---

## Tindakan yang disarankan, dari yang paling murah

1. **Restart aplikasi pada jam sepi** (`pm2 restart pesanpro`). Ini membebaskan
   memori proses dan memutus koneksi database yang menggantung. Efeknya sementara,
   tapi biasanya langsung terasa.
2. **Bersihkan dead-letter** webhook dan auto-reply lewat SQL. Saya bisa
   siapkan perintahnya kalau Anda mau.
3. **Naikkan `innodb_buffer_pool_size`** (misal 512 MB) di konfigurasi MariaDB,
   lalu restart database pada jam sepi.
4. **Tambah RAM VPS** atau pisahkan database ke instance sendiri. Dengan 3,6 GB
   yang dipakai bersama panel dan php-fpm, aplikasi ini memang sesak.
5. Kalau langkah 1–4 belum cukup, **kurangi frekuensi polling worker** atau
   jalankan worker di proses terpisah supaya tidak berebut dengan halaman web.

Catatan: angka di atas saya ambil saat trafik rendah. Artinya kondisi normalnya
sudah lambat, dan akan makin terasa saat ada pemakaian bersamaan.
