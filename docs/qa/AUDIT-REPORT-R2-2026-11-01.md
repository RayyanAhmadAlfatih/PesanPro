# Audit Bug Senyap PesanPro — Ronde 2 (1 November 2026)

Lanjutan `AUDIT-REPORT-2026-11-01.md` (ronde 1, rilis 0.2.1). Ronde 2 mengaudit
area yang belum tersentuh: autentikasi & API key, OTP, webhook & integrasi,
media/upload, dan route pesan langsung. Baseline: typecheck bersih, lint bersih,
447 tes lulus.

## Temuan yang diperbaiki

### Keamanan

1. **P1 — Media URL dikirim lewat jalur tanpa pengaman SSRF.** Saat pesan media
   dengan `mediaUrl` diantrekan, URL divalidasi dulu, tetapi Baileys mengunduhnya
   sendiri: redirect diikuti dan DNS di-resolve ulang tanpa pemeriksaan, jadi
   URL yang "baik" saat masuk antrean bisa dialihkan ke host internal (contoh:
   metadata cloud) saat diproses. Kini aplikasi mengunduh media lewat fetcher
   yang memvalidasi setiap lompatan redirect dan membatasi ukuran (maks 100 MB),
   lalu mengirim buffer-nya.
2. **Permintaan kode OTP membocorkan keberadaan akun.** Email terdaftar dapat
   jawaban 200, email tak dikenal 404 — cukup untuk memetakan akun mana yang
   ada. Kini semua email tak-layak-kirim dijawab dengan sukses generik yang
   sama.
3. **Limit login bisa dilewati dengan mengganti-ganti email.** Batas 5 percobaan
   terikat pada kombinasi IP+email yang dipilih penyerang sendiri. Kini ada
   batas tambahan per-IP (30 percobaan / 15 menit).
4. **Kuota OTP email bisa dibakar orang lain.** Batas per-email (3/15 menit)
   sebelumnya dikonsumsi bahkan untuk email yang tidak terdaftar, jadi 3 request
   anonim mengunci korban dari login OTP. Kini batas itu hanya dihitung untuk
   akun aktif.
5. **Kunci API legacy lolos dari semua kendali.** Kunci lama tinggal pengguna
   tetap berlaku dengan seluruh 16 scope, tanpa kedaluwarsa, tanpa IP allowlist,
   dan tidak terlihat di daftar kunci API. Sengaja TIDAK diubah karena itu
   jalur kompatibilitas — pemilik sistem yang memutuskan kapan mematikannya
   (`DELETE /api/user/api-key`). Dicatat sebagai tindak lanjut produk.

### Keandalan antrean & pekerja

6. **Pesan bisa terjebak "queued" selamanya.** Saat pekerja berhenti dengan
   anggun, pesan yang sudah kehabisan semua percobaan tetap dikembalikan ke
   antrean — tapi klaim baru menolak pesan tanpa sisa percobaan, dan pembersih
   dead-letter hanya menyapu status PROCESSING. Hasilnya: pesan menggantung
   abadi dan kuotanya tetap tertahan. Kini recovery langsung dead-letter-kan
   pesan habis-percobaan (kuota kembali, status penerima gagal, webhook FAILED).
7. **Pekerja yang hanya lambat bisa dihukum "FAILED".** Pembersih dead-letter
   memotong tepat saat sewa kedaluwarsa; pesan yang ternyata terkirim bisa
   tercatat gagal dan kuotanya kembali padahal terpakai. Kini ada jeda aman
   60 detik sebelum pesan benar-benar dinyatakan gagal total.
8. **Log percobaan webhook "berjalan" selamanya.** Percobaan milik pekerja yang
   mati mendadak tidak pernah ditutup, jadi log pengiriman menampilkan baris
   hantu yang masih berjalan. Kini setiap klaim baru menutup percobaan yatim,
   dan pekerja yang bangun setelah sewanya lepas tidak lagi membuat baris
   PROCESSING baru.

### Media & upload

9. **Media terkarantina menggantung kuota penyimpanan selamanya.** Berkas yang
   gagal validasi integritas tidak pernah dibersihkan. Kini ikut dalam sweep
   retensi biasa.
10. **Unggah media legacy membuffer seluruh body sebelum cek ukuran.** Kini
    Content-Length dicek dulu; body raksasa ditolak sebelum dialokasikan.
11. **Parser unggah menelan field ke-x tanpa pesan.** Batas jumlah field kini
    ditolak dengan error jelas, bukan diam-diam menghilangkan field `sessionId`.
12. **JID `@newsletter` (Channel WhatsApp) ditolak diam-diam.** Route media punya
    aturan khusus newsletter, tapi normalisasi penerima menolak domain itu —
    aturan JPEG-nya jadi kode mati. Kini Channel diterima di semua jalur.

### Konsistensi API

13. **Nomor `08…` berperilaku beda antar endpoint.** Endpoint antrean (/send,
    /reply) menormalkan nomor lokal; endpoint langsung (list, poll, contact,
    location, hapus/edit pesan, reaksi, bintang) meneruskannya mentah sehingga
    pesan diam-diam tidak sampai. Semua kini menormalkan dengan aturan yang sama
    dan menolak penerima tak valid dengan 422 yang jelas (sebelumnya 500 generik).
14. **Hash kanonik bergantung locale.** Pengurutan kunci JSON memakai
    `localeCompare` yang hasilnya bisa berubah antara versi ICU Node — dedup
    event webhook dan idempotensi integrasi bisa rusak diam-diam setelah
    upgrade. Kini diurutkan per codepoint.
15. **Error kegagalan DB saat validasi API key terlihat sebagai 401.** Kunci
    valid bisa "ditolak" saat database bermasalah. Kini error diteruskan sebagai
    500 dengan request id.
16. **Event `message.sent` bisa hilang tanpa jejak.** `catch` kosong kini
    mencatat error di log.

### Lainnya

17. **Logout tidak mematikan token.** Cookie JWT yang disalin tetap hidup sampai
    jendela idle habis. Kini logout menaikkan `sessionVersion`, sehingga semua
    salinan token langsung gagal. Catatan perilaku: logout di satu perangkat
    mengakhiri sesi di semua perangkat (sama seperti ganti sandi).
18. **Bias modulo pada pembuatan kunci API.** Karakter pertama alfabet ~1,6%
    lebih sering muncul. Kini memakai sampling seragam (`crypto.randomInt`).

## Yang diuji

- Tes regresi baru (+17): pemulihan antrean (requeue vs dead-letter, batch
  campuran), buffer media & pemetaan error SSRF/retry, normalisasi penerima
  (newsletter, format berbau, penolakan), sort kanonik bebas-ICU.
- Gerbang penuh setelah perbaikan, semua hijau:
  - `tsc --noEmit` bersih (heap 8 GB).
  - `eslint` bersih pada semua file yang diubah.
  - `npm test`: 464 tes lulus dari 107 file (naik dari 447).
  - Build produksi `next build --webpack` berhasil di lokal (heap 6 GB).
- `npm audit`: tidak berubah dari ronde 1 (temuan lama rantai `jimp`/Baileys
  rc/`vite`, ditindaklanjuti terpisah).

## Catatan deploy

- Tidak ada perubahan skema database dan tidak ada migrasi.
- Runtime membaca `src/`, jadi setelah `git pull` wajib build + `pm2 restart
  pesanpro`.
- Perubahan perilaku yang perlu diketahui:
  - Permintaan kode OTP selalu menjawab sukses generik untuk email yang tidak
    bisa diproses.
  - Logout mengakhiri sesi di semua perangkat.
  - Kirim media via URL kini dibatasi 100 MB per unduhan.
