# Draf Materi Marketing v0.2.0

Folder ini berisi draf materi untuk situs marketing PesanPro. Semua file adalah **draf untuk review**, bukan bukti bahwa fitur sudah live.

- Situs marketing: https://pesanpro.kingofcoding.my.id
- Aplikasi: https://wagateway.kingofcoding.my.id
- Versi acuan: v0.2.0 (GitHub)
- Status produksi: **v0.2.0 belum di-deploy**

## Aturan yang dipakai

- CTA selalu **"Daftar"** ke https://wagateway.kingofcoding.my.id/auth/register.
- Tidak ada "Mulai Gratis", trial, paket gratis, atau lifetime.
- Tidak ada klaim privasi, termasuk "tidak menyimpan pesanmu".
- Tidak ada Chat UI, Label, atau Campaign.
- Tidak ada testimoni, statistik, atau harga kompetitor yang belum terverifikasi.
- Tidak ada nomor rekening atau nomor WhatsApp admin di materi. Tulis "rekening tampil di halaman daftar" dan "hubungi admin lewat halaman Bantuan".
- Harga memakai tabel v0.2.0: 20/49/99 ribu per bulan, tahunan 10x.

## File

| File | Isi | Butuh deploy v0.2.0 |
| --- | --- | --- |
| `landing.md` | Copy landing page | Ya |
| `harga.md` | Halaman harga dan cara bayar | Ya |
| `kebijakan-privasi.md` | Draf kebijakan privasi | Sebagian, butuh keputusan pemilik |
| `syarat-ketentuan.md` | Draf syarat dan ketentuan | Sebagian, butuh review hukum |
| `mulai-cepat.md` | Panduan QR sampai pesan pertama | Ya |
| `blog-kirim-wa-otomatis-dari-website.md` | Pembaruan artikel lama | Ya |
| `blog-notifikasi-order-wa-toko-online.md` | Pembaruan artikel lama | Ya |
| `blog-menghubungkan-wa-ke-chatgpt-claude.md` | Pembaruan artikel lama | Ya |
| `blog-apa-itu-whatsapp-gateway.md` | Rekonstruksi artikel yang tidak ditemukan | Ya |
| `cara-broadcast-whatsapp.md` | Artikel baru | Ya |
| `PERUBAHAN-VS-MATERI-LAMA.md` | Daftar perubahan untuk reviewer | Tidak |

## Urutan publish yang disarankan

1. Deploy v0.2.0 dan jalankan migrasi database.
2. Isi rekening tujuan dan nomor WhatsApp admin di Settings.
3. Pastikan `/harga` dan `/docs` sudah tersedia di situs marketing.
4. Publish halaman harga.
5. Publish landing page.
6. Publish panduan mulai cepat.
7. Perbarui artikel blog lama.
8. Publish artikel broadcast baru.
9. Publish kebijakan privasi dan syarat setelah review hukum.

## Checklist sebelum publish

- [ ] Harga 20/49/99 sudah dikonfirmasi pemilik.
- [ ] Tidak ada angka 75.000, 149.000, atau 299.000 di seluruh situs.
- [ ] Tidak ada kata "gratis", "trial", atau "lifetime".
- [ ] Semua CTA berbunyi "Daftar".
- [ ] Tidak ada klaim privasi.
- [ ] Tidak ada Label, Campaign, atau Chat UI.
- [ ] Rekening tujuan sudah diisi superadmin.
- [ ] Nomor WhatsApp bantuan sudah diisi superadmin.
- [ ] Tautan `/harga`, `/docs`, dan `/auth/register` sudah diuji.
- [ ] Meta title dan meta description sudah dipasang.

## Catatan tentang artikel lama

Tiga artikel blog lama ditemukan di situs live dan diperbarui. Artikel "apa itu WhatsApp gateway" tidak ditemukan (404). File rekonstruksinya ditandai TODO. Jangan membuat dua artikel dengan topik yang sama.
