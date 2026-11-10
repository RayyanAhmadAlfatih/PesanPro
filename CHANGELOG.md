# Changelog

Semua perubahan penting pada PesanPro dicatat di file ini.

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id-ID/1.1.0/), dan versi mengikuti [Semantic Versioning](https://semver.org/lang/id/).

## [0.3.1] - 2026-11-02

Memperbaiki Contact Form 7 yang selalu gagal terkirim walaupun paket aktif dan
perangkat WhatsApp terhubung.

### Diperbaiki

- **Contact Form 7 berhenti dengan 401 "Unauthorized" sebelum diproses.** Proxy
  mewajibkan sesi dashboard atau kunci API untuk semua jalur `/api/v1`, termasuk
  jalur integrasi yang autentikasinya memakai token `ppint_`. Akibatnya setiap
  kiriman plugin ditolak sebelum sempat diperiksa, lalu dicatat sebagai kegagalan
  permanen dan tidak dicoba lagi. Jalur `POST /api/v1/integrations/*` sekarang
  dilewatkan ke penangan rute dengan pembatas laju per IP (120 permintaan per
  menit); pengelolaan token integrasi tetap wajib sesi atau kunci API.
- **Timestamp kiriman ditolak (422).** Plugin mengirim `gmdate('c')` yang
  berakhiran `+00:00`, sedangkan skema hanya menerima akhiran `Z`. Setiap kiriman
  Contact Form 7 dan Google Forms yang menyertakan waktu akan gagal validasi.
  Skema kini menerima offset zona waktu mana pun.
- **ESLint memeriksa folder build lama.** Pola abaikan `.next.*/**` tidak
  mencocokkan folder bernama `.next-stale-*`, sehingga 27 ribu berkas hasil build
  ikut diperiksa dan proses kehabisan memori. Ditambahkan pola `.next-*/**`.

### Plugin WordPress 1.1.1

- Kolom **Recipient field name** menampilkan nama field yang benar-benar ada di
  formulir Contact Form 7, jadi bisa disalin alih-alih dikira-kira.
- Kiriman tanpa nomor tujuan dicatat sebagai gagal dengan alasan
  `recipient_missing` di WordPress, tanpa mengirim permintaan 422 ke server.

### Plugin WordPress 1.1.0

- Halaman pengaturan menampilkan alasan kegagalan (401/403/404/409/422, gangguan
  jaringan, konfigurasi belum lengkap), bukan hanya jumlahnya.
- Tombol **Coba kirim ulang yang gagal** mengembalikan kiriman gagal ke antrean
  setelah token atau field penerima diperbaiki.
- Panduan 07 ditambah bagian penanganan status "failed".

## [Unreleased]

### Plugin WordPress 1.2.0

- Tab **PesanPro** di editor Contact Form 7 menyimpan pesan WhatsApp untuk
  masing-masing form. Placeholder `{{field:nama}}`, `{{all_fields}}`, dan metadata
  form diganti di WordPress sebelum pesan dikirim.
- Form tanpa template tetap memakai pesan bawaan server. Pesan dibatasi 4.096
  karakter agar tidak ditolak endpoint integrasi.
- Panduan 07 ditambah bagian pesan custom per form dan penjelasan bedanya dengan
  `messageTemplate` pada token.

### Akan datang

- Deploy migrasi paket, onboarding, dan support ke produksi.
- Pembersihan branch lama.
- Halaman status layanan dan dokumentasi pemulihan bencana.
- Tindak lanjut `npm audit`: 52 temuan lama dari rantai `jimp`, Baileys rc, dan
  `vite`. Perbaikannya butuh penurunan versi besar, jadi direncanakan terpisah.
- Keputusan produk: kunci API legacy tinggal pengguna (full-scope, tanpa
  kedaluwarsa/IP allowlist) kapan dimigrasi ke kunci terkelola.

## [0.2.5] - 2026-11-01

Sinkronisasi panduan `/docs` dengan kode terbaru. Tidak ada perubahan logika
aplikasi, harga, hak akses, atau perilaku auto-reply pada rilis ini.

### Dokumentasi

- 9 panduan di `docs/panduan/` diselaraskan dengan label sidebar dan formulir
  terbaru: **Perangkat & QR**, **Kirim Massal**, **Jadwal Kirim**, **Antrian
  Pesan**, **Balasan Otomatis**, **Kunci API**, **Tagihan**, serta grup admin
  **Operasi** (**Pengguna**, **Operasi Komersial**, **Monitor Sistem**,
  **Kirim Pengumuman**, **Pengumuman Pop-up**).
- Panduan 01: alur membuat perangkat diganti ke kartu **Create New Session**
  dan tombol **Create Session**, tabel status antrean dikoreksi ke
  `QUEUED/PROCESSING/SENT/DELIVERED/READ/FAILED/CANCELLED`.
- Panduan 02: field formulir broadcast ditulis persis (**Nama broadcast**,
  **Nomor tujuan**, **Template pesan**, **Delay minimum/maksimum (detik)**),
  tombol **Simpan & antrekan** dan **Jeda/Lanjut/Batal**, tab daftar jangan
  kirim beserta kata kunci opt-out.
- Panduan 03: ditambah langkah form Auto Reply Studio, tabel status log
  (`PENDING/PROCESSING/ENQUEUED/SKIPPED/FAILED`), 22 kode alasan, bagian
  "Sapaan otomatis: dua hal yang berbeda" (welcome message perangkat vs aturan
  buatan pengguna), dan glosarium.
- Panduan 06: langkah membuat webhook sesuai UI (**New Webhook**,
  **Create Webhook**); klaim bahwa percobaan maksimal dan timeout bisa diatur
  dari dashboard dihapus karena tidak ada di formulir (nilai bawaan server:
  8 percobaan, timeout 10 detik).
- Panduan 08: FAQ jadwal dan zona waktu, fallback yang terpicu salah, sapaan
  ganda atau tidak terkirim, serta batas jumlah aturan.
- README: status rilis, tabel paket, dan peta dokumentasi diperbarui.

### Catatan

- Perilaku `welcomeMessage` perangkat dapat dibaca di kode, tetapi tidak ada
  UI maupun API yang menulis nilainya. Hal ini dicatat sebagai temuan di
  panduan 03 dan belum diubah pada rilis ini.

## [0.2.4] - 2026-11-01

Perbaikan dari temuan QA live setelah deploy v0.2.3.

### Diperbaiki

- Pembaruan grup (`group.update`) kini terkirim di setiap kejadian. Sebelumnya
  JID grup dipakai sebagai kunci dedup, jadi hanya pembaruan pertama per grup
  yang pernah dikirim dan sisanya hilang senyap.
- Event webhook duplikat tidak lagi membanjiri log error Prisma; pemeriksaan
  duplikat dilakukan sebelum pembuatan, penanganan balapan tetap dipertahankan.

## [0.2.3] - 2026-11-01

Ronde kedua audit bug senyap: autentikasi, OTP, webhook, media, dan route pesan
langsung. Laporan lengkap: `docs/qa/AUDIT-REPORT-R2-2026-11-01.md`.

### Keamanan

- Media via URL kini diunduh lewat fetcher yang tervalidasi SSRF di setiap
  redirect dan dibatasi 100 MB, bukan diteruskan mentah ke Baileys.
- Permintaan kode OTP menjawab sukses generik untuk email yang tidak bisa
  diproses — status 404/200 tidak lagi membocorkan akun mana yang terdaftar.
- Login kini punya batas per-IP (30 percobaan/15 menit) selain batas per-email.
- Kuota OTP per-email hanya dihitung untuk akun aktif, jadi pihak lain tidak
  bisa mengunci korban dari login OTP.
- Logout menaikkan `sessionVersion`: semua salinan token langsung mati
  (perilaku baru: logout di satu perangkat mengakhiri sesi semua perangkat).

### Diubah

- Endpoint pesan langsung (list, poll, contact, location, hapus/edit, reaksi,
  bintang) kini menormalkan nomor seperti /send; penerima tidak valid dijawab
  422 dengan alasan jelas, bukan 500 generik.
- JID `@newsletter` (Channel WhatsApp) diterima di semua jalur pengiriman.
- Error database saat validasi API key dijawab 500 dengan request id, bukan 401
  yang menyesatkan.
- Kirim media legacy menolak unggahan raksasa dari header Content-Length
  sebelum body dibuffer.
- Hash kanonik webhook/integrasi diurutkan per codepoint, kebal perubahan ICU.

### Diperbaiki

- Pesan yang kehabisan percobaan tidak lagi terjebak "queued" selamanya saat
  pekerja berhenti; recovery langsung dead-letter dengan kuota kembali.
- Pembersih dead-letter memberi jeda aman 60 detik agar pekerja yang hanya
  lambat tidak dihukum FAILED.
- Percobaan pengiriman webhook milik pekerja yang mati kini ditutup sebagai
  gagal; log tidak lagi menampilkan baris "berjalan" hantu.
- Media terkarantina ikut dibersihkan retensi dan kuota penyimpanannya kembali.
- Parser unggah menolak field berlebih dengan pesan jelas.
- Event `message.sent` yang gagal dibuat kini tercatat di log, bukan hilang
  tanpa jejak.
- Pembuatan kunci API bebas bias modulo.

## [0.2.2] - 2026-11-01

Rilis perbaikan tampilan panduan, akses halaman publik, dan integrasi plugin
WordPress.

### Ditambahkan

- Unduhan ZIP plugin WordPress dari dashboard → **Developer**, plus endpoint
  publik `/api/public/plugin/wordpress`. Superadmin bisa mengunggah ZIP
  pengganti dari **Settings** agar pembaruan plugin tidak butuh deploy kode.
- Tombol salin di setiap blok kode halaman panduan, dengan warna blok kode
  yang kini terbaca (sebelumnya hijau di atas hijau).

### Diubah

- Pengguna yang sudah masuk tetap bisa membuka beranda, `/docs`, `/terms`, dan
  `/privacy`; sebelumnya beranda selalu dilempar ke dashboard.
- Panduan 10 (panduan admin) hanya terlihat dan terbaca oleh superadmin di
  halaman dokumentasi; pengguna lain mendapat halaman tidak ditemukan.
- Panduan integrasi WordPress kini memakai alur unduh ZIP dari dashboard, bukan
  menyalin folder dari repositori.

## [0.2.1] - 2026-11-01

Rilis hasil audit bug senyap di seluruh fitur. Laporan lengkap:
`docs/qa/AUDIT-REPORT-2026-11-01.md`.

### Ditambahkan

- Halaman Tagihan menampilkan rekening tujuan beserta tombol salin untuk
  pelanggan yang memperpanjang, dengan status jujur saat admin belum mengisi
  rekening.

### Diubah

- Perpanjangan paket yang sama kini melanjutkan masa aktif dari tanggal
  berakhirnya paket sekarang, bukan dihitung ulang dari hari persetujuan.
  `startsAt` tidak digeser agar kuota bulanan tidak ter-reset di tengah periode.
- Pesan error aksi perangkat menampilkan penyebab umum dan langkah berikutnya
  dalam Bahasa Indonesia, bukan satu kalimat generik untuk semua kegagalan.
- Error 500 pada API kini tercatat di log bersama request id.

### Diperbaiki

- Pesan yang gagal total setelah pekerja mati kini mengembalikan kuota bulanan,
  memperbarui status penerima broadcast, dan mengirim event webhook gagal.
- Hasil retry pesan broadcast kini memulihkan status penerima yang tadinya gagal.
- Hanya paket tanpa harga bulanan yang boleh dijadikan paket default, sehingga
  pendaftar baru tidak bisa mendapat paket berbayar gratis.
- Satu pengguna hanya boleh punya satu bukti pembayaran yang sedang diperiksa;
  form Tagihan ikut terkunci saat ada bukti yang belum diputuskan.
- Jadwal yang sewanya kedaluwarsa kini bisa dibatalkan dan diedit tanpa harus
  menunggu pekerja melepasnya.
- Status QR dan kode pairing yang tidak mungkin bertahan setelah restart server
  direset menjadi STOPPED, jadi tombol Start aktif lagi.
- Nomor telepon dengan spasi, strip, titik, atau tanda kurung, termasuk format
  lokal `08…`, kini dinormalisasi untuk pairing dan pengiriman pesan.
- Status kampanye mengikuti broadcast miliknya yang dijeda dari halaman
  Broadcast.
- Header CSV penerima mengenali nama kolom Indonesia seperti "Nomor WhatsApp"
  dan "No WA".
- Daftar perangkat menampilkan pesan galat dan tombol coba lagi saat API gagal,
  bukan daftar kosong.
- Percobaan terakhir pengiriman webhook yang mati total tidak lagi tampak
  "memproses" selamanya.
- Kebocoran kecil kuota saat retry balapan dengan pemulihan pekerja ditutup.

## [0.2.0] - 2026-10-31

Rilis onboarding dan dokumentasi di dalam aplikasi.

### Ditambahkan

- Onboarding saat daftar: paket, periode, rekening tujuan, dan bukti transfer diisi sebelum akun dibuat.
- Kolom rekening pembayaran di `SystemConfig` dan kartu **Payment destination** di Settings superadmin.
- Endpoint publik `/api/public/onboarding` yang mengirim daftar paket dan rekening tujuan ke halaman daftar.
- Halaman dokumentasi publik `/docs` dan `/docs/[slug]` yang membaca panduan `.md` yang sama dengan repositori, plus menu **Dokumentasi** di landing page dan dashboard.
- `docs/AGENT-PLAYBOOK.md`: aturan berpikir, diagnosis, testing lewat `browser-skill`, coding, struktur repo, dan format laporan.
- Kontak WhatsApp admin di `SystemConfig` dan halaman **Bantuan** di dashboard, dengan tombol chat langsung ke nomor yang diatur superadmin.
- Kredit pembuat **wa-akg** di README, footer aplikasi, halaman masuk, dan metadata paket.

### Diubah

- Halaman daftar menjadi tiga langkah dan memakai bahasa Indonesia: data akun, pilih paket, lalu transfer dan unggah bukti.
- Bukti pembayaran tidak lagi dihitung ke kuota `MEDIA_STORAGE_BYTES`.

### Diperbaiki

- Registrasi tidak bisa dikirim tanpa paket dan bukti transfer; server menolak permintaan yang tidak lengkap.
- Akun `PENDING` bisa mengunggah bukti pembayaran meski belum punya jatah penyimpanan.

## [0.1.0] - 2026-10-31

Rilis pra-launch pertama. Fokus: paket premium tanpa trial, harga kompetitif, dan dokumentasi lengkap.

### Ditambahkan

- Panduan lengkap `docs/panduan/01` sampai `10`: memulai untuk UMKM, broadcast, auto-reply, media, API developer, webhook, integrasi tanpa kode, troubleshooting, paket dan margin, serta panduan admin.
- Contoh kode cURL, Node.js, dan PHP, plus SDK mini untuk Node.js dan PHP.
- Entitlement `MEDIA_MAX_UPLOAD_BYTES` agar batas unggah bisa diatur per paket.
- Batas unggah per paket: Starter 50 MB, Bisnis 75 MB, Pro 100 MB.
- Halaman Tagihan baru: kartu paket berbahasa awam, nominal yang bisa disalin, langkah pengiriman bukti, checklist sebelum kirim, dan riwayat berstatus Indonesia.
- `README.md`, `CHANGELOG.md`, dan indeks panduan.

### Diubah

- Harga paket menjadi Starter Rp20.000, Bisnis Rp49.000, Pro Rp99.000 per bulan. Tahunan tetap 10x bulanan: Rp200.000, Rp490.000, Rp990.000.
- Batas paket disesuaikan: 1/3/5 perangkat, 3.000/12.000/40.000 pesan per bulan, 50/200/500 broadcast per bulan, 500/1.500/3.000 penerima per broadcast.
- Auto-reply 10/50/tanpa batas, webhook 2/5/15, kunci API 2/5/10.
- Batas platform `MAX_UPLOAD_SIZE_MB` dinaikkan ke 100 MB sebagai plafon server, sementara batas paket tetap yang menentukan.
- Halaman register disamakan dengan halaman login: kartu, tipografi, dan pesan status yang konsisten.
- Halaman Tagihan tetap menampilkan pilihan paket ketika akun belum punya data langganan.

### Dihapus

- Paket trial 7 hari. Akun baru langsung mendapat paket `PENDING` dan harus membayar sebelum mengirim.
- Kolom `Plan.trialDays` dan status default `TRIAL` pada subscription baru.
- Menu Chat UI, Label, dan Campaign dari navigasi.

### Diperbaiki

- Persetujuan dan penolakan pembayaran tidak lagi mengembalikan `500` karena nilai `BigInt` pada entitlement.
- Watchdog koneksi WhatsApp memutus sesi yang menggantung lebih dari 60 detik.
- Reaksi dari nomor sendiri tidak lagi tercatat sebagai pesan masuk.
- Notifikasi `LOGGED_OUT` dan `STOPPED` dikirim lewat saluran peringatan sesi.

### Keamanan

- Scope kunci API fail-closed: endpoint di luar kebijakan ditolak.
- Isolasi tenant pada sesi, media, dan pembayaran.
- Kunci API disimpan sebagai hash dengan preview, secret hanya muncul saat dibuat atau dirotasi.
- Retensi data: audit 365 hari, media dan metadata 30 hari, QR 1 jam, OTP 1 hari.

---

Catatan rilis disusun dari riwayat commit dan laporan perubahan `docs/LAPORAN-PERUBAHAN-2026-10-31.md`.
