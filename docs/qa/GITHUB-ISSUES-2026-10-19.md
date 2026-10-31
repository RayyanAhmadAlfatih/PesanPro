# GitHub Issues — Temuan L5 (2026-10-19)

Sumber: live test L5 (retained WhatsApp operations) pada
`https://wagateway.kingofcoding.my.id`, sesi `qa-b-session`.
Token disensor. Belum diperbaiki — perlu keputusan scope.

---

## [P2] Teruskan pesan selalu gagal — kode mengirim isi pesan kosong

> **KEPUTUSAN 2026-10-20: fitur DIPENSIUNKAN, bukan diperbaiki.** Alasan: server tidak
> menyimpan isi pesan (minimisasi data) dan tidak memakai message store Baileys, jadi
> tidak ada bahan untuk diteruskan. Memperbaikinya berarti menyimpan isi pesan (melanggar
> keputusan privasi) atau menambah cache memori (risiko OOM di box 3,6 GB). Penerusan
> dilakukan lewat aplikasi WhatsApp. **Belum dikerjakan** — pekerjaan: hapus endpoint
> `POST /api/messages/[sessionId]/forward`, hapus pemakaian di UI bila ada, dan tandai
> L5-06 N/A (sudah ditandai di roadmap).

**Dampak:** Fitur "teruskan" tidak bisa dipakai sama sekali. Setiap permintaan
berakhir `500 "Failed to forward message"`.

**Repro (2026-10-19 21:10 WIB):**
```
POST /api/messages/qa-b-session/forward
{"fromJid":"6285282348423@s.whatsapp.net","messageId":"3EB02EF9E5D6B812ACDE64","toJids":["6283877315731@s.whatsapp.net"]}
→ 500 {"status":false,"message":"Failed to forward message"}
```

**Penyebab terverifikasi:** `src/app/api/messages/[sessionId]/forward/route.ts`
memanggil `socket.sendMessage(toJid, { forward: { key: {...}, message: {} as proto.IMessage } })`.
Isi pesan dikirim sebagai objek kosong, sehingga Baileys menolak. Pesan asli tidak
pernah diambil dari penyimpanan. Selain itu `fromMe: false` dipaku, sehingga pesan
keluaran sendiri pun tidak bisa diteruskan.

**Saran:** ambil pesan asli (dari store Baileys atau penyimpanan) lalu teruskan
objek pesan yang sebenarnya; jadikan `fromMe` parameter seperti route `star`.

---

## [P2] Reaksi tidak bisa menyasar pesan sendiri

**Dampak:** Pelanggan tidak bisa memberi reaksi ke pesan yang mereka kirim sendiri.
Permintaan tetap dibalas `200 "Reaction sent"`, tetapi reaksi tidak mengenai pesan
yang benar (karena kunci pesan memakai `fromMe: false`).

**Penyebab terverifikasi:** `src/app/api/messages/[sessionId]/[jid]/[messageId]/react/route.ts`
memaku `fromMe: false` dengan komentar "as per previous implementation". Route `star`
sudah menerima `fromMe` dari body — sebaiknya reaksi disamakan.

**Catatan:** reaksi ke pesan masuk **berhasil** (diuji: 👍 → ❤️ → hapus, ketiganya `200`).

---

## [P3] Format balas (kutipan) tidak sesuai dugaan pengguna API

**Dampak:** Dokumentasi API mudah menyesatkan. Mengirim `{"message":"teks"}` dibalas
`400 "message is required"`; yang diterima hanya bentuk objek.

**Perilaku terverifikasi:** `{"message":{"text":"..."}}` → `200`, job masuk antrean,
status akhir `READ` (dibaca penerima). Saran: terima string biasa sebagai `text`,
atau dokumentasikan bentuk objek secara eksplisit.

---

## [P2 — OPERASIONAL] Sesi WhatsApp berubah `LOGGED_OUT` tanpa aksi QA

**Dampak:** Pengiriman via endpoint lama gagal `503 Session not ready`; job antre
berakhir `FAILED SESSION_NOT_READY`; pengguna harus scan QR ulang.

**Kronologi:** pengiriman sukses terakhir 13:15 WIB; pukul 20:23 sesi sudah
`LOGGED_OUT`. Status ini hanya diset ketika WhatsApp mengirim kode 401 (`loggedOut`).
Penyebab pasti belum diketahui — bukan dari klik "Logout device" selama QA.
Akun bot kemudian diganti nomor dan dipasangkan ulang (QR) pukul ±20:37.

**Saran:** tambahkan notifikasi ke pemilik akun saat status menjadi `LOGGED_OUT`
(email/in-app), karena saat ini pelanggan hanya tahu setelah pengiriman gagal.
