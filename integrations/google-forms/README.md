# PesanPro Google Forms Connector

Connector ini memakai installable `onFormSubmit` trigger. Token disimpan di Script Properties dan setiap response dikirim dengan idempotency key SHA-256 yang stabil.

## Instalasi

1. Buat integration token bertipe `GOOGLE_FORMS` di PesanPro. Pilih device dan mapping recipient/message.
2. Dari Google Form target, buka **Extensions > Apps Script**.
3. Ganti `Code.gs` dan `appsscript.json` dengan file dalam folder ini.
4. Buka **Project Settings > Script Properties** dan isi:
   - `PESANPRO_BASE_URL`: URL HTTPS PesanPro tanpa slash terakhir.
   - `PESANPRO_TOKEN`: secret `ppint_...` yang hanya ditampilkan sekali.
   - `PESANPRO_RECIPIENT_FIELD`: judul pertanyaan nomor WhatsApp, atau gunakan `PESANPRO_STATIC_RECIPIENT`.
5. Jalankan `pesanProInstallTrigger()` satu kali dan setujui permission Google.
6. Jalankan `pesanProCheckConfiguration()`, lalu kirim response uji dari form.

Jangan menaruh token sebagai variable source, membagikan project Apps Script, atau menggunakan simple trigger. Retry dengan payload dan idempotency key yang sama aman karena PesanPro melakukan deduplication sebelum queue.
