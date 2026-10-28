# Checkpoint QA — 28 Oktober 2026

Titik lanjut untuk sesi berikutnya. Baca ini dulu sebelum mengerjakan apa pun,
supaya tidak mengulang pekerjaan yang sudah selesai.

---

## Status L13 (webhook) — 27 PASS, 3 N/A, 1 gagal-sebagian, 1 belum

| Tes | Status |
| --- | --- |
| L13-01 … 06, 08, 09, 10, 17, 18, 20–30, 32 | PASS (detail di `ROADMAP-LIVE-TEST.md`) |
| L13-07 `message.received` | **PASS** 28 Okt |
| L13-11 `group.update` | **PASS** 28 Okt |
| L13-12 `group.participant` | **PASS** 28 Okt |
| L13-16 `message.deleted` | **PASS** 28 Okt |
| L13-13, 14, 19 | N/A (fitur dipensiunkan) |
| **L13-15 `message.edited`** | **GAGAL-SEBAGIAN** — lihat bagian di bawah |
| L13-31 restart worker | belum dijalankan (paling akhir) |

Sisa pekerjaan L13: **hanya L13-31** (restart worker sekali, cek antrean webhook
tidak hilang atau berganda).

---

## L13-15 — ditutup 28 Oktober 2026

**Status: GAGAL-SEBAGIAN, sengaja ditutup. Jangan diulang tanpa syarat di bawah.**

### Yang berhasil

- Edit terdeteksi sebagai `secretEncryptedMessage` dengan `secretEncType = 2`
  (MESSAGE_EDIT) dan `targetMessageKey.id`.
- Event `message.edited` **terkirim** (`SUCCEEDED 200`) dengan `keyId`,
  `remoteJid`, dan `fromMe` yang benar.
- Efek samping lama hilang: edit tidak lagi tercatat sebagai pesan masuk palsu
  (`type: TEXT`, `content: ""`).

### Yang tidak berhasil

`newContent` selalu kosong. WhatsApp mengirim isi edit **terenkripsi**, dan
skemanya tidak dipublikasikan.

### Bukti log (produksi, 28 Okt 2026 20:22 WIB)

```
Msg keys=messageContextInfo,secretEncryptedMessage stub=- secret=yes webhook=true
Edit received on secret message for 3EB01600F2D1F7897E7D8F secret=target decrypted=no
```

Artinya: kunci pesan **ditemukan** (`secret=target`), tetapi dekripsi dengan
AES-256-CBC + `messageSecret` **gagal**. Skema WhatsApp untuk pesan sejenis
(poll vote, event response) memakai turunan HMAC + AES-GCM dengan string konteks
dan AAD tertentu; varian untuk edit tidak dipublikasikan.

### Mengapa ditutup

- Baileys 7.0.0-rc14 **tidak mengimplementasikan** `secretEncryptedMessage`
  sama sekali — tidak ada di `lib/` maupun branch `master`.
- whatsmeow juga tidak mengekspos dekripsinya di `message.go`.
- Tanpa acuan, setiap percobaan hanya menebak protokol internal WhatsApp: satu
  siklus build + tes per tebakan, tanpa jaminan, dan rapuh karena bisa berubah
  kapan saja di sisi WhatsApp.

### Syarat membuka kembali

Buka **hanya** kalau salah satu terjadi:

1. Baileys (atau whatsmeow) merilis dukungan resmi `secretEncryptedMessage`
   beserta dekripsinya, atau
2. Skema enkripsi edit dipublikasikan (dokumentasi resmi, atau implementasi
   terbuka yang bisa diverifikasi).

Kalau tidak keduanya: **jangan dikerjakan lagi**.

---

## Kalimat resmi untuk marketing & dokumentasi webhook

Pakai kalimat ini apa adanya, jangan diringkas menjadi klaim "edit penuh":

> event `message.edited` terkirim, tapi teks baru hasil edit tidak tersedia
> karena WhatsApp mengenkripsi edit secara internal dan skemanya tidak
> dipublikasikan.

Turunan yang sudah dipasang di UI dashboard (daftar event webhook):

> "When a message is edited — target id only, WhatsApp does not expose the new text"

Jangan menulis "mendukung edit pesan" atau "isi edit diteruskan" di halaman
marketing, dokumentasi API, maupun materi penjualan.

---

## Commit terkait (branch `workbuddy-fase0-qa-2026-10-23`)

| Commit | Isi |
| --- | --- |
| `4402f8b` | Buang event palsu `status@broadcast` dari `message.edited`/`message.deleted` |
| `3f3f74d` | Pemulihan sesi `FAILED` + notifikasi pemilik |
| `b70d02b` | Tangani edit yang datang sebagai `msg.message.editedMessage` |
| `57ced88` | Edit/revoke pada `protocolMessage` selalu dipublikasikan |
| `de2a446` | Probe amplop edit (nama field saja) |
| `03b9914` | Probe semua pesan masuk (`Msg keys=`) |
| `edec70d` | `readEditedText()` untuk semua bentuk amplop |
| `87f764f` | Dukungan `secretEncryptedMessage` + cache `messageSecret` |
| `420599c` | Log `secret=target/own/none` untuk diagnosis dekripsi |
| `72265ec` | Catat L13-15 gagal-sebagian di roadmap + laporan |

---

## Aturan deploy yang WAJIB diingat

Aplikasi berjalan lewat `tsx src/server/index.ts`, **bukan** dari `.next`.

| Bagian | Sumber | Cara update |
| --- | --- | --- |
| Halaman & API route Next.js | `.next` | build di VPS lain, pindahkan `.next` |
| Worker, webhook, store WhatsApp, `src/lib/**` | **file `src/*.ts`** | **`git pull` di produksi** |

Tanpa `git pull` di produksi, perubahan server-side **tidak akan aktif** — ini
yang membuat deploy 28 Okt sempat tampak "tidak berpengaruh" selama beberapa jam.
Repo produksi sempat tertinggal 15 commit (`6adb92e` → `062a023`).

Deploy minimal untuk perubahan server-side saja:

```bash
su - pesanpro -c 'cd /www/wwwroot/PesanPro && git pull --ff-only origin workbuddy-fase0-qa-2026-10-23'
su - pesanpro -c 'cd /www/wwwroot/PesanPro && pm2 restart pesanpro && pm2 save'
```

Panduan lengkap: `docs/qa/PANDUAN-DEPLOY-VPS-2026-10-27.md`.

---

## Kondisi produksi saat checkpoint dibuat

| Item | Nilai |
| --- | --- |
| Commit produksi | `72265ec` (branch `workbuddy-fase0-qa-2026-10-23`) |
| Sesi `qa-b-session` | `CONNECTED` |
| Health | `/api/health/live` 200, `/api/health/ready` ok |
| Endpoint uji | `qa-l13-events` → `https://httpbin.org/post`, 8 event |

---

## Langkah berikutnya (sesi baru)

1. **L13-31** — restart worker sekali, pastikan antrean webhook tidak hilang
   atau berganda. Ini tes terakhir L13.
2. **L16** — sisa: 11–23 (butuh SUPERADMIN). Catatan: kata sandi superadmin di
   vault **ditolak** saat dicoba 28 Okt; perlu reset atau konfirmasi ulang.
3. **L17** — 01–15, 20–44 (butuh SUPERADMIN). L17-16/17/19 sudah PASS.
4. **L18, L15** — belum disentuh.

Lihat `ROADMAP-LIVE-TEST.md` untuk daftar tes lengkap dan
`docs/qa/GITHUB-ISSUES-2026-10-28.md` untuk kronologi hari ini.
