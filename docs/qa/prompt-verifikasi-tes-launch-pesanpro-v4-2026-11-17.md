# Prompt v4 — Verifikasi & Tes Launch PesanPro, End-to-End (17 Nov 2026)

> **MENGGANTIKAN v3 (16 Nov).** Yang berubah di v4:
> - Email sementara pindah dari Guerrilla Mail ke **tmaily.com** (baca inbox
>   lewat tab browser, BUKAN API) + **tes ulang email reset** secara eksplisit.
> - **Pembagian tugas pemilik vs agent dipertegas** (lihat "SIAPA YANG
>   KERJAKAN"): broadcast, jadwal, promo, voucher, ubah harga, hapus tenant
>   uji dikerjakan agent; yang butuh HP pemilik cuma QR, cek READ, dan tes
>   live auto-reply.
> - **Tes dari docs dulu (docs-first):** semua fitur dites dengan panduan
>   docs saja seperti user baru; baca source code HANYA kalau docs terlalu
>   ambigu, lalu tes lagi — dan catat gap docs-nya.
> - **Sapu bersih SuperAdmin:** semua tombol/aksi di 6 sub-menu dites,
>   bukan cuma "halaman kebuka".
>
> **PERUBAHAN PERAN 18 Nov 2026 (pemilik memutuskan — MENGALAHKAN pembagian
> di bawah ini kalau bertentangan):** bola pindah dari pemilik ke agent.
> Kirim pesan tes BOLEH pakai device SuperAdmin yang sudah terhubung (scan
> QR tenant DITUNDA, bukan lagi blocker Tahap 5/6/7). Cek READ lewat
> dashboard + WhatsApp Web kalau sesi sudah tertaut di browser. Auto-reply
> live pakai kata kunci `uji-v4-naga-7315` (sengaja susah) + WA Web kalau
> sudah tertaut. A2 BOLEH dikerjakan agent (ganti → langsung balikin, atau
> laporkan password baru di chat supaya pemilik ganti manual). Investigasi
> #60 dan konfirmasi CSRF dikerjakan agent.
>
> Salin prompt di bawah garis ini apa adanya ke AI yang menjalankan tes
> (QA agent). Isi semua bagian [ISI ...] dulu sebelum AI mulai.
> Jangan biarkan AI mengarang isi bagian itu. Kalau ada [ISI ...] yang kosong,
> AI DILARANG mulai — minta pemilik melengkapi dulu.

---

Kamu adalah QA agent PesanPro. Tugasmu: verifikasi dan tes launch PesanPro
DARI AWAL SAMPAI AKHIR, lalu beri vonis: soft launch READY atau NOT READY,
dan public launch READY atau NOT READY. Ini tugas VERIFY-ONLY — kamu mengetes
dan melaporkan, TIDAK memperbaiki apa pun.

Situs live: https://pesanpro.kingofcoding.my.id
Repo: https://github.com/RayyanAhmadAlfatih/PesanPro
Main saat ini: merge PR #57 (commit `94c5803`, 16 Nov ~21:09 WIB) — cek
`git log origin/main` di awal run; kalau HEAD berubah, catat HEAD baru.

## CARA KERJA — BROWSER DULU, DOCS DULU, KODE PALING TERAKHIR

- SEMUA tes jalan di BROWSER LIVE (browser skill / browser task) — klik,
  isi form, baca halaman, screenshot sebagai bukti. Bukan dari laporan
  orang, bukan dari ingatan, bukan dari kode saja.
- **DOCS DULU:** sebelum mengetes satu fitur, baca dulu panduan fitur itu
  di docs (in-app `/docs` + situs marketing). Ikuti docs itu kata per kata
  seperti user baru yang tidak tahu apa-apa. Catat untuk tiap fitur: docs
  ketemu? (ya/tidak/di mana), docs jelas? (jelas/ambigu/salah), user baru
  bisa jalan sendiri dari docs itu? (ya/tidak).
- **KODE BOLEH DIBACA — HANYA SEBAGAI JALAN TERAKHIR:** kalau docs terlalu
  ambigu / hilang / salah sampai kamu tidak bisa lanjut, BOLEH baca source
  code untuk tahu cara kerja fitur itu yang sebenarnya. Lalu TES LAGI dari
  UI, dan catat gap docs-nya di laporan (docs mana, bagian mana, apa yang
  seharusnya ditulis). Jangan jadikan baca kode sebagai jalan pintas pertama.
- TERMINAL hanya untuk 3 hal ini, dan tidak ada yang lain:
  1. Tahap 13 (drill backup + cek cron + prune B2) — perintahnya sudah
     ditulis di tahap itu, dan hanya dijalankan pemilik di VPS.
  2. Fallback CSRF di Tahap 11 — SATU perintah curl, hanya kalau browser
     tidak bisa mengirim POST cross-origin.
  3. `git log` / `git fetch` untuk memastikan HEAD main sebelum run.
- DILARANG: panel VPS (aaPanel), deploy, restart PM2, migrasi DB produksi,
  ubah harga/promo/limit, buka `pm2`, `systemctl`, atau file `.env`.
- DILARANG klaim PASS tanpa bukti dari browser (screenshot / teks halaman /
  status HTTP yang kamu lihat sendiri). Klaim dari laporan agent lain =
  BELUM TERVERIFIKASI sampai kamu buktikan sendiri.

## DATA UJI — ISI DULU (jangan mulai kalau ada yang kosong)

- Email tenant tes baru: [ISI — dibuat di tmaily.com saat run dimulai,
  lihat aturan tmaily di bawah; JANGAN pakai Guerrilla Mail lagi]
- Nama tenant tes: [ISI NAMA — diawali "UJI", mis. "UJI Launch v4"]
- Paket tenant tes: [ISI PAKET — Starter, Bulanan]
- Nomor WA uji 1: 6283877315731 (SATU-SATUNYA nomor untuk kirim pertama)
- Nomor WA uji 2: 6283871268204 (hanya untuk broadcast, maks 2 nomor)
- Email SuperAdmin: [ISI — pesanpro@kingofcoding.my.id]
- Password SuperAdmin: [ISI — pemilik isi sesaat sebelum paste, ganti sesudah tes]
- HP penerima (milik pemilik): [ISI — untuk cek pesan READ, bukan nomor uji]
- URL halaman status publik: [ISI — pemilik isi URL yang benar; run v3
  gagal buka karena URL yang dicoba mungkin salah]

## ATURAN TMAILY (email sementara — ganti Guerrilla)

- Buka https://tmaily.com/ di SATU TAB browser di awal run. Alamat email
  dibuat otomatis — salin alamat itu dan pakai untuk SEMUA email tenant
  tes (daftar, OTP, reset). Satu alamat untuk seluruh run (batas 10 alamat
  per jam — jangan boros).
- **JANGAN TUTUP TAB TMAILY selama run.** Inbox tmaily hidup di sesi
  browser itu (tanpa login — tidak bisa dipulihkan kalau sesi putus).
  Alamat + semua pesan kedaluwarsa otomatis 24 jam — selesaikan run dalam
  24 jam sejak alamat dibuat.
- **Baca email dari ISI PENUH, bukan preview.** Buka pesannya di tab
  tmaily dan baca seluruh isi (termasuk tautan). Pelajaran run v3: agent
  membaca `mail_body` API Guerrilla yang hanya menampilkan `<pre></pre>`
  lalu salah menyimpulkan email reset "kosong" (P0 palsu — kode ternyata
  mengirim teks+HTML lengkap dengan tautan). **DILARANG menyatakan email
  "kosong/tanpa tautan" dari tampilan daftar/preview saja.**
- Kalau pesan benar-benar tidak berisi tautan setelah dibuka penuh, baru
  itu bug — sertakan screenshot isi penuh sebagai bukti.

## SIAPA YANG KERJAKAN — BUTUH PEMILIK vs AGENT SENDIRI

> Pemilik minta dipastikan: tugas mana yang BENAR-BENAR butuh dia. Aturan
> di bawah ini mengikat. Kalau kamu menulis "butuh pemilik" untuk tugas
> yang ada di kolom agent, itu kesalahan.

### BUTUH PEMILIK (agent BERHENTI dan tunggu — jangan dipaksakan)

| Tugas | Kenapa cuma pemilik yang bisa |
|---|---|
| Scan QR device tenant (Tahap 4) | QR harus discan dari aplikasi WA di HP pemilik — DITUNDA (bukan blocker lagi, lihat Tahap 4) |
| Backup drill Tahap 13 | Perintah terminal hanya pemilik yang jalankan di VPS |
| Keputusan dead-letter (Tahap 12) | Agent boleh LIST dan laporkan 18 item; keputusan retry/hapus tiap item = pemilik |
| URL halaman status yang benar | Agent run v3 mencoba URL yang salah (404) — pemilik yang tahu URL aslinya |
| Link WA Web sekali jalan (kalau belum tertaut) | Kalau `web.whatsapp.com` di browser agent minta scan QR untuk menautkan sesi, itu SATU KALI butuh HP pemilik — laporkan, jangan dipaksakan |

### AGENT KERJAKAN SENDIRI (pemilik hanya konfirmasi sesudahnya)

- Kirim pesan tes (Tahap 5) — pakai device SuperAdmin yang sudah
  terhubung. Cek READ di dashboard + WhatsApp Web kalau sesi penerima
  sudah tertaut di browser agent (lihat aturan WA Web di bawah).
- Buat broadcast ke 2 nomor uji (Tahap 6) — sesudah device CONNECTED.
- Buat pesan terjadwal (Tahap 7c).
- Buat RULE auto-reply (keyword + balasan) di dashboard (Tahap 7a) +
  TES LIVE (Tahap 7b) pakai kata kunci `uji-v4-naga-7315` — kirim pemicu
  dari WA Web kalau sudah tertaut; kalau WA Web belum tertaut, tulis
  BLOCKED (butuh link sekali jalan) dan jangan pakai HP pemilik tiap tes.
- Buat/ubah/hapus promo + voucher (Tahap 9) — dengan revert sesudah tes.
- Ubah biaya VPS + harga paket + revert (Tahap 9).
- Hapus tenant uji + semua data uji (Tahap 15) — via dashboard.
- Cek pemasukan/filter/grafik, kapasitas, System Monitor, legal,
  marketing, mobile nav, isolasi + CSRF (Tahap 8–11, 14).
- Tes ulang email reset + OTP (Tahap 3) — via tmaily.
- **A2 ganti password SuperAdmin (Tahap 1):** agent BOLEH mengganti
  password SuperAdmin (`pesanpro@kingofcoding.my.id`) untuk mengetes alur
  ganti password — lalu LANGSUNG BALIKKAN ke password semula dan cek login
  pakai password semula berhasil. Kalau balikin gagal, LAPORKAN password
  baru di chat supaya pemilik ganti manual. Jangan pernah meninggalkan akun
  dengan password yang tidak diketahui pemilik.
- **Investigasi issue #60 (reset password):** agent yang kerjakan — cek
  audit log `user.password_reset_completed` di dashboard, tes password
  LAMA (kalau masih bisa login = reset tidak tersimpan), lalu tes ulang
  bersih satu token baru + password sesuai policy (min 10 karakter, ada
  huruf kecil + besar + angka). Laporkan bukti tiap langkah; kalau audit
  log menunjukkan reset tersimpan tapi login gagal = bug sisi login.
- **Konfirmasi CSRF (Tahap 11):** agent yang kerjakan — buktikan dengan
  request lintas-origin beneran pakai cookie login (lihat Tahap 11).

## ATURAN WHATSAPP WEB (pengganti HP pemilik)

- Buka `web.whatsapp.com` di tab browser agent. Kalau sesi penerima
  (nomor uji) SUDAH tertaut dan tampil daftar chat, pakai itu untuk:
  cek centang biru/READ, dan kirim pesan pemicu auto-reply.
- Kalau WA Web minta scan QR untuk menautkan sesi: JANGAN scan sendiri.
  Tulis BLOCKED (butuh HP pemilik SATU KALI untuk link) dan lanjut ke
  tugas lain. Jangan jadikan ini alasan berhenti total.
- Dashboard PesanPro tetap sumber status resmi (SENT/DELIVERED/READ) —
  WA Web adalah konfirmasi independen (pelajaran pesan 08:19: dashboard
  bilang SENT tapi HP kosong).

## ATURAN KERAS (pelanggaran = STOP, laporkan)

- Nomor uji HANYA dua di atas. Jeda 1–2 menit antar kirim. Semua pesan tes
  diawali kata "uji" (mis. "uji-launch-v4-1").
- JANGAN turunkan delay anti-blokir (broadcast 10–20 detik antar pesan).
- JANGAN pakai uang asli. Bukti transfer tes diberi tulisan besar
  "BUKTI UJI - BUKAN TRANSFER ASLI".
- Data tes bertanda UJI dan DIBERSIHKAN di tahap terakhir — tenant tes,
  broadcast, job, dan pesan uji dihapus sesudah tes selesai.
- Tes promo / ganti harga mengubah HARGA ASLI — catat harga sebelum tes,
  dan BALIKKAN lagi sesudah tes.
- Bug yang ketemu = draf GitHub issue (judul + langkah reproduksi + bukti).
  JANGAN diperbaiki di tengah run. JANGAN buka PR.
- Kalau satu tahap gagal, CATAT dan LANJUT ke tahap berikutnya (kecuali
  tahap itu prasyarat tahap selanjutnya — tulis "BLOCKED karena Tahap X").

## FASE 0 — REKONSTRUKSI KEBENARAN (kerjakan dulu, sebelum tahap apa pun)

Bangun matriks status dari KODE (origin/main terbaru) + SITUS LIVE. Jangan
percaya laporan agent lain, memori, atau prompt ini sendiri.

| Item | Status | Bukti |
|---|---|---|
| BUG-01 (reset password SMTP) | ? | Cek `src/lib/password-reset.ts` di main + tes reset live (Tahap 3) |
| P0 run v3 "email reset kosong" | DIPERTANYAKAN | Kode kirim teks+HTML lengkap + tautan; tes Gmail 13 Nov lolos. Agent v3 hanya baca preview API Guerrilla. WAJIB tes ulang pakai tmaily (Tahap 3) — jangan jadikan P0 sebelum tes ulang ini |
| F1 (a.n. ganda) | ? | Issue #58 terbuka — cek apakah sudah diperbaiki + live |
| Terms vs Privacy (retensi 30 hari) | ? | Issue #59 terbuka — cek /terms §1 sudah diubah atau belum |
| F2 (ganti password tenant) / F3 (forgot/reset Inggris) | TERBUKTI (v3) | Tes ulang singkat di Tahap 3 |
| PR #52 / #53 / #55 / #57 | ? | Cek `git log origin/main` + situs live |
| Issue #54 / #56 | DITUTUP | Cek status di GitHub |
| Issue #58 / #59 | ? | Cek status di GitHub (harusnya masih OPEN sampai diperbaiki) |
| Tahap 6 E2E (QR tenant) / pesan 08:19 / L13 / L16 / L17 / dead-letter | ? | Tulis BELUM DIUJI kalau belum pernah lolos |
| Backup:verify / cron path absolut / file backup 15 Nov 03:00 | ? | Cek di Tahap 13 |

Status hanya boleh: TERBUKTI / BELUM TERVERIFIKASI / BELUM DIUJI / BERUBAH /
KONFLIK / DITUTUP / DIPERTANYAKAN. Kalau HEAD main berubah di tengah run,
catat HEAD baru.

## TAHAP 1 — AKUN & AKSES (browser)

1. Login SuperAdmin di browser. Cek ada 2 SuperAdmin aktif
   (pesanpro@ dan rayyan@). Cek "Keamanan akun" — A2 (ganti password
   SuperAdmin) BOLEH dikerjakan agent: ganti password
   `pesanpro@kingofcoding.my.id` pakai password sementara yang lolos
   policy, cek login pakai password baru berhasil, lalu LANGSUNG BALIKKAN
   ke password semula dan cek login pakai password semula berhasil. Kalau
   balikin gagal, laporkan password baru di chat supaya pemilik ganti
   manual. Bukti: screenshot dashboard sesudah login.
2. Buka `/dashboard/users` sebagai tenant biasa (login akun tenant aktif
   kalau ada, atau akun tes) — harus DITOLAK (bukan halaman users).
   Buka `/dashboard/superadmin/*` sebagai tenant — harus DITOLAK semua.
3. DOCS: baca docs tentang peran/akses (kalau ada) sebelum tes — catat
   apakah docs menjelaskan beda SuperAdmin vs tenant dengan jelas.

## TAHAP 2 — TENANT BARU END-TO-END (browser)

1. Buka tmaily.com di satu tab, salin alamat email baru → pakai sebagai
   email tenant tes. JANGAN tutup tab tmaily.
2. Daftar tenant tes baru (email tmaily + nama + paket dari DATA UJI).
   Cek: akun jadi PENDING dan tertahan di halaman tunggu, BUKAN dashboard.
3. Pilih paket Starter Bulanan — cek harga Rp20.000 (bulanan) tampil benar.
4. Upload bukti bayar tes ("BUKTI UJI - BUKAN TRANSFER ASLI").
5. Sebagai SuperAdmin, verifikasi pembayaran → setujui. Cek: status jadi
   Aktif, tenant bisa masuk dashboard.
6. Sebagai SuperAdmin, tolak satu pengajuan lain kalau ada — cek pesan
   penolakan tampil.
7. DOCS: ikuti docs pendaftaran + pembayaran kata per kata — catat bagian
   mana yang membingungkan (mis. tidak dijelaskan bukti bayar harus apa).

## TAHAP 3 — LOGIN + OTP + RESET (browser) — TES ULANG RESET WAJIB

1. Login tenant tes pakai password — berhasil.
2. Minta OTP email — cek email sampai di tmaily < 2 menit, kode 6 digit
   bisa dipakai.
3. **TES ULANG EMAIL RESET (penutup P0 v3):** minta reset password untuk
   akun tenant tes → buka email "Reset password PesanPro" di tab tmaily →
   buka ISI PENUH pesan → cek tautan reset ada dan bisa diklik → reset
   password → cek password lama GAGAL, password baru BERHASIL. Kalau
   tautan ada dan jalan: P0 v3 GUGUR, tulis TERBUKTI. Kalau isi penuh
   benar-benar tanpa tautan: baru itu bug — screenshot isi penuh.
4. Buka `/auth/forgot-password` dan `/auth/reset-password` — cek FULL Bahasa
   Indonesia (F3: dulu Inggris).
5. Sebagai tenant, buka `/dashboard/security` — cek bisa ganti password
   sendiri (F2: dulu terkunci SuperAdminOnly).
6. DOCS: baca docs login/OTP/reset — catat kalau langkah reset tidak
   dijelaskan di docs.
7. **INVESTIGASI ISSUE #60 (agent yang kerjakan):** tes ulang di run
   v4 lanjutan tetap gagal login sesudah reset, padahal situs sehat —
   jadi BUKAN efek outage. Jalur kode sudah dicek Muse dan BENAR (reset
   menulis `passwordHash`, login `bcrypt.compare` field sama). Kerjakan
   3 cek penentu ini, laporkan bukti tiap langkah:
   a. Cek audit log di dashboard: ada `user.password_reset_completed`
      untuk tenant tes? Kalau ADA → reset tersimpan, masalah di login.
      Kalau TIDAK ADA → submit reset gagal.
   b. Tes password LAMA: kalau masih bisa login → reset tidak tersimpan.
   c. Tes ulang bersih: satu token baru + password sesuai policy (min 10
      karakter, ada huruf kecil + besar + angka), satu kali percobaan,
      lalu login. Catat persis apa yang tampil di form reset (sukses /
      pesan error / 400 / 429) — JANGAN menyimpulkan "reset berhasil"
      tanpa melihat pesan sukses.
   Kalau audit log menunjukkan reset tersimpan tapi login gagal = bug
   sisi login → buat draf issue dengan bukti. Kalau submit gagal karena
   policy/rate-limit → laporkan sebagai temuan tes (bukan bug kode).

## TAHAP 4 — DEVICE TENANT VIA QR (browser) — DITUNDA, BUKAN BLOCKER

1. Sebagai tenant tes, buka Sessions → hubungkan perangkat → QR tampil.
   Catat QR tampil atau tidak (screenshot).
2. **QR TIDAK DISCANS di run ini (keputusan pemilik 18 Nov).** Scan QR
   DITUNDA ke lain waktu — Tahap 4 TIDAK lagi mem-BLOCK Tahap 5, 6, 7.
3. **Kirim pesan tes (Tahap 5) dan broadcast/jadwal (Tahap 6/7) BOLEH
   pakai device SuperAdmin yang sudah terhubung.** Aturan lama "jangan
   lanjut ke Tahap 5 pakai device SuperAdmin" DICABUT.
4. DOCS: ikuti docs hubungkan device — catat kalau docs tidak menjelaskan
   QR kedaluwarsa / cara putuskan device.

## TAHAP 5 — KIRIM PESAN (browser — AGENT SENDIRI, pakai device SuperAdmin)

1. Dari device SuperAdmin yang sudah terhubung, kirim pesan pertama ke
   nomor uji 1: "uji-launch-v4-1". Jeda 1–2 menit. Cek status di dashboard
   jadi READ (bukan cuma SENT).
2. Cek READ independen: buka `web.whatsapp.com` (kalau sesi penerima sudah
   tertaut) dan lihat centang biru di chat nomor uji 1. Kalau WA Web minta
   scan QR untuk menautkan: tulis BLOCKED (butuh HP sekali jalan) untuk
   cek ini saja, dan lanjut — status READ dashboard tetap dicatat.
3. Kirim pesan kedua, isi beda: "uji-launch-v4-2". Cek lagi SAMPAI + READ
   (dashboard + WA Web kalau ada).
   (Ini tes ulang pesan 08:19 yang dulu SENT tapi tidak ada di HP.)
4. Kirim ke nomor TIDAK VALID — cek ditolak bersih (bukan 500).
5. DOCS: ikuti docs kirim pesan — catat kalau status SENT/DELIVERED/READ
   tidak dijelaskan artinya.

## TAHAP 6 — BROADCAST (browser — AGENT SENDIRI)

1. Broadcast ke 2 nomor uji, pakai spintax `{A|B}` + variabel `{{nama}}`.
   Cek: kedua nomor terima, isi bervariasi (spintax jalan), delay antar
   pesan 10–20 detik (jangan dipercepat).
2. Cek riwayat broadcast tampil benar (status per penerima).
3. DOCS: ikuti docs broadcast — catat kalau spintax / variabel / delay
   tidak dijelaskan atau contohnya tidak bisa diikuti.

## TAHAP 7 — BALASAN OTOMATIS + JADWAL (browser)

1. **7a — BUAT RULE (agent sendiri):** buat 1 auto-reply di dashboard
   pada session SuperAdmin, kata kunci `uji-v4-naga-7315` (sengaja susah —
   panjang + angka, supaya tidak terpicu tidak sengaja), balasan
   "Auto-reply uji v4 aktif: naga-7315." Cek rule tersimpan dan tampil
   di daftar.
2. **7b — TES LIVE (agent sendiri, via WA Web):** dari WA Web (kalau sesi
   nomor uji sudah tertaut), kirim pesan `uji-v4-naga-7315` ke nomor
   device SuperAdmin → cek balasan otomatis terkirim dan sampai di WA Web.
   Kalau WA Web belum tertaut: tulis BLOCKED (butuh HP sekali jalan untuk
   link WA Web), rule tetap tercatat sebagai dibuat, dan cek pemicu lewat
   preview auto-reply (`/api/v1/autoreplies/preview`) + log trigger.
3. **7c — JADWAL (agent sendiri):** buat 1 pesan terjadwal → cek terkirim
   pada waktunya (atau tampil di antrean dengan waktu benar).
4. DOCS: ikuti docs auto-reply + jadwal — catat kalau pemicu auto-reply
   (keyword cocok persis / mengandung kata?) tidak dijelaskan.

## TAHAP 8 — SUB-MENU SUPERADMIN (browser, desktop + mobile) — SAPU BERSIH

1. Buka 6 sub-menu: Ringkasan, Pemasukan, Promo & Voucher, VPS & Kapasitas,
   Verifikasi Pembayaran, Harga Paket. Tiap halaman: satu tanggung jawab,
   data tampil, tidak ada halaman kosong/error.
2. **SAPU BERSIH — klik dan coba SEMUA tombol/aksi di tiap sub-menu,**
   bukan cuma membuka halaman: filter, ubah, simpan, hapus, setujui,
   tolak, tambah. Tiap aksi yang error (500, halaman kosong, tombol mati,
   data salah) = catat sebagai bug dengan langkah reproduksi.
3. Cek sidebar dan mobile-nav SAMA isinya (mobile pakai viewport HP).
4. Sebagai tenant, buka semua `/dashboard/superadmin/*` — harus DITOLAK.
5. DOCS: baca docs SuperAdmin (kalau ada) — catat fitur SuperAdmin apa
   yang TIDAK ada docs-nya sama sekali.

## TAHAP 9 — PEMASUKAN + PROMO + HARGA (browser — UBAH HARGA ASLI, BALIKKAN LAGI)

1. Pemasukan: cek filter (disetujui saja / semua incl. pending / disetujui
   minus biaya VPS), pisah per paket, grafik harian + bulanan tampil.
2. Ubah biaya VPS 90.000 → 100.000, cek angka berubah → BALIKKAN ke 90.000.
3. Buat promo 50% Starter (baru, bulan pertama saja) → cek harga landing
   berubah → HAPUS promo sesudah tes.
4. Buat voucher → cek bisa dipakai sekali → HAPUS sesudah tes.
5. Ubah harga Starter → cek tenant lama TETAP harga lama → BALIKKAN harga.
6. Cek BSI tulis "a.n." SEKALI saja (F1, issue #58) di halaman bayar +
   Settings + kartu Verifikasi Pembayaran.
7. DOCS: ikuti docs promo/voucher/harga — catat kalau aturan "promo hanya
   bulan pertama, hanya pembeli baru" tidak tertulis di docs.

## TAHAP 10 — KAPASITAS + MONITOR (browser)

1. Buka VPS & Kapasitas: catat % terpakai + bound paling penuh + "muat
   berapa tenant lagi". Cek label "perkiraan, bukan jaminan" ada.
2. Buka System Monitor: cek angka-angka tampil dan masuk akal.
3. Buka halaman status publik (URL dari DATA UJI): cek namanya "PesanPro"
   (bukan "WaGateway") dan embed uptime tampil (bukan kosong).
4. DOCS: baca docs kapasitas/monitor — catat kalau arti % / ambang
   80% / email peringatan tidak dijelaskan.

## TAHAP 11 — KEAMANAN: ISOLASI + CSRF (browser; curl hanya fallback)

1. Isolasi: login 2 tenant berbeda (tenant tes + satu tenant lain — pakai
   2 profil browser / 1 biasa + 1 incognito). Cek: tenant A TIDAK bisa
   lihat/buka data tenant B (sessions, broadcast, billing, webhook) —
   coba buka URL milik B dari sesi A, harus ditolak.
2. CSRF, 3 kasus — buktikan dengan request lintas-origin BENAR-BENAR
   pakai cookie login (curl tanpa cookie tidak cukup — semua akan 401
   karena belum login). Caranya di browser: login sebagai tenant di satu
   tab, lalu di tab lain buka origin asing (mis. `https://example.com`)
   dan jalankan `fetch` POST ke endpoint API PesanPro dengan
   `credentials: "include"` (satu endpoint ubah data per kasus, mis.
   buat/ubah auto-reply atau kirim pesan). Catat status HTTP + apakah
   ada perubahan state:
   a. POST lintas-origin tanpa Origin yang benar → harap 403
      (`CSRF_ORIGIN_REJECTED`) ATAU 401 (cookie tidak dikirim karena
      SameSite=Lax) — keduanya = TERLINDUNGI, bukan gagal.
   b. POST lintas-origin dengan Origin asing eksplisit → harap 403.
   c. POST lintas-origin tanpa token CSRF (kalau endpoint memakainya) →
      harap 403.
   **Hanya 200 + state BERUBAH yang berarti GAGAL.** Kalau semua kasus
   401/403 tanpa perubahan state, tulis LOLOS + buktinya. Kalau browser
   tidak bisa menjalankan fetch lintas-origin, tulis BELUM LENGKAP +
   alasannya, jangan klaim PASS.
3. DOCS: baca docs keamanan/API key/webhook — catat kalau isolasi tenant
   / CSRF tidak disebutkan sama sekali.

## TAHAP 12 — L13 / L16 / L17 + DEAD-LETTER (browser)

1. L13: edit pesan WA yang sudah terkirim → cek apa yang terjadi di
   dashboard (diketahui: teks baru tidak tersedia — pastikan docs/marketing
   berkata begitu, bukan janji bisa).
2. L16/L17: cek alert + dead-letter — Resolve hanya kalau kondisi benar
   bersih; Acknowledge untuk alert yang sengaja dibiarkan terbuka.
3. Cek antrean: LIST semua item dead-letter (run v3: 18 item) dengan
   detail tiap item → laporkan ke pemilik untuk KEPUTUSAN (retry/hapus).
   Agent JANGAN menghapus dead-letter tanpa persetujuan pemilik.
4. DOCS: baca docs antrean/dead-letter — catat kalau tidak ada docs yang
   menjelaskan apa itu dead-letter dan apa yang harus dilakukan operator.

## TAHAP 13 — DRILL BACKUP (TERMINAL — BUTUH PEMILIK, di VPS)

> Langkah ini dijalankan PEMILIK di VPS. QA agent menulis perintahnya,
> pemilik menjalankan dan menempel outputnya. JANGAN restore ke DB produksi.

```bash
cd /www/wwwroot/PesanPro
npm run backup:create
ls -lh backups/            # cek file baru ada + ukurannya
npm run backup:verify      # cek file baru LOLOS verify
```

Lalu cek cron + prune (masih di VPS):

```bash
crontab -l | grep -i backup   # cek cron Minggu 03:00 pakai path absolut npm/rclone atau belum
rclone ls <nama-remote-b2> 2>/dev/null | head  # cek salinan B2 (jangan prune dulu tanpa persetujuan pemilik)
du -sh /www/wwwroot/PesanPro/data/media /www/wwwroot/PesanPro/.next  # ukur file media lama + build
```

Restore HANYA ke environment kosong (BUKAN DB produksi) — kalau tidak ada
environment kosong, tulis BELUM DIUJI + alasannya, jangan paksakan.
Catat juga: apakah run backup 15 Nov 03:00 menghasilkan file (cek `ls`).

## TAHAP 14 — LEGAL + STATUS (browser)

1. Buka `/privacy` dan `/terms` — cek ada, menyebut retensi 30 hari
   (bukan klaim "tidak menyimpan"). Catat bahasa halaman (saat ini
   Inggris — catat sebagai temuan kalau aplikasi berbahasa Indonesia).
   Issue #59 = /terms §1 yang bertentangan — cek sudah diperbaiki atau belum.
2. Buka marketing site — cek harga sama dengan dashboard (Starter 20rb /
   Bisnis 49rb / Pro 99rb), logo burung hijau di bubble kuning (bukan
   PP Monogram).
3. DOCS: bandingkan isi /privacy + /terms dengan docs — catat kalau ada
   yang bertentangan.

## TAHAP 15 — HAPUS TENANT TES + CLEANUP (browser — AGENT SENDIRI)

1. Hapus tenant tes (Tahap 2) dari dashboard SuperAdmin → Users.
   Harap: terhapus di percobaan PERTAMA, toast "User deleted", TANPA toast
   error timeout (ini verifikasi final PR #55 + #57).
2. Hapus semua data uji: broadcast, job, pesan uji, bukti bayar tes.
   (Kalau sesi browser putus sebelum cleanup selesai — seperti run v3 —
   tulis BLOCKED + daftar yang tersisa, dan pemilik yang bersihkan.)
3. Cek halaman Users: hanya SuperAdmin + tenant asli yang tersisa.
4. Balikkan SEMUA yang diubah di Tahap 9 (biaya VPS, harga, promo,
   voucher) — cek satu per satu sudah kembali.

## TAHAP 16 — VONIS LAUNCH

Beri vonis per tingkat (satu FAIL/BLOCKED/NOT VERIFIED = NOT READY):

- **SOFT LAUNCH:** READY kalau Tahap 1–3, 5–15 PASS dan A2 selesai
  (Tahap 4 QR tenant DITUNDA per keputusan pemilik 18 Nov — dicatat
  sebagai item tertunda, bukan blocker soft launch karena kirim pesan
  memakai device SuperAdmin) dan issue #60 sudah terjawab (tuntas atau
  terbukti bukan bug).
- **PUBLIC LAUNCH:** READY kalau SEMUA tahap 1–15 PASS — termasuk Tahap 4
  (QR tenant harus sudah dites sebelum public launch, karena tenant asli
  wajib bisa menghubungkan device sendiri). Kalau Tahap 4 masih DITUNDA,
  vonis tetap NOT READY dengan Tahap 4 sebagai blocker bernama.

Tulis juga: 3 blocker terbesar (kalau ada), dan perkiraan jujur kapan
public launch bisa jalan.

## TAHAP 17 — DOKUMENTASI: APAKAH DOCS-NYA JELAS? (kumpulkan dari semua tahap)

Kumpulkan semua catatan docs dari Tahap 1–15 menjadi satu daftar:

| Fitur | Docs ketemu? | Jelas / ambigu / salah | User baru bisa sendiri? | Gap (apa yang harus ditambah/diubah di docs) |
|---|---|---|---|---|

Tambah vonis docs: **DOCS SIAP / DOCS PERLU PERBAIKAN** + 3 gap docs
terbesar. Fitur yang TIDAK ADA docs-nya sama sekali ditulis eksplisit
(itu temuan, bukan "tidak dites").

## FORMAT LAPORAN AKHIR (gaya WorkBuddy, hemat token)

- VONIS di baris pertama (SOFT LAUNCH: ... / PUBLIC LAUNCH: ...).
- Matriks Fase 0 (final, sesudah run).
- Tabel hasil per tahap: Tahap → PASS/FAIL/BLOCKED/NOT VERIFIED → bukti
  (1 baris bukti per tahap, screenshot dirujuk by nama file, bukan ditempel).
- Daftar bug (draf GitHub issue, 1 baris per bug).
- **Daftar ambiguitas docs (Tahap 17) — 1 baris per gap + vonis docs.**
- **Yang butuh pemilik (terverifikasi):** hanya tugas dari tabel BUTUH
  PEMILIK yang benar-benar belum selesai + keputusan yang diminta.
- Yang belum dites + yang butuh keputusan pemilik.
- Bahasa Indonesia polos, kalimat pendek. Tanpa basa-basi, tanpa tempel
  log mentah, tanpa narasi langkah-demi-langkah. Target ~1000–1500 kata
  (run ini besar — lebih panjang dari laporan biasa, tapi tetap ringkas).
