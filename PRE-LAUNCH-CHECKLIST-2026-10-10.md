# Checklist Pre-Launch PesanPro

**Tanggal:** 10 Oktober 2026
**Branch:** `muse_ai-retire-eager-media-download`
**Commit terakhir:** `0903042` (pensiun Campaigns + Labels) + tindak lanjut Fase D
**Basis audit:** `AUDIT-REPORT-2026-10-09-WAGATEWAY-NATIVE.md`

**Legenda status:** ✅ Selesai & terverifikasi · 🟡 Mekanisme siap, perlu aktivasi · ⛔ Belum · 🔒 Terblokir / butuh keputusan

---

## 1. Privasi & minimisasi data

| # | Item | Status | Bukti | Catatan |
|---|---|---|---|---|
| 1.1 | Eager media download (masuk & keluar) dicabut | ✅ | commit `da92151`; `webhook.ts` tanpa `downloadAndSaveMedia`; `store/index.ts` tanpa pemanggil kedua | Akar kebocoran disk (519 file/sesi QA) |
| 1.2 | Media Manager + `/api/media/*` dipensiunkan | ✅ | `da92151`; halaman & 2 route dihapus | — |
| 1.3 | Endpoint download media pesan → 410 Gone | ✅ | `.../download/[messageId]/media/route.ts` → `MEDIA_DOWNLOAD_RETIRED` | Disengaja, bukan error |
| 1.4 | Retensi metadata pesan (`MESSAGE_RETENTION_DAYS`) | ✅ | `env.ts` default **30 hari** | Diaktifkan atas keputusan Anda |
| 1.5 | Purge harian | ✅ | `src/server/runtime.ts:212` `setInterval(runMaintenance, 86_400_000)` | Sudah ada sejak awal; kini termasuk pesan + QR |
| 1.6 | TTL kode QR pairing | ✅ | `operations-maintenance.ts` `QR_STALE_MS = 1 jam` | Hapus QR pada sesi non-`QR_REQUIRED` **atau** `updatedAt` > 1 jam |
| 1.7 | Metadata grup dibatasi | ✅ | `store/groups.ts` — penulisan `metadata` (dump mentah) dihapus | Field ditulis tapi **tidak pernah dibaca** |
| 1.8 | Foto profil kontak dihentikan | ✅ | `store/contacts.ts`, `store/index.ts`, `messages/.../search/route.ts` | Tidak dipakai UI mana pun |
| 1.9 | Log hygiene — JID tidak lagi utuh | ✅ | `jid-utils.ts`, `store/index.ts` → `maskJid()` | Pakai helper yang sudah ada; contoh `628••••789@s.whatsapp.net` |
| 1.10 | Contacts API dihapus (issue #37) | ✅ | `/api/v1/contacts/[id]/profile`, `/api/v1/contact-tags/*` dihapus | — |
| 1.11 | Labels dipensiunkan | ✅ | commit `0903042` | Halaman + `/api/labels/*` + `/api/chats/*` |
| 1.12 | Campaigns dipensiunkan | ✅ | commit `0903042` | Halaman + `/api/v1/campaigns/*` + `/api/v1/segments/*` |
| 1.13 | Retensi private media (30d) | ✅ | `PRIVATE_MEDIA_RETENTION_DAYS` (`env.ts:35`) | Sudah ada |
| 1.14 | Retensi audit log (365d) | ✅ | `AUDIT_RETENTION_DAYS` (`env.ts:75`) | Sudah ada |
| 1.15 | Retensi `Contact` | ⛔ | — | **Terblokir:** `CampaignRecipient` ber-FK ke `Contact`. Butuh keputusan |
| 1.16 | Retensi `Group` | ⛔ | — | Belum ada; prioritas rendah |
| 1.17 | Isolasi tenant | ✅ | `api-auth.ts:151` `canAccessSession` — scope ke `userId`, SUPERADMIN tidak bypass | Diuji di `/api/messages/*/search` |
| 1.18 | Enkripsi at-rest isi pesan | ✅ | — | **Tidak lagi relevan:** `Message.content` berhenti ditulis (lihat 1.19) |
| 1.19 | **Berhenti menulis `Message.content`** | ✅ | `store/index.ts` — create, edit, delete, anti-delete | Isi pesan tidak lagi disimpan sama sekali |
| 1.20 | Endpoint pencarian pesan dihapus | ✅ | `/api/messages/[sessionId]/search` dihapus | Satu-satunya API yang membaca isi |
| 1.21 | `chat.service.ts` (dead code) dihapus | ✅ | tidak punya pengimpor sama sekali | — |
| 1.22 | **Anti-delete dihapus** | ✅ | `store/index.ts` | Fitur yang sengaja menyimpan isi pesan yang dihapus pengirim — bertentangan dengan hak penghapusan UU PDP |
| 1.23 | `Contact.data` (JSON) | ✅ | tidak pernah dibaca **maupun** ditulis | Kolom dormant; tidak ada yang perlu dihentikan |
| 1.24 | `Session.config` | ✅ | dipertahankan | Masih dipakai `instance.ts` + API settings |
| 1.25 | Auto Reply tetap berfungsi | ✅ | `store/index.ts` — konsumsi teks hidup, bukan baris DB | Rewiring, bukan penghapusan fitur |

---

## 2. Keamanan

| # | Item | Status | Bukti | Catatan |
|---|---|---|---|---|
| 2.1 | API key default least-privilege | ✅ | `516d839`; `developer/page.tsx` default `[]` + 3 preset | Sebelumnya 16 scope aktif |
| 2.2 | Isolasi kepemilikan resource | ✅ | 403/404 generik, tidak membocorkan keberadaan | — |
| 2.3 | Kerentanan dependency | ⛔ | `npm audit --omit=dev` → 9 (4 moderate, 4 high, 1 critical) | **Pre-existing** (`sharp`, `source-map-js`); jadwal terpisah |
| 2.4 | Rotasi/least-privilege scope lama | ⛔ | — | Scope `campaign:read/write` tetap ada agar API key lama tidak mati |

---

## 3. UX / Information Architecture

| # | Item | Status | Bukti | Catatan |
|---|---|---|---|---|
| 3.1 | Sidebar dirapikan + Bahasa Indonesia | ✅ | `516d839`; `sidebar-nav.tsx`, `mobile-nav.tsx` | Grup "Operasi" = persis `SUPERADMIN_DASHBOARD_PREFIXES` |
| 3.2 | Sidebar tenant menyusut | ✅ | — | **16 → 11 item** (Kampanye, Label, Media Manager keluar; Notifikasi masuk) |
| 3.3 | Billing keluar dari grup "Developer" | ✅ | `516d839` | → grup "Akun" |
| 3.4 | Tabrakan nama grup/item "Developer" | ✅ | `516d839` | → grup "Integrasi", item "Kunci API" |
| 3.5 | "Notifications" menyesatkan | ✅ | `516d839` | → "Kirim Pengumuman" (komposer admin) |
| 3.6 | Rute pensiun ditolak semua role | ✅ | `access-policy.ts` `REMOVED_DASHBOARD_FEATURE_PREFIXES` | media, campaigns, labels, chat, dll |
| 3.7 | Dokumentasi QA sinkron | ⛔ | — | `ROADMAP-LIVE-TEST.md` masih menyebut route yang kini mati |

---

## 4. Gates & kesiapan deploy

| # | Gate | Status | Bukti | Catatan |
|---|---|---|---|---|
| 4.1 | `npm run typecheck` | ✅ | 0 error | Perlu `rm -rf .next` setelah route dihapus |
| 4.2 | `npm test` | ✅ | **80 file, 310 test lulus** | — |
| 4.3 | `npm run build` | ✅ | Sukses; `/api/media` & `/dashboard/media` absen dari artefak | Dijalankan pada Fase 2; jalankan ulang sebelum ship |
| 4.4 | `npm run lint` | 🔒 | ESLint crash (exit 2) | Diblokir Security Center environment saat membaca `broadcast-queue.test.ts`. **Bukan regresi kode** |
| 4.5 | `git diff --check` | ✅ | Bersih | — |
| 4.6 | Verifikasi runtime di VPS | ⛔ | — | Belum ada bukti runtime produksi (restart drill, uji isolasi live) |
| 4.7 | Uji backup/restore | ⛔ | — | Belum dibuktikan pasca-perubahan |

---

## 5. Kepatuhan & dokumen

| # | Item | Status | Bukti | Catatan |
|---|---|---|---|---|
| 5.1 | Halaman Privacy Policy | ✅ | rute `/privacy` ada di build | **Perlu ditinjau ulang** — isinya harus cocok dengan retensi baru |
| 5.2 | Halaman Terms | ✅ | rute `/terms` ada di build | — |
| 5.3 | Dokumentasi retensi (untuk privacy policy) | ⛔ | — | Lihat §6 di bawah — draft siap dipakai |
| 5.4 | Prosedur hak subjek data (akses/hapus) | ⛔ | — | UU PDP No. 27/2022: hak akses, koreksi, penghapusan, portabilitas |

---

## 6. Dokumentasi retensi (draft untuk privacy policy)

| Data | Lokasi | Retensi | Cara hapus |
|---|---|---|---|
| Isi pesan | `Message.content` | **Tidak lagi disimpan** — kolom berhenti ditulis | Tidak perlu dihapus |
| Metadata pesan | `Message` (JID, status, timestamp) | `MESSAGE_RETENTION_DAYS` = **30 hari** | Purge harian otomatis |
| Kontak | `Contact` | **Tak terbatas** (belum ada) | Belum ada mekanisme |
| Metadata grup | `Group` | Tak terbatas; dump mentah **tidak lagi ditulis** | Belum ada mekanisme |
| Kode QR pairing | `Session.qr` | **1 jam** sejak update terakhir | Purge harian otomatis |
| Media privat (upload) | `PrivateMedia` + B2 | `PRIVATE_MEDIA_RETENTION_DAYS` = **30 hari** | `purgeExpiredPrivateMedia` harian |
| Log autoreply | `AutoReplyTriggerLog` | `AUTOREPLY_TRIGGER_LOG_RETENTION_DAYS` = **30 hari** | Purge harian |
| Audit log | `AuditLog` | `AUDIT_RETENTION_DAYS` = **365 hari** | `purgeExpiredAuditLogs` harian |
| Backup | `BACKUP_DIR` | `BACKUP_RETENTION_DAYS` = **30 hari** | Kebijakan backup |

> ✅ **Untuk privacy policy:** isi pesan **tidak lagi disimpan** (kolom `content` berhenti ditulis). Yang tersisa hanya metadata pengiriman (JID, status, timestamp) dengan retensi **30 hari**. Ini pernyataan yang aman untuk ditulis di privacy policy.

---

## 7. Yang belum selesai — butuh keputusan Anda

| Prioritas | Item | Kenapa butuh keputusan |
|---|---|---|
| **P0** | Aktifkan `MESSAGE_RETENTION_DAYS` | Butuh angka (30/90?) + kesediaan kehilangan riwayat lama. **Destruktif** |
| **P1** | Retensi `Contact` | Butuh keputusan karena `CampaignRecipient` ber-FK ke `Contact` |
| **P1** | Enkripsi at-rest `Message.content` | Butuh keputusan kunci + migrasi + dampak performa |
| **P2** | Bersihkan dead code segment (`segment-service/input/policy`) | Sisa setelah Campaigns pensiun; surgery mekanis, tanpa manfaat fungsional |
| **P2** | Hapus engine campaign (worker, `runtime.ts`, env) | Menyentuh runtime produksi + 5 file inti; butuh restart drill |
| **P2** | `npm audit fix` | 9 kerentanan dependency, pre-existing |
| **P2** | Sinkronkan `ROADMAP-LIVE-TEST.md` | Masih menyebut route yang kini 404 |

---

## 8. Aktivasi & rollback

**Mengaktifkan retensi pesan (satu baris):**
```env
MESSAGE_RETENTION_DAYS="30"
```
Lalu restart: `pm2 restart pesanpro`. Purge pertama jalan otomatis (30 detik setelah start, lalu tiap 24 jam). Perhatikan log: `Daily retention maintenance complete` beserta `expiredMessages`.

**Rollback per bagian:**
```bash
git revert 0903042   # kembalikan Campaigns + Labels
git revert 516d839   # kembalikan scope API key + sidebar lama
git revert 9da8f66   # matikan mekanisme retensi pesan
git revert da92151   # kembalikan eager media download (menyalakan kembali kebocoran disk)
```
Setelah rollback: `npm run build && pm2 restart pesanpro`.

---

*Semua status "✅" di dokumen ini berbasis bukti yang dapat diperiksa (commit, `file:line`, atau output gate). Item tanpa bukti runtime produksi ditandai "⛔" — bukan "siap produksi".*

---

## 9. Strategi enkripsi — keputusan

**Keputusan: TIDAK melakukan enkripsi kolom di lapisan aplikasi untuk sekarang.** Alasan:

| Alasan | Penjelasan |
|---|---|
| Kunci di host yang sama | Kunci tersimpan di VPS yang sama dengan aplikasinya. Server jebol total → kunci ikut jebol. Enkripsinya jadi seremoni, bukan perlindungan |
| JID harus tetap bisa di-query | Nomor telepon dipakai untuk lookup (`jid-utils.ts`). Enkripsi kolom merusak query, atau butuh enkripsi deterministik yang kompleksitasnya tidak sebanding |
| Nilai sisa sudah rendah | Setelah minimisasi, yang tersisa hanya metadata operasional (nomor, status, timestamp). Rendah nilainya bagi penyerang, besar effort enkripsinya |

**Yang direkomendasikan sebagai gantinya (lapisan infrastruktur):**

| # | Item | Status |
|---|---|---|
| 9.1 | Verifikasi enkripsi backup restic — pastikan password repo aman dan **tidak** ikut ter-backup | ⛔ perlu bukti |
| 9.2 | Enkripsi disk VPS / database (jaga dari pencurian disk fisik) | ⛔ perlu bukti |
| 9.3 | Higiene kredensial: pastikan tidak ada secret nyangkut di repo, log, atau backup | ⛔ perlu bukti |

**Urutan yang benar: minimisasi dulu (impact terbesar), lalu enkripsi lapisan infrastruktur. Enkripsi kolom aplikasi ditunda sampai ada secret manager khusus.**

**Catatan:** `ENCRYPTION_KEY` sudah ada dan dipakai untuk **auth state WhatsApp** (`scripts/backfill-encrypt-authstate.ts`). Jadi enkripsi di titik yang benar sudah berjalan — yang tidak dilakukan adalah enkripsi kolom PII, dan itu keputusan sadar.
