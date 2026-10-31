# LAPORAN LENGKAP PENGUJIAN PESANPRO
### Periode: 16 Oktober – 22 Oktober 2026

Lingkungan: `https://wagateway.kingofcoding.my.id` (aplikasi rilis)
Nomor uji: `6283877315731` (utama) dan `6285282348423` (kedua)
Akun uji: tenant A (`qa-test-TenantA` / `testingusera@gmail.com`) dan tenant B (`qa-b-session` / `testinguserb@gmail.com`)

---

## 1. RINGKASAN EKSEKUTIF

| Ukuran | Angka |
| --- | --- |
| Total tes di roadmap | **427** |
| Sudah dijalankan & lolos | **±202** |
| Sebagian (batch awal, belum lengkap) | ±16 |
| Tidak berlaku (fitur dipensiunkan) | **48** |
| Belum dijalankan | **±156** |

**Kesimpulan:** bagian paling berisiko sudah teruji dan lolos — isolasi antar-akun,
antrean pesan, broadcast, jadwal, dan balasan otomatis. Ditemukan **1 bug P1 yang
sudah diperbaiki** dan **1 bug P1 yang masih terbuka** (koneksi WhatsApp mati
diam-diam). Produk **belum siap dijual** sampai bug P1 terbuka itu dibereskan.

---

## 2. STATUS PER BAB

| Bab | Nama | Jumlah | Status |
| --- | --- | --- | --- |
| L0 | Deployment sanity | 16 | sebagian (batch awal) |
| L1 | Autentikasi & akun | 26 | sebagian (batch awal) |
| L2 | RBAC & isolasi tenant **(P0)** | 21 | ✅ tuntas |
| L3 | Dashboard & sesi WhatsApp | 25 | ✅ tuntas |
| L4 | API pengiriman pesan | 25 | **24/25** — sisa L4-17 |
| L5 | Operasi WhatsApp | 12 | ✅ tuntas (2 N/A) |
| L6 | Antrean pesan **(P0)** | 18 | ✅ tuntas |
| L7 | Label & Kontak | 12 | ⛔ N/A (dipensiunkan) |
| L8 | Media privat **(P0)** | 15 | **13/15** (2 N/A, sisa L8-15) |
| L9 | Broadcast | 32 | ✅ tuntas 32/32 |
| L10 | Segment & Campaign | 27 | ⛔ N/A (dipensiunkan) |
| L11 | Scheduler | 18 | ✅ tuntas 18/18 |
| L12 | Auto Reply | 27 | **25/27** — sisa L12-21 |
| L13 | Webhook | 32 | ❌ belum |
| L14 | Developer API & Key **(P0)** | 30 | ❌ belum |
| L15 | Integrasi (GForms/CF7/Woo) | 12 | ❌ belum |
| L16 | Billing, Paket & Komersial | 23 | ❌ belum |
| L17 | Users, Settings, Notifikasi | 30 | ❌ belum |
| L18 | Ketahanan / Gerbang akhir | 26 | ❌ belum |

---

## 3. TEMUAN (BUG)

### 3.1 Sudah diperbaiki

| Severity | Temuan | Perbaikan |
| --- | --- | --- |
| **P1** | Nomor `08…` gagal terkirim, padahal API membalas `202 Accepted` | Sudah diperbaiki & dideploy; diverifikasi `08…` terkirim dan `628…` tidak dinormalisasi dua kali |

### 3.2 Masih terbuka

| # | Severity | Temuan | Dampak |
| --- | --- | --- | --- |
| 1 | **P1** | **Koneksi WhatsApp mati diam-diam.** Status tetap `CONNECTED`, API normal, tidak ada error — tapi semua pesan masuk berhenti diproses. Terjadi ±3,5 jam tanpa terdeteksi. | Pelanggan kehilangan chat masuk, balasan otomatis mati, webhook tidak terkirim — tanpa tahu |
| 2 | **P2** | Fitur "teruskan pesan" selalu gagal (`500`) | **Sudah diputuskan dipensiunkan** — server tidak menyimpan isi pesan, jadi tidak ada bahan untuk diteruskan |
| 3 | **P2** | Reaksi tidak bisa menyasar pesan sendiri (`fromMe` dipaku `false`) | Reaksi ke pesan keluar tidak mengenai pesan yang benar; API tetap balas `200` |
| 4 | **P2** | Sesi WhatsApp berubah `LOGGED_OUT` sendiri tanpa pemberitahuan | Pengiriman gagal `503`; pelanggan baru tahu setelah pesan gagal |
| 5 | **P3** | Unggahan melebihi batas ditolak **nginx** dengan halaman HTML, bukan JSON | Pesan error tidak konsisten |
| 6 | **P3** | Format balas membingungkan: `{"message":"teks"}` → `400`; harus `{"message":{"text":"..."}}` | Dokumentasi perlu diperbaiki |
| 7 | **P3** | Aturan uji auto-reply yang tertinggal membalas grup pelanggan | Proses, bukan bug produk — sudah diperbaiki dengan aturan kerja baru |

---

## 4. BUKTI KUNCI (APA YANG SUDAH TERBUKTI BEKERJA)

### Antrean pesan (L6)
- Job bertahan melewati restart: 12 job antre → **12 utuh, 0 duplikat**
- Klik ganda (2 permintaan identik) → **1 job** (`202` + `200` idempotent)
- Restart di tengah 10 kiriman paralel → tidak ada pesan hilang/dobel
- Cancel, retry, dan status `FAILED` dengan alasan jelas semuanya bekerja

### Broadcast (L9)
- 2 penerima → keduanya `READ`
- Nomor duplikat otomatis dibuang (3 entri → 2 penerima)
- Batas CSV ditegakkan: >2 MB `413`, >5000 baris `422`, >20 kolom `422`, nilai >1000 karakter `422`
- Personalisasi + Spintax: *"Halo Rayyan, salam dari KingOfCoding. Semoga harimu lancar!"*
- `STOP` dan `BERHENTI` otomatis masuk daftar blokir dan dihormati sampai tahap antrean
- Pause menghentikan enqueue; resume melanjutkan; cancel membatalkan sisa
- **Restart worker di tengah broadcast → lanjut sendiri, 2/2 `DELIVERED`, 0 duplikat**
- Jeda anti-blokir minimal 5 detik dipaksakan

### Scheduler (L11)
- Jadwal 14:06 WIB → terkirim tepat waktu, `READ`
- Zona `America/New_York` 05:42 → `09:42Z` (konversi benar)
- Cron `*/3` berjalan 16:54 / 16:57 / 17:00; cancel menghentikan run 17:03
- Restart aplikasi sebelum jatuh tempo → tetap terkirim
- Kebijakan terlewat: `SEND_LATE` kirim, `SKIP` lewati, `CANCEL` batalkan
- WhatsApp mati saat jatuh tempo → job `FAILED SESSION_NOT_READY` (terkontrol)
- API menolak jadwal di masa lalu (`422 SCHEDULE_IN_PAST`)

### Auto Reply (L12)
- Kata persis, diawali-dengan, mengandung, dan pola angka → semuanya cocok
- Tidak peduli huruf besar/kecil (`UJI-SAPAAN-QA` cocok)
- Prioritas: rule prioritas 200 mengalahkan 10
- Audiens: rule khusus privat tidak aktif di grup; rule "semua" jalan di grup
- Masa tunggu: memblokir pesan kedua, lalu berakhir; **selamat melewati restart aplikasi**
- Batas kecepatan: 2 balasan lalu sisanya `CONTACT_RATE_LIMITED`
- Balasan bergambar terkirim dan `READ`
- Edit → versi naik; hapus → berhenti membalas
- Log pemicu lengkap: siapa, aturan, status, alasan, waktu

### Media (L4/L8)
- Unggah video/audio/dokumen/gambar diterima dengan tipe benar; file asing `415`; file 51 MB `413`
- Media tidak bisa diakses tanpa kunci (`401`) atau lewat tebakan URL (`404`)
- Hapus media → catatan `404` **dan file hilang dari disk** (diverifikasi `find` kosong)

### Isolasi antar-akun
- Sesi, media, broadcast, jadwal, log auto-reply milik tenant lain → `403/404` tanpa kebocoran data

---

## 5. RISIKO MENJELANG LAUNCH

1. **Koneksi WhatsApp mati diam-diam (P1).** Harus dibereskan sebelum jualan.
2. **Reaksi tidak menyasar pesan sendiri (P2).** Kalau fitur reaksi dijanjikan, harus diperbaiki.
3. **Media pelanggan menumpuk di disk.** Retensi ada, tetapi tidak ada peringatan saat disk hampir penuh.
4. **Nomor yang pernah `STOP` diblokir permanen** sampai dibuka manual. Perlu dijelaskan di dokumentasi pelanggan.
5. **Pesan yang menunggu saat aplikasi mati >2 menit menjadi `FAILED`** dan perlu dikirim ulang manual.
6. **L14 (Developer API) dan L16 (Billing) belum diuji sama sekali** — dua bab yang paling menyentuh uang dan integrasi pelanggan.

---

## 6. SISA PEKERJAAN

| Prioritas | Bab | Jumlah | Catatan |
| --- | --- | --- | --- |
| **Tinggi** | L13 Webhook | 32 | Semua notifikasi ke sistem pelanggan |
| **Tinggi** | L14 Developer API & Key | 30 | Sebagian tersentuh di L4 |
| **Tinggi** | L16 Billing & Paket | 23 | Menyangkut uang |
| Sedang | L17 Users/Settings/Notif | 30 | |
| Sedang | L18 Ketahanan (gerbang akhir) | 26 | Wajib sebelum launch |
| Rendah | L15 Integrasi | 12 | Kemungkinan N/A |
| Kecil | L4-17, L8-15, L12-21 | 3 | Butuh kondisi khusus |

---

## 7. CATATAN OPERASIONAL

- Akun bot QA berganti nomor setelah `LOGGED_OUT` (kini "Ria Ulfa"). Jangan asumsikan nomor bot lama.
- Setiap API key yang dibuat untuk pengujian **sudah di-revoke**; key milik pelanggan tidak disentuh.
- Pengujian mengirim pesan nyata ke dua nomor uji dengan jeda sesuai aturan paket.
- Semua perubahan konfigurasi produksi (restart, migrasi, driver media) dilakukan atas persetujuan pemilik.
- Semua aturan & key uji auto-replay sudah dihapus; hanya rule milik pelanggan (`QA-L2-SCHEDULE-B`) yang tersisa.

---

## 8. DOKUMEN TERKAIT

| Dokumen | Isi |
| --- | --- |
| `ROADMAP-LIVE-TEST.md` | Daftar 427 tes + status per bab |
| `docs/qa/GITHUB-ISSUES-2026-10-19.md` | Bug 19 Okt (forward, reaksi, nginx, format balas) |
| `docs/qa/GITHUB-ISSUES-2026-10-21.md` | Bug 21 Okt (koneksi mati diam-diam — P1) |
| `docs/qa/LAPORAN-QA-2026-10-20.md` | Laporan periode sebelumnya |
| `docs/qa/PANDUAN-AGENT-QA-PESANPRO.md` | Panduan untuk agent lain |
