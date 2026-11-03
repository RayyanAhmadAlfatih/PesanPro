# 12 — Menu Pengiriman: pilih alat yang tepat

> Untuk siapa: operator dan pemilik usaha yang memakai dashboard.
> Tidak perlu bisa kode. Contoh di sini memakai menu yang benar-benar ada di aplikasi.

Di sidebar dashboard, menu **Pengiriman** adalah grup yang membuka empat submenu. Klik tulisan **PENGIRIMAN** untuk membuka atau menutup daftarnya (tanda panah kecil berputar menunjukkan kondisinya). Tidak ada halaman khusus "Pengiriman" — empat submenu itulah isinya.

## Isi menu Pengiriman

| Submenu | Untuk apa | Kapan memakainya |
| --- | --- | --- |
| **Antrian Pesan** | Melihat status setiap pesan keluar: dari API, kirim tunggal, broadcast, jadwal, atau auto-reply | Ingin tahu "pesankam sudah dikirim/dibaca?" atau mencari pesan yang gagal |
| **Kirim Massal** | Mengirim satu pesan ke banyak nomor dengan jeda, personalisasi CSV, spintax, dan daftar jangan-kirim | Promosi, pengingat tagihan, kabar promo ke banyak pelanggan sekaligus |
| **Jadwal Kirim** | Menjadwalkan pesan sekali kirim atau berulang (cron) | Pengingat rutin, sapaan hari kerja, notifikasi terjadwal |
| **Balasan Otomatis** | Aturan balasan otomatis untuk pesan masuk yang cocok | Auto-reply di luar jam kerja, jawaban cepat untuk kata kunci tertentu |

## Cara cepat memilih

- "Saya mau kirim 1 pesan sekarang" → kirim dari perangkat di **Perangkat & QR**, atau lewat API. Hasilnya pantau di **Antrian Pesan**.
- "Saya mau kirim ke 200 pelanggan" → **Kirim Massal**.
- "Saya mau pengingat tiap Senin jam 08.00" → **Jadwal Kirim**.
- "Pesan masuk harus dibalas otomatis" → **Balasan Otomatis**.
- "Kok pesannya belum dibaca?" → cek statusnya di **Antrian Pesan** (lihat arti status di [08 — Troubleshooting dan FAQ](08-troubleshooting-faq.md)).

## Menghapus riwayat

- Di **Antrian Pesan**, pesan yang sudah selesai (`SENT`, `DELIVERED`, `READ`, `FAILED`, `CANCELLED`) punya tombol **Hapus** dengan dialog konfirmasi. Menghapus hanya membersihkan riwayat dari daftar — pesan yang sudah terkirim tidak bisa ditarik.
- Di **Kirim Massal** tab Riwayat, broadcast berstatus `COMPLETED` atau `CANCELLED` bisa dihapus dengan tombol **Hapus**.
- Pesan yang masih `QUEUED` hanya bisa **Cancel**, dan pesan `FAILED` bisa **Retry**. Tidak ada tombol hapus untuk pesan yang sedang diproses — supaya pengiriman yang sedang berjalan tidak hilang tanpa sengaja.

## Catatan singkat

1. Semua kiriman dari keempat submenu memakai antrean yang sama dan tahan restart — matikan browser, proses tetap jalan di server.
2. Kuota paket berlaku: jumlah pesan per bulan, jumlah perangkat, dan penyimpanan media. Cek di **Tagihan**.
3. Nomor yang masuk daftar **Jangan kirim** (suppression) dilewati oleh semua broadcast, termasuk yang dijadwalkan.
