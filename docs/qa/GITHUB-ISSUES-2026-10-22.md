# Temuan QA — 22 Oktober 2026

Batch: **L14 Developer API & API Keys** (live di `https://wagateway.kingofcoding.my.id`)
Akun: tenant B (`testinguserb@gmail.com`, sesi `qa-b-session`)

---

## [P2] API key dengan "Allowed IPs" tidak bisa dipakai — semua permintaan terbaca dari 127.0.0.1

**Dampak (yang dirasakan pelanggan):**
Pelanggan yang mengaktifkan pembatasan IP pada API key akan **terkunci sendiri**.
Dari IP yang benar pun server membalas `401 INVALID_API_KEY`, sehingga key dianggap
rusak. Satu-satunya nilai yang diterima adalah `127.0.0.1`, yang tidak bisa dipakai
dari luar server.

Efek samping lain dari akar masalah yang sama:

- Semua permintaan tercatat berasal dari `127.0.0.1`, jadi jejak IP di audit log
  tidak berguna untuk menyelidiki penyalahgunaan.
- Batas yang dihitung **per IP** berubah menjadi batas **global untuk seluruh pelanggan**:
  - lupa password: 5 permintaan / jam untuk semua orang,
  - OTP email: 10 permintaan / jam untuk semua orang,
  - registrasi: 5 / jam untuk semua orang.
  Artinya 5 permintaan lupa password dari satu pihak bisa menahan permintaan
  pengguna lain selama satu jam.

**Kronologi / langkah reproduksi (terverifikasi):**
1. Buat API key dengan scope `message:read` dan Allowed IPs `182.8.227.186`
   (IP publik mesin penguji, dikonfirmasi lewat `api.ipify.org`).
2. `GET /api/v1/messages` dengan key tersebut → **401**
   `{"error":"Invalid, expired, revoked, or IP-restricted API key","code":"INVALID_API_KEY"}`.
3. Buat key kedua, scope sama, Allowed IPs `127.0.0.1`.
4. `GET /api/v1/messages` dengan key kedua → **200**.

**Bukti:**
- Key allowlist IP publik: `401 INVALID_API_KEY`.
- Key allowlist loopback: `200` dengan data antrean pesan.
- `.env` produksi **tidak memuat `TRUST_PROXY` sama sekali** (pencarian di editor
  aaPanel: 0 hasil), jadi nilainya memakai default `false`.
- Kode: `src/lib/client-ip.ts` hanya memakai alamat socket kecuali `TRUST_PROXY=true`;
  `src/server/runtime.ts:49-54` menulis header IP dari situ; `src/lib/rate-limit.ts:129`
  memakai header yang sama untuk limit per IP.
- Aplikasi berjalan di belakang reverse proxy lokal (nginx), sehingga alamat socket
  selalu `127.0.0.1`.

**Saran perbaikan:**
- Tambahkan `TRUST_PROXY="true"` dan `TRUST_PROXY_HOPS="1"` ke `.env`, lalu restart.
  Langkah rinci: `docs/qa/PANDUAN-TRUST-PROXY-2026-10-22.md`.
- Verifikasi ulang: key allowlist IP publik harus `200`, key allowlist IP lain `401`.
- Setelah aktif, cek audit log: IP klien harus IP asli, bukan `127.0.0.1`.

**Status:** terbuka — butuh izin pemilik untuk mengubah env produksi + restart.

---

## Catatan (bukan bug): `/api/health` menolak tanpa login

`GET /api/health` membalas `401`, sedangkan `GET /api/health/ready` publik dan
memeriksa database (`{"status":"ok","ok":true}`). Ini sesuai desain: snapshot rinci
(storage, disk, worker, antrean) sengaja hanya untuk sesi login. Roadmap L0-05 perlu
disesuaikan, bukan kode yang diubah.
