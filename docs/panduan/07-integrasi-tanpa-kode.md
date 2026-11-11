# 07 — Integrasi tanpa kode

Panduan ini untuk pemilik toko online atau pengguna WordPress/Google Forms yang ingin mengirim WhatsApp otomatis tanpa membangun aplikasi sendiri.

Semua integrasi memakai **integration token** (`ppint_...`), bukan API key. Token ini:

- Dibuat di menu **Integrasi → Token Integrasi** (hanya ada di satu tempat ini).
- Terikat ke satu perangkat WhatsApp.
- Hanya ditampilkan sekali.
- Bisa dicabut kapan saja.

### Bedanya integration token (`ppint_...`) dengan API key (`wag_...`)

| | Integration token | API key |
| --- | --- | --- |
| Format | `ppint_` diikuti 40–100 karakter | `wag_` diikuti karakter acak |
| Dibuat di | **Integrasi → Token Integrasi** | **Integrasi → Kunci API** (kartu **Create API key**) |
| Untuk siapa | Plugin dan konektor tanpa kode (Contact Form 7, Google Forms, WooCommerce, Elementor Form) | Programmer yang memanggil REST API lengkap |
| Cakupan | Satu perangkat WhatsApp, satu tugas: kirim pesan | Semua endpoint yang diizinkan scope-nya |
| Header autentikasi | `x-integration-token: ppint_...` atau `Authorization: Bearer ppint_...` | `x-api-key: wag_...` |

**Keduanya tidak bisa saling menggantikan.** Plugin Contact Form 7 hanya menerima token berformat `ppint_...` — kalau Anda mengisi API key `wag_...`, plugin menolak dengan pesan "Integration token format is invalid." Sebaliknya, integration token tidak bisa dipakai untuk memanggil endpoint REST API lain karena hanya berlaku untuk endpoint integrasi.

## Menyiapkan integration token

1. Buka menu **Integrasi → Token Integrasi** di dashboard.
2. Di kartu **Buat token integrasi**, isi:
   - **Nama** — penanda token untuk Anda, misalnya `Notifikasi Contact Form 7`.
   - **Tipe integrasi** — pilih salah satu:
     - `Contact Form 7` untuk Contact Form 7.
     - `WooCommerce` untuk WooCommerce.
     - `Google Forms` untuk Google Forms.
     - `WordPress (form kustom)` untuk form WordPress lain, termasuk Elementor Form.
   - **Perangkat WhatsApp** — perangkat pengirim. Hanya perangkat milik akun Anda yang muncul. Kalau daftar kosong, tambahkan perangkat dulu di menu **Perangkat & QR**.
   - **Tanggal kedaluwarsa (opsional)** — kosongkan supaya aktif sampai dicabut.
3. Isi bagian **Mapping (opsional)** kalau perlu:
   - **Nomor tetap (staticRecipient)** — semua pesan masuk ke satu nomor, misalnya nomor admin. Menang atas field penerima.
   - **Field penerima (recipientField)** — nama field form yang berisi nomor WhatsApp pengisi form.
   - **Template pesan (messageTemplate)** — misalnya `Pesan baru dari {{field:nama}}: {{message}}`.
4. Klik tombol **Buat token**.
5. Secret `ppint_...` tampil di kartu **Salin secret sekarang**. Klik **Salin secret**, simpan di tempat aman, lalu klik **Sembunyikan**. Secret **hanya ditampilkan sekali** — setelah halaman ditutup, yang tampil hanya preview. Kalau hilang, buat token baru lalu cabut yang lama dari kartu **Daftar token** (tombol **Cabut**).

Token dikirim lewat header:

```http
x-integration-token: ppint_xxxxxxxxxxxxxxxx
```

atau:

```http
Authorization: Bearer ppint_xxxxxxxxxxxxxxxx
```

---

## WordPress + Contact Form 7

Plugin tersedia sebagai ZIP langsung dari aplikasi. Buka menu **Integrasi → Kunci API** (judul halamannya **Developer**), cari kartu **Plugin WordPress**, lalu unduh plugin yang dibutuhkan.

| Plugin | Tipe token | URL unduhan |
| --- | --- | --- |
| Contact Form 7 | `Contact Form 7` | `https://pesanpro.kingofcoding.my.id/api/public/plugin/wordpress` |
| WooCommerce | `WooCommerce` | `https://pesanpro.kingofcoding.my.id/api/public/plugin/woocommerce` |
| Elementor Form | `WordPress (form kustom)` | `https://pesanpro.kingofcoding.my.id/api/public/plugin/elementor` |

Tiap plugin punya halaman pengaturan sendiri. Pesan ditulis dan diganti di WordPress sebelum dikirim, jadi satu token bisa melayani banyak form dengan teks berbeda.

### Yang dibutuhkan

- WordPress 6.7 atau lebih baru.
- PHP 7.4 atau lebih baru.
- Contact Form 7 aktif.
- WP-Cron berjalan.

### Langkah instalasi

1. Buat integration token tipe **Contact Form 7** di menu **Integrasi → Token Integrasi** (langkah lengkap di atas).
2. Unduh ZIP **Contact Form 7** dari menu **Integrasi → Kunci API**, kartu **Plugin WordPress**.
3. Di WordPress, buka **Plugins → Add New → Upload Plugin**, pilih ZIP-nya, lalu klik **Install Now**.
4. Aktifkan plugin di **Plugins**.
5. Buka **Settings → PesanPro CF7**.
6. Isi:
   - **PesanPro base URL** — `https://pesanpro.kingofcoding.my.id` (tanpa slash di akhir).
   - **Form ID** — opsional; kosongkan untuk semua form.
   - **Recipient field** — nama field Contact Form 7 yang berisi nomor WhatsApp, misalnya `whatsapp`. Nama field yang tersedia di formulir ditampilkan tepat di bawah kolom ini; salin dari situ, jangan dikira-kira. Kalau namanya tidak cocok, nomor tujuan kosong dan kiriman gagal.
   - **Static recipient** — isi kalau semua notifikasi dikirim ke nomor admin. Kalau kolom ini terisi, nama field penerima diabaikan.
6. Simpan token dengan salah satu cara:
   - **Disarankan:** tambahkan di `wp-config.php`:
     ```php
     define( 'PESANPRO_CF7_TOKEN', 'ppint_xxxxxxxxxxxxxxxx' );
     ```
   - Atau isi sekali di kolom password pada halaman pengaturan.
7. Simpan pengaturan.
8. Buka **Tools → Site Health** untuk memastikan tidak ada error.
9. Kirim form uji.
10. Buka **Antrian Pesan** di PesanPro untuk memastikan job masuk.

### Field form yang didukung

Plugin membaca field Contact Form 7 yang terkirim. Contoh form:

```
[text* nama placeholder "Nama"]
[tel* whatsapp placeholder "08xxxxxxxxxx"]
[email email placeholder "Email"]
[textarea pesan placeholder "Pesan"]
[submit "Kirim"]
```

Dengan **Recipient field** = `whatsapp`, pesan akan dikirim ke nomor yang diisi pelanggan.

Kalau **Recipient field** kosong dan **Static recipient** diisi, semua notifikasi dikirim ke nomor admin.

### Pesan custom per form

Plugin versi 1.2.0 menambah tab **PesanPro** di editor Contact Form 7. Isi pesan disimpan per form, jadi form "Hubungi Kami" dan form "Pesan Produk" bisa memakai teks berbeda walau memakai token integrasi yang sama.

1. Buka **Contact → Contact Forms**, lalu edit form yang ingin diubah.
2. Klik tab **PesanPro**.
3. Tulis pesan di kolom **Isi pesan**. Nama field yang bisa dipakai ditampilkan di bawah kolom.
4. Klik **Save** pada Contact Form 7, lalu kirim form uji dan cek **Antrian Pesan**.

Contoh isi kolom **Isi pesan**:

```
Halo {{field:nama}}, terima kasih sudah menghubungi {{formTitle}}.
Nomor tiket: {{submissionId}}
Pesan: {{field:pesan}}
```

| Placeholder | Isinya |
| --- | --- |
| `{{field:nama}}` | Isi field bernama `nama`. Kosong kalau field tidak ada atau tidak diisi. |
| `{{all_fields}}` | Semua field, satu baris per field dengan format `nama: isi`. |
| `{{formTitle}}` | Judul form. |
| `{{formId}}` | ID form. |
| `{{submissionId}}` | ID kiriman. |
| `{{submittedAt}}` | Waktu kirim. |
| `{{site}}` | Alamat situs WordPress. |

Yang perlu diperhatikan:

- **Form ID** di **Settings → PesanPro CF7** sebaiknya dikosongkan kalau Anda memakai lebih dari satu form. Kalau diisi, hanya form itu yang diproses.
- Kolom kosong, atau pesan yang setelah placeholder diganti menjadi kosong, memakai pesan bawaan PesanPro: judul form diikuti daftar field.
- Placeholder diganti di WordPress sebelum pesan dikirim. Tulis `{{field:nama}}`, bukan `[nama]` seperti mail-tag pada tab Mail.
- Pesan dibatasi 4.096 karakter supaya tidak ditolak server.
- **Template pesan (messageTemplate)** pada token integrasi tetap berlaku dan membungkus pesan tab ini lewat `{{message}}`. Template token berlaku untuk semua form yang memakai token itu, sedangkan tab **PesanPro** berlaku untuk satu form.

### Kalau WP-Cron tidak berjalan

Plugin memakai WP-Cron untuk memproses antrean. Di hosting yang mematikan WP-Cron, tambahkan cron server:

```bash
*/5 * * * * curl -s https://toko-anda.com/wp-cron.php?doing_wp_cron > /dev/null 2>&1
```

Lalu tambahkan di `wp-config.php`:

```php
define( 'DISABLE_WP_CRON', true );
```

### Kalau halaman pengaturan menampilkan "failed"

Baris **Queue** di halaman **Settings → PesanPro CF7** menghitung submission: pending, retrying, failed, dan sent. Sejak plugin versi 1.1.0, alasan kegagalan ditampilkan di bawah hitungan itu, misalnya:

- **401 — token ditolak.** Token salah tipe (misalnya token `WORDPRESS` dipakai untuk Contact Form 7), sudah dicabut, kedaluwarsa, atau tersalin tidak lengkap. Buat token baru tipe **Contact Form 7**, lalu perbarui `PESANPRO_CF7_TOKEN` atau isi ulang kolom **Integration token**.
- **422 — data ditolak.** Biasanya **Recipient field name** tidak cocok dengan nama field di form, sehingga nomor tujuan kosong. Samakan dengan nama field Contact Form 7 Anda (misalnya `whatsapp`), atau isi **Static recipient**.
- **recipient_missing — nomor tujuan kosong.** Sama penyebabnya dengan 422, tetapi plugin kini menangkapnya di WordPress dan tidak mengirim sama sekali. Sejak versi 1.1.1, nama field yang benar-benar ada di formulir ditampilkan di bawah pesan; salin satu ke **Recipient field name**.
- **403 — paket tidak mencakup integrasi.** Periksa menu **Tagihan**.
- **404 — base URL salah.** Pastikan **PesanPro base URL** = `https://pesanpro.kingofcoding.my.id`.
- **network_error — server tidak bisa dihubungi.** Biasanya firewall hosting memblokir koneksi keluar.

Setelah penyebabnya diperbaiki, klik **Coba kirim ulang yang gagal**. Submission yang gagal tidak dicoba ulang otomatis — tanpa tombol ini baris tersebut akan tetap berstatus failed sampai masa retensi berakhir.

### Menghentikan integrasi

Cabut token di menu **Integrasi → Token Integrasi**: cari token di kartu **Daftar token**, lalu klik **Cabut**. Token yang dicabut tampil dengan status **REVOKED** dan langsung tidak bisa dipakai. Atau nonaktifkan plugin. Data plugin tidak dihapus otomatis saat uninstall; tambahkan `define( 'PESANPRO_CF7_REMOVE_DATA', true );` sebelum uninstall kalau ingin menghapus data.

---

## WooCommerce

Plugin **PesanPro for WooCommerce** tersedia sebagai ZIP di kartu **Plugin WordPress** pada halaman Developer: `https://pesanpro.kingofcoding.my.id/api/public/plugin/woocommerce`. Plugin ini menulis pesan berbeda untuk tiap status pesanan. Endpoint yang dipakai:

```
POST /api/v1/integrations/woocommerce
```

### Yang dibutuhkan

- WordPress 6.7 atau lebih baru, PHP 7.4 atau lebih baru.
- WooCommerce aktif.
- WP-Cron berjalan.
- Integration token tipe **WooCommerce**.

### Langkah instalasi

1. Buat integration token tipe **WooCommerce** di menu **Integrasi → Token Integrasi**.
2. Unduh ZIP **WooCommerce**, lalu unggah di **Plugins → Add New → Upload Plugin**.
3. Aktifkan plugin.
4. Buka **Settings → PesanPro WooCommerce**.
5. Isi **PesanPro base URL** dengan `https://pesanpro.kingofcoding.my.id` (tanpa slash di akhir).
6. Simpan token:
   - **Disarankan:** `define( 'PESANPRO_WOO_TOKEN', 'ppint_xxxxxxxxxxxxxxxx' );` di `wp-config.php`.
   - Atau isi sekali di kolom **Integration token**.
7. Isi **Static recipient** kalau semua notifikasi harus masuk ke nomor admin. Kosongkan untuk memakai nomor billing pembeli.
8. Tulis pesan di kolom tiap status, lalu simpan.
9. Ubah status pesanan uji dari `pending` ke `processing`, lalu cek **Antrian Pesan** di PesanPro.

### Pesan per status

| Event | Status WooCommerce | Aktif bawaan |
| --- | --- | --- |
| `order.created` | Pesanan baru dibuat | Ya |
| `order.updated` | Status lain di luar daftar | Tidak |
| `order.paid` | `processing` | Ya |
| `order.completed` | `completed` | Ya |
| `order.cancelled` | `cancelled` | Ya |
| `order.refunded` | `refunded` | Ya |

`order.updated` tidak aktif bawaan supaya perubahan status tidak mengirim notifikasi ganda. Centang kotak di sebelah status untuk mengaktifkannya, atau hapus centang untuk mematikan status lain. Kolom pesan kosong memakai teks bawaan plugin.

Contoh isi kolom **Pesanan dibayar**:

```
Halo {{customerName}}, pembayaran pesanan #{{orderNumber}} sebesar {{orderTotal}} {{currency}} sudah kami terima.
Item: {{items}}
```

| Placeholder | Isinya |
| --- | --- |
| `{{orderId}}`, `{{orderNumber}}` | ID dan nomor pesanan |
| `{{customerName}}`, `{{customerLastName}}`, `{{customerPhone}}`, `{{customerEmail}}` | Data billing pembeli |
| `{{orderTotal}}`, `{{currency}}`, `{{paymentMethod}}`, `{{shippingMethod}}` | Ringkasan pembayaran dan pengiriman |
| `{{items}}` | Daftar produk dengan jumlah |
| `{{status}}`, `{{event}}` | Status WooCommerce dan nama event PesanPro |
| `{{billingCity}}`, `{{shippingCity}}`, `{{site}}`, `{{submittedAt}}` | Kota, alamat situs, dan waktu |
| `{{all_fields}}` | Semua nilai di atas, satu baris per field |
| `{{field:orderId}}` | Bentuk alternatif untuk field yang sama |

Placeholder diganti di WordPress sebelum pesan dikirim. Placeholder yang tidak dikenal menjadi teks kosong. Pesan dibatasi 4.096 karakter. `messageTemplate` pada token tetap bisa membungkus pesan ini lewat `{{message}}`.

### Antrean dan kegagalan

Kiriman disimpan di tabel lokal WordPress dan dikirim WP-Cron. Satu pasangan order dan event punya satu idempotency key, jadi status yang berubah bolak-balik tidak mengirim pesan yang sama dua kali. Kalau gateway sedang mati, plugin mencoba ulang sampai delapan kali.

Baris **Queue** di halaman pengaturan menampilkan pending, retrying, failed, dan sent. Alasan gagal yang umum:

- **401 — token ditolak.** Token salah tipe, dicabut, kedaluwarsa, atau tersalin tidak lengkap.
- **403 — paket tidak mencakup integrasi.** Periksa menu **Tagihan**.
- **404 — base URL salah.**
- **422 — nomor tujuan tidak valid atau pesan kosong.**
- **recipient_missing — nomor billing kosong.** Isi nomor pelanggan atau **Static recipient**.
- **network_error — server PesanPro tidak bisa dihubungi.**

Perbaiki penyebabnya, lalu klik **Coba kirim ulang yang gagal**.

### Menghentikan integrasi

Cabut token di **Integrasi → Token Integrasi**, atau nonaktifkan plugin. Data tidak dihapus saat uninstall; tambahkan `define( 'PESANPRO_WOO_REMOVE_DATA', true );` sebelum uninstall kalau ingin menghapus tabel antrean dan pengaturan.

---

## Google Forms

Connector di distribusikan sebagai ZIP yang bisa diunduh langsung, sama seperti plugin WordPress:

```
https://pesanpro.kingofcoding.my.id/api/public/integration/google-forms
```

Berkas ZIP berisi folder `pesanpro-google-forms/` dengan `Code.gs`, `appsscript.json`, dan README ringkas.

### Langkah

1. Buat integration token tipe **Google Forms** di menu **Integrasi → Token Integrasi**.
2. Buka form target → **Extensions → Apps Script**.
3. Ganti isi `Code.gs` dan `appsscript.json` dengan isi file dari ZIP connector di atas.
4. Buka **Project Settings → Script Properties** dan isi:
   - `PESANPRO_BASE_URL` — `https://pesanpro.kingofcoding.my.id`.
   - `PESANPRO_TOKEN` — token `ppint_...`.
   - `PESANPRO_RECIPIENT_FIELD` — judul pertanyaan nomor WhatsApp.
   - atau `PESANPRO_STATIC_RECIPIENT` — nomor tetap.
   - `PESANPRO_MESSAGE_TEMPLATE` — opsional, isi pesan untuk form ini.
5. Jalankan fungsi `pesanProInstallTrigger()` satu kali.
6. Setujui permission Google.
7. Jalankan `pesanProCheckConfiguration()`.
8. Kirim response uji dari form.
9. Periksa **Antrian Pesan** di PesanPro.

### Pesan custom per form

Satu project Apps Script biasanya menempel pada satu Google Form, jadi `PESANPRO_MESSAGE_TEMPLATE` sudah berlaku per form. Kalau satu script dipakai untuk beberapa form, tambahkan property `PESANPRO_MESSAGE_TEMPLATE_<FORM_ID>`. Template khusus form menang atas template umum. ID form bisa dilihat di URL form atau lewat `pesanProCheckConfiguration()`.

Contoh isi `PESANPRO_MESSAGE_TEMPLATE`:

```
Halo {{field:Nama Lengkap}}, pendaftaran {{formTitle}} sudah kami terima.
Nomor tiket: {{responseId}}
Layanan: {{field:Layanan}}
```

| Placeholder | Isinya |
| --- | --- |
| `{{field:Nama Lengkap}}` | Jawaban pertanyaan dengan judul persis `Nama Lengkap`. Kosong kalau tidak ada. |
| `{{all_fields}}` | Semua jawaban, satu baris per pertanyaan. |
| `{{formTitle}}`, `{{formId}}` | Judul dan ID form. |
| `{{responseId}}`, `{{submittedAt}}` | ID response dan waktu kirim. |
| `{{respondentEmail}}` | Email responden kalau form mengumpulkannya. |

Placeholder diganti di Apps Script sebelum payload dikirim, jadi `{{field:...}}` tidak sampai ke WhatsApp sebagai teks mentah. Kalau template kosong atau hasilnya kosong, connector tidak mengirim `message` dan PesanPro memakai pesan bawaan server. Pesan dibatasi 4.096 karakter. `messageTemplate` pada token tetap berlaku dan membungkus pesan ini lewat `{{message}}`.

### Yang perlu diperhatikan

- Gunakan **installable trigger**, bukan simple trigger.
- Jangan menaruh token di source code atau membagikan project Apps Script.
- Retry dengan payload dan idempotency key yang sama aman; PesanPro melakukan deduplication.
- Setiap response form memakai `submissionId` unik sebagai dasar idempotency.

---

## Elementor Form

Plugin **PesanPro for Elementor Form** tersedia di kartu **Plugin WordPress**: `https://pesanpro.kingofcoding.my.id/api/public/plugin/elementor`. Plugin memakai token tipe **WordPress (form kustom)** dan endpoint `/api/v1/integrations/wordpress`. Tidak ada tipe token khusus Elementor.

### Yang dibutuhkan

- WordPress 6.7 atau lebih baru, PHP 7.4 atau lebih baru.
- Elementor Pro dengan widget Form aktif.
- WP-Cron berjalan.
- Integration token tipe **WordPress (form kustom)**.

### Langkah instalasi

1. Buat token tipe **WordPress (form kustom)** di menu **Integrasi → Token Integrasi**.
2. Unduh ZIP **Elementor Form**, unggah di **Plugins → Add New → Upload Plugin**, lalu aktifkan.
3. Buka **Settings → PesanPro Elementor**.
4. Isi **PesanPro base URL** dan token. Token juga bisa ditaruh di `wp-config.php`:
   ```php
   define( 'PESANPRO_ELEMENTOR_TOKEN', 'ppint_xxxxxxxxxxxxxxxx' );
   ```
5. Isi **Default recipient field ID** dengan ID field nomor WhatsApp, misalnya `whatsapp`. Ini ID field Elementor, bukan labelnya.
6. Di tabel **Daftar form**, tambahkan satu baris per form:
   - **Nama form** — sama persis dengan kolom **Form Name** di widget Elementor.
   - **Field penerima** — isi kalau form ini memakai ID field nomor yang berbeda.
   - **Isi pesan** — teks khusus form ini.
7. Kirim form uji, lalu cek **Antrian Pesan** di PesanPro.

Bawaan **Form yang diproses** adalah hanya form yang ada di daftar. Ubah ke **Semua form Elementor** kalau semua form memang boleh mengirim WhatsApp. Nama form yang pernah terkirim muncul di halaman pengaturan untuk membantu mengisi **Nama form**.

Contoh **Isi pesan** untuk form "Hubungi Kami":

```
Halo {{field:nama}}, permintaan dari {{formTitle}} sudah kami terima.
Nomor tiket: {{submissionId}}
Pesan: {{field:pesan}}
```

| Placeholder | Isinya |
| --- | --- |
| `{{field:nama}}` | Jawaban field dengan ID `nama`. Kosong kalau tidak ada. |
| `{{all_fields}}` | Semua field, satu baris per field. |
| `{{formTitle}}`, `{{formId}}` | Nama dan ID form Elementor. |
| `{{submissionId}}`, `{{submittedAt}}`, `{{site}}` | ID kiriman, waktu, dan alamat situs. |

Placeholder diganti di WordPress sebelum pesan dikirim. **Pesan bawaan** dipakai kalau baris form tidak punya pesan; kalau itu juga kosong, plugin menyusun daftar field. Pesan dibatasi 4.096 karakter.

### Antrean dan kegagalan

Kiriman masuk antrean lokal WordPress dan dikirim WP-Cron, sama seperti plugin Contact Form 7 dan WooCommerce. Nomor tujuan kosong dicatat sebagai `recipient_missing` tanpa mengirim request ke PesanPro. Token tipe lain ditolak dengan 401. Perbaiki penyebabnya di **Settings → PesanPro Elementor**, lalu klik **Coba kirim ulang yang gagal**.

Data tidak dihapus saat uninstall; tambahkan `define( 'PESANPRO_ELEMENTOR_REMOVE_DATA', true );` sebelum uninstall kalau ingin menghapus tabel antrean dan pengaturan.

---

## WordPress kustom (form plugin lain)

Plugin **Elementor Form** memakai endpoint yang sama lewat token tipe **WordPress (form kustom)**. Kalau Anda memakai form plugin lain dan ingin mengirim sendiri, kirim payload ke:

```
POST /api/v1/integrations/wordpress
```

```json
{
  "submissionId": "form-12345",
  "recipient": "628123456789",
  "message": "Pesan baru dari Ayu: minta penawaran.",
  "site": "https://toko-anda.com"
}
```

Header wajib:

```http
x-integration-token: ppint_xxxxxxxxxxxxxxxx
Content-Type: application/json
Idempotency-Key: form-12345
```

Contoh PHP:

```php
wp_remote_post('https://pesanpro.kingofcoding.my.id/api/v1/integrations/wordpress', [
    'timeout' => 15,
    'headers' => [
        'Content-Type'        => 'application/json',
        'x-integration-token' => PESANPRO_TOKEN,
        'Idempotency-Key'     => 'form-' . $submission_id,
    ],
    'body' => wp_json_encode([
        'submissionId' => (string) $submission_id,
        'recipient'    => $phone,
        'message'      => $message,
        'site'         => home_url(),
    ]),
]);
```

---

## Mapping pesan

Mapping memungkinkan Anda mengubah isi pesan tanpa mengubah kode integrasi.

| Field mapping | Arti |
| --- | --- |
| `recipientField` | Nama field yang berisi nomor tujuan |
| `staticRecipient` | Nomor tetap; menang atas `recipientField` |
| `messageTemplate` | Template pesan |

Placeholder yang tersedia di `messageTemplate`:

| Placeholder | Diganti dengan |
| --- | --- |
| `{{message}}` | Pesan final dari konektor |
| `{{sourceId}}` | ID submission atau order |
| `{{field:nama}}` | Nilai field form bernama `nama`. Hanya tersedia pada Contact Form 7 dan Google Forms. |
| `{{event}}` | Nama event. Hanya tersedia pada WooCommerce. |
| `{{site}}` | Alamat situs. Tersedia pada Contact Form 7 dan WordPress kustom. |

Placeholder yang tidak dikirim konektor diganti teks kosong. Karena WooCommerce dan WordPress kustom tidak mengirim daftar field, jangan memakai `{{field:...}}` pada token untuk kedua jalur itu.

Contoh untuk token WooCommerce:

```
Pesanan {{sourceId}} ({{event}}): {{message}}
```

Kalau template menghasilkan pesan kosong atau lebih dari 4.096 karakter, request ditolak `INVALID_MESSAGE`.

`messageTemplate` diatur pada token, jadi satu template berlaku untuk semua form yang memakai token itu. Pesan yang berbeda antar form atau event disusun di sisi konektor:

| Sumber | Tempat mengatur pesan |
| --- | --- |
| Contact Form 7 | Tab **PesanPro** pada tiap form |
| WooCommerce | Kolom tiap status di **Settings → PesanPro WooCommerce** |
| Elementor Form | Baris tiap form di **Settings → PesanPro Elementor** |
| Google Forms | Script Property `PESANPRO_MESSAGE_TEMPLATE` |
| WordPress kustom | Kode PHP pada situs Anda |

`{{message}}` berisi teks yang sudah diganti placeholder-nya di WordPress atau Apps Script. Kosongkan pengaturan pesan pada konektor kalau ingin memakai pesan bawaan server.

---

## Checklist integrasi

1. Token disimpan di server, bukan di browser.
2. Token bisa dicabut tanpa mengubah kode.
3. `Idempotency-Key` stabil per kejadian.
4. Endpoint PesanPro bisa diakses dari server Anda (HTTPS, DNS benar).
5. Form uji benar-benar masuk ke Antrian Pesan.
6. Nomor tujuan memakai format yang benar.
7. Ada penanganan error dan log di sisi WordPress/Google.
8. Pesan per form atau per event diatur di konektor, bukan di `messageTemplate` token.
9. Kebijakan privasi menyebut pengiriman data ke PesanPro.
