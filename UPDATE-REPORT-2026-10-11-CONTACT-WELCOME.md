# Laporan: Perbaikan Welcome Message + Ringkasan Branch

**Tanggal:** 11 Oktober 2026
**Branch:** `workbuddy-audit-privacy-branding-2026-10-11`
**Remote:** `git@github.com:RayyanAhmadAlfatih/PesanPro.git`

---

## 1. Masalah yang diperbaiki

Welcome message terkirim ulang ke kontak lama.

Kontak yang pernah mengirim pesan, lalu diam lebih lama dari jendela retensi 30 hari, akan
terlihat seperti kontak baru dan **menerima welcome message untuk kedua kalinya**.

## 2. Akar masalah

Logika lama di `src/modules/whatsapp/store/index.ts` menentukan "pesan pertama dari kontak
ini" dengan menghitung baris pesan yang tersimpan:

```ts
const msgCount = await prisma.message.count({
    where: { sessionId: dbSessionId, remoteJid: finalRemoteJid }
});
if (msgCount === 1) { /* kirim welcome */ }
```

Pemeriksaan ini bergantung pada **isi tabel `Message`**. Ketika retensi
`MESSAGE_RETENTION_DAYS` (commit `9da8f66`) mulai mempurge baris pesan, ketergantungan itu
putus: setelah semua pesan lama terhapus, hitungannya kembali ke 1, dan welcome terkirim lagi.

Jadi ini bukan bug lama yang kebetulan muncul. Ini **efek samping dari perubahan retensi
yang saya buat sendiri**, dan saya yang seharusnya menangkapnya saat itu.

## 3. Perubahan

| Berkas | Perubahan |
|---|---|
| `prisma/schema.prisma` | Tambah `Contact.welcomedAt DateTime?` |
| `prisma/migrations/20261011000000_contact_welcomed_at/migration.sql` | Migrasi baru: tambah kolom + backfill |
| `src/modules/whatsapp/store/index.ts` | Ganti penghitungan pesan dengan penanda `welcomedAt` |

Penanda disimpan di baris `Contact`, **bukan** di baris `Message`. Alasannya: `Contact`
tidak punya retensi, jadi purge pesan tidak bisa menghidupkan kembali status "belum
disambut".

## 4. Keputusan yang disengaja, dan konsekuensinya

**Ditandai sebelum dikirim, bukan sesudah.**
Kalau proses mati di antara menandai dan mengirim, kerugiannya satu welcome yang tidak
terkirim. Urutan sebaliknya berisiko mengirim dua kali, dan welcome ganda terbaca sebagai
spam. Untuk pesan keluar, sekali-kirim lebih penting daripada pasti-terkirim.

**Grup tidak lagi bisa menerima welcome.**
Dulu, pesan grup dengan hitungan tepat 1 bisa memicu welcome ke dalam grup. Sekarang cabang
ini mencari baris `Contact`, dan kontak **tidak pernah dibuat untuk JID grup**
(`store/index.ts` sengaja melewati `@g.us` dan `@status`). Efeknya welcome ke grup tidak
mungkin terjadi lagi. Ini perbaikan perilaku, bukan kemunduran.

**Backfill memperlakukan semua kontak yang sudah punya pesan sebagai "sudah disambut".**
Tanpa ini, seluruh kontak lama akan menerima welcome sekali lagi tepat setelah deploy.
Konsekuensi yang perlu Anda tahu: kontak yang **belum pernah** menerima welcome di bawah
logika lama (misalnya karena fitur welcome baru dinyalakan belakangan) juga tidak akan
menerimanya. Menghindari spam massal lebih penting daripada melengkapi satu welcome.

## 5. Urutan deploy (penting)

Migrasi **harus** jalan sebelum kode baru aktif. Kalau kode baru jalan lebih dulu,
`welcomedAt` belum ada di database dan setiap pesan masuk akan gagal pada query kontak.

```bash
git pull
npm ci
npx prisma migrate deploy     # wajib lebih dulu
npx prisma generate
npm run build
pm2 restart pesanpro
```

Verifikasi setelah deploy:

```sql
-- Harus 0: kontak yang punya pesan tapi belum ditandai
SELECT COUNT(*) FROM `Contact` c
WHERE c.`welcomedAt` IS NULL
  AND EXISTS (SELECT 1 FROM `Message` m
              WHERE m.`sessionId` = c.`sessionId` AND m.`remoteJid` = c.`jid`);
```

Kalau angkanya bukan 0, backfill tidak berjalan. Periksa log migrasi.

## 6. Status verifikasi

| Pemeriksaan | Hasil |
|---|---|
| `npx prisma generate` | Sukses, klien memuat `welcomedAt` |
| `npm run typecheck` | 0 error |
| `npm test` | **315/315 lulus**, 81 berkas |
| `npm run lint` | **Tidak terverifikasi**, diblokir sandbox |
| `npm run build` | **Tidak terverifikasi**, diblokir sandbox |
| Migrasi dijalankan ke MySQL | **Belum.** Tidak ada MySQL di environment ini |

**Yang belum dibuktikan:** SQL migrasi belum pernah dieksekusi. Sintaksnya sudah diperiksa
manual terhadap skema (`Contact.sessionId`, `Contact.jid`, `Contact.welcomedAt`,
`Message.sessionId`, `Message.remoteJid`, `Message.timestamp` semuanya cocok), dan kolom
join `(sessionId, remoteJid)` punya index `[sessionId, remoteJid, timestamp]` di `Message`.
Tapi "sudah diperiksa" bukan "sudah dijalankan". **Uji di database salinan dulu.**

## 7. Rollback

```bash
git revert <commit-fix>
```
Kolom `welcomedAt` boleh dibiarkan ada setelah revert. Kolom nullable yang tidak dibaca
tidak mengganggu, dan menghapusnya berarti kehilangan penanda kalau fix ini dipasang lagi.

## 8. Ringkasan seluruh branch

**20 commit di atas `main`**, termasuk commit laporan ini.

| Commit | Tanggal | Isi |
|---|---|---|
| laporan | 11 Okt | Dokumen ini |
| `6408799` | 11 Okt | **Fix welcome message** (skema + migrasi + backfill + kode) |
| `ec3ab42` | 11 Okt | `.workbuddy-ai/` dan preview SVG masuk `.gitignore` |
| `bbeb9fb` | 11 Okt | Logo asli dipakai; maskot tetap untuk ilustrasi |
| `1bddb22` | 11 Okt | 12 pose maskot merpati + preview PNG |
| `c55e90c` | 11 Okt | Prompt pack maskot |
| `c1fbc07` | 11 Okt | Maskot + alur landing mengikuti grupy.chat |
| `d45db06` | 11 Okt | Landing page ditulis ulang sesuai DESIGN.md |
| `b88ef8d` | 10 Okt | Identitas perangkat per sesi (risiko banned) |
| `703e4f3` | 10 Okt | Dokumen: penghapusan isi pesan + keputusan enkripsi |
| `c7c76e4` | 10 Okt | Isi pesan berhenti disimpan; anti-delete dihapus |
| `fc474fd` | 10 Okt | Checklist pre-launch |
| `f6f0619` | 10 Okt | Minimisasi kontak & sesi (QR TTL, metadata grup, foto profil, log) |
| `0903042` | 10 Okt | Campaigns + Labels dipensiunkan |
| `872db06` | 10 Okt | Laporan audit wagateway-native |
| `9da8f66` | 10 Okt | Jendela retensi pesan |
| `516d839` | 10 Okt | API key least-privilege + sidebar |
| `da92151` | 9 Okt | Eager media download + Media Manager dipensiunkan |
| `479dbec` | 6 Okt | **Bukan dari sesi ini.** Dokumen bukti verifikasi audit |
| `f8fe351` | 6 Okt | **Bukan dari sesi ini.** Penutupan temuan keamanan pra-launch |

Dua commit terakhir sudah ada di branch `muse_ai-retire-eager-media-download` sebelum
pekerjaan ini dimulai. Branch lama `workbuddy-audit-hardening-2026-10` menunjuk ke
`479dbec`, jadi branch ini adalah **kelanjutannya**, bukan duplikat.

Setiap klaim di tabel di atas sudah diperiksa langsung ke pohon file, bukan hanya dari pesan
commit. Contoh: `downloadAndSaveMedia` kini hanya muncul di dua berkas test yang justru
menguji ketiadaannya, dan `content: text`, `antiDelete`, serta penulisan `Group.metadata`
dan `profilePic` semuanya bernilai nol kemunculan.

## 9. Yang belum selesai

| Prioritas | Item | Kenapa menggantung |
|---|---|---|
| P1 | Retensi `Contact` | `CampaignRecipient` ber-FK ke `Contact`; butuh keputusan |
| P2 | Engine campaign masih hidup | Menyentuh `runtime.ts` + `operations.ts` + env |
| P2 | Dead code segment | Sisa setelah Campaigns pensiun |
| P2 | `npm audit` (9 kerentanan) | Pre-existing, perlu jadwal terpisah |
| P2 | `ROADMAP-LIVE-TEST.md` | Masih menyebut route yang kini 404 |
| P2 | Warna kuning logo | Logo `#FCDB3A` vs token `--pp-highlight #FFE95C`. Anda putuskan dibiarkan |

## 10. Catatan kebersihan

Komentar `// Placeholder - verified that I need to find the logic first` di akhir
`src/modules/whatsapp/store/index.ts` dihapus. Komentar itu berasal dari commit `d18a6ac`,
bukan dari pekerjaan ini, dan posisinya di luar fungsi mana pun sehingga hanya menyesatkan.
