# Temuan GitHub Issues — 2026-10-17 (BATCH 1 live QA)

Issue ini dicatat di repo karena push otomatis ke GitHub terblokir (403).
Salin blok di bawah ke github.com/RayyanAhmadAlfatih/PesanPro/issues.

---

## [P2] Login rate-limit: pesan menyesatkan + login sukses ikut menghabiskan kuota

**Lokasi:** `src/lib/auth.ts:44` (limiter `login:<ip>:<email>`, 5 attempt / 15 menit,
fixed-window, DB-backed) dan `src/app/auth/login/page.tsx:83-84` (SEMUA kegagalan
signIn ditampilkan sebagai "Invalid email or password").

**Repro:**
1. Lakukan 5 attempt login dalam satu window 15 menit (campuran password salah
   atau benar — limiter dipanggil sebelum cek password dan tidak pernah
   di-reset saat login sukses, jadi attempt sukses pun ikut dihitung).
2. Attempt ke-6 dengan password BENAR tetap ditolak dengan pesan
   "Invalid email or password".

**Dampak:**
- Perlindungan brute-force sendiri bekerja (terverifikasi live 2026-10-17),
  tapi pengguna normal (multi-tab, re-login, HP + desktop) bisa terkunci
  15 menit tanpa penjelasan.
- Tidak ada indikasi kapan bisa mencoba lagi; pesan "Invalid email or password"
  menyesatkan saat penyebab sebenarnya adalah rate limit.
- **Terkonfirmasi live 2026-10-18 (B1-08):** user yang di-suspend juga melihat
  "Invalid email or password" padahal penyebabnya status SUSPENDED — user
  menyangka lupa password. Lebih parah: user suspend yang meminta reset
  password dapat balasan "reset instructions have been sent" tapi email tidak
  pernah dikirim (`requestPasswordReset` diam untuk user non-ACTIVE), sehingga
  terjebak menunggu email yang mustahil datang.

**Saran fix:**
1. Saat rate-limited, tampilkan pesan khusus ("Terlalu banyak percobaan. Coba
   lagi dalam X menit"). Infrastruktur sudah ada — pola `OtpSignInError` dengan
   code spesifik di `src/lib/auth.ts:16-22` bisa direplikasi.
2. Reset counter saat login sukses, atau pindahkan pemanggilan limiter ke jalan
   gagal saja (setelah `bcrypt.compare` gagal).
3. Untuk status SUSPENDED: jangan bebaskan informasi di form login (risiko
   enumerasi akun). Tampilkan "akun ditangguhkan, hubungi support" hanya
   setelah user membuktikan kepemilikan email (mis. lewat alur OTP).

---

## [P3] Email reset password kehilangan branding — tidak samain dengan email OTP

**Lokasi:** `src/lib/password-reset.ts:36-37` (jalur Resend) dan `:57-58`
(jalur SMTP) — HTML polos tanpa template.

**Pembanding:** email OTP memakai `htmlDocument()`
(`src/lib/otp-email.ts:32-40`) dengan heading, sapaan, dan kotak kode besar.
Versi reset email yang lama juga punya tombol bergaya (lihat screenshot user).

**Repro:** `/auth/forgot-password` → kirim permintaan → email masuk polos
("Gunakan tautan berikut ... Reset password ... Tautan berlaku 30 menit"),
jauh di bawah kualitas email OTP.

**Dampak:** kesan pertama produk jelek di komunikasi keamanan paling sensitif;
inkonsistensi brand antar email transaksional.

**Saran fix:**
1. Pakai `htmlDocument()` untuk reset email (mis. heading "Atur ulang kata sandi").
2. Perluas `htmlDocument` di `src/lib/email-notifications.ts` dengan parameter
   opsional `button: { label, href }` supaya email reset punya tombol seperti
   versi lama, lanjut dengan URL mentah sebagai fallback teks.
3. Opsional (prioritas rendah): tombol "Copy code/link" gaya Sumupod — catatan:
   mayoritas email client strip JavaScript, tombol copy belum tentu berfungsi;
   pertimbangkan menampilkan kode/token besar & mudah diselect.

**Referensi visual:** 4 screenshot user (reset lama vs baru, OTP email,
contoh Sumupod).

---

## Hasil BATCH 1 (2026-10-17)

| Tes | Hasil |
|---|---|
| B1-04 OTP | PASS — kode benar masuk, kode salah gagal, email masuk < 1 menit |
| B1-05 Reset password | PASS fungsional — email masuk (bukan spam), password lama mati, password baru jalan, sesi lama tertendang. Temuan styling → issue P3 di atas |
| B1-06 Session cap | PASS — cookie expiry 2026-10-18T13:18:57Z (~24 jam dari login) |
| B1-07 Rate limit | PASS fungsional — attempt ke-6 diblokir termasuk dengan password benar (sesuai desain 5/15 menit). Temuan UX → issue P2 di atas. Recovery perlu diverifikasi: coba lagi setelah melewati batas window 15 menit |
| B1-08 Suspend B | PASS — login B ditolak saat suspend, bisa login lagi setelah reactivate. API: saat suspend key → **401** (ditolak); setelah reactivate key yang sama → **403** (`/api/user/api-key` endpoint session-only, di luar scope developer API) — transisi 401→403 justru bukti key valid kembali (key invalid/suspend tidak akan pernah mencapai tahap cek scope). Tes ulang memakai endpoint developer API (`/api/v1/*`) untuk positive control |
