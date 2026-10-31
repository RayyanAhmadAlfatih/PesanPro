# PANDUAN AGENT QA PESANPRO

### Cara membantu menguji PesanPro sebelum dijual ke pelanggan

Dokumen ini ditulis agar agent lain bisa ikut menguji tanpa harus menebak-nebak.  
Baca sampai habis sebelum mulai. **Aturan di bagian 3 bersifat wajib.**

---

## 1. TUJUAN

Memastikan setiap janji produk PesanPro benar-benar bekerja di server sungguhan,  
sebelum pelanggan membayar. Fokusnya:

1. **Menemukan kerusakan lebih dulu** daripada pelanggan.
2. **Memastikan data antar-akun terisolasi** — satu akun tidak boleh melihat data akun lain.
3. **Memastikan layanan tidak mati mendadak** — termasuk saat server di-restart.

## 2. LINGKUNGAN & AKSES

| Hal             | Nilai                                                                         |
| --------------- | ----------------------------------------------------------------------------- |
| Aplikasi        | `https://wagateway.kingofcoding.my.id`                                        |
| Daftar tes      | `ROADMAP-LIVE-TEST.md` (427 tes, urut L0 → L18)                               |
| Catatan temuan  | `docs/qa/GITHUB-ISSUES-*.md`                                                  |
| Laporan         | `docs/qa/LAPORAN-*.md`                                                        |
| Memori proyek   | `.workbuddy-ai/memory/`                                                       |
| Nomor uji utama | `6283877315731`                                                               |
| Nomor uji kedua | `6285282348423`                                                               |
| Akun uji A      | `testingusera@gmail.com` (sesi `27092015`)                                    |
| Akun uji B      | `testinguserb@gmail.com` (sesi `qa-b-session`)                                |
| Bot WhatsApp    | nomor dengan akun "Ria Ulfa" — **bisa berganti**, jangan asumsikan nomor lama |

**Cara mengakses dashboard:** login lewat browser. Kalau browser otomatis tidak bisa  
dipakai, minta pemilik proyek membuat API key lewat dashboard dan menempelkannya.

---

## 3. ATURAN WAJIB (JANGAN DILANGGAR)

### 3.1 Tentang pesan WhatsApp sungguhan

- ✅ Boleh mengirim pesan uji **hanya** ke dua nomor uji di atas.
- ⛔ **Dilarang** mengirim ke nomor lain, termasuk nomor palsu sembarangan.
- ✅ Jeda antar kiriman ke nomor asli: **1–2 menit**, jangan beruntun.
- ✅ Setelah pairing/scan QR, jangan sentuh sesi ±5 menit sampai koneksi stabil.
- ⛔ **Dilarang** menjalankan broadcast/campaign massal tanpa izin pemilik.

### 3.2 Tentang pemicu otomatis (auto-reply, jadwal, broadcast)

- ⛔ **DILARANG MEMAKAI KATA BIASA** sebagai keyword uji (`halo`, `beli`, `malam`,  
  `harga`, dll). Pelanggan sungguhan bisa mengirim kata itu dan dibalas otomatis.
- ✅ **Wajib** pakai keyword mustahil dipakai orang, contoh: `uji-sapaan-qa`,  
  `ujibelipaket`, `ujikode`, `ujispam`, `ujikatalog`, `ujitahan`.
- ⛔ **DILARANG** meninggalkan aturan uji aktif setelah tes selesai.
- ✅ **Wajib** menghapus aturan uji **di akhir tes yang sama**, lalu verifikasi daftar  
  aturan hanya berisi milik pemilik.
- ⛔ **DILARANG** membuat jadwal uji yang waktunya sudah lewat — API menolak  
  (`422 SCHEDULE_IN_PAST`). Untuk menguji kebijakan "terlewat", matikan aplikasi dulu.

### 3.3 Tentang API key

- ✅ Setiap key uji **wajib di-revoke** setelah selesai.
- ⛔ **Dilarang** menyentuh key milik pemilik (`Production API`, `qa-tenant-a`,  
  `qa-tenant-b`, dll).
- ✅ Pakai key dengan izin **sekecil mungkin** (least privilege). Tambah izin hanya  
  bila tes memang butuh.

### 3.4 Tentang server produksi

- ⛔ **Dilarang** restart, migrasi, atau ubah env tanpa izin pemilik.
- ✅ Kalau tes butuh aplikasi mati, minta izin dulu dan jelaskan durasi + dampaknya.
- ✅ Setelah restart, tunggu sesi WhatsApp `CONNECTED` sebelum mengirim pesan uji.

### 3.5 Tentang kesimpulan

- ⛔ **Dilarang** menyimpulkan dari **satu** pembacaan. Status API bisa basi.
- ✅ Verifikasi lewat **minimal dua sumber**: log aplikasi (pm2), database, antrean  
  pesan, atau dashboard.
- ⛔ **Dilarang** mengklaim tes lolos kalau belum benar-benar dijalankan.
- ✅ Bedakan dengan jelas: **terbukti**, **diduga**, dan **belum diuji**.

---

## 4. ALUR KERJA

### 4.1 Sebelum mulai

1. Baca `.workbuddy-ai/memory/` — terutama catatan terbaru dan bagian CHECKPOINT.
2. Baca status bab di `ROADMAP-LIVE-TEST.md` supaya tidak mengulang tes yang sudah lolos.
3. Tentukan bab target. Kalau ragu urutannya, tanya pemilik.

### 4.2 Menjalankan satu tes

1. Baca skema/validasi endpoint terkait di kode (`src/lib/*-input.ts`) sebelum kirim  
   permintaan — supaya tahu bentuk data yang benar.
2. Kirim permintaan lewat API (curl satu baris).
3. Catat: permintaan, kode status, dan isi balasan penting.
4. Verifikasi hasilnya di sumber kedua (log pm2 / database / dashboard).
5. Tandai lolos / gagal / N/A beserta **alasannya**.

### 4.3 Setelah satu batch tes selesai

1. Hapus semua aturan/key/media uji yang dibuat.
2. Verifikasi bersih (daftar aturan, daftar key, daftar media).
3. Perbarui status bab di `ROADMAP-LIVE-TEST.md`.
4. Catat temuan di `docs/qa/GITHUB-ISSUES-<tanggal>.md` dengan severity, dampak,  
   dan langkah reproduksi.
5. Perbarui memori proyek.

### 4.4 Definisi "bab selesai"

- Semua tes berstatus lolos / gagal-tercatat / N/A-beralasan.
- Tidak ada aturan, key, atau media uji yang tertinggal.
- Temuan sudah dicatat dengan severity.
- Roadmap dan memori sudah diperbarui.

---

## 5. KETERAMPILAN & ALAT

| Alat                 | Dipakai untuk                                              | Catatan                                                           |
| -------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------- |
| **API + curl**       | Menjalankan hampir semua tes                               | Perintah **satu baris**; hindari quote multi-baris                |
| **Browser otomatis** | Login dashboard, buat/revoke key, start/stop sesi WhatsApp | Sering putus — kalau gagal, minta pemilik lakukan lewat dashboard |
| **Query database**   | Membuktikan pesan tersimpan / tidak tersimpan              | Minta pemilik menjalankan (akses root di VPS)                     |
| **Log pm2**          | Membuktikan worker berjalan / menemukan error              | `pm2 logs pesanpro --lines 300 --nostream`                        |
| **Baca kode**        | Memahami skema, batas, dan perilaku sebelum menebak        | Folder `src/lib/` dan `src/modules/`                              |

**Contoh perintah yang berguna:**

```bash
# daftar pesan terakhir yang diproses aplikasi
mysql -u root -p pesanpro -e "SELECT keyId, remoteJid, fromMe, type, timestamp FROM Message ORDER BY timestamp DESC LIMIT 10;"

# log terkait scheduler
pm2 logs pesanpro --lines 300 --nostream | grep -iE "schedul" | tail -15
```

---

## 6. CARA MEMBUAT & MENGHAPUS API KEY

1. Buka **Dashboard → Kunci API**.
2. Isi nama (pakai awalan `qa-` + bab + tanggal, contoh `qa-l13-agent`).
3. Centang **hanya izin yang dibutuhkan**.
4. Klik **Create key**, lalu **salin key-nya segera** — hanya ditampilkan sekali.
5. Setelah tes selesai, klik **Revoke** pada key tersebut.
6. Verifikasi status key menjadi `REVOKED`.

---

## 7. CARA MELAPORKAN TEMUAN

Format di `docs/qa/GITHUB-ISSUES-<tanggal>.md`:

```
## [SEVERITY] Judul singkat

**Dampak:** apa yang dirasakan pelanggan.

**Kronologi / langkah reproduksi:** urutan kejadian yang terverifikasi.

**Bukti:** kode status, isi balasan, potongan log, atau hasil query.

**Saran perbaikan:** langkah teknis yang disarankan.
```

Severity:

- **P1** — data hilang/tercampur, layanan mati, pesan tidak terkirim. Hentikan bab ini, laporkan segera.
- **P2** — fitur rusak tapi ada jalan keluar.
- **P3** — kebingungan kecil, pesan error, dokumentasi.

---

## 8. PELANGKARAN YANG PERNAH TERJADI (JANGAN DITULULANG)

| Kesalahan                                              | Akibat                                                  | Pelajaran                                   |
| ------------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------- |
| Meninggalkan aturan `halo` aktif semalam               | Bot membalas otomatis ke grup pelanggan                 | Hapus aturan uji di tes yang sama           |
| Menyimpulkan "jadwal tidak jalan" dari satu bacaan API | Laporan salah, hampir memicu perbaikan yang tidak perlu | Selalu verifikasi lewat 2+ sumber           |
| Membuat jadwal saat aplikasi mati                      | Permintaan gagal total (server tak menjawab)            | Buat data dulu, baru matikan aplikasi       |
| Membuat broadcast ke nomor yang masih ter-blokir       | Broadcast selesai instan, tes tidak valid               | Periksa daftar blokir sebelum tes broadcast |

---

## 9. URUTAN YANG DISARANKAN

Roadmap berurutan L0 → L18, tapi kalau pemilik ingin prioritas berbeda, urutan ini  
paling masuk akal secara bisnis:

1. **L14 Developer API & Key** — paling sering dipakai pelanggan teknis
2. **L16 Billing & Paket** — menyangkut uang
3. **L13 Webhook** — semua notifikasi ke sistem pelanggan
4. **L17 Users/Settings/Notif** — pengalaman harian pelanggan
5. **L18 Ketahanan** — gerbang akhir sebelum jualan
6. **L15 Integrasi** — kemungkinan besar N/A

---

## 10. CHECKLIST CEPAT SEBELUM MENUTUP PEKERJAAN

- [ ] Semua tes batch ini berstatus jelas (lolos/gagal/N/A)
- [ ] Semua aturan uji dihapus dan daftar aturan sudah diverifikasi bersih
- [ ] Semua API key uji di-revoke dan diverifikasi
- [ ] Media uji dihapus bila tidak dipakai
- [ ] Sesi WhatsApp `CONNECTED` dan login dashboard kembali ke akun pemilik
- [ ] Roadmap diperbarui
- [ ] Temuan dicatat di `docs/qa/GITHUB-ISSUES-<tanggal>.md`
- [ ] Memori proyek diperbarui
