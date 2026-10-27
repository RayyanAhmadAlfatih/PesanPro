# Panduan Aksi HP untuk Sisa L13 — 27 Oktober 2026

Tes yang butuh HP: **L13-07, L13-11, L13-12, L13-15, L13-16**.
L13-31 (restart worker) **belum** — dikerjakan paling akhir, satu per satu.

---

## Aturan umum (berlaku untuk semua tes)

1. **HP yang dipakai:** HP yang nomornya tertaut ke sesi `qa-b-session`
   (status `CONNECTED` di dashboard → Perangkat & QR). Nomor itu yang mewakili
   gateway.
2. **Nomor lawan chat:** nomor uji `6283877315731` untuk pesan keluar, atau HP
   lain milik Anda untuk pesan masuk dan grup. **Jangan pakai nomor pelanggan.**
3. **Kata kunci wajib:** setiap pesan diawali `uji-<kode tes>`, contoh
   `uji-L13-07 halo`. Ini yang saya pakai untuk mencari bukti di log.
4. **Satu aksi per langkah, jeda minimal 1 menit.** Jangan kirim/edit/hapus
   beruntun — WhatsApp bisa menandai nomor sebagai spam.
5. **Setelah satu aksi selesai, kabari saya:** kode tes + jam (WIB) + nomor/nama
   lawan chat. Saya cocokkan dengan log webhook. Tanpa jam, pencocokan meleset.
6. **Tidak perlu membalas pesan apa pun** dan tidak perlu mengubah pengaturan
   dashboard.
7. Kalau ada langkah yang gagal di HP (mis. tombol Edit tidak muncul), cukup
   lapor apa adanya — jangan diulang lebih dari dua kali.

---

## 1. L13-07 — `message.received` (bisa sekarang)

| Langkah | Detail |
| --- | --- |
| Dari | HP **lain** (bukan nomor gateway) |
| Ke | nomor gateway (yang tertaut `qa-b-session`) |
| Isi | `uji-L13-07 halo, ini pesan masuk untuk QA.` |
| Kirim | 1 pesan saja |

**Yang diharapkan:** dashboard → Webhook → Logs menampilkan `message.received`
berisi nomor pengirim, teks pesan, dan `sessionId: qa-b-session`.

---

## 2. L13-11 — `group.update` (bisa sekarang)

| Langkah | Detail |
| --- | --- |
| Buat grup | berisi nomor gateway + 1 nomor Anda yang lain |
| Nama awal | `uji-L13-11` |
| Ubah | nama grup menjadi `uji-L13-11 ganti` |

**Yang diharapkan:** satu event `group.update` dengan perubahan subjek grup.

---

## 3. L13-12 — `group.participant` (bisa sekarang, jeda 1 menit dari L13-11)

| Langkah | Detail |
| --- | --- |
| Di grup yang sama | tambahkan satu nomor uji lain |
| Lalu | keluarkan nomor itu lagi |

**Yang diharapkan:** dua event `group.participant` — `action: add` lalu
`action: remove`, masing-masing membawa daftar peserta.

---

## 4. L13-15 — `message.edited` (**setelah deploy selesai**)

| Langkah | Detail |
| --- | --- |
| Kirim ke | `6283877315731` |
| Isi awal | `uji-L13-15 versi pertama` |
| Lalu | **edit pesan itu** (dalam 15 menit) menjadi `uji-L13-15 versi kedua` |

**Yang diharapkan:** tepat **satu** event `message.edited`, `keyId` sama dengan
ID pesan asli, `newContent` berisi teks versi kedua. Kalau muncul dua event atau
`newContent` kosong, tes gagal — tolong catat.

---

## 5. L13-16 — `message.deleted` (**setelah deploy selesai**)

| Langkah | Detail |
| --- | --- |
| Kirim ke | `6283877315731` |
| Isi | `uji-L13-16 akan dihapus` |
| Lalu | **hapus pesan itu untuk semua orang** |

**Yang diharapkan:** satu event `message.deleted` dengan `keyId` pesan tersebut.
Catatan: event untuk status WhatsApp (`status@broadcast`) sudah dibuang oleh fix
26 Okt, jadi log seharusnya bersih dari event aneh.

---

## Urutan yang saya sarankan

1. Deploy dulu (panduan terpisah), supaya L13-15/16 memakai kode terbaru.
2. L13-07 → jeda 1 menit → L13-11 → jeda 1 menit → L13-12.
3. L13-15 → jeda 2 menit → L13-16.
4. L13-31 (restart) paling akhir, setelah saya bilang siap.

Kirim hasilnya per tes, tidak perlu sekaligus — saya verifikasi satu per satu
supaya kalau ada yang gagal, penyebabnya jelas.
