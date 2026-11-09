# Bahan Marketing PesanPro (6 November 2026)

Paket lengkap bahan marketing hasil verifikasi fakta terhadap sumber resmi produk.  
Bahasa santai, kalimat pendek. Satu CTA utama di semua bahan: **Daftar** ke  
<https://pesanpro.kingofcoding.my.id/auth/register>

Aturan yang dipatuhi di seluruh dokumen ini (sesuai brief dan `README.md` folder ini):

- Tidak ada trial, paket gratis, atau lifetime.
- Tidak ada klaim privasi, termasuk "tidak menyimpan pesanmu".
- Tidak ada testimoni, statistik, atau jumlah pengguna (tidak ada sumbernya).
- Tidak ada nomor rekening atau nomor WhatsApp admin di materi.
- Tidak ada urgensi palsu dan kata "terbaik" atau "nomor 1".
- Kompres otomatis hanya untuk gambar, bukan video.
- Dukungan satu kanal (WhatsApp admin lewat halaman Bantuan), tidak dibeda-bedakan per paket.

## Langkah 1: Tabel fakta (hasil verifikasi)

Sumber dicek pada 6 November 2026:

1. Brief pemilik (prompt tanggal 6 Nov 2026).
2. Halaman daftar live: <https://pesanpro.kingofcoding.my.id/auth/register>
3. Halaman landing live: <https://pesanpro.kingofcoding.my.id>
4. Migrasi database `20261031000000_premium_plans_and_upload_limits`.
5. `docs/panduan/09-paket-dan-margin.md` (dokumen internal).
6. `docs/marketing/README.md`, `docs/marketing/landing.md`, `docs/marketing/harga.md`,  
   `docs/marketing/mulai-cepat.md`, `docs/marketing/PERUBAHAN-VS-MATERI-LAMA.md`.
7. `docs/panduan/README.md` dan `docs/panduan/07-integrasi-tanpa-kode.md`.

| Fakta                        | Isi                                                                                                                                                                    | Sumber                                                | Status                                |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------- |
| Nama produk                  | PesanPro                                                                                                                                                               | Brief pemilik + judul halaman aplikasi live           | TERVERIFIKASI                         |
| URL aplikasi                 | <https://pesanpro.kingofcoding.my.id>                                                                                                                                 | Aplikasi live + panduan README                        | TERVERIFIKASI                         |
| URL landing                  | <https://pesanpro.kingofcoding.my.id>                                                                                                                                  | Panduan README + landing live                         | TERVERIFIKASI (isi masih materi lama) |
| CTA                          | "Daftar" ke <https://pesanpro.kingofcoding.my.id/auth/register>                                                                                                       | Halaman daftar live + README marketing                | TERVERIFIKASI                         |
| Harga Starter                | Rp20.000/bulan, Rp200.000/tahun                                                                                                                                        | Halaman daftar live + migrasi DB + panduan 09 + brief | TERVERIFIKASI                         |
| Harga Bisnis                 | Rp49.000/bulan, Rp490.000/tahun                                                                                                                                        | Sama seperti di atas                                  | TERVERIFIKASI                         |
| Harga Pro                    | Rp99.000/bulan, Rp990.000/tahun                                                                                                                                        | Sama seperti di atas                                  | TERVERIFIKASI                         |
| Skema tahunan                | 10x bulanan, setara bayar 10 bulan untuk 12 bulan (hemat 2 bulan)                                                                                                      | harga.md + aritmetika harga terverifikasi             | TERVERIFIKASI                         |
| Perangkat                    | 1 / 3 / 5                                                                                                                                                              | Halaman daftar live + migrasi DB + panduan 09         | TERVERIFIKASI                         |
| Pesan/bulan                  | 3.000 / 12.000 / 40.000                                                                                                                                                | Sama                                                  | TERVERIFIKASI                         |
| Upload per file              | 50 / 75 / 100 MB                                                                                                                                                       | Sama                                                  | TERVERIFIKASI                         |
| Penyimpanan media            | 1 / 5 / 20 GB                                                                                                                                                          | Sama                                                  | TERVERIFIKASI                         |
| Broadcast/bulan              | 50 / 200 / 500                                                                                                                                                         | Migrasi DB + panduan 09                               | TERVERIFIKASI                         |
| Penerima per batch broadcast | 500 / 1.500 / 3.000                                                                                                                                                    | Migrasi DB + panduan 09                               | TERVERIFIKASI                         |
| Auto-reply                   | 10 / 50 / tanpa batas                                                                                                                                                  | Migrasi DB + panduan 09                               | TERVERIFIKASI                         |
| Webhook                      | 2 / 5 / 15 endpoint                                                                                                                                                    | Migrasi DB + panduan 09                               | TERVERIFIKASI                         |
| Kunci API                    | 2 / 5 / 10                                                                                                                                                             | Migrasi DB + panduan 09                               | TERVERIFIKASI                         |
| Pesan terjadwal              | 20 / 100 / tanpa batas                                                                                                                                                 | Migrasi DB + panduan 09                               | TERVERIFIKASI                         |
| Jeda minimum broadcast       | 5 / 3 / 2 detik                                                                                                                                                        | Migrasi DB + panduan 09                               | TERVERIFIKASI                         |
| Permintaan API/menit         | 30 / 60 / 150                                                                                                                                                          | Migrasi DB + panduan 09                               | TERVERIFIKASI                         |
| Trial                        | Dihapus. Akun baru PENDING sampai admin menyetujui pembayaran                                                                                                          | Halaman daftar live + migrasi DB + docs marketing     | TERVERIFIKASI                         |
| Alur daftar                  | Isi data, pilih paket, transfer ke rekening yang tampil di halaman daftar, unggah bukti (maks 5 MB), tunggu persetujuan                                                | Halaman daftar live + docs marketing                  | TERVERIFIKASI                         |
| Selama PENDING               | Dashboard dan Tagihan bisa dibuka; pengiriman, auto-reply, webhook, upload media terkunci                                                                              | docs marketing + migrasi DB                           | TERVERIFIKASI                         |
| Fitur inti                   | REST API, webhook bertanda tangan, auto-reply kata kunci, broadcast (CSV, variabel, spintax, jeda otomatis), pesan terjadwal, multi-perangkat, kompres gambar otomatis | panduan 02/03/05/06 + landing.md                      | TERVERIFIKASI                         |
| Integrasi tanpa kode                                    | Contact Form 7, Google Forms, WooCommerce, WordPress form kustom (token `ppint_`)                                   | panduan 07                                                   | TERVERIFIKASI                                                    |
| Sambungan AI                                            | Pesan masuk diteruskan lewat webhook ke ChatGPT/Claude, balasan dikirim kembali; ada panduan Bahasa Indonesia       | panduan 06 + blog di docs/marketing + brief pemilik          | TERVERIFIKASI (framing: lewat webhook, bukan tombol sekali klik) |
| Dokumentasi                                             | Bahasa Indonesia, ada panduan UMKM sampai API developer                                                             | docs/panduan                                                 | TERVERIFIKASI                                                    |
| Batas WhatsApp                                          | Video 16 MB, dokumen 100 MB, gambar dan audio 16 MB                                                                 | harga.md                                                     | TERVERIFIKASI                                                    |
| Kecepatan mulai                                         | "Hitungan menit"; target 5 menit ada di panduan mulai cepat, dihitung setelah akun aktif                            | mulai-cepat.md + PERUBAHAN (klaim "5 menit" di hero dicabut) | TERVERIFIKASI dengan framing terbatas                            |
| Dukungan                                                | Satu kanal WhatsApp admin lewat halaman Bantuan; tidak ada SLA per paket                                            | PERUBAHAN-VS-MATERI-LAMA                                     | TERVERIFIKASI                                                    |
| Kompres video otomatis                                  | Tidak terverifikasi; klaim sudah dihapus dari materi                                                                | PERUBAHAN-VS-MATERI-LAMA                                     | DILARANG DIPAKAI                                                 |
| Harga lama Rp75.000/Rp149.000/Rp299.000 di landing live | Materi lama yang lupa diupdate (konfirmasi pemilik 6 Nov 2026); wajib diganti, tidak boleh muncul di bahan mana pun | Landing live + PERUBAHAN-VS-MATERI-LAMA + konfirmasi pemilik | KONFLIK SELESAI (paket baru jadi acuan)                          |
| Logo resmi                                              | Burung hijau gelap di chat bubble kuning; logo PP Monogram dilarang                                                 | Brief pemilik                                                | PERLU CEK BERKAS (belum diverifikasi dari folder brand)          |

## A. Copy landing page [FAKTA]

Semua teks di bawah siap tempel dan dibangun dari fakta terverifikasi di tabel atas.  
Pengecualian ditandai [DRAF] di tempatnya.

### A.1 Hero

**Headline:** WhatsApp bisnis, dikelola dari satu tempat

**Sub-headline:** Hubungkan nomor WhatsApp lewat QR, lalu kirim notifikasi, broadcast, dan balasan otomatis dari dashboard atau API.

**Tombol utama:** Daftar (mengarah ke <https://pesanpro.kingofcoding.my.id/auth/register>)

**Kalimat penenang di bawah tombol:** Pembayaran lewat transfer bank dan diverifikasi admin. Tanpa kartu kredit.

### A.2 Masalah

1. Balasan pelanggan menumpuk karena harus diketik satu per satu.
2. Pembeli bertanya "pesanan saya sudah dikirim belum?" karena tidak ada notifikasi otomatis.
3. Broadcast dikirim manual, satu nomor demi satu nomor.

### A.3 Cara kerja

1. **Daftar, pilih paket, bayar.**  
   Isi data akun, pilih paket dan periode, transfer ke rekening yang tampil di halaman daftar, lalu unggah bukti transfer. Akun aktif setelah admin menyetujui.
2. **Hubungkan WhatsApp lewat QR.**  
   Masuk ke dashboard dan pindai QR dari ponsel. Satu nomor cukup untuk mulai.
3. **Kirim pesan pertama.**  
   Kirim dari dashboard atau lewat API. Panduan mulai cepat tersedia, targetnya sekitar 5 menit setelah akun aktif.

### A.4 Fitur

**Notifikasi otomatis.** Sistem toko atau aplikasimu memanggil API, pesanan dan nomor resi terkirim ke WhatsApp pelanggan tanpa diketik ulang.

**Broadcast dengan jeda otomatis.** Satu pesan untuk daftar penerima, sistem menjaga ritme kirimnya, daftar nomor bisa diimpor dari CSV.

**Balasan otomatis.** Pelanggan mengetik "harga" atau "jam buka", jawaban terkirim langsung, termasuk di luar jam kerja.

**Webhook untuk setiap kejadian.** PesanPro memberi tahu servermu saat ada pesan masuk atau status pengiriman berubah.

**Sambungkan ke AI.** Pesan masuk diteruskan lewat webhook ke ChatGPT atau Claude, balasannya dikirim kembali ke pelanggan, dengan panduan Bahasa Indonesia.

**Integrasi tanpa kode.** Contact Form 7, Google Forms, WooCommerce, dan WordPress bisa mengirim WhatsApp tanpa membangun aplikasi baru.

**Pesan terjadwal.** Siapkan pesannya sekarang, kirim pada waktu yang kamu tentukan.

**Banyak nomor dalam satu akun.** Pisahkan nomor untuk penjualan, dukungan, dan pengiriman; jumlahnya mengikuti paket.

**Gambar dikompres otomatis.** Media diperkecil sebelum dikirim, jadi kuota dan waktu unggah lebih hemat.

### A.5 Tabel harga

|                       | Starter   | Bisnis    | Pro       |
| --------------------- | --------- | --------- | --------- |
| Bulanan               | Rp20.000  | Rp49.000  | Rp99.000  |
| Tahunan (10x bulanan) | Rp200.000 | Rp490.000 | Rp990.000 |

Isi per paket:

- **Starter:** 1 nomor WhatsApp, 3.000 pesan per bulan, 50 broadcast per bulan, upload file maksimal 50 MB, penyimpanan media 1 GB.
- **Bisnis:** 3 nomor WhatsApp, 12.000 pesan per bulan, 200 broadcast per bulan, upload file maksimal 75 MB, penyimpanan media 5 GB.
- **Pro:** 5 nomor WhatsApp, 40.000 pesan per bulan, auto-reply tanpa batas, upload file maksimal 100 MB, penyimpanan media 20 GB.

Catatan di bawah tabel:

Semua paket mendapat fitur yang sama. Yang berbeda hanya batas pemakaian. Bayar bulanan atau tahunan; tahunan setara membayar 10 bulan untuk 12 bulan pemakaian. Bantuan tersedia untuk semua paket lewat halaman Bantuan.

**Tombol:** Daftar

### A.6 FAQ

**Apakah ada paket gratis atau trial?**  
Tidak. PesanPro berbayar sejak awal. Akun baru aktif setelah pembayaran disetujui admin.

**Saya tidak bisa coding. Apakah tetap bisa memakai PesanPro?**  
Bisa. Dashboard dipakai lewat klik, tanpa menulis kode. API hanya diperlukan kalau Anda ingin menghubungkan sistem sendiri.

**Berapa lama akun aktif setelah transfer?**  
Akun berstatus PENDING sampai admin memeriksa bukti transfer. Setelah disetujui, paket langsung aktif dan Anda bisa menghubungkan WhatsApp.

**Apakah saya perlu nomor WhatsApp baru?**  
Disarankan memakai nomor khusus usaha. Nomor pribadi bisa dipakai, tetapi lebih rawan tercampur dengan percakapan pribadi.

**Apakah nomor saya dijamin aman dari blokir WhatsApp?**  
Tidak ada layanan yang bisa menjamin itu. PesanPro menyediakan jeda otomatis dan batas pengiriman untuk menurunkan risiko. Anda tetap perlu mengikuti aturan WhatsApp, termasuk hanya mengirim ke nomor yang setuju menerima pesan.

**Berapa nomor WhatsApp yang bisa dihubungkan?**  
Starter 1 nomor, Bisnis 3 nomor, Pro 5 nomor.

### A.7 CTA akhir

**Headline:** Siap pindahkan WhatsApp bisnis ke satu tempat?

**Tombol:** Daftar (link sama dengan CTA utama)

### A.8 Catatan kaki [DRAF]

Link: Syarat dan Ketentuan, Kebijakan Privasi, Bantuan.  
Syarat dan kebijakan privasi masih draf yang menunggu review hukum, jadi tautannya baru bisa aktif setelah halamannya dipublish. Bantuan berupa kanal WhatsApp admin lewat halaman Bantuan.


## B. Bank konten [FAKTA]

Semua angka di bawah dari fakta terverifikasi. Nada santai. Jualan lewat link di bio atau reply, tanpa hard sell.

### B.1 Sepuluh postingan sosial (Threads/Instagram)

**1**
Hook: Chat pelanggan numpuk tiap jam sibuk?
Isi: Pertanyaan yang sama berulang terus: harga, stok, jam buka. Auto-reply menjawab kata kunci itu langsung, termasuk di luar jam kerja. Kamu atur aturannya sekali, sisanya jalan sendiri. Paket Starter sudah termasuk 10 aturan auto-reply.
CTA: Pengen lihat alurnya? Link daftar di bio.
Hashtag: #AutoReply #UMKM #OtomasiBisnis

**2**
Hook: Notifikasi order masih disalin manual satu per satu?
Isi: Kalau tokomu pakai WooCommerce, perubahan status pesanan bisa langsung jadi pesan WhatsApp. Pesanan dibayar, terkirim, selesai, pelanggan tahu tanpa harus bertanya. Kamu juga bebas dari pertanyaan "sudah dikirim belum?" yang berulang. Panduan penyambungannya ada di dokumentasi.
CTA: Daftar lewat link di bio.
Hashtag: #TokoOnline #WooCommerce #NotifikasiOtomatis

**3**
Hook: Form di website bisa langsung kirim WhatsApp.
Isi: Contact Form 7 dan Google Forms punya jalur resmi ke PesanPro lewat token integrasi. Pengunjung isi form, kamu dapat notifikasi WA, tanpa menulis kode. Ada juga jalur untuk form WordPress lain dan WooCommerce. Semua langkahnya ada di panduan integrasi tanpa kode.
CTA: Mau dicoba? Link daftar di bio.
Hashtag: #ContactForm7 #GoogleForms #TanpaKoding

**4**
Hook: Broadcast bukan spam kalau cara kirimnya tertib.
Isi: Kirim ke nomor yang memang setuju menerima pesan. Atur jeda antar pesan supaya ritmenya sehat, PesanPro menjalankannya otomatis. Sediakan cara berhenti, misalnya balas STOP, lalu catat nomor itu di daftar suppression. Daftar yang bersih bikin pesanmu dibaca, bukan diblokir.
CTA: Panduan broadcast lengkap ada di dokumentasi, link di bio.
Hashtag: #BroadcastWhatsApp #OptIn #PemasaranWA

**5**
Hook: Mulai Rp20.000 per bulan.
Isi: Paket Starter: satu nomor WhatsApp, 3.000 pesan per bulan, upload file sampai 50 MB. Semua paket fiturnya sama, bedanya hanya batas pemakaian. Bayar bulanan atau tahunan; tahunan setara 10 bulan untuk 12 bulan pemakaian. Rekening dan langkahnya tampil jelas di halaman daftar.
CTA: Lihat perbandingan paket, link di bio.
Hashtag: #HargaTransparan #WhatsAppGateway #BisnisKecil

**6**
Hook: Nomor pribadi dipakai jualan? Chat bisnis dan pribadi jadi nyampur.
Isi: Pisahkan nomor penjualan, dukungan, dan pengiriman dalam satu akun PesanPro. Starter untuk satu nomor, Bisnis tiga, Pro lima. Nomor bisnis yang terpisah bikin balasan lebih cepat dan catatan lebih rapi. Saran kami, siapkan nomor khusus usaha.
CTA: Pilih paket sesuai jumlah nomormu, link di bio.
Hashtag: #NomorBisnis #WhatsAppBisnis #UMKM

**7**
Hook: WA bisa disambung ke ChatGPT atau Claude.
Isi: Pesan masuk diteruskan lewat webhook ke model AI, balasannya dikirim kembali ke pelanggan. Cocok untuk jawaban pertama sebelum operator ikut campur. Panduan dan contoh promptnya tersedia dalam Bahasa Indonesia. Yang perlu disiapkan cuma webhook dan server kecil.
CTA: Baca panduannya, link di bio.
Hashtag: #ChatGPT #AIUntukBisnis #Webhook

**8**
Hook: Tidak bisa coding? Bukan halangan.
Isi: Dashboard PesanPro dipakai lewat klik: broadcast, auto-reply, pesan terjadwal, semuanya dari menu. API hanya diperlukan kalau kamu mau menyambung sistem sendiri. Untuk form dan toko online, ada integrasi tanpa kode. Dokumentasinya pakai bahasa sehari-hari, jadi belajarnya cepat.
CTA: Mulai dari panduan UMKM, link di bio.
Hashtag: #TanpaKoding #DashboardMudah #UMKMIndonesia

**9**
Hook: Dokumentasi Bahasa Indonesia yang bisa langsung dipraktikkan.
Isi: Panduan UMKM sampai API developer ditulis rapi, dengan contoh cURL, Node.js, dan PHP yang bisa disalin. Ada panduan troubleshooting kalau macet. Cari jawaban sendiri dulu, sisanya tanya admin lewat halaman Bantuan. Hemat waktu untuk semua pihak.
CTA: Jelajahi dokumentasinya, link di bio.
Hashtag: #Dokumentasi #DeveloperIndonesia #WhatsAppAPI

**10**
Hook: Bayar tahunan itu hemat dua bulan.
Isi: Harga tahunan PesanPro sepuluh kali harga bulanan. Starter jadi Rp200.000, bukan Rp240.000. Kamu bayar 10 bulan untuk 12 bulan pemakaian. Tidak ada diskon tambahan lain di luar skema ini, jadi harganya gampang dihitung.
CTA: Hitung pilihanmu di halaman daftar, link di bio.
Hashtag: #HematTahunan #HargaJelas #WhatsAppGateway

### B.2 Tiga naskah video pendek

**Video 1: Order masuk, WA terkirim sendiri (60 detik)**

- 0-3 dtk (hook): "Masih salin-tempel nomor pelanggan buat kabari order?"
- 3-30 dtk (demo): Layar menampilkan status pesanan di toko online berubah, lalu WhatsApp masuk di ponsel pelanggan berisi status terbaru. Narasi: setiap perubahan status pesanan di WooCommerce dikirim sebagai pesan WhatsApp lewat PesanPro.
- 30-50 dtk (isi): Bukan cuma WooCommerce. Sistem apa pun yang bisa memanggil API atau menerima webhook bisa mengirim notifikasi. Auto-reply mengambil alih pertanyaan yang berulang.
- 50-60 dtk (CTA): "Mulai Rp20.000 per bulan. Daftar di pesanpro.kingofcoding.my.id/auth/register."

**Video 2: Tiga langkah sampai pesan pertama (45 detik)**

- 0-3 dtk (hook): "Dari daftar sampai pesan pertama, cuma tiga langkah."
- 3-15 dtk (langkah 1): Pilih paket, transfer ke rekening yang tampil di halaman daftar, unggah bukti. Akun aktif setelah admin menyetujui.
- 15-25 dtk (langkah 2): Masuk dashboard, pindai QR, nomor tersambung.
- 25-35 dtk (langkah 3): Kirim pesan dari dashboard atau lewat API. Panduan mulai cepat tersedia, target sekitar 5 menit setelah akun aktif.
- 35-45 dtk (CTA): "Paket mulai Rp20.000 per bulan. Daftar di pesanpro.kingofcoding.my.id/auth/register."

**Video 3: Broadcast yang tidak dianggap spam (45 detik)**

- 0-3 dtk (hook): "Broadcast WA bisa dibaca atau diblokir, bedanya di cara kirim."
- 3-15 dtk: Kirim ke nomor yang memang setuju menerima pesan.
- 15-30 dtk: PesanPro menjalankan jeda otomatis antar pesan, dan batas penerima per batch mengikuti paket.
- 30-40 dtk: Sediakan cara berhenti, misalnya balas STOP, lalu masukkan nomor itu ke daftar suppression.
- 40-45 dtk (CTA): "Mulai dari Rp20.000 per bulan. Daftar di pesanpro.kingofcoding.my.id/auth/register."

### B.3 Tiga outline artikel blog

**Artikel 1: Auto-reply atau broadcast? Menentukan mana yang cocok untuk bisnis Anda**

- Beda fungsi: auto-reply bekerja saat pesan masuk, broadcast mengirim lebih dulu ke daftar penerima.
- Kapan auto-reply: pertanyaan berulang seperti harga, stok, dan jam buka dijawab otomatis.
- Kapan broadcast: pengumuman ke banyak orang sekaligus, misalnya stok baru, promo, atau jam operasional.
- Aturan supaya tidak dianggap spam: opt-in, jeda otomatis, dan sediakan cara berhenti.
- Mulai dari mana: atur aturan auto-reply di paket Starter, baru masuk ke broadcast saat daftar penerima siap.
- CTA akhir: Daftar.

**Artikel 2: Menghitung kebutuhan pesan WhatsApp bulanan untuk bisnis kecil**

- Hitung pesan per transaksi: konfirmasi order, info pengiriman, dan follow-up.
- Kalikan dengan jumlah transaksi per bulan untuk mendapat kebutuhan dasar.
- Tambahkan ruang untuk pertanyaan pelanggan yang masuk dan harus dibalas.
- Cocokkan hasilnya dengan paket: Starter 3.000, Bisnis 12.000, Pro 40.000 pesan per bulan.
- Kalau butuh lebih besar, naikkan paket; perubahan berlaku pada pembayaran berikutnya.
- CTA akhir: Daftar.

**Artikel 3: Broadcast WhatsApp yang dibaca, bukan diblokir**

- Dasar opt-in: kirim hanya ke nomor yang setuju menerima pesan.
- Isi yang berharga: pengumuman stok, promo, dan info operasional yang memang ditunggu.
- Ritme kirim: jeda otomatis antar pesan dan batas penerima per batch sesuai paket.
- Cara berhenti yang jelas: nomor yang membalas berhenti masuk daftar suppression.
- Ukur hasil: status pengiriman bisa dipantau lewat dashboard, API, atau webhook.
- CTA akhir: Daftar.

### B.4 Tiga varian copy iklan

**Varian 1 (fokus harga)**

Headline: Mulai Rp20.000 per bulan.
Isi: Satu nomor WhatsApp, 3.000 pesan per bulan, fitur sama dengan paket di atasnya. Bayar setahun setara 10 bulan.
CTA: Daftar di https://pesanpro.kingofcoding.my.id/auth/register

**Varian 2 (fokus kemudahan)**

Headline: Tidak bisa coding? Tetap jalan.
Isi: Broadcast, auto-reply, dan pesan terjadwal dijalankan dari dashboard lewat klik. Form dan toko online tersambung lewat integrasi tanpa kode.
CTA: Daftar di https://pesanpro.kingofcoding.my.id/auth/register

**Varian 3 (fokus masalah)**

Headline: Berhenti mengetik info order satu per satu.
Isi: Notifikasi pesanan dan resi terkirim otomatis dari sistemmu ke WhatsApp pelanggan. Pelanggan berhenti bertanya status pesanannya.
CTA: Daftar di https://pesanpro.kingofcoding.my.id/auth/register

### B.5 Dua template broadcast WhatsApp (maksimal 5 baris)

**Template 1 (perkenalan ke daftar opt-in)**

```
Hi [Nama], kabar buat yang sering balas pelanggan satu per satu.
PesanPro bikin WA bisnis bisa kirim notifikasi, broadcast, dan auto-reply dari satu dashboard.
Mulai Rp20.000 per bulan, semua paket fiturnya sama.
Daftar di https://pesanpro.kingofcoding.my.id/auth/register
Tidak berminat? Balas STOP ya.
```

**Template 2 (tips ringan + tawaran)**

```
Halo [Nama], tips hari ini: pisahkan nomor jualan dan nomor pribadi.
Urusan bisnis jadi rapi dan balasan lebih cepat.
Nomor WA bisnis bisa kirim pesan otomatis pakai PesanPro, mulai Rp20.000 per bulan.
Daftar di https://pesanpro.kingofcoding.my.id/auth/register
Balas STOP kalau tidak ingin menerima pesan lagi.
```

## C. Satu halaman ringkasan pesan inti [FAKTA]

**Tagline:** WhatsApp bisnis, dikelola dari satu tempat

**Janji utama:** Satu dashboard untuk mengirim notifikasi, broadcast, dan balasan otomatis dari nomor WhatsApp bisnis Anda, lewat klik atau API.

**Tiga keunggulan:**

1. Harga transparan: mulai Rp20.000 per bulan, semua paket fiturnya sama, bedanya hanya batas pemakaian.
2. Ramah pemula: dashboard lewat klik tanpa coding, integrasi tanpa kode untuk form dan toko online, dokumentasi Bahasa Indonesia.
3. Pengiriman tertib: jeda otomatis antar pesan, batas sesuai paket, webhook bertanda tangan.

**CTA utama:** Daftar di https://pesanpro.kingofcoding.my.id/auth/register

Halaman ini jadi patokan bahasa untuk semua bahan di atas. Kata kunci yang dipakai konsisten:
notifikasi otomatis, broadcast, balasan otomatis, integrasi tanpa kode, batas pemakaian.


## D. Kamus istilah PesanPro [FAKTA]

Semua definisi di bawah diambil dari panduan resmi aplikasi (`/docs`, sumber `docs/panduan`). Dipakai untuk halaman istilah di situs marketing, konten edukasi di sosial, atau penjelasan di FAQ.

### D.1 Pertanyaan paling sering: "Broadcast 50" di harga itu apa?

Broadcast adalah satu aksi mengirim satu pesan yang sama ke banyak nomor sekaligus, dengan jeda otomatis antar pesan. Contoh: pengumuman promo ke 200 pelanggan, dikirim satu per satu secara berurutan oleh sistem.

Jadi "Broadcast/bulan: 50" di paket Starter berarti maksimal 50 aksi broadcast per bulan. Bukan 50 pesan, bukan 50 nomor. Satu broadcast = satu pengiriman massal yang masuk antrean, lalu dikirim bergiliran.

| Angka di harga Starter | Artinya |
| --- | --- |
| Broadcast/bulan 50 | Maksimal 50 aksi kirim massal per bulan |
| Penerima per broadcast 500 | Batas jumlah nomor dalam satu broadcast |
| Pesan/bulan 3.000 | Plafon total semua pesan keluar per bulan |

Ketiganya saling terkait. Contoh perhitungan di paket Starter:

- 5 broadcast dengan 400 penerima = 2.000 pesan. Lolos batas broadcast (baru 5 dari 50) dan memakan 2.000 dari kuota 3.000 pesan.
- 10 broadcast dengan 500 penerima = 5.000 pesan. Kuota pesan 3.000 habis duluan, padahal batas broadcast (10 dari 50) belum tercapai. Kuota pesan biasanya yang habis duluan.
- Panduan resmi menulisnya begini: broadcast ke 500 penerima memakai 500 dari kuota pesan bulanan.

Soal "jeda minimum 5 detik": itu jeda wajib antar pesan dalam satu broadcast. Bisa diset lebih besar, tidak bisa lebih kecil. Paket kecil punya jeda minimum lebih besar (Starter 5 detik, Bisnis 3 detik, Pro 2 detik). Contoh dari panduan: broadcast 1.000 penerima dengan jeda 10-20 detik butuh sekitar 2,5-5,5 jam. Jeda ini disengaja supaya nomor tidak dianggap spam.

### D.2 Istilah di halaman harga

| Istilah | Artinya dengan mudah |
| --- | --- |
| Perangkat (1/3/5) | Satu perangkat = satu nomor WhatsApp yang terhubung ke PesanPro lewat scan QR. Nomor yang sama jangan dipindai di dua tempat. |
| Pesan/bulan (3.000/12.000/40.000) | Total pesan keluar yang terkirim per bulan, dihitung dari semua sumber: kirim manual, API, broadcast, jadwal, dan auto-reply. |
| Broadcast/bulan (50/200/500) | Jumlah aksi kirim massal. Penjelasan lengkap di D.1. |
| Penerima per broadcast (500/1.500/3.000) | Batas jumlah nomor dalam satu broadcast. |
| Jeda minimum broadcast (5/3/2 detik) | Jeda wajib antar pesan saat broadcast. |
| Auto-reply (10/50/tanpa batas) | Jumlah aturan balasan otomatis. Satu aturan = "kalau pesan masuk mengandung kata X, balas dengan Y". |
| Webhook (2/5/15) | Jumlah alamat server yang bisa menerima pemberitahuan otomatis dari PesanPro. |
| Kunci API (2/5/10) | Jumlah kunci rahasia untuk menyambungkan sistem ke PesanPro lewat API. |
| Pesan terjadwal (20/100/tanpa batas) | Jumlah jadwal kirim pesan yang bisa disimpan, sekali kirim atau berulang. |
| Upload per file (50/75/100 MB) | Batas ukuran satu file yang diunggah. WhatsApp sendiri membatasi gambar/video/audio 16 MB dan dokumen 100 MB, jadi batas paket besar tidak menembus batas WhatsApp. |
| Penyimpanan media (1/5/20 GB) | Ruang simpan file di PesanPro. Media yang tidak dipakai dihapus otomatis setelah 30 hari. |
| Permintaan API/menit (30/60/150) | Batas kecepatan panggilan API. Kalau lebih cepat, permintaan ditolak sementara. |

### D.3 Istilah akun dan pembayaran

| Istilah | Artinya |
| --- | --- |
| PENDING / Belum aktif | Akun sudah dibuat tapi terkunci, menunggu admin menyetujui bukti transfer. Dashboard dan Tagihan tetap bisa dibuka. |
| Kuota | Sisa hak paket pada periode berjalan. Periode dihitung dari tanggal aktivasi paket, bukan tanggal 1 kalender. |
| Masa tenggang | Kalau paket kedaluwarsa, data masih bisa dilihat tapi pengiriman dibekukan sampai perpanjang. |
| Perpanjangan | Dihitung dari tanggal berakhir paket lama, jadi sisa hari tidak hilang. Ganti paket baru mulai dihitung saat pembayaran disetujui. |
| Hak paket (entitlement) | Daftar fitur dan batas yang kamu dapat, tampil di menu Tagihan. |

### D.4 Istilah fitur pengiriman

| Istilah | Artinya |
| --- | --- |
| Antrian Pesan | Menu untuk melihat status semua pesan keluar: masuk antrean, terkirim, dibaca, atau gagal. |
| Kirim Massal | Nama menu untuk broadcast. |
| Variabel `{{name}}` | Personalisasi dari file CSV. Kolom bernama "name" otomatis mengisi {{name}} di pesan tiap penerima. |
| Spintax `{Halo\|Hai}` | Isi pesan diacak dari beberapa pilihan, supaya pesan tiap orang tidak identik semua. |
| Opt-in | Tanda kontak setuju menerima pesanmu. Kalau "Wajib opt-in" aktif, hanya kontak yang setuju yang dikirimi. |
| Jangan kirim (suppression) | Daftar nomor yang selalu dilewati semua broadcast. Balasan STOP atau BERHENTI otomatis masuk daftar ini. |
| Status pesan | QUEUED = masih mengantri. SENT = sudah diserahkan ke WhatsApp, belum tentu sampai. DELIVERED = sampai HP penerima (centang 2). READ = dibuka (centang 2 biru). FAILED = gagal, ada kode penyebabnya. |
| Fallback (auto-reply) | Aturan tangkap semua: dibalas kalau tidak ada aturan kata kunci yang cocok. |
| Cooldown | Jeda minimal antar balasan otomatis ke kontak yang sama, supaya tidak dibalas beruntun. |

### D.5 Istilah teknis untuk yang menyambung sistem

| Istilah | Artinya |
| --- | --- |
| API key (`wag_...`) | Kunci untuk programmer, bisa memakai semua endpoint API. |
| Integration token (`ppint_...`) | Kunci khusus plugin tanpa kode: Contact Form 7, Google Forms, WooCommerce, WordPress. Terikat ke satu perangkat. Tidak bisa saling menggantikan dengan API key. |
| Webhook | PesanPro memberi tahu servermu otomatis saat ada kejadian, misalnya pesan masuk. |
| Idempotency-Key | Nomor struk untuk satu aksi kirim. Permintaan yang diulang dengan kunci yang sama tidak membuat pesan terkirim dua kali. |
| Tenant | Satu akun terpisah. Data, perangkat, dan media antar akun tidak saling terlihat. |

## Yang masih butuh pemilik

1. **Situs landing pesanpro.kingofcoding.my.id masih materi lama** (harga Rp75.000/Rp149.000/Rp299.000, Pro 10 sesi, janji trial, headline privasi yang dilarang). Pemilik mengonfirmasi 6 Nov 2026 bahwa itu lupa diupdate. Materi penggantinya sudah ada di `docs/marketing/landing.md` dan `harga.md`, tinggal dideploy.
2. **Klaim privasi dan retensi data** masih keputusan terbuka. Semua bahan di atas sengaja tidak memuat janji privasi apa pun.
3. **Syarat dan Ketentuan serta Kebijakan Privasi** masih draf dan menunggu review hukum. Tautan catatan kaki di landing baru bisa aktif setelah halamannya dipublish.
4. **Pajak**: belum ada ketentuan final. Bahan tidak menyebut "termasuk pajak".
5. **Refund**: kebijakan belum ditetapkan tertulis. Tidak ada janji pengembalian dana di bahan.
6. **Route /harga dan /docs di situs marketing** belum terverifikasi live. Cek sebelum publish.
7. **Logo resmi** (burung hijau gelap di chat bubble kuning) baru bersumber dari brief. Periksa berkas di folder `brand/` sebelum dipakai desain; logo PP Monogram tetap dilarang.
8. **Klaim "5 menit"**: di bahan dipakai framing aman "hitungan menit" dan target 5 menit hanya disebut sebagai target panduan mulai cepat setelah akun aktif. Kalau mau klaim "5 menit" di hero, butuh keputusan pemilik.
9. **Testimoni, statistik, dan jumlah pengguna** tidak dipakai karena tidak ada sumber. Kalau kelak ada data nyata, tambahkan dengan sumbernya.
10. **Nomor WhatsApp admin dan rekening tujuan** tidak ditulis di materi apa pun, sesuai aturan folder ini; keduanya tampil lewat halaman Bantuan dan halaman daftar.
11. **Penempatan kamus istilah (bagian D)**: butuh keputusan pemilik. Pilihan: halaman istilah tersendiri di situs marketing, dimasukkan ke FAQ, atau hanya dipakai sebagai bahan konten edukasi di sosial.
