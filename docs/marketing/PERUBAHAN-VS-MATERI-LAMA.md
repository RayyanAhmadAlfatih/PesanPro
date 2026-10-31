# Perubahan vs Materi Lama

Dokumen ini untuk reviewer. Isinya daftar hal yang berubah dari situs marketing lama ke draf v0.2.0.

## Ringkasan status

| Materi | File | Status |
| --- | --- | --- |
| Landing page | `landing.md` | Draf, menunggu deploy v0.2.0 |
| Halaman harga | `harga.md` | Draf, menunggu deploy v0.2.0 |
| Kebijakan privasi | `kebijakan-privasi.md` | Draf, butuh keputusan pemilik dan review hukum |
| Syarat dan ketentuan | `syarat-ketentuan.md` | Draf, butuh review hukum |
| Mulai cepat | `mulai-cepat.md` | Draf, route `/docs/mulai-cepat` belum ada |
| Blog: kirim WA dari website | `blog-kirim-wa-otomatis-dari-website.md` | Pembaruan artikel lama |
| Blog: notifikasi order | `blog-notifikasi-order-wa-toko-online.md` | Pembaruan artikel lama |
| Blog: ChatGPT/Claude | `blog-menghubungkan-wa-ke-chatgpt-claude.md` | Pembaruan artikel lama |
| Blog: apa itu gateway | `blog-apa-itu-whatsapp-gateway.md` | Rekonstruksi, artikel lama 404 |
| Blog: cara broadcast | `cara-broadcast-whatsapp.md` | Artikel baru, 1.381 kata |

## Perubahan harga

| Item | Lama (situs live) | Baru (v0.2.0) |
| --- | --- | --- |
| Starter bulanan | Rp75.000 | **Rp20.000** |
| Bisnis bulanan | Rp149.000 | **Rp49.000** |
| Pro bulanan | Rp299.000 | **Rp99.000** |
| Starter tahunan | Rp750.000 | **Rp200.000** |
| Bisnis tahunan | Rp1.490.000 | **Rp490.000** |
| Pro tahunan | Rp2.990.000 | **Rp990.000** |

Tidak ada harga lama yang boleh tersisa di situs, blog, meta description, atau materi iklan.

## Perubahan paket dan fitur

| Item | Lama | Baru |
| --- | --- | --- |
| Trial | "Uji coba 1 minggu segera hadir" | **Dihapus.** Tidak ada trial, paket gratis, atau lifetime. |
| Perangkat Pro | 10 sesi | **5 perangkat** |
| Batas upload | Tidak dirinci | **50/75/100 MB per file** |
| Storage | Tidak dirinci | **1/5/20 GB** |
| Penerima per broadcast | Tidak dirinci | **500/1.500/3.000** |
| Kunci API | Tidak dirinci | **2/5/10** |
| Pesan terjadwal | Tidak dirinci | **20/100/tanpa batas** |
| Label | Ditampilkan sebagai fitur | **Dihapus dari aplikasi** |
| Campaign | Tidak disebut di landing, tetapi ada di aplikasi lama | **Dihapus dari aplikasi** |
| Chat UI | Tidak disebut | **Dihapus dari aplikasi** |
| Support per paket | FAQ / WhatsApp / WhatsApp prioritas | **Satu kanal WhatsApp admin lewat halaman Bantuan.** Tidak ada SLA per paket. |
| Kompres video | Diklaim otomatis | **Klaim dihapus.** Kompresi otomatis yang terverifikasi hanya untuk gambar. |

## Perubahan alur daftar

**Lama:** daftar akun dulu, masuk dashboard, baru pilih paket dan bayar.

**Baru (v0.2.0):**

1. Isi data akun.
2. Pilih paket dan periode.
3. Transfer ke rekening tujuan yang tampil di halaman daftar.
4. Unggah bukti transfer maksimal 5 MB.
5. Akun berstatus PENDING sampai admin menyetujui.

Selama PENDING, dashboard dan Tagihan bisa dibuka, tetapi pengiriman, auto-reply, webhook, dan upload media belum aktif.

## Perubahan CTA

| Lama | Baru |
| --- | --- |
| "Mulai Gratis" | **"Daftar"** |
| "Coba Gratis" | **"Daftar"** |
| "Uji coba 1 minggu" | **Dihapus** |

Semua CTA mengarah ke `https://wagateway.kingofcoding.my.id/auth/register`.

## Klaim yang dihapus

- Headline "Gateway WhatsApp yang tidak menyimpan pesanmu".
- Kalimat "Isi obrolan tidak pernah kami tulis ke database".
- FAQ "Apakah PesanPro menyimpan isi pesan pelanggan saya? Tidak."
- Klaim "online dalam 5 menit" di hero. Diganti dengan "hitungan menit" atau target 5 menit khusus di panduan mulai cepat.
- Klaim "video dikecilkan otomatis".
- Janji trial 7 hari.

Klaim privasi belum diputuskan pemilik. Jangan menggantinya dengan klaim lain yang serupa.

## Perubahan blog

Tiga artikel lama ditemukan dan diperbarui:

1. `kirim-wa-otomatis-dari-website`
2. `notifikasi-order-wa-toko-online`
3. `menghubungkan-wa-ke-chatgpt-claude-untuk-auto-reply`

Perubahan utama:

- CTA diganti menjadi "Daftar".
- Tautan harga dan dokumentasi ditambahkan.
- Istilah `Idempotency-Key` diselaraskan menjadi `idempotency-key`.
- Tidak ada harga lama, trial, atau klaim privasi yang tersisa.

Artikel keempat, "apa itu WhatsApp gateway", tidak ditemukan. URL `/blog/apa-itu-whatsapp-gateway` dan `/blog/whatsapp-gateway` mengembalikan 404, dan blog index hanya menampilkan tiga artikel. File `blog-apa-itu-whatsapp-gateway.md` adalah rekonstruksi. Kalau artikel lama ada di URL lain, gunakan itu sebagai basis dan jangan membuat duplikat.

Artikel baru:

- `cara-broadcast-whatsapp.md`, 1.381 kata, meta description 142 karakter.
- Judul mengandung keyword "cara broadcast WhatsApp".
- FAQ 5 pertanyaan.
- Tautan internal ke dua artikel blog lain, halaman harga, dan dokumentasi broadcast.

## Yang belum bisa dipublish

1. Harga dan alur daftar baru: menunggu deploy v0.2.0 dan migrasi database.
2. Kebijakan privasi: menunggu keputusan tentang penyimpanan konten pesan, alamat, email, dan review hukum.
3. Syarat dan ketentuan: menunggu kebijakan refund, pajak, SLA, dan review hukum.
4. Panduan `/docs/mulai-cepat`: route belum ada. Saat ini panduan setara ada di `/docs/01-memulai-umkm`.
5. Rekening tujuan: harus diisi superadmin di Settings sebelum halaman daftar dipakai.
6. Nomor WhatsApp admin: harus diisi superadmin di Settings sebelum halaman Bantuan menampilkan tombol chat.
