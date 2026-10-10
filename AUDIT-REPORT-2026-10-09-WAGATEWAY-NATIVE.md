# Laporan Audit Fase 1 — Menuju "wagateway native"

**Produk:** PesanPro (WhatsApp Gateway SaaS multi-tenant)
**Tanggal:** 9 Oktober 2026
**Branch audit:** `muse_ai-retire-eager-media-download` (commit `da92151`)
**Baseline:** `workbuddy-audit-hardening-2026-10`
**Metode:** heuristic evaluation (Nielsen) + cognitive walkthrough 3 alur inti + audit privasi (PII map) + code audit ringan area Fase 2
**Status:** laporan + proposal. Perubahan UX **belum dieksekusi** sesuai instruksi. Fase 2 (media) sudah dieksekusi — lihat §10.

---

## 0. Ringkasan eksekutif

**Skor kesederhanaan navigasi saat ini: 4.2 / 10.**

Diagnosis satu kalimat: **PesanPro membangun navigasi dari daftar fitur yang tumbuh organik, bukan dari 5 alur inti gateway.** Akibatnya 4 dari 5 alur inti (connect QR → API key → kirim pesan → webhook → bayar) terkubur di antara menu pendukung yang tidak lolos tes "inti gateway".

Tiga akar masalah yang paling menahan produk dari rasa "wagateway native":

1. **Hierarki tidak mencerminkan alur.** `Sessions / QR` (langkah 1) dan `Developer`/`Webhooks` (langkah 2–3) tersebar di 3 grup berbeda, sementara `Message Queue` (pendukung) mendapat grup penuh sendiri.
2. **Dua kebingungan struktural:** nama grup identik dengan nama item (`Developer` berisi `Developer`), dan dua menu uang (`Billing` vs `Commercial`) tanpa penanda siapa pemiliknya.
3. **Nol retensi PII.** Isi pesan, kontak, dan metadata grup disimpan plaintext tanpa batas waktu. Retensi hanya ada untuk audit log, private media, dan log autoreply — bukan untuk data pesan.

**Dua koreksi atas premis Anda** (detail di §9):

- **Temuan #5 Anda tidak akurat.** `/dashboard/notifications` **bukan** inbox personal — itu komposer admin superadmin-only (`src/app/dashboard/notifications/page.tsx`, `POST /api/notifications`, diproteksi `SUPERADMIN_DASHBOARD_PREFIXES`). Inbox personal adalah `/dashboard/inbox` (tenant) dan justru **tidak punya entri sidebar** — hanya bisa diakses lewat lonceng di navbar. Jadi kategorisasi `Notifications` di grup Administration sudah **benar**; yang salah adalah **labelnya**.
- **Premis Fase 2 tidak cocok dengan branch.** Commit `1c06877` tidak ada di riwayat branch ini, dan Media Manager masih hidup (`src/app/dashboard/media/page.tsx` 544 baris, entri sidebar, prefix access-policy). Sudah dikonfirmasi ke Anda dan ditangani lewat opsi "pensiunkan penuh".

---

## 1. Metode & basis bukti

| Langkah | Yang dilakukan | Sumber |
|---|---|---|
| Inventaris IA | Baca struktur grup + item sidebar | `src/components/dashboard/sidebar-nav.tsx:48-96`, `mobile-nav.tsx:38-86` |
| Heuristic evaluation | 10 heuristik Nielsen atas 17 layar | seluruh `src/app/dashboard/*/page.tsx` |
| Cognitive walkthrough | 3 alur inti, langkah demi langkah | `sessions/`, `developer/`, `billing/`, `webhooks/` + API terkait |
| Konsistensi bahasa | Sapuan label nav vs copy halaman | semua page + komponen nav |
| Privacy audit | PII map + uji isolasi tenant + retensi | `prisma/schema.prisma`, `src/lib/api-auth.ts`, `src/lib/operations-maintenance.ts` |
| Code audit ringan | Jejak semua penulis `data/media` & konsumen `/api/media` | `src/lib/webhook.ts`, `src/modules/whatsapp/store/index.ts`, `src/app/api/media/*` |

Keterbatasan: audit dilakukan dari source, bukan dari sesi browser live. Klaim runtime (mis. perilaku QR) ditandai sebagai asumsi bila tidak dapat diverifikasi dari kode.

---

## 2. Inventaris sidebar

Struktur saat ini: **17 item dalam 6 grup** (16 menu fitur + `Dashboard` sebagai landing).

| # | Menu (label) | Grup | Rute |
|---|---|---|---|
| 1 | Dashboard | Main | `/dashboard` |
| 2 | Sessions / QR | Main | `/dashboard/sessions` |
| 3 | Message Queue | Messaging | `/dashboard/message-queue` |
| 4 | Broadcast | Messaging | `/dashboard/broadcast` |
| 5 | Campaigns | Messaging | `/dashboard/campaigns` |
| 6 | ~~Media Manager~~ | ~~Messaging~~ | ~~`/dashboard/media`~~ → **dihapus di Fase 2** |
| 7 | Labels | Data | `/dashboard/labels` |
| 8 | Auto Reply | Automation | `/dashboard/autoreply` |
| 9 | Scheduler | Automation | `/dashboard/scheduler` |
| 10 | Developer | Developer | `/dashboard/developer` |
| 11 | Webhooks | Developer | `/dashboard/webhooks` |
| 12 | Billing | Developer | `/dashboard/billing` |
| 13 | Users | Administration | `/dashboard/users` |
| 14 | Commercial | Administration | `/dashboard/commercial` |
| 15 | Settings | Administration | `/dashboard/settings` |
| 16 | System Monitor | Administration | `/dashboard/system-monitor` |
| 17 | Notifications | Administration | `/dashboard/notifications` |
| — | Inbox *(tanpa entri sidebar)* | — | `/dashboard/inbox` (via lonceng navbar) |

---

## 3. Temuan UX/IA per menu

Rubrik: **5** = inti gateway, jelas, unik · **3** = pendukung sah · **1–2** = bukan inti / tumpang tindih / menyesatkan.

| # | Menu | Awam ngerti dalam 5 detik? | Duplikat dengan | Inti gateway? | Skor | Rekomendasi |
|---|---|---|---|---|---|---|
| 1 | Dashboard | Ya | — | Pendukung (ringkasan) | 4 | Pertahankan, isi dengan status 5 alur inti |
| 2 | **Sessions / QR** | **Tidak** — slash ambigu, "sessions" bisa dibaca "sesi login" | — | **Inti #1** | 3 | Rename → **"Perangkat & QR"**, naikkan ke posisi teratas |
| 3 | Message Queue | Sebagian — "queue" istilah teknis | Broadcast, Campaigns | Pendukung (diagnostik) | 2 | Turunkan jadi sub-tab di Perangkat atau gabung ke "Pengiriman" |
| 4 | Broadcast | Ya — istilah khas WA | Campaigns, Message Queue | **Inti #3** (kirim massal) | 3 | Pertahankan; tegaskan beda vs Campaigns |
| 5 | **Campaigns** | Tidak — "campaign" vs "broadcast" tak terbedakan awam | Broadcast | Bukan inti gateway (CRM-lite) | 2 | Gabung ke Broadcast sebagai mode lanjutan, atau tandai operator-only |
| 6 | ~~Media Manager~~ | — | — | — | — | **Sudah dihapus (Fase 2)** |
| 7 | **Labels** | Ya, tapi… | — | **Bukan inti gateway** (fitur CRM) | 2 | Kandidat pensiun; grup "Data" hanya berisi 1 item = overhead grup |
| 8 | Auto Reply | Ya | — | Pendukung sah | 4 | Pertahankan |
| 9 | Scheduler | Ya | Message Queue (keduanya "kirim nanti") | Pendukung sah | 4 | Pertahankan |
| 10 | **Developer** | **Tidak** — nama grup = nama item | Webhooks | **Inti #2** (API key) | 2 | Rename → **"Kunci API"**, grup → "Integrasi" |
| 11 | Webhooks | Ya (istilah teknis, audiens developer) | Developer | **Inti #4** | 4 | Pertahankan, satu grup dengan Kunci API |
| 12 | **Billing** | Ya | Commercial | **Inti #5** | 4 | **Pindahkan keluar dari grup "Developer"** → grup "Akun" |
| 13 | Users | Ya | — | Pendukung (superadmin) | 4 | Pertahankan, tandai operator-only |
| 14 | **Commercial** | **Tidak** — tak jelas milik siapa | Billing | Operator-only (bukan tenant) | 2 | Rename → **"Operasi Komersial"**, sembunyikan dari tenant |
| 15 | Settings | Ya | — | Pendukung | 4 | Pertahankan |
| 16 | System Monitor | Ya | — | Operator-only | 3 | Pertahankan, operator-only |
| 17 | **Notifications** | **Menyesatkan** — terbaca "inbox saya", padahal komposer admin | Inbox | Operator-only composer | 2 | Rename → **"Kirim Pengumuman"** |
| — | Inbox | — | Notifications | Pendukung | 3 | **Naikkan jadi entri sidebar** (saat ini tersembunyi) |

**Skor rata-rata: 4.2/10.** Setelah proposal §8 diterapkan, target 8/10.

---

## 4. Heuristic evaluation (Nielsen)

| Heuristik | Temuan | Bukti |
|---|---|---|
| **1. Visibility of system status** | `Sessions / QR` tidak menunjukkan status koneksi di level nav. Pengguna harus masuk untuk tahu sesi hidup/mati. | `sidebar-nav.tsx:53` |
| **2. Match with real world** | Campuran istilah internal (`queue`, `campaign`, `entitlement`) dengan bahasa awam. | `message-queue/page.tsx` subtitle "Pesan dari API, broadcast, campaign, atau scheduler…" |
| **3. User control & freedom** | Baik: setiap flow punya batal/keluar. Tidak ada temuan. | — |
| **4. Consistency & standards** | **Gagal.** Nav berbahasa Inggris, isi halaman berbahasa Indonesia. Tombol "Ciutkan" (ID) berdampingan dengan label "Settings" (EN). | `sidebar-nav.tsx:185` vs `:91` |
| **5. Error prevention** | Baik pada input (validasi warna label 0–19, dsb). | `labels/[sessionId]/route.ts:72` |
| **6. Recognition over recall** | **Gagal.** Awam harus mengingat bahwa "Developer" = API key, dan bahwa "Billing" ≠ "Commercial". | `sidebar-nav.tsx:81,90` |
| **7. Flexibility & efficiency** | Baik: ada API + dashboard. | — |
| **8. Aesthetic & minimalist design** | Grup "Data" berisi 1 item (Labels) — overhead grup tanpa manfaat. | `sidebar-nav.tsx:66-69` |
| **9. Error recovery** | Baik: pesan error publik aman, tidak membocorkan detail internal. | seluruh `route.ts` |
| **10. Help & documentation** | Tidak ada tautan dokumentasi di dalam sidebar; `developer/page.tsx` memuat `BookOpen` (ada tautan docs di halaman, bukan di nav). | `developer/page.tsx:5` |

---

## 5. Cognitive walkthrough — 3 alur inti

### (a) Connect sesi WA via QR pertama kali

| Langkah | Aksi pengguna | Yang terjadi | Friksi |
|---|---|---|---|
| 1 | Cari menu untuk menghubungkan WA | Melihat 17 item; label "Sessions / QR" | **Tinggi.** "Sessions" ambigu (sesi login?). Slash membuat label terbaca dua hal. |
| 2 | Klik `/dashboard/sessions` | Halaman "Manage Sessions" | **Sedang.** Judul EN, isi ID. |
| 3 | Buat sesi, dapat QR | QR muncul | Rendah. |
| 4 | Scan QR | Sesi terhubung | Rendah. |

**Titik putus utama: langkah 1.** Tidak ada satu pun kata "WhatsApp"/"Perangkat"/"Hubungkan" di nav.

### (b) Developer baru: API key → kirim pesan pertama

| Langkah | Aksi | Yang terjadi | Friksi |
|---|---|---|---|
| 1 | Cari tempat membuat API key | Harus menebak bahwa "Developer" di grup "Developer" = API key | **Tinggi.** Nama grup = nama item. |
| 2 | Buat key, pilih scope | 16 scope ditampilkan semua terpilih (`developer/page.tsx:30,35`) | **Tinggi.** Default "semua scope aktif" melanggar least-privilege; awam tidak tahu harus memilih apa. |
| 3 | Baca cara pakai API | `BookOpen` di halaman, bukan di nav | Sedang. |
| 4 | Konfigurasi webhook | Harus pindah ke menu "Webhooks" (masih satu grup — baik) | Rendah. |
| 5 | Kirim pesan pertama | Lewat API | Rendah. |

**Titik putus utama: langkah 1–2.** Alur inti terkubur, dan default scope tidak aman.

### (c) User bayar / upgrade plan

| Langkah | Aksi | Yang terjadi | Friksi |
|---|---|---|---|
| 1 | Cari menu tagihan | "Billing" **ada di dalam grup "Developer"** | **Tinggi.** Billing adalah urusan keuangan tenant, bukan dev tool. Kategorisasi salah. |
| 2 | Bingung Billing vs Commercial | Dua menu uang tanpa penanda kepemilikan | **Tinggi.** `Commercial` = "Commercial Operations" (operator); `Billing` = plan tenant. Tidak ada penanda. |
| 3 | Pilih plan | `billing/page.tsx` — copy ID yang bagus: "Pilih plan berdasarkan kebutuhan; tidak ada tier yang dipaksakan" | Rendah (copy ini justru contoh baik). |
| 4 | Upload bukti bayar | Via private media (B2) | Rendah. |

**Titik putus utama: langkah 1–2.** Billing salah grup; Billing vs Commercial tidak terbedakan.

---

## 6. Konsistensi bahasa

**Pola:** nav & judul halaman **Inggris**, copy & pesan **Indonesia**. Untuk target "orang Indonesia yang banyak awam teknis", ini adalah penghalang langsung.

Bukti campuran dalam satu layar:

| Lokasi | Inggris | Indonesia |
|---|---|---|
| Sidebar | 16 label menu | "Ciutkan" (`sidebar-nav.tsx:185`) |
| Mobile nav | 16 label menu | "Keluar" (`mobile-nav.tsx:171`) |
| Billing | H1 "Billing", H2 "Available plans" | "Pilih plan berdasarkan kebutuhan…" (`billing/page.tsx`) |
| Message Queue | H1 "Message Queue" | "Pesan dari API, broadcast, campaign, atau scheduler akan muncul di sini." |
| Labels | H1 "Chat Labels" | "Organize chats with color-coded labels…" (EN) |
| Scheduler | "Scheduled delivery, without guesswork." | "Timezone-aware execution, private media, missed-run policy…" (EN) |

**Rekomendasi:** untuk permukaan tenant, pakai label ID; pertahankan istilah teknis yang sudah lazim (`Webhook`, `API`) tapi beri padanan singkat. Permukaan operator (superadmin) boleh tetap EN.

Usulan pemetaan label (dipakai di §8): `Sessions / QR` → **Perangkat & QR** · `Message Queue` → **Antrian Pesan** · `Broadcast` → **Kirim Massal** · `Campaigns` → **Kampanye** · `Developer` → **Kunci API** · `Webhooks` → **Webhook** · `Billing` → **Tagihan** · `Commercial` → **Operasi Komersial** · `Notifications` → **Kirim Pengumuman** · `Inbox` → **Notifikasi** · `Users` → **Pengguna** · `Settings` → **Pengaturan** · `System Monitor` → **Monitor Sistem** · `Auto Reply` → **Balasan Otomatis** · `Scheduler` → **Jadwal Kirim** · `Labels` → **Label** · `Dashboard` → **Ringkasan**.

---

## 7. Audit privasi

### 7.1 Peta PII (siapa menyimpan apa, di mana)

| Data | Lokasi | Isi | Akses | Retensi | Rekomendasi |
|---|---|---|---|---|---|
| **Isi pesan** | `Message.content` `@db.Text` (`schema.prisma:821`) | Teks & caption **plaintext** | `GET /api/messages/{sessionId}/search` — tenant-scoped | **Tidak ada** → permanen | **P0.** Tetapkan retensi (mis. 30–90 hari) + job purge; pertimbangkan enkripsi at-rest |
| **Kontak** | `Contact` (`schema.prisma:782`) | `jid`, `lid`, `name`, `notify` (pushName), `verifiedName`, `remoteJidAlt`, `profilePic` `@db.Text`, `data` Json | `/api/contacts/{sessionId}`, `/api/labels/*` | **Tidak ada** → permanen | **P1.** Minimalkan `profilePic`/`data`; tetapkan retensi |
| **Media pesan** | `Message.mediaUrl` → `data/media/*` | File biner plaintext di disk VPS | `/api/media/[filename]` | **Tidak ada** | **P0 — DICABUT** (Fase 2, §10) |
| **Metadata grup** | `Group.participants` / `metadata` Json (`schema.prisma:846,851`) | Daftar anggota + dump metadata mentah | internal | Tidak ada | **P2.** Minimalkan `metadata` (dump mentah) |
| **Sesi** | `Session.qr` `@db.Text`, `config` Json | String QR (sementara), config | internal | Tidak ada | **P2.** Beri TTL pada QR tersimpan |
| **Media privat (upload)** | `PrivateMedia` + B2 / `data/private-media` | Bukti bayar, lampiran broadcast | `/api/v1/media` | **Ada** — `PRIVATE_MEDIA_RETENTION_DAYS=30` (`env.ts:35`) | OK, jangan disentuh |

### 7.2 Uji isolasi tenant (hasil: **LULUS**)

`canAccessSession()` (`src/lib/api-auth.ts:151-168`) memverifikasi:
1. Role adalah akun aktif (`SUPERADMIN`/`USER`);
2. Actor ada, `status === "ACTIVE"`, dan role cocok;
3. Sesi **dimiliki oleh `userId`** — dan komentarnya eksplisit: *"the role never bypasses ownership"* — SUPERADMIN tidak bisa menembus kepemilikan.

| Endpoint | Guard | Hasil |
|---|---|---|
| `GET /api/messages/{sessionId}/search` | `canAccessSession` (`search/route.ts:41`) + query di-scope ke `session.id` | **Lulus** |
| `GET/POST /api/labels/{sessionId}` | `canAccessSession` (`labels/[sessionId]/route.ts:22,65`) | **Lulus** |
| `GET/DELETE /api/media` | filter `where: { userId: user.id }` (`api/media/route.ts:41`) | Lulus — *endpoint kini dihapus* |
| `GET /api/media/[filename]` | `canAccessSession` dari sessionId pada nama file | Lulus — *endpoint kini dihapus* |

Catatan positif: saat gagal, endpoint mengembalikan 403/404 generik tanpa membocorkan keberadaan resource. Sesuai invariant repo.

### 7.3 Retensi — temuan utama

Job pemeliharaan (`src/lib/operations-maintenance.ts:18-32`) mempurge: audit log, runtime heartbeat, operational alert, `autoReplyTriggerLog`, entitlement override, rate-limit bucket, private media.

**Yang TIDAK pernah dipurge: `Message`, `Contact`, `Group`.** Tidak ada `MESSAGE_RETENTION_DAYS` di `src/lib/env.ts`. Artinya seluruh isi percakapan dan buku kontak tenant tumbuh selamanya.

Ini bertentangan langsung dengan visi "wagateway native": gateway **meneruskan** pesan, bukan **mengarsipkan** percakapan. Sejalan issue #37 (hapus Media Manager & Contacts API), rekomendasi minimisasi:

- **P0** — `MESSAGE_RETENTION_DAYS` (default 30) + purge harian. Gateway tidak butuh riwayat percakapan; API sudah lewat webhook.
- **P1** — Minimalkan `Contact`: buang `profilePic` & `data` bila tidak dipakai fitur aktif; retensi kontak sejalan retensi pesan.
- **P1** — Nilai ulang `Labels` (fitur CRM) terhadap visi gateway; lihat §9.
- **P2** — Hapus endpoint `GET /api/chats/{sessionId}/by-label/{labelId}` & `GET /api/contacts/{sessionId}` bila Labels/Contacts dipensiunkan (issue #37).

---

## 8. Proposal navigasi "wagateway native"

**Prinsip:** sidebar = **alur inti**, bukan katalog fitur. Setiap item harus lolos "apakah ini inti gateway?" dan "apakah awam paham dalam 5 detik?".

### 8.1 Struktur usulan — 4 grup, 11 item (dari 6 grup, 16 item)

| Grup | Item | Rute | Alasan ada |
|---|---|---|---|
| **(tanpa grup)** | Ringkasan | `/dashboard` | Landing = status 5 alur inti |
| **Perangkat** | Perangkat & QR | `/dashboard/sessions` | **Inti #1** |
| | Antrian Pesan | `/dashboard/message-queue` | Diagnostik pengiriman (turunan Perangkat) |
| **Pengiriman** | Kirim Massal | `/dashboard/broadcast` | **Inti #3** |
| | Kampanye | `/dashboard/campaigns` | Mode lanjutan Kirim Massal (dipertahankan, ditandai) |
| | Jadwal Kirim | `/dashboard/scheduler` | Pendukung sah |
| | Balasan Otomatis | `/dashboard/autoreply` | Pendukung sah |
| **Integrasi** | Kunci API | `/dashboard/developer` | **Inti #2** |
| | Webhook | `/dashboard/webhooks` | **Inti #4** |
| **Akun** | Tagihan | `/dashboard/billing` | **Inti #5** — keluar dari grup Developer |
| | Pengaturan | `/dashboard/settings` | Pendukung |
| | Notifikasi *(Inbox)* | `/dashboard/inbox` | Inbox personal naik ke sidebar |
| **Operasi** *(superadmin saja)* | Pengguna | `/dashboard/users` | Operator |
| | Operasi Komersial | `/dashboard/commercial` | Operator |
| | Monitor Sistem | `/dashboard/system-monitor` | Operator |
| | Kirim Pengumuman | `/dashboard/notifications` | Operator composer (rename dari "Notifications") |

**Perubahan kunci:**
1. `Sessions / QR` → **Perangkat & QR**, naik ke posisi #1 (selaras urutan alur).
2. `Billing` **keluar** dari grup "Developer" → grup **Akun**. Billing = keuangan tenant.
3. `Developer` (item) → **Kunci API**; grup "Developer" → **Integrasi**. Menghapus tabrakan nama.
4. Grup **Data** dibubarkan: `Labels` dipensiunkan (kandidat) atau jadi sub-fitur Kampanye.
5. `Commercial` + `System Monitor` + `Users` + `Kirim Pengumuman` dikumpulkan di grup **Operasi** yang **hanya tampil untuk superadmin** (sudah ditangani `canAccessDashboardPath`).
6. Inbox personal **naik** ke sidebar sebagai "Notifikasi".
7. Grup "Administration" (campuran tenant + operator) dipecah: tenant → "Akun", operator → "Operasi".

### 8.2 Perbaikan 3 alur inti

| Alur | Sebelum | Sesudah |
|---|---|---|
| (a) Connect QR | "Sessions / QR" di grup Main, ambigu | "Perangkat & QR" di paling atas grup Perangkat |
| (b) API key → kirim | "Developer" di grup "Developer", 16 scope aktif | "Kunci API" di grup Integrasi, **scope default kosong + preset "kirim pesan"** |
| (c) Bayar/upgrade | "Billing" di grup Developer, bingung vs Commercial | "Tagihan" di grup Akun; "Operasi Komersial" hanya untuk superadmin |

### 8.3 Temuan keamanan sampingan (dari alur b)

`src/app/dashboard/developer/page.tsx:35` — `useState<string[]>([...scopes])` membuat **semua 16 scope terpilih secara default** saat membuat API key baru. Ini melanggar least-privilege dan memperbesar dampak kebocoran key. Rekomendasi: default kosong + preset per kasus pakai. **Severity: sedang** — layak jadi GitHub issue terpisah, bukan bagian Fase 2.

---

## 9. "Grill" — asumsi yang saya tantang

Bagian ini menantang premis, sesuai peran kritis yang Anda minta.

**G1. Temuan #5 Anda salah.** Anda menulis *"Notifications (inbox notifikasi personal) ditaruh di grup Administration — salah kategori."* Faktanya `src/app/dashboard/notifications/page.tsx` adalah **komposer admin** (`NotificationAdminPage`, `POST /api/notifications` dengan `broadcast`/`targetUserId`), dan `access-policy.ts:10` menaruhnya di `SUPERADMIN_DASHBOARD_PREFIXES`. Jadi kategorinya **benar** (operator tool di grup Administration). Yang benar-benar bermasalah: **labelnya menyesatkan** dan **inbox personal (`/dashboard/inbox`) tidak punya entri sidebar**. Arah perbaikan berbeda dari yang Anda usulkan — bukan memindahkan, tapi mengganti nama + menaikkan Inbox.

**G2. Apakah "Message Queue" perlu jadi menu tersendiri?** Anda menyebut batas Message Queue vs Broadcast vs Campaigns kabur. Tapi perhatikan: `message-queue` adalah **antrian kerja** (observability), sedangkan Broadcast/Campaigns adalah **pembuat pekerjaan** (authoring). Awam tidak perlu melihat antrian. **Usul saya: jadikan sub-tab di Perangkat**, bukan menu setara. Ini memangkas satu menu tanpa kehilangan fungsi.

**G3. Apakah `Campaigns` layak dipertahankan di permukaan tenant?** `campaigns/page.tsx` menjual "Segment, kunci target, snapshot penerima immutable, fallback device" — itu bahasa **CRM/marketing automation**, bukan gateway. Ini kandidat terkuat untuk ditandai operator-only atau dipensiunkan sejalan issue #37. **Saya tidak memutuskan sendiri** — ini keputusan produk Anda.

**G4. Apakah `Labels` masih punya alasan?** Fitur label = CRM-lite. Visi Anda: "bukan CRM". Namun label mungkin dipakai integrasi. **Perlu keputusan Anda** sebelum dipensiunkan.

**G5. Klaim "sudah benar" soal tidak ada UI chat.** Benar — dan `dashboard-feature-policy.test.ts:10-23` mengunci penghapusan chat. Bagus. Tapi `src/app/api/messages/[sessionId]/[jid]/{send,reply,forward,react,star,poll,media,contact,location,list}` masih hidup — itu **permukaan pengiriman**, bukan chat UI. Konsisten dengan visi. Tidak perlu diubah, hanya dicatat agar tidak dikira "sisa chat".

**G6. `data/media` setelah Fase 2.** Verifikasi saya: setelah commit `da92151`, **tidak ada lagi penulis ke `data/media` di seluruh `src/`**. Sisa referensi hanya di test (yang justru mengunci ketiadaan itu) dan `release-policy.test.ts` (yang mengizinkan `.gitkeep`). Klaim Anda "satu-satunya konsumen sisa: field fileUrl + endpoint download" **kurang lengkap** — ada penulis kedua di `store/index.ts` yang sudah saya cabut (lihat §10.1).

---

## 10. Lampiran — Eksekusi Fase 2 (sudah dijalankan)

**Branch:** `muse_ai-retire-eager-media-download` · **Commit:** `da92151` · **Diff:** 13 file, +88 / −1150

### 10.1 File diubah / dihapus

| Aksi | File | Ringkasan |
|---|---|---|
| **Dihapus** | `src/app/api/media/route.ts` | Hanya melayani Media Manager (mati) → dihapus |
| **Dihapus** | `src/app/api/media/[filename]/route.ts` | Thumbnail/preview Media Manager → dihapus |
| **Dihapus** | `src/app/dashboard/media/page.tsx` | Halaman Media Manager (544 baris) |
| **Diubah** | `src/lib/webhook.ts` | `downloadAndSaveMedia()` + helper yatim dihapus; `fileUrl` hilang dari `message.received`/`message.sent`; quoted tak lagi resolve media dari DB; param `existingFileUrl` & `sessionId` yatim dicabut; import yatim dicabut satu per satu (`downloadMediaMessage`, `writeFile`, `mkdir`, `path`, `runWithStorageQuota`, `safeFetchBuffer`) |
| **Diubah** | `src/modules/whatsapp/store/index.ts` | **Penulis kedua** `downloadAndSaveMedia` dicabut (baris lama 496) + `mediaUrl: null`; import yatim dicabut |
| **Diubah** | `src/app/api/messages/[sessionId]/download/[messageId]/media/route.ts` | → **410 Gone** (`code: "MEDIA_DOWNLOAD_RETIRED"`), disengaja |
| **Diubah** | `src/components/dashboard/sidebar-nav.tsx` | Entri Media Manager + import `HardDrive` dihapus |
| **Diubah** | `src/components/dashboard/mobile-nav.tsx` | Entri Media Manager + import `HardDrive` dihapus |
| **Diubah** | `src/lib/access-policy.ts` | `/dashboard/media` keluar dari `TENANT_DASHBOARD_PREFIXES`, masuk `REMOVED_DASHBOARD_FEATURE_PREFIXES` |
| **Diubah** | `src/lib/api-scope-policy.ts` | Mapping scope `/api/media` (kini mati) dihapus |
| **Diubah** | `src/lib/access-policy.test.ts` | Assertion disesuaikan (media → removed) |
| **Diubah** | `src/lib/whatsapp-sync-minimization.test.ts` | Invarian dibalik: "tidak pernah download media" |
| **Ditambah** | `src/lib/media-download-retirement.test.ts` | Regresi: halaman/route hilang, 410, tidak ada penulis `data/media` |

**Tidak disentuh** (sesuai larangan): `private-media-storage.ts`, `POST /api/v1/media`, `MediaPicker`, lampiran broadcast/campaign/autoreply/scheduler, `private-media-cleanup`. Tidak ada migrasi DB (`Message.mediaUrl` tetap nullable; baris lama dibiarkan).

### 10.2 Breaking change (dokumentasikan ke tenant)

1. **Webhook `message.received` & `message.sent` tidak lagi memuat field `fileUrl`.** Konsumen yang membaca `payload.fileUrl` akan mendapat `undefined`. Media sekarang harus diambil tenant dari WhatsApp langsung, atau diunggah sendiri lewat private media.
2. **Field `fileUrl` pada `quoted` juga dihilangkan.** Tipe `QuotedWebhookMessage` tidak lagi punya `fileUrl`.
3. **URL `/api/media/...` mati total** (route dihapus → 404).
4. **`GET /api/messages/{sessionId}/download/{messageId}/media` → 410 Gone** dengan body `{ code: "MEDIA_DOWNLOAD_RETIRED" }`. Pesan lama yang punya `mediaUrl` tidak lagi bisa diunduh.
5. **Menu "Media Manager" hilang** dari sidebar & nav mobile. `/dashboard/media` kini rute pensiun (ditolak untuk semua role).

### 10.3 Cara verifikasi Fase 2

| # | Skenario | Ekspektasi |
|---|---|---|
| a | Kirim pesan bermedia masuk ke sesi live | **Tidak ada file baru** di `data/media/`. Cek: `ls -la data/media/` → hanya `.gitkeep` |
| b | Amati webhook tenant | Payload `message.received` **tanpa** `fileUrl` (dan `quoted` tanpa `fileUrl`) |
| c | `curl -i .../api/messages/{sid}/download/{mid}/media` | **410 Gone**, body `MEDIA_DOWNLOAD_RETIRED` |
| d | Upload bukti bayar & gambar broadcast via `POST /api/v1/media` | **Normal** — tersimpan ke B2, tidak terpengaruh |
| e | Buka `/dashboard/media` | Rute pensiun — ditolak (`canAccessDashboardPath` → false) |
| f | Cari sisa penulis disk | `grep -rn '"data", "media"' src` → hanya di test yang mengunci ketiadaan |

### 10.4 Gates (semua dijalankan lokal, branch `da92151`)

| Gate | Hasil |
|---|---|
| `npm run typecheck` | **0 error** (setelah membersihkan cache tipe `.next/` yang usang) |
| `npm run lint` | **0 error** |
| `npm test` | **308/308 lulus**, 80 file |
| `npm run build` | **Sukses** (7 mnt). Artefak membuktikan `/api/media` & `/dashboard/media` hilang; route 410 ada |
| `git diff --check` | Bersih |
| `npm audit --omit=dev` | **9 kerentanan (4 moderate, 4 high, 1 critical)** — **pre-existing**, di dependency (`sharp`, `source-map-js`), tidak terkait perubahan ini |

### 10.5 Instruksi deploy (VPS)

> ⚠️ Branch di-commit di atas baseline `workbuddy-audit-hardening-2026-10`, **bukan** di atas `main`. Konfirmasi state VPS sebelum merge.

```bash
# 1. Di VPS: pastikan working tree bersih & catat commit saat ini (untuk rollback)
cd /path/ke/pesanpro
git rev-parse HEAD                      # ← SIMPAN hash ini sebagai titik rollback
git status --short                      # harus kosong

# 2. Tarik branch (atau merge setelah review Anda)
git fetch origin muse_ai-retire-eager-media-download
git merge --no-ff origin/muse_ai-retire-eager-media-download

# 3. Build & migrasi
npm ci                                  # atau npm install bila lockfile tak berubah
npm run build                           # WAJIB: route dihapus, build ulang
# Tidak ada migrasi DB di perubahan ini — JANGAN jalankan db:migrate

# 4. Restart PM2
pm2 restart pesanpro
pm2 logs pesanpro --lines 50            # pastikan tidak ada error route

# 5. Bersihkan sisa media lama (bom disk)
ls -la data/media/ | head              # catat jumlah file sebelum
find data/media -type f ! -name '.gitkeep' -delete
ls -la data/media/                      # harus hanya .gitkeep
```

**Dampak & konflik yang harus Anda ketahui sebelum merge:**

- **Konflik file:** jika VPS sudah punya perubahan lokal pada `src/lib/webhook.ts`, `src/modules/whatsapp/store/index.ts`, `sidebar-nav.tsx`, `mobile-nav.tsx`, `access-policy.ts`, atau `api-scope-policy.ts`, merge akan konflik. Selesaikan manual dengan mempertahankan cabang ini untuk file-file tersebut.
- **Route hilang saat runtime:** bila ada proses lain yang memanggil `/api/media/*` (mis. cron/integrasi tenant), akan mendapat 404. Sudah diverifikasi tidak ada konsumen internal selain Media Manager.
- **`data/media` lama:** baris `Message.mediaUrl` lama masih menunjuk `/api/media/...` yang kini 404. Ini **disengaja**; bersihkan disk di langkah 5.
- **`.workbuddy-ai/`** muncul sebagai untracked di working tree lokal saya. **Jangan** ikut di-commit; folder itu menyimpan data proyek, bukan cache.

### 10.6 Instruksi rollback

**Rollback cepat (belum di-merge, hanya ingin membatalkan di lokal):**

```bash
git checkout workbuddy-audit-hardening-2026-10   # kembali ke baseline
git branch -D muse_ai-retire-eager-media-download
```

**Rollback setelah deploy (VPS sudah menjalankan commit ini):**

```bash
# Opsi A — revert commit (aman, tidak menulis ulang riwayat)
cd /path/ke/pesanpro
git revert --no-commit da92151
git commit -m "revert: restore eager media download + Media Manager"
npm run build
pm2 restart pesanpro

# Opsi B — reset ke titik yang Anda catat di langkah 1
git reset --hard <HASH_SEBELUM_MERGE>
npm run build
pm2 restart pesanpro
```

**Catatan rollback:** mengembalikan kode akan **menyalakan kembali** kebocoran disk (`downloadAndSaveMedia` menulis ke `data/media` tanpa cleanup). Setelah rollback, pasang pembersih sementara (cron `find data/media -type f -mtime +7 -delete`) sampai perbaikan diluncurkan kembali.

---

## 11. Rekomendasi lanjutan (belum dieksekusi — menunggu keputusan Anda)

| Prioritas | Item | Alasan |
|---|---|---|
| **P0** | Retensi pesan (`MESSAGE_RETENTION_DAYS` + purge) | Isi percakapan plaintext tanpa batas waktu — inti visi gateway |
| **P1** | Terapkan proposal navigasi §8 | Skor kesederhanaan 4.2 → target 8 |
| **P1** | Scope API key default kosong + preset | Least-privilege (§8.3) |
| **P1** | Minimalkan `Contact.profilePic`/`data` | Minimisasi PII |
| **P2** | Putuskan nasib `Labels` & `Campaigns` (§9 G3/G4) | Selaras issue #37 |
| **P2** | `npm audit fix` untuk 9 kerentanan dependency | Pre-existing, terpisah dari audit ini |
| **P2** | Hapus endpoint `chats/by-label` & `contacts` bila Labels/Contacts dipensiunkan | Issue #37 |

---

*Dokumen ini adalah hasil Fase 1 (audit) + catatan eksekusi Fase 2. Semua klaim UX/IA berbasis source dengan `file:line`. Klaim runtime yang tidak dapat diverifikasi dari kode ditandai sebagai asumsi.*

---

# LAMPIRAN — Eksekusi Tindak Lanjut (10 Oktober 2026)

Branch: `muse_ai-retire-eager-media-download` · Baseline commit Fase 2: `da92151`

## L.1 Tier 1a — least-privilege API key (SELESAI)

**Temuan:** `src/app/dashboard/developer/page.tsx:38` membuat key baru dengan **semua 16 scope aktif** secara default.

**Perbaikan:** default jadi **kosong** (`useState<string[]>([])`) + tambah 3 preset ("Kirim pesan", "Kirim + terima event", "Baca saja") dan tombol "Kosongkan". Tombol Create sudah disabled saat scope kosong, sehingga pengguna **wajib** memilih secara sadar.

File: `src/app/dashboard/developer/page.tsx`.

## L.2 Tier 1b — IA + konsistensi bahasa (SELESAI)

Struktur navigasi baru (4 grup + 1 grup operator), label berbahasa Indonesia:

| Grup | Item |
|---|---|
| *(tanpa header)* | Ringkasan · Perangkat & QR |
| **Pengiriman** | Antrian Pesan · Kirim Massal · Kampanye · Label · Jadwal Kirim · Balasan Otomatis |
| **Integrasi** | Kunci API · Webhook |
| **Akun** | Tagihan · Pengaturan · Notifikasi *(Inbox)* |
| **Operasi** *(superadmin)* | Pengguna · Operasi Komersial · Monitor Sistem · Kirim Pengumuman |

Perubahan kunci: `Billing` **keluar** dari grup "Developer" → grup "Akun"; item `Developer` → **Kunci API** (menghapus tabrakan nama grup/item); grup "Data" (1 item) dibubarkan; `Notifications` → **Kirim Pengumuman** (kini akurat: itu komposer admin, bukan inbox); Inbox personal naik ke sidebar.

Grup **Operasi** ternyata persis sama dengan `SUPERADMIN_DASHBOARD_PREFIXES` — jadi untuk tenant, grup itu otomatis kosong dan sidebar tenant turun dari 16 → **12 item**. Tidak ada perubahan pada `access-policy.ts` (visibilitas sudah benar; hanya penyajian yang diubah).

File: `src/components/dashboard/sidebar-nav.tsx`, `src/components/dashboard/mobile-nav.tsx`.

## L.3 Tier 2 — mekanisme retensi PII (SELESAI, default NONAKTIF)

**Temuan:** `Message` tidak punya retensi (P0).

**Perbaikan:** `MESSAGE_RETENTION_DAYS` ditambahkan, **default `0` = nonaktif** (riwayat disimpan selamanya). Purge hanya berjalan bila nilainya > 0.

```env
MESSAGE_RETENTION_DAYS="0"   # set 30 (atau 90) untuk mengaktifkan purge
```

**Keputusan desain:** saya sengaja **tidak** memakai default 30. Anda menekankan "jangan merusak yang sudah jalan" — kalau defaultnya 30, deploy pertama akan langsung menghapus riwayat > 30 hari tanpa Anda memintanya. Dengan default 0, kode ini **tidak mengubah perilaku apa pun** sampai Anda menyalakannya. Mekanismenya sudah siap; aktivasi = satu baris env.

**`Contact` tidak ikut dipurge** — `CampaignRecipient` ber-FK ke `Contact`, jadi menghapus kontak akan merusak riwayat campaign. Retensi kontak masih terbuka dan butuh keputusan terpisah.

File: `src/lib/env.ts`, `src/lib/operations-maintenance.ts`, `.env.example`, `src/lib/operations-maintenance.test.ts`.

## L.4 Tier 3 — DIBLOKIR (butuh keputusan Anda)

**"Tier 3 sebagian" tidak dapat dijalankan dengan aman.** Labels bukan fitur mandiri — ia adalah **dimensi segmen Campaigns**:

| Bukti | Peran |
|---|---|
| `src/lib/segment-input.ts:19` | `labelIds: z.array(id).max(10).default([])` — ada di **skema validasi definisi segmen** |
| `src/lib/segment-service.ts:41-43` | Validasi kepemilikan label (`INVALID_SEGMENT_LABEL`) |
| `src/lib/segment-service.ts:92` | Query `prisma.chatLabel` untuk resolve kandidat segmen |
| `src/lib/segment-policy.ts:9` | Kompleksitas segmen menghitung `labelIds` |
| `src/app/dashboard/campaigns/page.tsx:104` | UI filter "WhatsApp labels" memanggil `/api/labels/{sessionId}` |
| `src/modules/whatsapp/**` | **Tidak ada** sinkronisasi label dari WhatsApp — label hanya lahir dari dashboard |

Konsekuensi: memensiunkan halaman Labels menyisakan filter "WhatsApp labels" di Segment builder yang **tidak akan pernah bisa diisi** — kontrol mati, melanggar prinsip "jangan merusak fungsi yang sudah jalan". Tidak ada penulis `data/media`-style alternatif; ini murni all-or-nothing dengan Campaigns.

**Butuh keputusan A/B/C** (lihat §9 G3/G4). Setelah Anda pilih, pekerjaan Tier 3 punya rencana sendiri (menyentuh `segment-input`, `segment-service`, `segment-policy`, halaman Campaigns + migrasi bila perlu).

## L.5 Status gates tindak lanjut

| Gate | Hasil |
|---|---|
| `npm run typecheck` | **0 error** |
| `npm test` (test terkait) | **28/28 lulus** — termasuk `segment-service` & `segment-policy` (bukti Campaigns utuh) |
| `npm run lint` | **Tidak dapat diverifikasi** — ESLint crash (exit 2) saat membaca `src/lib/broadcast-queue.test.ts` yang diblokir Security Center environment. Bukan regresi kode; file itu tidak disentuh |
| `npm run build` | Belum dijalankan ulang setelah tindak lanjut (dijalankan pada Fase 2) |

**Catatan:** perubahan Tier 1a/1b/2 belum di-commit. Lihat instruksi commit & rollback di §10.5–10.6.

