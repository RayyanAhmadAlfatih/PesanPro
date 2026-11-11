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
   - `PESANPRO_MESSAGE_TEMPLATE`: opsional, isi pesan untuk form ini.
5. Jalankan `pesanProInstallTrigger()` satu kali dan setujui permission Google.
6. Jalankan `pesanProCheckConfiguration()`, lalu kirim response uji dari form.

Jangan menaruh token sebagai variable source, membagikan project Apps Script, atau menggunakan simple trigger. Retry dengan payload dan idempotency key yang sama aman karena PesanPro melakukan deduplication sebelum queue.

## Pesan custom per form

Satu project Apps Script biasanya menempel pada satu Google Form, jadi `PESANPRO_MESSAGE_TEMPLATE` sudah berlaku per form. Kalau satu script dipakai untuk beberapa form, tambahkan property `PESANPRO_MESSAGE_TEMPLATE_<FORM_ID>`. Template khusus form menang atas template umum. `FORM_ID` bisa dilihat di URL form atau lewat `pesanProCheckConfiguration()`.

Contoh isi `PESANPRO_MESSAGE_TEMPLATE`:

```
Halo {{field:Nama Lengkap}}, pendaftaran {{formTitle}} sudah kami terima.
Nomor tiket: {{responseId}}
Layanan: {{field:Layanan}}
```

| Placeholder | Isinya |
| --- | --- |
| `{{field:Nama Lengkap}}` | Jawaban pertanyaan dengan judul persis `Nama Lengkap`. Kosong kalau tidak ada. |
| `{{all_fields}}` | Semua jawaban, satu baris per pertanyaan dengan format `judul: jawaban`. |
| `{{formTitle}}` | Judul form. |
| `{{formId}}` | ID form. |
| `{{responseId}}` | ID response. |
| `{{submittedAt}}` | Waktu kirim. |
| `{{respondentEmail}}` | Email responden kalau form mengumpulkannya. |

Placeholder diganti di Apps Script sebelum payload dikirim, jadi `{{field:...}}` tidak sampai ke WhatsApp sebagai teks mentah. Kalau template kosong atau hasilnya kosong, connector tidak mengirim `message` dan PesanPro memakai pesan bawaan server. Pesan dibatasi 4.096 karakter. `messageTemplate` pada token integrasi tetap berlaku dan membungkus pesan ini lewat `{{message}}`.
