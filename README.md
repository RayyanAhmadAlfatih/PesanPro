# PesanPro

Gateway WhatsApp untuk UMKM. Satu dashboard untuk menghubungkan nomor WhatsApp, mengirim broadcast, membalas otomatis, menjadwalkan pesan, dan memanggil REST API.

Status: pra-rilis `0.1.0` (31 Oktober 2026). Tidak ada paket trial. Akun baru bisa masuk dashboard, tetapi pengiriman, auto-reply, webhook, dan unggah media aktif setelah pembayaran disetujui admin.

Dibuat dan dikembangkan oleh **wa-akg**.

## Fitur

- **Multi-tenant.** Setiap akun punya perangkat, kontak, kuota, dan kunci API sendiri.
- **Perangkat WhatsApp.** Hubungkan nomor lewat QR, pantau status koneksi, dan putuskan kapan saja.
- **Broadcast.** Kirim ke banyak penerima dengan jeda, impor CSV, variabel, spintax, dan daftar suppression.
- **Auto-reply.** Aturan `EXACT`, `CONTAINS`, `STARTS_WITH`, `REGEX`, dan `FALLBACK`, lengkap dengan prioritas, jadwal, cooldown, dan batas rantai.
- **Pesan terjadwal.** Simpan pesan untuk dikirim pada waktu tertentu.
- **REST API dan webhook.** Kunci API dengan scope, idempotency, dan event webhook bertanda tangan.
- **Media.** Unggah gambar, video, audio, dan dokumen dengan batas per paket.
- **Operasional admin.** Verifikasi pembayaran, assign paket, override entitlement, dan pemantauan antrean.

## Paket

| | Starter | Bisnis | Pro |
| --- | --- | --- | --- |
| Bulanan | Rp20.000 | Rp49.000 | Rp99.000 |
| Tahunan (10x bulanan) | Rp200.000 | Rp490.000 | Rp990.000 |
| Perangkat WhatsApp | 1 | 3 | 5 |
| Pesan/bulan | 3.000 | 12.000 | 40.000 |
| Broadcast/bulan | 50 | 200 | 500 |
| Penerima/broadcast | 500 | 1.500 | 3.000 |
| Auto-reply | 10 | 50 | Tanpa batas |
| Webhook | 2 | 5 | 15 |
| Kunci API | 2 | 5 | 10 |
| Upload per file | 50 MB | 75 MB | 100 MB |
| Penyimpanan media | 1 GB | 5 GB | 20 GB |

Pembayaran dilakukan lewat transfer manual. Pengguna mengirim bukti transfer, admin memverifikasi, lalu paket aktif. Tidak ada payment gateway otomatis.

## Stack

| Lapisan | Teknologi |
| --- | --- |
| Web | Next.js 16 (App Router), React 19, TypeScript |
| UI | Tailwind CSS 4, komponen bergaya shadcn/ui |
| Data | Prisma 5, MySQL |
| WhatsApp | Baileys |
| Realtime | Socket.IO |
| Auth | NextAuth, kata sandi dan OTP email |
| Uji | Vitest |

Runtime memakai server sendiri, `src/server/index.ts`, bukan `next dev`. Server ini menjalankan HTTP Next.js, Socket.IO, dan worker di proses yang sama.

## Menjalankan di lokal

Prasyarat: Node.js 20 atau lebih baru, MySQL 8, dan npm.

```bash
git clone git@github.com:RayyanAhmadAlfatih/PesanPro.git
cd PesanPro
npm ci
cp .env.example .env
```

Isi minimal variabel berikut di `.env`:

| Variabel | Keterangan |
| --- | --- |
| `DATABASE_URL` | Koneksi MySQL, contoh `mysql://root:password@localhost:3306/pesanpro_db` |
| `AUTH_SECRET` | String acak minimal 32 karakter |
| `ENCRYPTION_KEY` | 64 karakter hex untuk enkripsi sesi WhatsApp |
| `BASE_URL` | Alamat aplikasi, contoh `http://localhost:3000` |
| `PORT` | Port server, default `3000` |

Buat secret dengan `openssl rand -base64 32` dan `openssl rand -hex 32`.

```bash
npx prisma migrate deploy
npx prisma generate
npm run dev
```

Buka `http://localhost:3000`. Cek kesehatan server di `/api/health/live`.

Untuk membuat akun superadmin pertama:

```bash
npm run make-admin
```

## Perintah penting

| Perintah | Fungsi |
| --- | --- |
| `npm run dev` | Menjalankan server pengembangan beserta worker |
| `npm run build` | Build produksi Next.js (webpack, heap 2 GB) |
| `npm start` | Menjalankan server produksi |
| `npm run typecheck` | Cek tipe TypeScript |
| `npm run lint` | ESLint |
| `npm test` | Vitest, satu worker |
| `npm run db:migrate` | `prisma migrate deploy` lalu `prisma generate` |
| `npm run backup:create` | Backup database |
| `npm run release:preflight` | Pemeriksaan sebelum rilis |

## Struktur repositori

```
src/app          Halaman dashboard, halaman publik, dan route API
src/server       Runtime HTTP, Socket.IO, dan bootstrap worker
src/worker       Worker pengiriman pesan
src/scheduler    Penjadwal pesan
src/broadcast    Pengirim broadcast
src/autoreply    Mesin auto-reply
src/webhook      Pengirim webhook
src/lib          Logika domain: billing, entitlement, media, auth, audit
prisma           Skema dan migrasi database
docs/panduan     Panduan UMKM dan developer
docs/qa          Catatan QA, issue, dan panduan runtime VPS
scripts          Backup, migrasi media, pembuatan admin
```

## Dokumentasi

Panduan lengkap ada di [`docs/panduan`](docs/panduan/README.md):

| Panduan | Untuk |
| --- | --- |
| [01 Memulai untuk UMKM](docs/panduan/01-memulai-umkm.md) | Daftar, pilih paket, bayar, hubungkan WhatsApp |
| [02 Broadcast](docs/panduan/02-broadcast.md) | CSV, variabel, spintax, opt-in, batas paket |
| [03 Auto-reply](docs/panduan/03-auto-reply.md) | Semua jenis aturan dan contoh siap pakai |
| [04 Media dan batas upload](docs/panduan/04-media-dan-limit-upload.md) | Format, batas per paket, kompresi |
| [05 API untuk developer](docs/panduan/05-api-developer.md) | cURL, Node.js, PHP, SDK mini |
| [06 Webhook](docs/panduan/06-webhook.md) | Event, payload, signature, retry |
| [07 Integrasi tanpa kode](docs/panduan/07-integrasi-tanpa-kode.md) | WordPress, WooCommerce, Google Forms |
| [08 Troubleshooting](docs/panduan/08-troubleshooting-faq.md) | Error umum dan cara memperbaiki |
| [09 Paket dan margin](docs/panduan/09-paket-dan-margin.md) | Matriks harga dan hitungan margin |
| [10 Panduan admin](docs/panduan/10-panduan-admin.md) | Verifikasi pembayaran dan operasional |

Panduan yang sama juga tersedia di dalam aplikasi pada halaman [`/docs`](https://wagateway.kingofcoding.my.id/docs), dan bisa dibuka dari menu **Dokumentasi** di dashboard.

Aturan kerja untuk agen AI ada di [`docs/AGENT-PLAYBOOK.md`](docs/AGENT-PLAYBOOK.md).

## Deploy

Panduan langkah demi langkah ada di [`docs/qa/VPS-RUNTIME-GUIDE-2026-10-12.md`](docs/qa/VPS-RUNTIME-GUIDE-2026-10-12.md). Urutan dasarnya:

1. Backup database dengan `npm run backup:create`.
2. `git pull` di direktori aplikasi.
3. `npm ci`.
4. `npx prisma migrate deploy && npx prisma generate`.
5. `npm run build`.
6. `pm2 restart pesanpro`.

Penting: runtime membaca kode dari `src/`, bukan dari `.next`. Deploy yang hanya mengganti hasil build tidak mengaktifkan perubahan pada worker, webhook, atau logika server. `git pull` dan restart proses selalu diperlukan.

## Konvensi kerja

- Branch fitur memakai awalan `workbuddy-`, `codex-`, atau `fix/`.
- Commit mengikuti gaya Conventional Commits, contoh `feat(billing): ...` dan `docs(qa): ...`.
- Perubahan yang sudah selesai dicatat di [`CHANGELOG.md`](CHANGELOG.md).
- Jangan commit `.env`, kunci, atau artefak QA lokal.

## Lisensi

MIT. Lihat [`LICENSE`](LICENSE).

## Kredit

PesanPro dibuat dan dikembangkan oleh **wa-akg**.
