# Laporan QA Live PesanPro — 2026-10-19 s/d 2026-10-20

Lingkungan: `https://wagateway.kingofcoding.my.id` (aplikasi rilis), sesi uji  
`qa-b-session`, tenant uji A (`qa-test-TenantA`) dan B (`qa-b-session`).  
Pengujian dilakukan lewat API produksi + browser, dengan pengiriman nyata ke nomor  
uji `6283877315731` dan `6285282348423`.

---

## 1. Ringkasan

| Ukuran                             | Angka    |
| ---------------------------------- | -------- |
| Total tes di roadmap               | **427**  |
| Sudah dijalankan & lolos           | **±197** |
| Tidak berlaku (fitur dipensiunkan) | **48**   |
| Belum dijalankan                   | **±182** |

Status per tahap:

| Fase                           | Jumlah | Status                           |
| ------------------------------ | ------ | -------------------------------- |
| L0 Deployment sanity           | 16     | sebagian (batch awal)            |
| L1 Auth & akun                 | 26     | sebagian (batch awal)            |
| L2 RBAC & isolasi tenant (P0)  | 21     | tuntas (batch 2)                 |
| L3 Dashboard & sesi WA         | 25     | tuntas (batch 3)                 |
| L4 Outbound messaging API      | 25     | **24/25** — sisa L4-17           |
| L5 Operasi WhatsApp            | 12     | **tuntas** (2 N/A)               |
| L6 Antrean pesan (P0)          | 18     | **tuntas**                       |
| L7 Label & Kontak              | 12     | **N/A** (fitur dipensiunkan)     |
| L8 Media privat (P0)           | 15     | **13/15** (2 N/A, sisa L8-15)    |
| L9 Broadcast                   | 32     | **tuntas 32/32**                 |
| L10 Segment & Campaign         | 27     | **N/A** (dipensiunkan)           |
| L11 Scheduler                  | 18     | **tuntas 18/18**                 |
| L12 Auto Reply                 | 27     | belum                            |
| L13 Webhook                    | 32     | belum                            |
| L14 Developer API & Key (P0)   | 30     | belum (sebagian tersentuh di L4) |
| L15 Integrasi GForms/CF7/Woo   | 12     | belum                            |
| L16 Billing & paket            | 23     | belum                            |
| L17 Users/Settings/Notif       | 30     | belum                            |
| L18 Resilience (gerbang akhir) | 26     | belum                            |

---

## 2. Temuan (bug) sesi ini

| # | Severity | Temuan                                                                                                                                                        | Status                               |
| - | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 1 | **P1**   | Nomor `08...` tidak dinormalisasi → pesan gagal terkirim, padahal API membalas `202`                                                                          | **Sudah diperbaiki & terverifikasi** |
| 2 | **P2**   | **Teruskan pesan selalu gagal (`500`)** — kode mengirim isi pesan kosong (`message: {}`), pesan asli tidak pernah diambil                                     | Terbuka                              |
| 3 | **P2**   | **Reaksi tidak bisa menyasar pesan sendiri** — `fromMe` dipaku `false`; reaksi ke pesan keluar tidak mengenai pesan yang benar (API tetap balas `200`)        | Terbuka                              |
| 4 | **P2**   | **Sesi WhatsApp berubah `LOGGED_OUT` sendiri** — pengiriman via endpoint lama `503`, job antre `FAILED`; butuh scan QR ulang; tidak ada notifikasi ke pemilik | Terbuka (operasional)                |
| 5 | **P3**   | Unggahan melebihi batas ditolak **nginx** dengan halaman HTML, bukan JSON seperti endpoint lain                                                               | Terbuka                              |
| 6 | **P3**   | Format balas (kutipan) membingungkan: `{"message":"teks"}` → `400`; harus `{"message":{"text":"..."}}`                                                        | Terbuka (dokumentasi)                |

Detail lengkap: `docs/qa/GITHUB-ISSUES-2026-10-19.md`.

---

## 3. Yang diperbaiki selama sesi

- **Normalisasi nomor `08…`** — sebelumnya `628` ganda / gagal kirim. Setelah perbaikan  
  dideploy: `08…` terkirim dan `628…` tidak dinormalisasi dua kali (L4-03/04 lolos).
- **Media driver produksi** — dialihkan ke penyimpanan lokal (dengan backup), sehingga  
  unggah media bisa diuji dan file benar-benar tersimpan di disk.
- **Migrasi kolom auth state** diterapkan di VPS (tanpa kehilangan data).

---

## 4. Fitur yang sudah dipensiunkan (N/A)

| Fase                        | Alasan                                                                           |
| --------------------------- | -------------------------------------------------------------------------------- |
| L7 Label & Kontak (12)      | Tidak ada halaman label dan tidak ada endpoint label                             |
| L10 Segment & Campaign (27) | Tidak ada halaman/route campaign; mesin masih ada di worker tanpa jalur pengguna |
| L5-01 cari pesan            | Tidak ada endpoint pencarian (pensiun bersama Chat UI)                           |
| L5-10 unduh media pesan     | `410 MEDIA_DOWNLOAD_RETIRED` — media pesan tidak disimpan                        |
| L8-01/02 media masuk        | Media masuk tidak lagi diunduh (keputusan produk)                                |
| L8-03..07 Media Manager     | Halaman Media Manager dihapus                                                    |

---

## 5. Bukti kunci

**Antrean pesan (L6)**

- Job bertahan melewati restart aplikasi: 12 job antre → 12 utuh, **0 duplikat**.
- Klik ganda (2 permintaan identik) → **1 job** (`202` + `200` idempotent).
- Restart di tengah 10 kiriman paralel → tidak ada pesan hilang/dobel.
- Cancel, retry, dan status `FAILED` dengan alasan jelas semuanya bekerja.

**Broadcast (L9)**

- 2 penerima → keduanya `READ`.
- Nomor duplikat otomatis dibuang (3 entri → 2 penerima).
- Batas CSV ditegakkan: >2 MB `413`, >5000 baris `422`, >20 kolom `422`,  
  nilai >1000 karakter `422`.
- Personalisasi + Spintax: *"Halo Rayyan, salam dari KingOfCoding. Semoga harimu lancar!"*
- `STOP` dan `BERHENTI` otomatis masuk daftar blokir (`UNSUBSCRIBE` + rujukan pesan).
- Pause menghentikan enqueue; resume melanjutkan; cancel membatalkan sisa.
- **Restart worker di tengah broadcast → lanjut sendiri, 2/2 `DELIVERED`, 0 duplikat.**
- Paket memaksa jeda minimal 5 detik (perlindungan anti-blokir).

**Scheduler (L11)**

- Jadwal 14:06 WIB → terkirim tepat waktu, `READ`.
- Zona `America/New_York` 05:42 → `09:42Z` (konversi benar).
- Cron `*/3` berjalan 16:54 / 16:57 / 17:00; cancel menghentikan run 17:03.
- Restart aplikasi sebelum jatuh tempo → tetap terkirim.
- Kebijakan terlewat: `SEND_LATE` kirim, `SKIP` lewati, `CANCEL` batalkan.
- WhatsApp mati saat jatuh tempo → job `FAILED SESSION_NOT_READY` (terkontrol).
- API menolak jadwal di masa lalu (`422 SCHEDULE_IN_PAST`).

**Media (L4/L8)**

- Unggah video/audio/dokumen/gambar diterima dengan tipe benar; file asing `415`;  
  file 51 MB `413`.
- Media tidak bisa diakses tanpa kunci (`401`) atau lewat tebakan URL (`404`).
- Hapus media → catatan `404` **dan file hilang dari disk** (diverifikasi `find` kosong).
- Media yang sudah dihapus tidak bisa dipakai lagi (`404`).

**Isolasi antar-akun**

- Sesi, media, broadcast, jadwal milik tenant lain → `403/404` tanpa kebocoran data.

---

## 6. Risiko menjelang launch

1. **Fitur "teruskan pesan" tidak berfungsi sama sekali.** Kalau fitur ini dijanjikan  
   di materi pemasaran, harus diperbaiki atau dihapus dari janji.
2. **Sesi WhatsApp bisa ter-logout sendiri tanpa pemberitahuan.** Pelanggan baru tahu  
   setelah pesan gagal. Perlu notifikasi ke pemilik akun saat status berubah.
3. **Media pelanggan menumpuk di disk server.** Retensi ada, tetapi kapasitas disk  
   perlu dipantau; tidak ada peringatan otomatis saat disk hampir penuh.
4. **Nomor yang pernah `STOP` diblokir permanen sampai dibuka manual.** Perlu dijelaskan  
   di dokumentasi pelanggan.
5. **Pesan yang menunggu saat aplikasi mati >2 menit akan `FAILED`** dan perlu dikirim  
   ulang manual. Pertimbangkan retry otomatis saat aplikasi hidup.

---

## 7. Sisa pekerjaan

| Prioritas | Pekerjaan                                                                     |
| --------- | ----------------------------------------------------------------------------- |
| Tinggi    | L12 Auto Reply (27), L13 Webhook (32) — keduanya menyentuh pelanggan langsung |
| Tinggi    | L18 Resilience (26) — gerbang akhir sebelum launch                            |
| Sedang    | L14 Developer API (30), L16 Billing (23)                                      |
| Sedang    | L17 Users/Settings/Notif (30)                                                 |
| Rendah    | L15 Integrasi (12) — kemungkinan N/A                                          |
| Kecil     | L4-17 (batas unggahan paralel), L8-15 (media setelah restart)                 |



---

## 8. Catatan operasional

- Akun bot QA berganti nomor setelah `LOGGED_OUT` (kini "Ria Ulfa"). Jangan asumsikan  
  nomor bot lama.
- Setiap API key yang dibuat untuk pengujian **sudah di-revoke**; key milik pelanggan  
  tidak disentuh.
- Pengujian mengirim pesan nyata ke dua nomor uji dengan jeda sesuai aturan paket.
- Semua perubahan konfigurasi produksi (restart, migrasi, driver media) dilakukan atas  
  persetujuan pemilik.
