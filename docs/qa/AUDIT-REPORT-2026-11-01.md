# Audit Bug Senyap PesanPro — 31 Oktober 2026

## Ringkasan

Audit mencari bug yang tidak terlihat dari luar: fitur yang tampak jalan tetapi
diam-diam merugikan pengguna (kuota berkurang tanpa alasan, status yang bohong,
tombol yang tidak bekerja, pesan yang tetap terkirim setelah dibatalkan).

Baseline sebelum perbaikan: typecheck bersih, lint bersih, 435 tes lulus
(104 file tes).

## Temuan yang diperbaiki

### 1. Kuota bulanan bocor ketika pesan gagal total
**Gejala untuk pengguna:** kuota pesan berkurang padahal pesan gagal terkirim.
**Penyebab:** ketika pekerja mati mendadak (server restart, listrik mati) saat
pesan sedang diproses dan pesan sudah kehabisan percobaan, pesan ditandai
"gagal" tanpa mengembalikan kuotanya, tanpa memperbarui status penerima
broadcast, dan tanpa mengirim event webhook gagal.
**Perbaikan:** pesan yang gagal total sekarang mengembalikan kuota, menandai
penerima broadcast sebagai gagal, dan mengirim event `message.status` FAILED.

### 2. Pesan broadcast gagal lalu berhasil di-retry, status tidak pulih
**Gejala:** admin menekan Retry di antrean pesan, pesan terkirim, tetapi
laporan broadcast tetap menampilkan penerima itu gagal.
**Perbaikan:** ketika pesan berhasil dikirim (termasuk hasil retry), status
penerima broadcast ikut menjadi TERKIRIM.

### 3. Perpanjangan paket menghanguskan sisa hari
**Gejala:** pelanggan membayar ulang 5 hari sebelum paket habis; setelah
disetujui, sisa 5 hari itu hilang karena periode baru dihitung dari hari
persetujuan.
**Perbaikan:** pembayaran untuk paket yang sama kini melanjutkan dari akhir
masa aktif sekarang. Ganti paket atau paket kedaluwarsa tetap dimulai hari itu
juga. `startsAt` tidak diubah untuk perpanjangan agar kuota bulanan tidak
ter-reset di tengah periode.

### 4. Paket berbayar bisa dijadikan paket default
**Gejala:** satu klik salah di panel admin dan seluruh pendaftar baru mendapat
paket berbayar gratis selamanya (akun baru dibuat di paket default tanpa bayar).
**Perbaikan:** hanya paket tanpa harga bulanan yang boleh dijadikan default,
di endpoint buat dan ubah paket.

### 5. Satu bukti pembayaran ganda
**Gejala:** jaringan lambat atau klik dobal membuat pengguna mengirim dua bukti;
kalau keduanya disetujui, pelanggan bisa terlanjur transfer dua kali.
**Perbaikan:** satu pengguna hanya boleh punya satu bukti yang sedang diperiksa.
Form di halaman Tagihan ikut terkunci dan menampilkan statusnya.

### 6. Nomor rekening tidak tampil di halaman Tagihan
**Gejala:** pelanggan yang mau memperpanjang harus bertanya nomor rekening ke
admin lewat WhatsApp. Ini sumber tiket support paling langsung.
**Perbaikan:** halaman Tagihan kini menampilkan rekening tujuan (bank, nomor,
a.n., catatan) dengan tombol salin, sama seperti halaman pendaftaran. Kalau
admin belum mengisi rekening, halaman menunjukkan statusnya secara jujur.

### 7. Jadwal tidak bisa dibatalkan setelah server mati
**Gejala:** server mati saat jadwal sedang diproses; setelah hidup, pengguna
mencoba membatalkan jadwal itu dan selalu dapat "jadwal sedang diproses",
padahal tidak ada yang memprosesnya. Jadwal tetap terkirim.
**Perbaikan:** batal dan ubah jadwal kini diizinkan begitu masa sewa pekerja
kedaluwarsa, bukan hanya saat pekerja tidak memegangnya.

### 8. Perangkat stuck di "QR diperlukan" setelah server restart
**Gejala:** pengguna sedang memasangkan WhatsApp, server restart. Halaman
menampilkan QR lama yang sudah mati dan tombol Start mati; perangkat tampak
rusak padahal cukup Start ulang.
**Perbaikan:** saat server menyala, status QR/pairing yang tidak mungkin
bertahan direset menjadi STOPPED, jadi tombol Start aktif dan QR baru muncul.

### 9. Kode pairing ditolak untuk nomor 08…
**Gejala:** pengguna mengetik `0812-3456-7890`, kode pairing muncul, tetapi
selalu gagal dipakai di HP karena WhatsApp mengharapkan format internasional.
**Perbaikan:** nomor dinormalisasi (hilangkan spasi, strip, titik, tanda
kurung; `08…` menjadi `62…`) sebelum diminta ke WhatsApp. Normalisasi yang sama
kini menerima nomor dengan tanda baca untuk pengiriman pesan.

### 10. Semua gagalan aksi perangkat tampil sama
**Gejala:** Start gagal karena perangkat dipakai proses lain, atau pairing
diminta sebelum Start, tetapi layar hanya menampilkan "Failed to perform device
action" untuk semuanya.
**Perbaikan:** pesan error kini menjelaskan penyebab umum dan langkah
selanjutnya, dalam Bahasa Indonesia, dengan kode status yang benar.

### 11. Kampanye berhenti tapi status tetap "berjalan"
**Gejala:** broadcast milik kampanye dijeda langsung dari halaman Broadcast;
status kampanye tetap "berjalan" tanpa kemajuan.
**Perbaikan:** penyelarasan kampanye kini mengikuti status broadcast yang
dijeda.

### 12. Header CSV penerima tidak dikenali
**Gejala:** CSV dengan kolom "Nomor WhatsApp" atau "No WA" ditolak dengan
pesan "CSV does not contain valid private recipients".
**Perbaikan:** daftar nama kolom diperluas (nomor_wa, nomor_whatsapp, no_wa,
hp, handphone, dan lainnya).

### 13. Daftar perangkat kosong tanpa alasan
**Gejala:** kalau API gagal, halaman Perangkat menampilkan "No sessions found"
seolah pengguna belum punya perangkat.
**Perbaikan:** kegagalan memuat kini ditampilkan sebagai error dengan tombol
coba lagi, bukan daftar kosong.

### 14. Kegagalan lain yang dibereskan
- Error 500 API kini dicatat di log bersama request id, sehingga keluhan
  pengguna bisa dilacak.
- Log pengiriman webhook yang mati total kini menandai percobaan terakhirnya
  sebagai gagal, bukan "masih memproses" selamanya.
- Kebocoran kecil kuota saat retry balapan dengan pemulihan pekerja ditutup.

## Yang diuji

- Tes regresi baru untuk: normalisasi nomor telepon dan penerima, pesan error
  aksi perangkat, status sewa jadwal, aturan paket default, periode
  perpanjangan, header CSV Indonesia.
- Gerbang penuh setelah perbaikan, semua hijau:
  - `tsc --noEmit` bersih (heap 8 GB; di heap 4 GB mesin ini bisa OOM).
  - `eslint` bersih.
  - `npm test`: 447 tes lulus dari 104 file (naik dari 435).
  - Build produksi `next build --webpack` berhasil di lokal untuk pertama
    kalinya (heap 6 GB; `.next` lama dipindah dulu karena pengaman hapus).
  - `git diff --check` bersih.
  - `npm audit`: 52 temuan lama (semuanya dari rantai `jimp` pemroses media,
    Baileys versi rc, dan `vite` alat pengembang). Perbaikannya semua butuh
    penurunan versi besar yang berisiko, jadi sengaja tidak dipaksa. Ditetapkan
    sebagai tindak lanjut terpisah, bukan dibiarkan diam-diam: risikonya sudah
    dibatasi karena `jimp` hanya memproses media milik tenant sendiri yang
    sudah divalidasi, dan `vite` tidak ikut terkirim ke produksi.

## Yang belum bisa dipastikan di lokal

- Perbaikan yang menyentuh runtime WhatsApp (reset status QR, normalisasi
  pairing) baru teruji lewat unit test. Uji nyata butuh perangkat WhatsApp;
  lakukan di QA live berikutnya mengikuti aturan `uji*`.
- Build produksi lokal tetap terkendala RAM mesin ini; build dilakukan di VPS
  sesuai catatan deploy.
- Perilaku lama yang sengaja tidak diubah: satu pesan yang sudah masuk antrean
  saat broadcast dibatalkan tetap boleh terkirim (dianggap sedang berjalan).
  Kalau mau dibatalkan juga, itu keputusan produk terpisah.

## Catatan deploy

- Tidak ada perubahan skema database dan tidak ada migrasi.
- Urutan seperti biasa: `git pull` di VPS, build, `pm2 restart pesanpro`.
  Runtime membaca `src/`, jadi restart wajib.
