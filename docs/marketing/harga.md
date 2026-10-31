# Halaman Harga (/harga)

## FAKTA

- Harga resmi v0.2.0: Starter Rp20.000, Bisnis Rp49.000, Pro Rp99.000 per bulan.
- Tahunan = 10x bulanan: Rp200.000, Rp490.000, Rp990.000. Artinya membayar 10 bulan untuk 12 bulan pemakaian.
- Pembayaran manual lewat transfer, unggah bukti, lalu menunggu persetujuan admin.
- Akun baru berstatus PENDING. Dashboard dan Tagihan bisa dibuka, tetapi pengiriman, auto-reply, webhook, dan upload media aktif setelah pembayaran disetujui.
- Batas upload per file: 50 MB, 75 MB, 100 MB. Video WhatsApp tetap dibatasi 16 MB oleh WhatsApp. Dokumen maksimal 100 MB.
- Tidak ada trial, paket gratis, diskon lain, atau lifetime.
- Materi menunggu deploy v0.2.0.

## DRAF

> **Status: DRAF.** Hanya boleh publish setelah v0.2.0 live dan migrasi database selesai.

### Judul

**H1:** Harga PesanPro

**Subjudul:** Semua paket mendapat fitur yang sama. Yang berbeda adalah batas pemakaian. Bayar bulanan atau tahunan, lalu aktifkan akun dengan transfer dan bukti pembayaran.

### Tabel harga

| | Starter | Bisnis | Pro |
| --- | --- | --- | --- |
| **Bulanan** | **Rp20.000** | **Rp49.000** | **Rp99.000** |
| **Tahunan (10x bulanan)** | **Rp200.000** | **Rp490.000** | **Rp990.000** |
| Perangkat WhatsApp | 1 | 3 | 5 |
| Pesan/bulan | 3.000 | 12.000 | 40.000 |
| Broadcast/bulan | 50 | 200 | 500 |
| Penerima/broadcast | 500 | 1.500 | 3.000 |
| Auto-reply | 10 | 50 | Tanpa batas |
| Webhook | 2 | 5 | 15 |
| Kunci API | 2 | 5 | 10 |
| Pesan terjadwal | 20 | 100 | Tanpa batas |
| Upload per file | 50 MB | 75 MB | 100 MB |
| Storage | 1 GB | 5 GB | 20 GB |
| Jeda minimum broadcast | 5 detik | 3 detik | 2 detik |

**Tombol:** Daftar

### Cara bayar

1. **Daftar dan pilih paket.**
   Isi data akun, pilih paket, lalu pilih periode bulanan atau tahunan.

2. **Transfer ke rekening tujuan.**
   Rekening tujuan tampil otomatis di halaman daftar. Transfer tepat sebesar nominal yang tertera.

3. **Unggah bukti transfer.**
   Unggah foto atau PDF bukti transfer, maksimal 5 MB. Isi nama pengirim atau kode referensi agar admin mudah mencocokkan.

4. **Tunggu persetujuan admin.**
   Akun berstatus PENDING. Dashboard dan halaman Tagihan sudah bisa dibuka, tetapi pengiriman pesan, auto-reply, webhook, dan upload media baru aktif setelah pembayaran disetujui.

### Bulanan atau tahunan

Harga tahunan adalah 10x harga bulanan. Anda membayar 10 bulan dan memakai layanan selama 12 bulan, jadi hemat 2 bulan.

Contoh: Starter bulanan Rp20.000. Kalau bayar setahun, Rp200.000, bukan Rp240.000.

Tidak ada diskon lain di luar skema tahunan ini.

### Catatan media

Batas upload mengikuti paket: 50 MB, 75 MB, dan 100 MB per file. Namun WhatsApp punya batas sendiri:

- Video: 16 MB.
- Dokumen: 100 MB.
- Gambar dan audio: 16 MB.

Kalau video Anda lebih dari 16 MB, kompres dulu sebelum dikirim. Batas paket yang lebih besar tidak menembus batas WhatsApp.

### FAQ singkat

**Apakah ada trial atau paket gratis?**
Tidak. PesanPro berbayar sejak awal. Tidak ada trial, paket gratis, atau lifetime.

**Apakah bisa upgrade atau downgrade paket?**
Bisa. Perubahan berlaku pada pembayaran berikutnya. Hubungi admin lewat halaman Bantuan kalau butuh bantuan memilih paket.

**Apakah harga sudah termasuk pajak?**
Belum ada ketentuan pajak yang final. Bagian ini menunggu keputusan pemilik. Jangan menambahkan klaim "sudah termasuk pajak" sebelum diputuskan.

**Metode pembayaran apa saja?**
Transfer manual ke rekening tujuan yang tampil di halaman daftar. Tidak ada payment gateway otomatis.

**Apakah pembayaran bisa dikembalikan?**
Kebijakan pengembalian dana belum ditetapkan. Jangan menjanjikan refund sebelum ada keputusan tertulis.

### CTA penutup

**Judul:** Pilih paket dan mulai hari ini.

**Isi:** Daftar, pilih paket, transfer, lalu unggah bukti. Akun aktif setelah admin menyetujui pembayaran.

**Tombol:** Daftar

## TODO

- Konfirmasi harga final 20/49/99 dan skema tahunan 10x sebelum publish.
- Deploy v0.2.0 dan migrasi database.
- Keputusan pajak dan kebijakan refund.
- Pastikan rekening tujuan sudah diisi superadmin di Settings sebelum halaman ini dipublikasikan.
- Ganti seluruh harga lama 75/149/299 di situs marketing.
