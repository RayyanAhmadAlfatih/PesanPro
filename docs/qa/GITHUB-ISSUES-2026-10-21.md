# GitHub Issues — Temuan 2026-10-21

## [P1] Koneksi WhatsApp mati diam-diam — semua pesan masuk hilang tanpa error

**Dampak:** Paling serius dari seluruh sesi QA. Sesi WhatsApp bisa berhenti menerima
pesan **tanpa** peristiwa `connection.close`, sehingga aplikasi tidak pernah
menyambung ulang. Status di dashboard tetap `CONNECTED`, API tetap jalan, tidak ada
error di log — tapi **semua pesan masuk berhenti diproses**. Pelanggan akan kehilangan
chat, balasan otomatis, dan webhook selama berjam-jam tanpa tahu.

**Kronologi terverifikasi:**
- Pesan masuk terakhir yang diproses: **2026-10-21 09:07:46 UTC (16:07 WIB)** — hanya
  `status@broadcast`.
- Pesan pribadi terakhir yang diproses: **2026-10-20 09:42 UTC (16:42 WIB)**.
- Pukul 19:20 dan 19:50 WIB penguji mengirim pesan dari `6285282348423`; pesan
  **muncul di WhatsApp bot** tetapi **tidak tersimpan** di database dan tidak memicu
  auto-reply/webhook.
- Dashboard menampilkan `CONNECTED` (status basi di DB).
- Setelah **Stop Session → Start Session** dari dashboard, pesan masuk langsung
  diproses normal lagi (terverifikasi lewat log auto-reply dengan `recipientJid`
  `6285282348423@s.whatsapp.net`).

**Penyebab (dugaan terverifikasi sebagian):** handler `messages.upsert` terikat pada
socket lama. Saat koneksi TCP mati tanpa event `close`, Baileys tidak memicu
rekoneksi, dan aplikasi tidak punya pemeriksa kesehatan (heartbeat) untuk mendeteksi
socket mati.

**Saran perbaikan:**
1. Tambahkan pemeriksa berkala (mis. tiap 60 detik): kirim presence/ping ke WhatsApp
   dan paksa `init()` ulang bila tidak ada respons dalam batas waktu.
2. Pantau `lastMessageReceivedAt` per sesi; beri tanda "mungkin mati" bila melewati
   ambang (mis. 15 menit) dan tampilkan peringatan di dashboard.
3. Kirim notifikasi ke pemilik akun saat sesi berhenti menerima pesan.
4. Pertimbangkan `keepAliveIntervalMs` bawaan Baileys dan pastikan tidak dimatikan.

---

## [P3] Unggahan melebihi batas ditolak nginx dengan halaman HTML

Dari `docs/qa/GITHUB-ISSUES-2026-10-19.md` — masih terbuka.

---

## Catatan L12 (Auto Reply) — 2026-10-21

Terbukti bekerja lewat pengujian nyata (setelah sesi dipulihkan):

| Perilaku | Bukti |
| --- | --- |
| EXACT cocok → balasan masuk antrean | log `ENQUEUED` + rule "Uji sapaan" |
| Huruf besar/kecil | `UJI-SAPAAN-QA` tetap cocok aturan yang sama (tidak case-sensitive) |
| Cooldown | pesan kedua 9 detik kemudian → `SKIPPED / COOLDOWN_ACTIVE` |
| Cooldown berakhir | pesan ketiga 44 detik kemudian → `ENQUEUED` |
| Jaring pengaman (FALLBACK) | `pesan acak xyz` → `ENQUEUED` via rule FALLBACK |
| Log pemicu | penerima, aturan, status, alasan, waktu tercatat lengkap |

Semua aturan uji dihapus segera setelah tes; key uji di-revoke.
