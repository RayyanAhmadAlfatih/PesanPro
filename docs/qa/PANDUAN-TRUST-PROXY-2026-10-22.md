# Panduan: Mengaktifkan TRUST_PROXY + Perintah Verifikasi

Untuk pemilik PesanPro — 22 Oktober 2026
Latar: temuan **L14-18 (P2)** — API key dengan "Allowed IPs" selalu ditolak karena
server melihat semua permintaan berasal dari `127.0.0.1`.

---

## Kenapa ini terjadi (singkat)

Aplikasi berjalan di belakang nginx. nginx meneruskan permintaan ke aplikasi dari
`127.0.0.1`, dan aplikasi **tidak diberi tahu** bahwa ada proxy di depannya. Karena
variabel `TRUST_PROXY` belum ada di `.env` (pencarian Anda: 0 hasil), nilainya
default `false`, jadi IP asli pengunjung tidak pernah dibaca.

Akibatnya bukan cuma fitur "Allowed IPs" yang mati, tetapi juga:

- batas "per IP" menjadi batas global untuk semua pelanggan
  (lupa password 5/jam, OTP 10/jam, registrasi 5/jam),
- kolom IP di audit log berisi `127.0.0.1` untuk semua orang.

---

## Bagian A — Menambahkan dua baris di `.env`

1. **Backup dulu.** Buka **aaPanel → Terminal**, jalankan satu baris:

```
cp /www/wwwroot/PesanPro/.env /www/wwwroot/PesanPro/.env.bak-20261022
```

2. Buka lagi **Files → /www/wwwroot/PesanPro/.env** di editor aaPanel.

3. Tambahkan dua baris berikut di bagian **REQUIRED CORE SETTINGS**
   (misalnya tepat di bawah baris `DATABASE_URL=...`):

```
# Aplikasi di belakang nginx lokal: baca IP asli dari X-Forwarded-For.
TRUST_PROXY="true"
TRUST_PROXY_HOPS="1"
```

4. **Simpan** (Ctrl+S). Pastikan tanda kutip ikut ditulis dan tidak ada spasi
   di sekitar tanda `=`.

Catatan: `TRUST_PROXY_HOPS="1"` benar untuk topologi sekarang
(pengunjung → nginx → aplikasi; tidak ada Cloudflare). Kalau nanti di depan nginx
ditambah CDN, angka ini harus dinaikkan.

---

## Bagian B — Restart aplikasi (perlu izin, ±15 detik)

Restart membuat sesi WhatsApp terputus sebentar lalu tersambung sendiri.
Jangan lakukan saat ada broadcast/kampanye berjalan.

Di **aaPanel → Terminal**, satu baris:

```
su - pesanpro -c "cd /www/wwwroot/PesanPro && pm2 restart pesanpro && pm2 save"
```

Lalu cek aplikasi hidup:

```
curl -s -o /dev/null -w "%{http_code}\n" https://wagateway.kingofcoding.my.id/api/health/ready
```

Harus `200`. Kalau `000` atau `503`, tunggu 15 detik lalu ulangi sekali.

---

## Bagian C — Verifikasi hasil (saya yang menjalankan)

Setelah restart, beri tahu saya. Saya akan mengulang dua pengujian:

- key dengan Allowed IPs `182.8.227.186` (IP publik mesin QA) → harus `200`,
- key dengan Allowed IPs `1.1.1.1` (IP salah) → harus `401`.

Kalau yang pertama masih `401`, berarti nginx tidak mengirim header
`X-Forwarded-For`. Beri tahu saya; perbaikannya ada di konfigurasi reverse proxy
aaPanel (bukan di aplikasi).

---

## Bagian D — Rollback (kalau ada yang tidak beres)

Hapus dua baris `TRUST_PROXY` tadi, simpan, lalu:

```
su - pesanpro -c "cd /www/wwwroot/PesanPro && pm2 restart pesanpro && pm2 save"
```

Atau kembalikan file backup:

```
cp /www/wwwroot/PesanPro/.env.bak-20261022 /www/wwwroot/PesanPro/.env
```

lalu restart dengan perintah yang sama.

---

## Bagian E — Perintah SQL untuk memeriksa audit (L14-30)

Ini **hanya membaca**, tidak mengubah apa pun.

**Cara 1 — phpMyAdmin (paling mudah):**
aaPanel → **Databases** → baris database `pesanpro` → **Manage / phpMyAdmin** →
tab **SQL** → tempel query di bawah → **Go**.

**Cara 2 — Terminal** (akan meminta password MySQL root):

```
mysql -u root -p pesanpro -e "SELECT action, resource, resourceId, ip, createdAt FROM AuditLog WHERE action LIKE 'api_key%' ORDER BY createdAt DESC LIMIT 15;"
```

Yang saya butuhkan: hasil 15 baris terakhir. Yang dicari:
`api_key.create`, `api_key.revoke`, `api_key.rotate` beserta waktu dan IP-nya.

Setelah `TRUST_PROXY` aktif, jalankan juga query ini untuk membuktikan IP asli
sudah tercatat (bukan `127.0.0.1`):

```
mysql -u root -p pesanpro -e "SELECT action, ip, createdAt FROM AuditLog ORDER BY createdAt DESC LIMIT 10;"
```

---

## Bagian F — Opsional: satu slot untuk uji key kedaluwarsa (L14-14)

Plan Starter membatasi **2 API key aktif per tenant**. Tenant B sudah memakai 2
(`qa-tenant-b` dan `TENANT-B-READ-TEST`), jadi saya tidak bisa membuat key uji
berumur 1 menit.

Kalau `TENANT-B-READ-TEST` memang sisa uji lama dan boleh dihapus:

1. Login tenant B → **Kunci API** → cari `TENANT-B-READ-TEST` → **Revoke**.
2. Beri tahu saya. Saya buat key berumur 60 detik, buktikan `200` lalu `401`
   setelah kedaluwarsa, lalu saya revoke sendiri.

Kalau key itu masih dipakai, lewati saja bagian ini — L14-14 akan saya tandai
"belum diuji" dengan alasan kuota, bukan lolos.

---

## Ringkasan urutan

1. Backup `.env` (Bagian A langkah 1).
2. Tambah 2 baris `TRUST_PROXY` (Bagian A langkah 2–4).
3. Restart + cek health (Bagian B).
4. Kabari saya → saya uji ulang allowlist (Bagian C).
5. Jalankan SQL audit, kirim hasilnya (Bagian E).
6. Opsional: kosongkan satu slot key (Bagian F).
