# BRIEF DISKUSI — Harga Tahunan & Free Trial PesanPro

> ## ⚠️ CATATAN DRAF — UNTUK RAYYAN
>
> 1. Ini **draf**. **Jangan diteruskan ke tim developer sebelum Rayyan setuju isinya.**
> 2. Opsi **lifetime dibatalkan** (keputusan Rayyan, 12 Oktober 2026). Tidak ada lagi pembahasan lifetime di dokumen ini.
> 3. Scope sekarang: **harga tahunan (per-tahun)** dan **free trial** (coba gratis) 1 minggu.
> 4. Harga dan isi 3 tier yang sudah final **tidak diubah** di dokumen ini.
> 5. Dokumen ini **tidak memerintahkan eksekusi apa pun**. Semua pekerjaan menunggu approve tertulis Rayyan.

> ### STATUS IMPLEMENTASI — 12 Oktober 2026
>
> Inti teknis sudah dikerjakan di branch `workbuddy-harga-tahunan-trial-2026-10-12`.
>
> **Sudah jalan:** harga tahunan disimpan per paket (`Plan.priceYearly`), halaman harga memakai harga itu (bukan bulanan × 12), siklus tagihan dicatat (`BillingCycle`), pembayaran tahunan yang disetujui memberi masa aktif 12 bulan, dan trial jadi 7 hari.
>
> **Belum diputuskan, belum dikerjakan:** refund, perpanjangan otomatis, aturan anti-abuse, harga tahunan boleh naik atau dikunci, dan tier mana yang boleh di-trial. Pertanyaan Grup A dan Grup B masih berlaku.
>
> **Asumsi yang dipakai (perlu dikonfirmasi Rayyan):** trial tetap memakai paket trial internal yang sudah ada (`plan_trial`, limit kecil), bukan salah satu dari 3 tier berbayar. Yang diubah hanya durasinya, dari 14 hari jadi 7 hari.

**Versi:** v3 · **Tanggal:** 12 Oktober 2026 · *(menggantikan draf v1 yang memuat lifetime, dan v2)*
**Penerima:** tim developer (tim Abi)
**Tenggat jawaban tertulis:** 3 hari kerja setelah brief dikirim

---

## 1. KONTEKS SINGKAT

PesanPro = WhatsApp Gateway SaaS multi-tenant. Pasar Indonesia. Target user awam.
Pricing 3 tier sudah FINAL. **Tidak ada tier gratis.**

### 1.1 Pricing FINAL (jangan diubah) — [FAKTA]

| Fitur | Starter | Bisnis | Pro |
|---|---|---|---|
| Harga/bulan | Rp 75.000 | Rp 149.000 | Rp 299.000 |
| Harga/tahun | Rp 750.000 | Rp 1.490.000 | Rp 2.990.000 |
| Session WA | 1 | 3 | 10 |
| Pesan/bulan | 10.000 | 25.000 | 100.000 |
| Broadcast/batch | 50 nomor | 200 nomor | 1.000 nomor |
| Delay broadcast | 5 detik | 3 detik | 2 detik |
| Webhook | 1 | 5 | 15 |
| Auto-reply | 5 rules | 30 rules | Unlimited |
| Jadwal pesan | 20 | 100 | Unlimited |
| Label | 5 | 20 | Unlimited |
| API Rate | 30 req/menit | 60 req/menit | 150 req/menit |
| Media compress | ✅ | ✅ | ✅ |
| Support | FAQ Only | WhatsApp | Priority WA |

### 1.2 Yang jadi scope sekarang — [BELUM DIPUTUSKAN]

- **Free trial** (coba gratis) 1 minggu.
- **Opsi bayar tahunan** (per-tahun). Angka harganya sudah FINAL di tabel atas. Yang belum ada adalah **jalannya di sistem** — lihat temuan 1.3.

### 1.3 Temuan awal dari kode — [FAKTA]

Dibaca langsung dari repo, bukan dugaan. Tujuannya supaya diskusi tidak berangkat dari asumsi salah.

1. **Pembayaran saat ini MANUAL, bukan gateway.** Alur yang ada: tenant upload bukti bayar → admin verifikasi (`PaymentVerification`, status PENDING/APPROVED/REJECTED). **Tidak ada Midtrans atau payment gateway (pintu pembayaran otomatis) lain di repo.**
2. **Harga tahunan sudah FINAL di atas kertas, tapi BELUM ADA di sistem.** Model `Plan` hanya menyimpan `priceMonthly`. Landing page (`src/app/page.tsx`) menghitung harga tahunan = **bulanan × 12 tanpa diskon**. Jadi angka yang tampil sekarang: Rp 900rb / Rp 1,788jt / Rp 3,588jt. Sementara harga tahunan FINAL: Rp 750rb / Rp 1,49jt / Rp 2,99jt. **Selisih ±16,7% (kira-kira 2 bulan gratis) belum tertangani di kode.** Ini temuan, bukan tugas. Perbaikannya menunggu keputusan.
3. **Trial sudah ada mesinnya, tapi belum dinyalakan.** Model `Plan` sudah punya field `trialDays`, dan `src/lib/billing.ts` sudah bisa membuat status `TRIAL` + `trialEndsAt`. Saat ini nilai `trialDays = 0` untuk Starter/Bisnis/Pro. Jadi trial 1 minggu kemungkinan besar = set `trialDays = 7` + penyelesaian alur, bukan bangun dari nol.
4. **Satu user = satu subscription.** `Subscription.userId` bersifat unik. Artinya pindah dari bulanan ke tahunan (atau sebaliknya) = **update data yang ada**, bukan bikin subscription baru. Perlu dipastikan tidak ada data lama yang rusak.
5. **Perhitungan pendapatan bulanan membaca `priceMonthly`** (`src/lib/operations.ts`). Pendapatan tahunan harus dibagi 12 dulu supaya laporan pendapatan bulanan tidak melonjak palsu di bulan pembayaran.
6. **Mesin limit per paket sudah ada** (`Entitlement` + `EntitlementFeature`), plus override per tenant (`TenantEntitlementOverride`). Jadi ubah/tambah batas fitur tidak perlu bikin tabel baru.

---

## 2. INSTRUKSI KERJA UNTUK TIM DEVELOPER

1. **Baca seluruh brief ini dulu sampai selesai.** Jangan mulai dari satu pertanyaan saja.
2. **Jawab SETIAP pertanyaan tertulis** (Grup A, B, C). Format jawaban: **(a) jawaban, (b) estimasi effort KECIL / SEDANG / BESAR, (c) risiko.**
   - KECIL = di bawah 1 hari kerja, tidak sentuh skema atau pembayaran.
   - SEDANG = 1–3 hari kerja, atau sentuh skema tapi tidak sentuh uang.
   - BESAR = lebih dari 3 hari kerja, atau sentuh skema + pembayaran + alur uang.
3. **Kalau ada pertanyaan yang tidak bisa dijawab**, tulis alasannya. Jangan diisi dengan tebakan.
4. **Kalau menemukan hal di luar brief** (bug, celah, atau fitur yang ternyata belum jalan), **catat dulu sebagai temuan bernomor**. Jangan langsung perbaiki.
5. **Jawaban dikumpulkan dalam 3 hari kerja.** Lewat dari itu, tulis kendalanya.
6. **Tenggat ini untuk MENJAWAB, bukan untuk mengerjakan.**

> ### 🔴 ATURAN WAJIB — JANGAN EKSEKUSI SEBELUM APPROVE
>
> **Jangan menulis kode, jangan membuat branch, jangan mengubah skema, jangan migrasi apa pun, jangan deploy — sebelum ada approve tertulis dari Rayyan.**
>
> Approve tertulis = persetujuan lewat chat/email/tiket yang menyebut nomor pertanyaan dan jawabannya. Kesepakatan lisan atau "kira-kira setuju" **bukan** approve.
>
> Aturan ini ditulis eksplisit karena ada preseden: tim pernah mengeksekusi perbaikan sebelum Rayyan memutuskan (kasus welcome message). Kali ini tidak boleh terulang.
>
> Kalau ragu antara "kerjakan" dan "tanya" → **tanya**.

---

## 3. PERTANYAAN DISKUSI

### Grup A — FREE TRIAL (coba gratis)

- **A1.** Paket mana yang boleh di-trial? Starter saja, Bisnis saja, Pro saja, atau semua tier? Sertakan alasan bisnisnya.
- **A2.** Apa syarat ikut trial? Misalnya: wajib verifikasi email, wajib nomor HP, wajib identitas, atau tanpa syarat apa pun.
- **A3.** **Anti-abuse** (pencegahan penyalahgunaan): bagaimana mencegah satu orang bikin banyak akun trial? (mis. batas per email, per nomor HP, per IP, per perangkat). Bagaimana kalau orang yang sudah pernah trial mau trial lagi?
- **A4.** Apa yang terjadi saat trial habis? Pilihannya: akun dibekukan total / turun ke paket paling rendah / jadi mode baca saja / langsung dihapus. Sebutkan juga: apakah data (session WA, kontak, jadwal) tetap disimpan?
- **A5.** Apakah user boleh pindah paket di tengah trial? Apakah boleh bayar di tengah trial dan sisa trial dihitung?
- **A6.** Trial dihitung 1 minggu penuh sejak daftar, atau sejak berhasil connect WhatsApp pertama kali? Mana yang lebih adil untuk user awam?
- **A7.** Saat trial mau habis, apakah user diarahkan ke paket **bulanan** atau **tahunan**? Mana yang lebih menguntungkan dan mana yang lebih mudah dijelaskan?

### Grup B — HARGA TAHUNAN (bayar per tahun)

- **B1.** Angka diskon tahunan: harga tahunan final = **hemat ±16,7%** dibanding 12× harga bulanan (kira-kira sama dengan 2 bulan gratis). Konfirmasi: angka ini tetap? Di landing page ditampilkan sebagai apa — "hemat Rp X", "hemat 2 bulan", atau "diskon 17%"?
- **B2.** Apakah **semua tier** dapat opsi tahunan, atau sebagian saja? Kalau sebagian, tier mana dan kenapa?
- **B3.** Pembayaran tahunan: **bayar penuh di depan** atau boleh dicicil? (Kalau dicicil, itu bukan lagi bayar tahunan.)
- **B4.** Saat masa tahunan habis: **berhenti otomatis** atau **auto-perpanjang**? Kalau auto-perpanjang, bagaimana cara menagihnya — masih manual lewat bukti bayar?
- **B5.** Boleh pindah paket di tengah masa tahunan? Kalau boleh, ada penyesuaian harga (naik/turun) atau tidak?
- **B6.** **Refund** (pengembalian dana) untuk pembelian tahunan: boleh tidak? Contoh kasus: user berhenti di bulan ke-3. Kalau tidak boleh, bagaimana menjelaskannya di depan supaya tidak jadi keluhan?
- **B7.** Harga tahunan boleh naik saat perpanjangan? Kalau boleh, apakah harga pembelian pertama dikunci untuk pembeli lama?
- **B8.** Kalau user trial lalu langsung mau ambil tahunan, apakah ada perlakuan khusus (mis. potongan karena trial)?

### Grup C — TEKNIS

- **C1.** **Model data harga tahunan.** Mana yang dipilih: (i) tambah field `priceYearly` di `Plan`, atau (ii) hitung di kode dari `priceMonthly`? Sebutkan dampaknya ke kode yang sudah jalan dan ke risiko salah angka.
- **C2.** **Pembayaran tahunan.** [FAKTA: sekarang masih manual lewat bukti bayar + verifikasi admin, tidak ada gateway.] Apakah alur manual ini cukup untuk nominal tahunan, atau perlu gateway otomatis? Bagaimana nominal tahunan dicatat di `PaymentVerification`?
- **C3.** **Menandai langganan tahunan.** Cukup pakai `Subscription.endsAt` (diisi 12 bulan ke depan), atau perlu field baru (mis. `billingCycle`: BULANAN/TAHUNAN)? Sebutkan alasannya.
- **C4.** **Scheduler** (`scheduler` = penjadwal otomatis yang berjalan sendiri di server). Perlu scheduler baru untuk peringatan jatuh tempo dan penutupan masa tahunan, atau bisa menumpang purge harian yang sudah ada?
- **C5.** **Landing page.** Terkait temuan 1.3 nomor 2: apakah selisih harga tahunan diperbaiki sekalian dalam pekerjaan ini? Kalau ya, harga tahunan diambil dari mana supaya tidak ada dua sumber angka yang bisa beda?
- **C6.** **Laporan pendapatan.** Bagaimana memastikan pendapatan tahunan tidak membuat laporan pendapatan bulanan melonjak palsu (lihat temuan 1.3 nomor 5)?
- **C7.** **Trial teknis.** Apakah state `TRIAL` yang sudah ada cukup, atau perlu state baru? Apakah perlu scheduler khusus penutup trial?
- **C8.** **Anti-abuse teknis.** Apakah sistem sekarang bisa mendeteksi banyak akun dari satu orang/nomor/IP? Kalau belum, effort untuk menambahnya berapa?
- **C9.** **API publik halaman harga.** Perlu endpoint publik (tanpa login) supaya halaman harga menampilkan paket, harga bulanan/tahunan, dan status trial? Kalau perlu, sebutkan bentuk datanya.

**Template jawaban per pertanyaan:**

```
Nomor      : A1
Jawaban    :
Effort     : KECIL / SEDANG / BESAR
Alasan effort :
Risiko     :
Butuh keputusan Rayyan? (ya/tidak) :
```

---

## 4. PEMBAGIAN KEPUTUSAN

| Keputusan | Sifat | Pemilik | Approve akhir |
|---|---|---|---|
| Besaran diskon tahunan (tetap ±16,7% atau diubah) | Bisnis | Rayyan + Abi | Rayyan |
| Cara menampilkan diskon di landing page | Bisnis | Rayyan + Abi | Rayyan |
| Tier mana yang dapat opsi tahunan | Bisnis | Rayyan + Abi | Rayyan |
| Bayar penuh di depan atau cicil | Bisnis | Rayyan + Abi | Rayyan |
| Perpanjangan otomatis atau berhenti | Bisnis | Rayyan + Abi | Rayyan |
| Refund pembelian tahunan | Bisnis | Rayyan + Abi | Rayyan |
| Harga tahunan boleh naik atau dikunci | Bisnis | Rayyan + Abi | Rayyan |
| Paket yang di-trial & syarat ikut trial | Bisnis | Rayyan + Abi | Rayyan |
| Isi fitur & limit saat trial | Bisnis | Rayyan + Abi | Rayyan |
| Aturan anti-abuse (batas akun/nomor/IP) | Bisnis + Teknis | Usul tim dev, putus Rayyan + Abi | Rayyan |
| Tempat menyimpan harga tahunan (`priceYearly` vs hitung di kode) | Teknis | Tim dev | Rayyan |
| Field `billingCycle` atau pakai `endsAt` saja | Teknis | Tim dev | Rayyan |
| Gateway pembayaran (manual vs otomatis) | Teknis + Biaya | Tim dev usul, putus Rayyan | Rayyan |
| Scheduler jatuh tempo & penutup trial | Teknis | Tim dev | Rayyan |
| Perbaikan selisih harga tahunan di landing page | Teknis | Tim dev | Rayyan |
| Cara hitung pendapatan tahunan di laporan | Teknis | Tim dev | Rayyan |
| API publik halaman harga | Teknis | Tim dev | Rayyan |

Catatan: keputusan teknis diusulkan tim dev, tapi tetap **Rayyan yang approve**. Tidak ada pekerjaan yang jalan tanpa approve.

---

## 5. USULAN URUTAN EKSEKUSI

**Tahap 1 — Harga tahunan dulu.**
Alasan: halaman harga yang tayang sekarang menampilkan angka tahunan yang **berbeda** dari harga tahunan final (Rp 900rb vs Rp 750rb, dst). Itu permukaan publik yang sudah hidup. Selama belum dibetulkan, calon pembeli melihat harga yang bukan harga jual sebenarnya. Menutup ini juga membangun fondasi penagihan yang benar sebelum trial dipakai.

**Tahap 2 — Free trial.**
Alasan: mesin trial sudah ada (`trialDays` + status `TRIAL`), jadi effort diperkirakan kecil. Dampaknya langsung ke konversi. Dikerjakan setelah harga benar, supaya user trial yang mau lanjut melihat harga yang sudah konsisten.

**Urutan ini USULAN, bukan keputusan.** Rayyan yang memutuskan.
Kalau prioritasnya menaikkan konversi secepat mungkin, urutannya bisa dibalik (trial dulu) — dengan catatan angka tahunan di landing page masih salah sampai Tahap 1 selesai.

---
---

# 6. SARAN ALUR DISKUSI — KHUSUS RAYYAN (JANGAN DITERUSKAN KE TIM)

Bagian ini untuk Rayyan sendiri. Bukan bagian dari brief yang dikirim ke tim.

## 6.1 Usulan alur

1. **Kirim brief ini** ke tim developer.
2. **Minta jawaban tertulis** atas semua pertanyaan, plus effort dan risiko. Tenggat 3 hari.
3. **Adakan meeting 30 menit**, tapi **hanya untuk poin yang belum sepakat**. Poin yang sudah jelas di jawaban tertulis tidak perlu dibahas lagi.

## 6.2 Alasan cara ini dipakai

- Jawaban tertulis memaksa tim berpikir dulu, bukan menjawab spontan di meeting.
- Ada catatan hitam-putih. Kalau nanti ada salah paham, ada bukti apa yang pernah disepakati.
- Meeting jadi pendek karena hanya membahas sisa perbedaan.
- Rayyan bisa menilai kualitas tim dari cara mereka menjawab (sadar risiko atau tidak, effortnya realistis atau tidak).

## 6.3 Downside jujur dari cara ini

- **Tertulis bisa lambat.** Jawaban tertulis sering lebih formal dan kurang dalam daripada ngobrol langsung.
- **Tenggat 3 hari bisa jadi alasan menunda.** Kalau tim sibuk, jawaban bisa datang mepet atau asal.
- **Kalau brief salah paham, jawabannya ikut salah.** Kesalahan baru ketahuan saat meeting. Jadi pastikan brief ini jelas sebelum dikirim.
- **Meeting 30 menit gampang melebar.** Kalau tidak dijaga, bisa jadi 1,5 jam tanpa keputusan.
- **Tanpa pemimpin rapat, yang paling vokal yang menang.** Rayyan perlu jadi penentu, bukan penengah.
- **Jawaban bagus tidak sama dengan eksekusi bagus.** Aturan "jangan eksekusi sebelum approve" tetap wajib, apa pun hasil diskusinya.

## 6.4 Yang perlu Rayyan putuskan sebelum kirim brief

- Diskon tahunan: tetap ±16,7% (2 bulan gratis) atau diubah?
- Semua tier dapat opsi tahunan, atau sebagian?
- Perpanjangan tahunan: otomatis atau berhenti?
- Refund pembelian tahunan: boleh atau tidak?
- Trial: paket mana, berapa lama, dan diarahkan ke bulanan atau tahunan?

Kalau poin-poin ini sudah ada jawabannya, brief bisa dikirim hari ini. Kalau belum, kirim brief dengan poin tersebut ditandai "menunggu keputusan Rayyan" — itu masih jujur dan tetap bisa jalan.
