# 09 — Paket, harga, dan margin

Dokumen ini menjelaskan paket yang berlaku, alasan di balik angkanya, dan hitungan margin agar harga tetap kompetitif tanpa membuat biaya VPS dan domain menelan keuntungan.

> **Sifat dokumen:** ini catatan bisnis internal. Angka biaya di bawah adalah **asumsi** yang harus Anda ganti dengan tagihan VPS, domain, dan backup yang sebenarnya. Jangan menampilkan tabel margin ke pelanggan.

## Matriks paket yang berlaku

| | **Starter** | **Bisnis** | **Pro** |
| --- | --- | --- | --- |
| Harga bulanan | **Rp20.000** | **Rp49.000** | **Rp99.000** |
| Harga tahunan (10×) | **Rp200.000** | **Rp490.000** | **Rp990.000** |
| Hemat tahunan | 2 bulan gratis | 2 bulan gratis | 2 bulan gratis |
| Perangkat WhatsApp | 1 | 3 | 5 |
| Pesan terkirim/bulan | 3.000 | 12.000 | 40.000 |
| Broadcast/bulan | 50 | 200 | 500 |
| Penerima per broadcast | 500 | 1.500 | 3.000 |
| Aturan auto-reply | 10 | 50 | Tanpa batas |
| Endpoint webhook | 2 | 5 | 15 |
| Kunci API | 2 | 5 | 10 |
| Pesan terjadwal | 20 | 100 | Tanpa batas |
| Ukuran maksimal per file | 50 MB | 75 MB | 100 MB |
| Penyimpanan media | 1 GB | 5 GB | 20 GB |
| Jeda minimum broadcast | 5 detik | 3 detik | 2 detik |
| Permintaan API/menit | 30 | 60 | 150 |

Semua paket mendapat:

- Akses REST API.
- Auto-reply dengan media.
- Broadcast dengan CSV, variabel, dan spintax.
- Webhook bertanda tangan.
- Pesan terjadwal.
- Dukungan dasar.

## Yang berubah dari paket lama

| | Lama | Baru |
| --- | --- | --- |
| Starter | Rp75.000 / 10.000 pesan / 1 device | **Rp20.000 / 3.000 pesan / 1 device** |
| Bisnis | Rp149.000 / 25.000 pesan / 3 device | **Rp49.000 / 12.000 pesan / 3 device** |
| Pro | Rp299.000 / 100.000 pesan / 10 device | **Rp99.000 / 40.000 pesan / 5 device** |
| Trial | 7 hari | **Dihapus** |
| Media | Tanpa batas | **1/5/20 GB + 50/75/100 MB per file** |

Harga masuk turun sekitar **73%**, tetapi batas pesan juga turun. Karena itu, paket baru menang di **harga per pesan**, bukan di harga total:

| Paket | Harga per pesan |
| --- | --- |
| Starter | Rp6,67 |
| Bisnis | Rp4,08 |
| Pro | Rp2,48 |

Sebagai pembanding, paket termurah Fonnte yang Anda sebutkan (Rp25.000 untuk 1.000 pesan) setara **Rp25 per pesan**. Artinya PesanPro 3,7–10× lebih murah per pesan. Angka pembanding ini perlu Anda verifikasi ulang sebelum dipakai di materi marketing.

## Mengapa tidak ada trial

1. **Biaya perangkat nyata.** Setiap nomor yang terhubung memakai RAM dan koneksi. Trial gratis membuka biaya tanpa pendapatan.
2. **Penyalahgunaan.** Gateway WhatsApp gratis mudah dipakai untuk spam. Tanpa paywall, risiko ini tinggi.
3. **Kualitas pelanggan.** Pengguna yang membayar sejak awal lebih serius dan lebih kecil kemungkinan churn.
4. **Posisi produk.** PesanPro adalah alat operasional, bukan mainan. Harga Rp20.000 sudah sangat rendah untuk uji coba berbayar.

Akun baru tetap bisa masuk dashboard dan melihat semua menu, tetapi pengiriman terkunci sampai pembayaran disetujui. Ini memberi pengalaman "coba sebelum bayar" tanpa membuka biaya.

## Struktur biaya

### Asumsi

| Komponen | Asumsi | Catatan |
| --- | --- | --- |
| VPS 4 vCPU / 4 GB | Rp250.000/bulan | Ganti dengan tagihan Anda |
| Kapasitas sesi per VPS | 20–25 sesi aktif | Tergantung RAM dan tuning |
| Domain `.my.id` | Rp150.000/tahun ≈ Rp12.500/bulan | |
| Backup B2 + monitoring + email | Rp37.500/bulan | |
| Storage B2 | ±Rp100/GB/bulan | |
| Biaya per pesan | ±Rp0 | Gateway tidak memakai API berbayar per pesan |
| Biaya pembayaran | Rp0 | Transfer manual |
| Dukungan | Belum dihitung | Waktu Anda sendiri |

**Fixed cost non-perangkat:** Rp50.000/bulan (domain + backup + monitoring).
**Biaya perangkat:** Rp10.000–12.500/bulan per sesi, tergantung kepadatan VPS.

### Mengapa perangkat, bukan pesan, yang mahal

Pesan teks hampir tidak menambah biaya: tidak ada tarif per pesan, dan CPU untuk satu pesan kecil. Yang mahal adalah **koneksi WhatsApp per nomor**, karena setiap sesi menyimpan state, kunci enkripsi, dan socket.

Konsekuensinya:

- Paket harus membatasi **jumlah perangkat**, bukan hanya pesan.
- Menambah perangkat adalah keputusan biaya, bukan sekadar fitur.
- Pesan bisa murah, tetapi perangkat tidak bisa gratis.

## Margin per paket

Dengan asumsi **25 sesi per VPS** (biaya perangkat Rp10.000):

| Paket | Harga | Biaya perangkat | Storage | Kontribusi | Margin |
| --- | --- | --- | --- | --- | --- |
| Starter | 20.000 | 10.000 | 100 | **9.900** | **49,5%** |
| Bisnis | 49.000 | 30.000 | 500 | **18.500** | **37,8%** |
| Pro | 99.000 | 50.000 | 2.000 | **47.000** | **47,5%** |

Dengan asumsi konservatif **20 sesi per VPS** (biaya perangkat Rp12.500):

| Paket | Harga | Biaya perangkat | Storage | Kontribusi | Margin |
| --- | --- | --- | --- | --- | --- |
| Starter | 20.000 | 12.500 | 100 | **7.400** | **37,0%** |
| Bisnis | 49.000 | 37.500 | 500 | **11.000** | **22,4%** |
| Pro | 99.000 | 62.500 | 2.000 | **34.500** | **34,8%** |

**Kesimpulan:** margin sangat sensitif terhadap jumlah sesi per VPS. Pada 25 sesi, margin sehat (38–50%). Pada 20 sesi, margin menipis (22–37%). Karena itu, kepadatan sesi adalah angka yang wajib diukur di produksi.

## Simulasi portofolio

Campuran pelanggan yang dipakai: **50% Starter, 30% Bisnis, 20% Pro**.

| Pelanggan | Pendapatan/bulan | Perangkat | VPS (25 sesi) | Biaya VPS | Fixed + storage | Laba | Margin |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | Rp445.000 | 24 | 1 | Rp250.000 | Rp56.000 | **Rp139.000** | **31,2%** |
| 20 | Rp890.000 | 48 | 2 | Rp500.000 | Rp62.000 | **Rp328.000** | **36,9%** |
| 50 | Rp2.225.000 | 120 | 5 | Rp1.250.000 | Rp80.000 | **Rp895.000** | **40,2%** |
| 100 | Rp4.450.000 | 240 | 10 | Rp2.500.000 | Rp110.000 | **Rp1.840.000** | **41,3%** |

Dengan skenario konservatif 20 sesi/VPS:

| Pelanggan | Pendapatan/bulan | VPS | Biaya VPS | Fixed + storage | Laba | Margin |
| --- | --- | --- | --- | --- | --- | --- |
| 20 | Rp890.000 | 3 | Rp750.000 | Rp62.000 | **Rp78.000** | **8,8%** |
| 50 | Rp2.225.000 | 6 | Rp1.500.000 | Rp80.000 | **Rp645.000** | **29,0%** |
| 100 | Rp4.450.000 | 12 | Rp3.000.000 | Rp110.000 | **Rp1.340.000** | **30,1%** |

**Titik impas:**

- Pada 25 sesi/VPS: sekitar **7–8 pelanggan** campuran.
- Pada 20 sesi/VPS: sekitar **18–20 pelanggan** campuran.

Artinya, pada awal launch, Anda perlu minimal sekitar 20 pelanggan berbayar sebelum benar-benar aman. Di bawah itu, biaya VPS masih menempel.

## Cara menjaga margin

### 1. Ukur kepadatan sesi, jangan menebak

Catat RAM proses setelah 20 sesi terhubung. Kalau RSS masih di bawah 60% RAM, tambah sesi. Kalau sudah di atas 75%, siapkan VPS baru.

Aturan operasional yang aman:

- **20 sesi/VPS** = batas aman.
- **25 sesi/VPS** = batas efisien.
- **>25 sesi/VPS** = hanya kalau hasil ukur mendukung.

### 2. Jual tahunan untuk arus kas

Paket tahunan = 10× bulanan. Anda memberi diskon 17%, tetapi mendapat uang di depan untuk membeli VPS dan domain. Ini membantu kas, bukan menaikkan margin per bulan.

### 3. Dorong paket Bisnis

Kontribusi absolut per pelanggan:

- Starter: Rp9.900
- Bisnis: Rp18.500
- Pro: Rp47.000

Bisnis adalah titik seimbang: harga masih terjangkau, perangkat cukup untuk banyak UMKM, dan kontribusi hampir dua kali Starter. Jadikan Bisnis paket yang paling sering direkomendasikan.

### 4. Jangan menambah perangkat gratis

Perangkat adalah biaya. Kalau pelanggan butuh lebih banyak nomor:

- Naikkan ke paket berikutnya, atau
- Jual add-on perangkat (misalnya Rp10.000–15.000/perangkat/bulan).

Add-on belum diimplementasikan di aplikasi. Ini rekomendasi bisnis untuk iterasi berikutnya.

### 5. Jaga retensi media

Media 30 hari sudah tepat. Jangan menaikkan retensi tanpa menaikkan harga. Penyimpanan memang murah, tetapi backup dan bandwidth tetap punya biaya.

### 6. Otomasi verifikasi pembayaran saat volume naik

Verifikasi manual tidak punya biaya transaksi, tetapi memakan waktu. Di atas ±100 pelanggan, pertimbangkan payment gateway. Biaya 2–3% masih wajar dibanding waktu yang dihemat, tetapi harus dimasukkan ke harga.

### 7. Hindari perang harga di bawah Rp20.000

Di bawah Rp20.000, margin perangkat hampir habis. Kalau perlu menarik pelanggan, gunakan:

- Diskon tahunan.
- Bonus kuota pesan sekali, bukan harga lebih murah permanen.
- Paket komunitas/agensi dengan komitmen volume.

## Perbandingan posisi harga

| | PesanPro Starter | Fonnte termurah (data Anda) |
| --- | --- | --- |
| Harga | Rp20.000 | Rp25.000 |
| Pesan | 3.000 | 1.000 |
| Harga per pesan | Rp6,67 | Rp25 |
| Perangkat | 1 | 1 (umumnya) |
| API | Termasuk | Tergantung paket |

Keunggulan PesanPro:

- Harga per pesan jauh lebih rendah.
- API dan webhook termasuk di semua paket.
- Auto-reply dan broadcast dengan personalisasi.
- Dukungan bahasa Indonesia.

Kelemahan yang harus diakui:

- Merek belum dikenal.
- Gateway berbasis Baileys, bukan WhatsApp Business API resmi.
- Belum ada payment gateway otomatis.
- Kapasitas awal terbatas pada VPS yang tersedia.

## Rekomendasi angka

Kalau Anda ingin margin lebih tebal tanpa menaikkan harga headline:

| Langkah | Dampak |
| --- | --- |
| Tetap 1/3/5 perangkat | Menjaga biaya terkendali |
| Tambah add-on perangkat Rp10.000 | Menutup biaya perangkat tambahan |
| Dorong tahunan | Kas di depan |
| Jaga 25 sesi/VPS | Margin 38–50% |
| Naikkan Starter ke Rp25.000 nanti | +Rp5.000 kontribusi per pelanggan |
| Naikkan Bisnis ke Rp59.000 nanti | +Rp10.000 kontribusi per pelanggan |

Jangan menaikkan harga sebelum:

1. Ada minimal 30 pelanggan berbayar.
2. churn bulanan di bawah 5%.
3. Ada bukti kapasitas dan stabilitas.

## Metrik yang wajib dipantau

1. **Pelanggan berbayar aktif** per paket.
2. **Perangkat aktif** per VPS.
3. **Pesan terkirim** per bulan (untuk melihat paket mana yang paling terpakai).
4. **Pemakaian storage** per tenant.
5. **Tingkat gagal kirim** dan kode error terbanyak.
6. **Waktu verifikasi pembayaran** (target < 12 jam).
7. **Churn** dan alasan berhenti.
8. **Biaya VPS + domain + backup** aktual, bukan asumsi.

Isi `MONTHLY_INFRA_COST_IDR` di environment produksi dengan biaya aktual. Dashboard admin memakai angka itu untuk estimasi laba.

## Ringkasan satu paragraf

Paket Rp20.000/49.000/99.000 layak secara bisnis **kalau** kepadatan sesi minimal 20–25 per VPS dan Anda mendorong paket Bisnis. Pada 50 pelanggan campuran, laba sekitar Rp645.000–895.000/bulan (29–40%). Pada 100 pelanggan, sekitar Rp1,34–1,84 juta/bulan (30–41%). Titik impas 7–20 pelanggan, tergantung kepadatan. Jangan menambah perangkat gratis, jangan menurunkan harga di bawah Rp20.000, dan ukur biaya VPS sebenarnya sebelum menetapkan diskon tambahan.
