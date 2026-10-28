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

## L13-15 — `message.edited` — belum ada bukti

Setelah build baru berjalan (28 Okt 02:42 UTC), belum ada satu pun event
`message.edited`. Sebelum deploy, event ini hanya muncul untuk
`status@broadcast` (bug yang sudah diperbaiki), bukan untuk pesan biasa.
Perlu satu percobaan: kirim pesan ke `6283877315731`, lalu edit pesan itu.

---

## Akses SUPERADMIN

Login dengan `pesanpro@kingofcoding.my.id` + kata sandi dari vault ditolak
(`CredentialsSignin`, kode `credentials`). Alur login yang sama berhasil untuk
`testinguserb@gmail.com`, jadi masalahnya bukan cara login melainkan kredensial
atau status akun. Perlu reset kata sandi atau pemeriksaan `User.status`.
