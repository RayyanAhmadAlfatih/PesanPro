# Temuan & Aksi — 28 Oktober 2026

Sesi ini: memulihkan produksi setelah OOM, lalu melanjutkan sisa tes L13 dengan
aksi HP dari pemilik.

---

## Ringkasan

| Item | Hasil |
| --- | --- |
| Produksi | pulih, build baru aktif (`health/live/ready` 200) |
| L13-07 `message.received` | **PASS** |
| L13-11 `group.update` | **PASS** |
| L13-12 `group.participant` | **PASS** |
| L13-16 `message.deleted` | **PASS** |
| L13-15 `message.edited` | belum — belum ada event setelah deploy |
| L13-31 restart worker | belum — ditunda sesuai permintaan |
| Akses SUPERADMIN | **ditolak** (kata sandi di vault tidak cocok) |

---

## Insiden produksi 27–28 Okt (ringkas)

Build Next.js di VPS produksi dibunuh OOM berulang kali; `.next` lama ternyata
tidak utuh sehingga situs tidak bisa dipulihkan dari backup build. Solusi yang
dipakai: build di VPS lain (Node 22, `npm ci`, `next build --webpack`), lalu
`.next` dipindahkan ke produksi. Panduan lengkap + langkah pencegahan:
`docs/qa/PEMULIHAN-OOM-VPS-2026-10-27.md`.

Catatan operasional yang perlu diingat:

- `pm2 start <nama>` gagal setelah daemon PM2 mati; mulai dari
  `pm2 start ecosystem.config.cjs` **di direktori aplikasi**, lalu `pm2 save`.
- Jangan build di VPS produksi (RAM 3,6 GB, swap cepat penuh). Build di VPS lain.
- Sesi login browser hilang setelah rebuild; login ulang diperlukan.

---

## L13-07 — `message.received` — PASS

Dikirim dari HP lain ke nomor gateway, 10:05 WIB. Payload yang diterima:

```json
{"key":{"id":"3EB01E7F1C2995542683A5","remoteJid":"6283877315731@s.whatsapp.net","fromMe":false,"participant":""},
 "pushName":"Salman","messageTimestamp":1793156754,
 "from":"6283877315731@s.whatsapp.net","receiver":"6283871268204@s.whatsapp.net",
 "sender":"154077874929843@lid","isGroup":false,"chatType":"PERSONAL","type":"TEXT",
 "content":"uji-L13-07 halo, ini pesan masuk untuk QA.","quoted":null}
```

Tepat satu event, `SUCCEEDED 200`. Bentuk payload cocok dengan kontrak
(`src/lib/webhook.ts`): `key`, `from`, `receiver`, `sender`, `chatType`, `type`,
`content`, `caption`, `quoted`.

Catatan: endpoint uji sebelumnya **tidak berlangganan** `message.received`; event
ini mustahil muncul sampai langganan ditambah. Sudah ditambahkan 28 Okt.

---

## L13-11 — `group.update` — PASS

Grup `pesanpro` diubah namanya menjadi `uji-L13-11 ganti` (10:13 WIB).

```json
{"jid":"120363411558933992@g.us","id":"120363411558933992@g.us",
 "subject":"uji-L13-11 ganti","author":"154077874929843@lid"}
```

Satu event, `SUCCEEDED 200`.

---

## L13-12 — `group.participant` — PASS

Satu nomor ditambahkan lalu dikeluarkan dari grup yang sama (10:14 WIB).

```json
{"jid":"120363411558933992@g.us","action":"add",
 "participants":[{"id":"230339297472637@lid","phoneNumber":"6285282348423@s.whatsapp.net","admin":null}]}
{"jid":"120363411558933992@g.us","action":"remove",
 "participants":[{"id":"230339297472637@lid","phoneNumber":"6285282348423@s.whatsapp.net","admin":null}]}
```

Dua event berurutan, masing-masing `SUCCEEDED 200`.

---

## L13-16 — `message.deleted` — PASS

10:19 WIB, dua event dalam 22 ms dengan `keyId` **berbeda**:

```json
{"keyId":"3EB0A2C6131872AE3DDDCC","remoteJid":"154077874929843@lid","fromMe":true}
{"keyId":"3EB086BADF42F9A0A874C2","remoteJid":"154077874929843@lid","fromMe":true}
```

Karena `keyId`-nya berbeda, ini bukan duplikat event untuk satu pesan — dua pesan
memang dihapus. Perlu konfirmasi pemilik apakah yang dihapus memang dua pesan.

---

## L13-15 — `message.edited` — GAGAL, sudah diperbaiki (menunggu deploy)

**Uji:** pemilik mengedit pesan pada 28 Okt (setelah build baru jalan).
**Hasil:** tidak ada satu pun event `message.edited` di delivery log; event
terakhir sebelum percobaan adalah `group.participant` 10:53 WIB. Jadi edit
sama sekali tidak menghasilkan webhook — bukan payload yang salah.

**Dua penyebab yang ditemukan di kode:**

1. Baileys bisa mengirim edit **sudah terbuka** sebagai
   `msg.message.editedMessage` pada `messages.upsert`, bukan sebagai
   `protocolMessage` dan bukan pada `messages.update`. Jalur upsert tidak punya
   cabang untuk bentuk itu, sehingga edit jatuh ke pemrosesan pesan biasa dan
   tidak pernah memicu event.
2. Filter JID yang ditambahkan 26 Okt membuang update ketika `remoteJid` kosong
   (`isTenantChatJid(null) === false`). Sebelum filter itu ada, update tanpa JID
   tetap diproses.

**Perbaikan (28 Okt):**

- Cabang baru di `processAndSaveMessage` untuk `msg.message.editedMessage`:
  hitung teks baru, kirim `message.edited`, lalu `return null` supaya tidak
  tersimpan sebagai pesan baru.
- Filter di `messages.update` diubah menjadi
  `if (remoteJid && !isTenantChatJid(remoteJid)) continue;` — JID yang tidak ada
  tidak lagi membuang event sah, sedangkan `status@broadcast`, `@broadcast`,
  dan `@newsletter` tetap dibuang.
- Log diagnostik `Edit received on upsert` / `Edit received on update stream`
  supaya jalur mana yang dipakai terlihat di `pm2 logs` saat retest.
- Tes: `whatsapp-sync-minimization.test.ts` +1 (kedua amplop edit dikenali,
  guard JID tidak membuang JID kosong).

### Retest pertama setelah deploy `b70d02b` — masih nol event

Pemilik mengulang tes edit; `grep "Edit received"` di `pm2 logs` kosong dan
delivery log tetap tanpa `message.edited`. Artinya edit tidak pernah masuk ke
kedua jalur yang baru ditambal.

**Penyebab ketiga (ditemukan dari kode):** edit dari HP tertaut masuk lewat
stream **append**, bukan `notify`. Di jalur `protocolMessage` (type 14) ada
pemeriksaan `if (triggerWebhook)` — dan `triggerWebhook` hanya bernilai `true`
untuk stream `notify`. Jadi edit dihitung, lalu **dibuang tanpa jejak**: tidak
ada event, tidak ada log. Revoke pun terkena masalah yang sama.

**Perbaikan lanjutan:**

- Edit dan revoke pada `protocolMessage` sekarang **selalu** dipublikasikan,
  tidak lagi bergantung pada `triggerWebhook` — keduanya peristiwa protokol,
  bukan pesan baru.
- Tambah log `Protocol message type=… target=… webhook=…`, plus
  `Edit/Delete received on protocol message`, supaya retest berikutnya
  memperlihatkan persis apa yang diterima server.
- Tes: `whatsapp-sync-minimization` 7/7.

**Status:** diperbaiki di branch, **menunggu build + deploy**, lalu retest.

---

## Akses SUPERADMIN

Login dengan `pesanpro@kingofcoding.my.id` + kata sandi dari vault ditolak
(`CredentialsSignin`, kode `credentials`). Alur login yang sama berhasil untuk
`testinguserb@gmail.com`, jadi masalahnya bukan cara login melainkan kredensial
atau status akun. Perlu reset kata sandi atau pemeriksaan `User.status`.


---

## Analisis bentuk amplop edit (28 Okt malam)

Diuji lokal dengan `normalizeMessageContent` dari Baileys 7.0.0-rc14:

| Bentuk `msg.message` | Hasil normalisasi | Teks terbaca |
| --- | --- | --- |
| `{ conversation: "v2" }` | `{ conversation: "v2" }` | `v2` |
| `{ conversation: "" }` | `{ conversation: "" }` | kosong |
| `{ editedMessage: { message: { conversation: "v2" } } }` | `{ conversation: "v2" }` | `v2` |
| `{ editedMessage: { message: {} } }` | `{}` | kosong |
| `{ editedMessage: { conversation: "v2" } }` | `undefined` | butuh fallback |
| `{ messageContextInfo: {} }` | `{ messageContextInfo: {} }` | kosong |

Kesimpulan: pesan kedua yang muncul di delivery log (`type: TEXT`, `content: ""`)
pasti salah satu dari bentuk **tanpa teks**. Karena itu:

- `readEditedText()` sekarang menangani ketiga amplop edit (termasuk yang
  `normalizeMessageContent` kembalikan `undefined`), dengan 7 tes unit.
- Ditambah probe `Msg keys=… stub=… webhook=…` untuk setiap pesan masuk — hanya
  nama field, tidak pernah isi — supaya bentuk persisnya terbaca di log tanpa
  perlu menebak lagi.
