# 07 — Integrasi tanpa kode

Panduan ini untuk pemilik toko online atau pengguna WordPress/Google Forms yang ingin mengirim WhatsApp otomatis tanpa membangun aplikasi sendiri.

Semua integrasi memakai **integration token** (`ppint_...`), bukan API key. Token ini:

- Dibuat di dashboard → **Developer** atau **Integrations**.
- Terikat ke satu perangkat WhatsApp.
- Hanya ditampilkan sekali.
- Bisa dicabut kapan saja.

## Menyiapkan integration token

1. Buka dashboard → **Developer**.
2. Buat integration token dengan tipe yang sesuai:
   - `CONTACT_FORM_7` untuk Contact Form 7.
   - `WOOCOMMERCE` untuk WooCommerce.
   - `GOOGLE_FORMS` untuk Google Forms.
   - `WORDPRESS` untuk form WordPress kustom.
3. Pilih perangkat WhatsApp.
4. Isi mapping (opsional):
   - `recipientField` — nama field yang berisi nomor WhatsApp.
   - `staticRecipient` — nomor tetap, kalau semua pesan dikirim ke admin.
   - `messageTemplate` — template pesan, misalnya `Pesan baru dari {{field:nama}}: {{message}}`.
5. Simpan dan salin token.

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

Plugin tersedia di folder `integrations/wordpress/pesanpro-contact-form-7/`.

### Yang dibutuhkan

- WordPress 6.7 atau lebih baru.
- PHP 7.4 atau lebih baru.
- Contact Form 7 aktif.
- WP-Cron berjalan.

### Langkah instalasi

1. Buat integration token tipe `CONTACT_FORM_7` di PesanPro.
2. Salin folder `pesanpro-contact-form-7` ke `/wp-content/plugins/`.
3. Aktifkan plugin di **Plugins**.
4. Buka **Settings → PesanPro CF7**.
5. Isi:
   - **PesanPro base URL** — `https://wagateway.kingofcoding.my.id` (tanpa slash di akhir).
   - **Form ID** — opsional; kosongkan untuk semua form.
   - **Recipient field** — nama field Contact Form 7 yang berisi nomor WhatsApp, misalnya `whatsapp`.
   - **Static recipient** — isi kalau semua notifikasi dikirim ke nomor admin.
6. Simpan token dengan salah satu cara:
   - **Disarankan:** tambahkan di `wp-config.php`:
     ```php
     define( 'PESANPRO_CF7_TOKEN', 'ppint_xxxxxxxxxxxxxxxx' );
     ```
   - Atau isi sekali di kolom password pada halaman pengaturan.
7. Simpan pengaturan.
8. Buka **Tools → Site Health** untuk memastikan tidak ada error.
9. Kirim form uji.
10. Buka **Message Queue** di PesanPro untuk memastikan job masuk.

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

### Kalau WP-Cron tidak berjalan

Plugin memakai WP-Cron untuk memproses antrean. Di hosting yang mematikan WP-Cron, tambahkan cron server:

```bash
*/5 * * * * curl -s https://toko-anda.com/wp-cron.php?doing_wp_cron > /dev/null 2>&1
```

Lalu tambahkan di `wp-config.php`:

```php
define( 'DISABLE_WP_CRON', true );
```

### Menghentikan integrasi

Cabut token di PesanPro, atau nonaktifkan plugin. Data plugin tidak dihapus otomatis saat uninstall; tambahkan `define( 'PESANPRO_CF7_REMOVE_DATA', true );` sebelum uninstall kalau ingin menghapus data.

---

## WooCommerce

WooCommerce tidak punya plugin bawaan di repositori ini, tetapi bisa dihubungkan dengan **mu-plugin** kecil. Endpoint yang dipakai:

```
POST /api/v1/integrations/woocommerce
```

Payload:

```json
{
  "orderId": "1042",
  "event": "order.paid",
  "recipient": "628123456789",
  "message": "Pesanan #1042 sudah dibayar."
}
```

`event` yang diterima: `order.created`, `order.updated`, `order.paid`, `order.completed`, `order.cancelled`, `order.refunded`.

### Langkah

1. Buat integration token tipe `WOOCOMMERCE`.
2. Tambahkan di `wp-config.php`:
   ```php
   define( 'PESANPRO_WOO_TOKEN', 'ppint_xxxxxxxxxxxxxxxx' );
   define( 'PESANPRO_BASE_URL', 'https://wagateway.kingofcoding.my.id' );
   ```
3. Buat file `/wp-content/mu-plugins/pesanpro-woocommerce.php`:

```php
<?php
/**
 * Plugin Name: PesanPro WooCommerce Connector
 * Description: Kirim notifikasi WhatsApp saat status pesanan berubah.
 */

if (!defined('ABSPATH')) {
    exit;
}

add_action('woocommerce_order_status_changed', function ($orderId, $from, $to, $order) {
    if (!defined('PESANPRO_WOO_TOKEN') || !defined('PESANPRO_BASE_URL')) {
        return;
    }

    $eventMap = [
        'pending'    => 'order.created',
        'processing' => 'order.paid',
        'completed'  => 'order.completed',
        'cancelled'  => 'order.cancelled',
        'refunded'   => 'order.refunded',
    ];

    if (!isset($eventMap[$to])) {
        return;
    }

    $phone = preg_replace('/[^0-9+]/', '', (string) $order->get_billing_phone());
    if ($phone === '') {
        return;
    }

    $event = $eventMap[$to];
    $message = sprintf(
        "Halo %s, pesanan #%s statusnya sekarang: %s.",
        $order->get_billing_first_name(),
        $order->get_order_number(),
        $to
    );

    $response = wp_remote_post(PESANPRO_BASE_URL . '/api/v1/integrations/woocommerce', [
        'timeout' => 15,
        'headers' => [
            'Content-Type'       => 'application/json',
            'x-integration-token' => PESANPRO_WOO_TOKEN,
            'Idempotency-Key'     => 'wc-' . $orderId . '-' . $to,
        ],
        'body' => wp_json_encode([
            'orderId'   => (string) $orderId,
            'event'     => $event,
            'recipient' => $phone,
            'message'   => $message,
        ]),
    ]);

    if (is_wp_error($response)) {
        error_log('PesanPro WooCommerce: ' . $response->get_error_message());
    }
}, 10, 4);
```

4. Uji dengan mengubah status pesanan dari `pending` ke `processing`.
5. Periksa **Message Queue** di PesanPro.

> **Catatan:** `Idempotency-Key` `wc-<orderId>-<status>` mencegah pesan ganda kalau status berubah bolak-balik. Kalau Anda ingin notifikasi ulang untuk status yang sama, tambahkan timestamp pada key.

---

## Google Forms

Connector tersedia di folder `integrations/google-forms/`.

### Langkah

1. Buat integration token tipe `GOOGLE_FORMS`.
2. Buka form target → **Extensions → Apps Script**.
3. Ganti isi `Code.gs` dan `appsscript.json` dengan file dari folder `integrations/google-forms/`.
4. Buka **Project Settings → Script Properties** dan isi:
   - `PESANPRO_BASE_URL` — `https://wagateway.kingofcoding.my.id`.
   - `PESANPRO_TOKEN` — token `ppint_...`.
   - `PESANPRO_RECIPIENT_FIELD` — judul pertanyaan nomor WhatsApp.
   - atau `PESANPRO_STATIC_RECIPIENT` — nomor tetap.
5. Jalankan fungsi `pesanProInstallTrigger()` satu kali.
6. Setujui permission Google.
7. Jalankan `pesanProCheckConfiguration()`.
8. Kirim response uji dari form.
9. Periksa **Message Queue** di PesanPro.

### Yang perlu diperhatikan

- Gunakan **installable trigger**, bukan simple trigger.
- Jangan menaruh token di source code atau membagikan project Apps Script.
- Retry dengan payload dan idempotency key yang sama aman; PesanPro melakukan deduplication.
- Setiap response form memakai `submissionId` unik sebagai dasar idempotency.

---

## WordPress kustom (form plugin lain)

Kalau Anda memakai form plugin lain, kirim payload ke:

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
wp_remote_post('https://wagateway.kingofcoding.my.id/api/v1/integrations/wordpress', [
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
| `{{message}}` | Pesan asli dari integrasi |
| `{{sourceId}}` | ID submission/order |
| `{{field:nama}}` | Nilai field form bernama `nama` |
| `{{event}}` | Nama event (untuk WooCommerce) |

Contoh:

```
Pesanan {{sourceId}} ({{event}}) dari {{field:nama}}: {{message}}
```

Kalau template menghasilkan pesan kosong atau lebih dari 4.096 karakter, request ditolak `INVALID_MESSAGE`.

---

## Checklist integrasi

1. Token disimpan di server, bukan di browser.
2. Token bisa dicabut tanpa mengubah kode.
3. `Idempotency-Key` stabil per kejadian.
4. Endpoint PesanPro bisa diakses dari server Anda (HTTPS, DNS benar).
5. Form uji benar-benar masuk ke Message Queue.
6. Nomor tujuan memakai format yang benar.
7. Ada penanganan error dan log di sisi WordPress/Google.
8. Kebijakan privasi menyebut pengiriman data ke PesanPro.
