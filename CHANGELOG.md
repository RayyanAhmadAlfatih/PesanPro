# Changelog

Semua perubahan penting pada PesanPro dicatat di file ini.

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id-ID/1.1.0/), dan versi mengikuti [Semantic Versioning](https://semver.org/lang/id/).

## [Unreleased]

### Akan datang

- Deploy migrasi paket dan batas upload ke produksi.
- GitHub Release untuk `v0.1.0` dan pembersihan branch lama.
- Halaman status layanan dan dokumentasi pemulihan bencana.

## [0.1.0] - 2026-10-31

Rilis pra-launch pertama. Fokus: paket premium tanpa trial, harga kompetitif, dan dokumentasi lengkap.

### Ditambahkan

- Panduan lengkap `docs/panduan/01` sampai `10`: memulai untuk UMKM, broadcast, auto-reply, media, API developer, webhook, integrasi tanpa kode, troubleshooting, paket dan margin, serta panduan admin.
- Contoh kode cURL, Node.js, dan PHP, plus SDK mini untuk Node.js dan PHP.
- Entitlement `MEDIA_MAX_UPLOAD_BYTES` agar batas unggah bisa diatur per paket.
- Kolom rekening pembayaran di `SystemConfig` dan kartu **Payment destination** di halaman Settings superadmin.
- Endpoint publik `/api/public/onboarding` yang mengirim daftar paket dan rekening tujuan ke halaman daftar.
- Registrasi onboarding: paket, nominal, rekening tujuan, dan bukti transfer diisi saat membuat akun.
- Batas unggah per paket: Starter 50 MB, Bisnis 75 MB, Pro 100 MB.
- Halaman Tagihan baru: kartu paket berbahasa awam, nominal yang bisa disalin, langkah pengiriman bukti, checklist sebelum kirim, dan riwayat berstatus Indonesia.
- `README.md`, `CHANGELOG.md`, dan indeks panduan.
- Kredit pembuat **wa-akg** di README, footer aplikasi, halaman masuk, dan metadata paket.
- Halaman dokumentasi publik `/docs` yang membaca panduan `.md` yang sama dengan repositori, plus menu **Dokumentasi** di landing page dan dashboard.
- `docs/AGENT-PLAYBOOK.md`: aturan berpikir, diagnosis, testing lewat `browser-skill`, coding, struktur repo, dan format laporan.
- Kontak WhatsApp admin di `SystemConfig` dan halaman **Bantuan** di dashboard, dengan tombol chat langsung ke nomor yang diatur superadmin.

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
- Bukti pembayaran tidak lagi dihitung ke kuota `MEDIA_STORAGE_BYTES`, sehingga akun `PENDING` bisa mengunggah bukti sebelum punya paket.
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
