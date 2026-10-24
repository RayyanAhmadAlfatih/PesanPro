# Panduan Menjalankan 11 Tes L13 yang Tersisa

**Tanggal:** 24 Oktober 2026
**Akun:** Tenant B (`testinguserb@gmail.com`), sesi `qa-b-session`
**Nomor bot:** `6283871268204` (Ria Ulfa)
**Nomor uji:** `6283877315731` dan `6285282348423`

---

## Persiapan (sudah saya lakukan)

- Endpoint penangkap event sudah dibuat: **`qa-l13-events`**
  (ID `cmvmgs13701xaora4wc3cuu12`), 12 event, status aktif.
- Endpoint ini mengirim ke receiver uji; Anda tidak perlu membuka apa pun.
- Sesi `qa-b-session` sedang `CONNECTED`.

## Aturan selama tes

1. **Satu aksi per langkah.** Setelah selesai, balas "sudah" — saya cek dulu sebelum
   Anda lanjut ke tes berikutnya.
2. **Jangan logout, jangan scan QR, jangan hapus sesi.**
3. Hanya berinteraksi dengan dua nomor uji di atas.
4. Jangan mengirim pesan beruntun; beri jeda sesuai instruksi.
5. Kalau ada yang aneh (sesi putus, minta QR, error), **berhenti** dan lapor saya.

---

## Ringkasan urutan

| No | Tes | Siapa | Risiko |
| --- | --- | --- | --- |
| 1 | 07 `message.received` | Anda (kirim WA) | Rendah |
| 2 | 10 `connection.update` | Anda (stop/start sesi) | Sedang — sesi offline sebentar |
| 3 | 13 `contact.update` | Anda (ubah nama kontak) | Rendah |
| 4 | 14 `status.update` | Anda (posting status) | Rendah |
| 5 | 15 `message.edited` | Anda (edit pesan) | Rendah |
| 6 | 16 `message.deleted` | Anda (hapus pesan) | Rendah |
| 7 | 11 `group.update` | Anda (ubah subject grup) | Butuh grup uji |
| 8 | 12 `group.participant` | Anda (tambah/keluarkan anggota) | Butuh grup uji |
| 9 | 17 `schedule.status` | **Saya** | Tidak perlu aksi Anda |
| 10 | 18 `broadcast.status` | **Saya** | Tidak perlu aksi Anda |
| 11 | 31 restart worker | Anda (satu perintah) | Sesi offline ±30 detik |

---

## 1. L13-07 — `message.received`

**Tujuan:** memastikan pesan masuk dari pelanggan memicu event.

**Langkah Anda:**

1. Dari HP nomor **`6285282348423`**, buka WhatsApp.
2. Kirim ke **`6283871268204`** (bot) pesan:
   `uji-l13-07-masuk-20261024`
3. Tunggu 30 detik. Jangan kirim pesan lain dulu.

**Yang saya cek:** event `message.received` dengan isi pesan tersebut, satu event saja.
**Kalau tidak muncul:** saya cek status sesi dan antrean; Anda tidak perlu mengulang
sampai saya minta.

---

## 2. L13-10 — `connection.update`

**Tujuan:** memastikan perubahan koneksi sesi memicu event.

**Langkah Anda:**

1. Buka dashboard → **Perangkat & QR**.
2. Pada sesi `qa-b-session`, klik **Stop**. Tunggu status menjadi `STOPPED`.
3. Klik **Start**. Tunggu sampai `CONNECTED` (jangan scan QR; kredensial masih ada).
4. Tunggu 1 menit.

**Yang saya cek:** event `connection.update` untuk perubahan status.
**Penting:** jangan kirim pesan selama stop/start. Kalau Start meminta QR, **hentikan**
dan lapor saya — jangan scan.

---

## 3. L13-13 — `contact.update`

**Tujuan:** memastikan perubahan nama kontak memicu event.

**Langkah Anda:**

1. Di HP **bot** (`6283871268204`), buka kontak **`6283877315731`**.
2. Ubah namanya menjadi: `uji-l13-13-20261024`
3. Simpan, lalu tunggu 30 detik.

**Yang saya cek:** event `contact.update` dengan nama baru.
**Setelah saya konfirmasi:** kembalikan nama kontak ke nama sebelumnya.

---

## 4. L13-14 — `status.update`

**Tujuan:** memastikan status WhatsApp (story) memicu event.

**Langkah Anda:**

1. Di HP **bot**, posting status WhatsApp (teks atau foto) dengan penanda:
   `uji-l13-14-20261024`
2. Tunggu 30 detik.

**Yang saya cek:** event `status.update`.
**Setelah saya konfirmasi:** hapus status tersebut.

---

## 5. L13-15 — `message.edited`

**Tujuan:** memastikan edit pesan memicu event.

**Langkah Anda:**

1. Dari HP **bot**, kirim ke **`6283877315731`**:
   `uji-l13-15-awal-20261024`
2. Setelah pesan terkirim, **edit** pesan itu menjadi:
   `uji-l13-15-edit-20261024`
3. Tunggu 30 detik.

**Yang saya cek:** event `message.edited` dengan isi baru.

---

## 6. L13-16 — `message.deleted`

**Tujuan:** memastikan hapus-untuk-semua memicu event.

**Langkah Anda:**

1. Dari HP **bot**, kirim ke **`6283877315731`**:
   `uji-l13-16-hapus-20261024`
2. Setelah terkirim, **hapus untuk semua** pesan itu.
3. Tunggu 30 detik.

**Yang saya cek:** event `message.deleted`.

---

## 7. L13-11 — `group.update` (butuh grup uji)

**Tujuan:** memastikan perubahan info grup memicu event.

**Prasyarat:** grup uji yang berisi bot dan kedua nomor uji.

**Langkah Anda:**

1. Buka grup uji, ubah **subject/nama grup** menjadi:
   `uji-l13-11-20261024`
2. Tunggu 30 detik.

**Yang saya cek:** event `group.update`.
**Kalau tidak ada grup uji:** lewati tes ini — saya tandai **BLOCKED**, bukan gagal.

---

## 8. L13-12 — `group.participant` (butuh grup uji)

**Tujuan:** memastikan perubahan anggota grup memicu event.

**Langkah Anda:**

1. Di grup uji yang sama, **tambahkan** `6285282348423` (atau keluarkan lalu
   masukkan lagi kalau sudah menjadi anggota).
2. Tunggu 30 detik.

**Yang saya cek:** event `group.participant`.
**Setelah saya konfirmasi:** kembalikan susunan anggota grup seperti semula.

---

## 9. L13-17 — `schedule.status` (saya jalankan)

Anda tidak perlu melakukan apa pun. Saya akan:

1. Membuat jadwal satu kali, +1 menit, ke `6283877315731` dengan penanda unik.
2. Menunggu jadwal berjalan.
3. Memverifikasi event `schedule.status` dan status job.
4. Menghapus jadwal uji.

---

## 10. L13-18 — `broadcast.status` (saya jalankan)

Anda tidak perlu melakukan apa pun. Saya akan:

1. Membuat broadcast **2 penerima** (kedua nomor uji) dengan penanda unik.
2. Menunggu sampai selesai.
3. Memverifikasi event `broadcast.status`.
4. Tidak ada penerima lain, tidak ada CSV.

---

## 11. L13-31 — restart worker

**Tujuan:** memastikan event webhook tidak hilang atau terkirim dua kali saat restart.

**Langkah Anda (satu perintah):**

```bash
su - pesanpro -c "pm2 restart pesanpro"
```

Saya akan mengantrekan satu event webhook uji tepat sebelum Anda menjalankan perintah
ini. Setelah restart, tunggu 5 menit; saya verifikasi event terkirim **tepat satu kali**.

---

## Setelah semua selesai

Saya akan:

1. Menghapus endpoint `qa-l13-events`.
2. Memastikan daftar webhook bersih (kecuali endpoint lama `QA-L2-17` yang inactive).
3. Mencatat hasil setiap ID di `docs/qa/GITHUB-ISSUES-2026-10-24.md`.
4. Memperbarui roadmap dan memori proyek.

## Kalau ada yang gagal

- **Berhenti**, jangan ulangi aksi.
- Catat jam kejadian dan apa yang Anda lakukan.
- Lapor saya; saya cek event, delivery log, dan status job.
- Kita ulangi **satu kali** setelah penyebabnya jelas — tidak di-loop.
