# 11 — Model autentikasi API: kunci, cookie, dan origin

> Untuk siapa: developer yang memanggil REST API PesanPro, dan siapa pun yang ingin paham aturan keamanan API.
> Panduan ini menjelaskan kapan permintaan diterima dan kapan ditolak — sesuai perilaku nyata di aplikasi.

## Dua cara otentikasi, dua dunia

| Cara | Dipakai siapa | Caranya |
| --- | --- | --- |
| **API key** (`wag_...`) | Kode/server di luar aplikasi (backend, script, integrasi kustom) | Kirim header `x-api-key: wag_...` |
| **Cookie sesi dashboard** | Dashboard web PesanPro yang sedang login di browser | Otomatis — browser mengirim cookie login setiap kali membuka halaman dashboard |

Aturan penting: **keduanya tidak saling menggantikan.**

1. Kalau request membawa header `x-api-key`, PesanPro memperlakukannya sebagai request API: key harus valid, tidak kedaluwarsa, tidak dicabut, lolos batas IP (kalau diatur), dan punya **scope** yang cukup untuk endpoint itu. Kalau salah satu gagal, request ditolak 401/403 — request **tidak** berpindah memakai cookie sesi.
2. Kalau request tidak membawa `x-api-key`, dashboard boleh memakai cookie sesi untuk keperluannya sendiri (misalnya halaman Kirim Massal memanggil API broadcast).

## Aturan anti-CSRF untuk permintaan ber-cookie

CSRF (cross-site request forgery) adalah serangan dari situs lain yang memanfaatkan cookie login yang masih aktif di browser Anda untuk mengirim permintaan atas nama Anda tanpa sepengetahuan Anda.

Untuk semua permintaan yang mengubah data (POST/PUT/PATCH/DELETE) dan diautentikasi **lewat cookie sesi**, PesanPro memeriksa asal permintaan:

- **Origin sama dengan situs PesanPro** → diterima. Dashboard normal selalu begini.
- **Origin dari situs lain** (misalnya `https://evil.example.com`) → **ditolak 401**, sekalipun cookie sesi valid.
- Header `Sec-Fetch-Site: cross-site` dari browser → ditolak.
- Tanpa `Origin`/`Referer` sama sekali (misalnya `curl` yang menyertakan cookie manual) → diterima, karena browser selalu mengirim salah satu dari header itu untuk permintaan pengubah data; request tanpa keduanya bukan permintaan browser.

Permintaan yang memakai **`x-api-key` tidak terpengaruh aturan origin** — server-to-server dari origin mana pun tetap boleh, asalkan key dan scope-nya valid.

## Contoh

### Benar — API key dengan scope cukup

```bash
curl -X POST https://wagateway.kingofcoding.my.id/api/v1/messages/text \
  -H "x-api-key: wag_XXXX..." \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: order-1042-notify" \
  -d '{"sessionId":"cs-rina","recipient":"628123456789","text":"Halo"}'
```

### Ditolak — API key tanpa scope yang cukup

Kalau key hanya punya scope `message:read`, permintaan kirim pesan ditolak 403 `SCOPE_FORBIDDEN` — sekalipun cookie sesi dashboard ikut terkirim di request yang sama.

### Ditolak — cookie sesi dari situs lain

Request dengan cookie sesi dashboard tetapi header `Origin: https://evil.example.com` ditolak 401. Tidak ada pesan masuk antrean.

### Benar — dashboard sendiri

Tombol di dashboard (Kirim Massal, Antrian Pesan, Token Integrasi, Webhook) memanggil API dari origin yang sama dengan cookie sesi → tetap berjalan normal.

## Ringkasan untuk developer

1. Integrasi eksternal → selalu `x-api-key` (atau integration token `ppint_...` untuk plugin form; lihat [07 — Integrasi tanpa kode](07-integrasi-tanpa-kode.md)).
2. Jangan pernah menyalin cookie sesi dashboard ke script di luar dashboard — itu bukan cara pakai API dan aturan origin bisa menolaknya.
3. Selalu kirim `Idempotency-Key` untuk permintaan kirim (lihat [05 — API untuk developer](05-api-developer.md)).
4. Scope key dibuat sekecil mungkin: key untuk "kirim pesan" tidak perlu scope hapus data.
