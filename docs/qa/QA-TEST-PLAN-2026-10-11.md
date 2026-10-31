# QA Test Plan — PesanPro pre-launch (workbuddy-audit-privacy-branding-2026-10-11)

- Tanggal: 2026-10-11
- Target test: branch `workbuddy-audit-privacy-branding-2026-10-11` (HEAD `c6fbc9a`), folder lokal.
- Bukan `main`, bukan VPS. VPS masih kode lama (belum merge/pull/deploy). Tidak ada test ke production.
- Pendekatan: risk-based. Urutan eksekusi REQ-11 → 12 → 13 → 04 → 07 → 08, lalu sisanya.
- Teknik per case: equivalence partitioning, boundary value, state transition, negative testing.
- Lapisan: otomatis (unit/integration) → manual (batch) → ditunda. Paralel di mana mungkin.

## 0. Baseline (wajib, sebelum apa pun)

`npm test` dijalankan dua kali dengan perintah identik untuk membuktikan klaim "315/315", bukan mempercayainya.

| Run | Hasil | Catatan |
|---|---|---|
| Run 1 (bersamaan dengan aktivitas lokal berat) | `Test Files 80 passed (81)` · `Tests 311 passed (315)` · `Errors 1` · `Worker exited unexpectedly` | Worker vitest crash; 1 berkas + 4 test tidak pernah jalan |
| Run 2 (idle) | `Test Files 81 passed (81)` · `Tests 315 passed (315)` · `EXIT=0` | Lulus penuh |

Kesimpulan: klaim 315/315 **reproducible pada run bersih**, tetapi suite **flaky** (1 dari 2 run crash) → lihat BUG-03. Baseline dipakai untuk laporan: **315/315 lulus (run bersih)**.

## 1. Test plan (TC → REQ)

Format: `TC ID | REQ ID | Skenario | Teknik | Otomatis/Manual | Estimasi`.
Urutan baris mengikuti urutan risiko.

### Baseline

| TC ID | REQ ID | Skenario | Teknik | Otomatis/Manual | Estimasi |
|---|---|---|---|---|---|
| TC-000 | (baseline) | `npm test` lulus penuh & reproducible | Equivalence | Otomatis | 5m |

### REQ-11 — Auth & tenant isolation (risiko tertinggi)

| TC ID | REQ ID | Skenario | Teknik | Otomatis/Manual | Estimasi |
|---|---|---|---|---|---|
| TC-001 | REQ-11 | Tenant A tidak bisa akses session tenant B (`canAccessSession` mengembalikan false) | Negative | Otomatis | 10m |
| TC-002 | REQ-11 | SUPERADMIN tidak bypass kepemilikan device pelanggan | Negative | Otomatis | 5m |
| TC-003 | REQ-11 | Akun SUSPENDED ditolak sebelum query session | State transition | Otomatis | 5m |
| TC-004 | REQ-11 | Service layer (webhook/schedule/broadcast/autoreply/media) scope ke `tenantId` | Negative | Otomatis | 15m |
| TC-005 | REQ-11 | Route yang dihapus balas 404, bukan 500 | Negative | Manual | 15m |

### REQ-12 — Kirim pesan & broadcast

| TC ID | REQ ID | Skenario | Teknik | Otomatis/Manual | Estimasi |
|---|---|---|---|---|---|
| TC-006 | REQ-12 | `POST /api/v1/messages/text` valid → 202 masuk antrian | Happy path | Manual | 20m |
| TC-007 | REQ-12 | Idempotency-Key sama + payload sama → 200 idempotent | State transition | Otomatis | 10m |
| TC-008 | REQ-12 | Idempotency-Key sama + payload beda → 409 conflict | Negative | Otomatis | 10m |
| TC-009 | REQ-12 | Idempotency-Key absen / <8 char / karakter ilegal → 422 | Boundary value | Otomatis | 5m |
| TC-010 | REQ-12 | Transisi status pesan queued → sent → delivered → read | State transition | Manual | 30m |
| TC-011 | REQ-12 | Broadcast terkirim ke daftar recipient dengan status benar | Happy path | Manual | 30m |
| TC-012 | REQ-12 | Kuota habis → 429 `QUOTA_EXCEEDED` (reserve atomik) | Boundary value | Otomatis | 15m |
| TC-013 | REQ-12 | Cancel hanya boleh dari status QUEUED | State transition | Otomatis | 10m |

### REQ-13 — Verifikasi signature webhook

| TC ID | REQ ID | Skenario | Teknik | Otomatis/Manual | Estimasi |
|---|---|---|---|---|---|
| TC-014 | REQ-13 | Signature valid diterima | Happy path | Otomatis | 5m |
| TC-015 | REQ-13 | Signature palsu ditolak | Negative | Otomatis | 5m |
| TC-016 | REQ-13 | Timestamp basi (>300s) ditolak (`STALE_TIMESTAMP`) | Boundary value | Otomatis | 5m |
| TC-017 | REQ-13 | Replay eventId ditolak | Negative | Otomatis | 5m |
| TC-018 | REQ-13 | Header signature/timestamp/event-id hilang → `MISSING_HEADERS` | Negative | Otomatis | 5m |
| TC-019 | REQ-13 | URL webhook privat/localhost/port aneh ditolak (SSRF) | Negative | Otomatis | 10m |
| TC-020 | REQ-13 | Rotasi secret: secret lama masih valid sampai kedaluwarsa, lalu ditolak | State transition | Otomatis | 10m |

### REQ-04 — Message.content tidak pernah ditulis

| TC ID | REQ ID | Skenario | Teknik | Otomatis/Manual | Estimasi |
|---|---|---|---|---|---|
| TC-021 | REQ-04 | `prisma.message.create` tidak menyetel `content` (statik) | Negative | Otomatis | 5m |
| TC-022 | REQ-04 | Tidak ada penulis `content` di jalur runtime (statik) | Negative | Otomatis | 5m |
| TC-023 | REQ-04 | Auto-reply membaca teks hidup, bukan baris DB | Negative | Otomatis | 10m |

### REQ-07 — Retensi & purge

| TC ID | REQ ID | Skenario | Teknik | Otomatis/Manual | Estimasi |
|---|---|---|---|---|---|
| TC-024 | REQ-07 | `MESSAGE_RETENTION_DAYS=0` → `messageBefore=null`, tidak purge | Boundary value | Otomatis | 5m |
| TC-025 | REQ-07 | `=30` → purge hanya baris > 30 hari | Boundary value | Otomatis | 5m |
| TC-026 | REQ-07 | `=31` → boundary bergeser tepat 31 hari | Boundary value | Otomatis | 5m |
| TC-027 | REQ-07 | Contact & Group TIDAK di-purge (statik) | Negative | Otomatis | 5m |
| TC-028 | REQ-07 | QR basi (>1 jam) dibersihkan | Boundary value | Otomatis | 5m |
| TC-029 | REQ-07 | Validasi env: `MESSAGE_RETENTION_DAYS` di luar 0..3650 ditolak | Boundary value | Otomatis | 5m |

### REQ-08 — Welcome message sekali kirim

| TC ID | REQ ID | Skenario | Teknik | Otomatis/Manual | Estimasi |
|---|---|---|---|---|---|
| TC-030 | REQ-08 | Kontak baru dapat welcome tepat sekali | Happy path | Manual | 20m |
| TC-031 | REQ-08 | Kontak dengan `welcomedAt` terisi tidak dapat welcome ulang | Negative | Manual | 15m |
| TC-032 | REQ-08 | Setelah purge retensi (kontak kembali >30 hari) tidak welcome ulang | State transition | Manual | 30m |
| TC-033 | REQ-08 | Grup tidak pernah dapat welcome (tanpa baris Contact) | Negative | Manual | 15m |
| TC-034 | REQ-08 | Migrasi backfill `welcomedAt` jalan sebelum kode baru aktif | State transition | Manual | 30m |
| TC-035 | REQ-08 | Welcome ditandai SEBELUM kirim (crash → hilang, bukan ganda) | State transition | Otomatis (statik) | 10m |

### REQ-09 — API key scope

| TC ID | REQ ID | Skenario | Teknik | Otomatis/Manual | Estimasi |
|---|---|---|---|---|---|
| TC-036 | REQ-09 | UI: default pilihan scope kosong | Happy path | Otomatis (statik) | 10m |
| TC-037 | REQ-09 | 3 preset tersedia (Kirim pesan / Kirim+event / Baca saja) | Happy path | Manual | 5m |
| TC-038 | REQ-09 | Scope kosong ditolak saat buat key | Negative | Otomatis | 5m |
| TC-039 | REQ-09 | Scope sebagian → hanya scope itu yang lolos | Equivalence | Otomatis | 10m |
| TC-040 | REQ-09 | Scope penuh → semua endpoint scope lolos | Boundary value | Otomatis | 10m |
| TC-041 | REQ-09 | Endpoint POST tanpa `scopes` → key semua-scope (temuan BUG-02) | Negative | Otomatis | 10m |

### REQ-01 / 02 / 03 / 05 — Permukaan yang dipensiunkan

| TC ID | REQ ID | Skenario | Teknik | Otomatis/Manual | Estimasi |
|---|---|---|---|---|---|
| TC-042 | REQ-01 | `downloadAndSaveMedia` absen dari `src/` non-test | Negative | Otomatis (statik) | 5m |
| TC-043 | REQ-01 | `/api/media` hilang → 404 | Negative | Manual | 5m |
| TC-044 | REQ-02 | `/api/v1/media` ada dan melayani upload manual tenant | Happy path | Manual | 20m |
| TC-045 | REQ-03 | `/api/v1/contacts/*` & `contact-tags` absen | Negative | Otomatis (statik) | 5m |
| TC-046 | REQ-05 | Endpoint search pesan absen | Negative | Otomatis (statik) | 5m |

### REQ-06 / 10 — Webhook forward & privasi log

| TC ID | REQ ID | Skenario | Teknik | Otomatis/Manual | Estimasi |
|---|---|---|---|---|---|
| TC-047 | REQ-06 | Webhook forward isi pesan ke tenant, tidak disimpan | Happy path | Manual | 20m |
| TC-048 | REQ-10 | JID di-mask pada log (`628••••789@...`) | Happy path | Otomatis | 5m |
| TC-049 | REQ-10 | QR tidak disimpan setelah 1 jam / saat tidak QR_REQUIRED | Boundary value | Otomatis | 5m |

### REQ-14 / 15 / 16 — Media B2, billing, reset password

| TC ID | REQ ID | Skenario | Teknik | Otomatis/Manual | Estimasi |
|---|---|---|---|---|---|
| TC-050 | REQ-14 | Upload bukti bayar/gambar broadcast tersimpan (driver B2) | Happy path | Manual | 20m |
| TC-051 | REQ-14 | Media tenant-scoped; checksum mismatch → QUARANTINED | Negative | Otomatis | 10m |
| TC-052 | REQ-14 | Path traversal pada `storagePath` ditolak | Negative | Otomatis | 5m |
| TC-053 | REQ-15 | Kuota respek limit `consumed + reserved + amount > limit` | Boundary value | Otomatis | 15m |
| TC-054 | REQ-15 | GRACE_PERIOD membekukan fitur terbatas, read tetap | State transition | Otomatis | 15m |
| TC-055 | REQ-15 | Idempotency ledger mencegah kuota dobel | Negative | Otomatis | 10m |
| TC-056 | REQ-16 | Reset password terkirim via SMTP (temuan BUG-01) | Happy path | Manual | 20m |
| TC-057 | REQ-16 | Token sekali pakai, kedaluwarsa 30 menit, `sessionVersion` naik | State transition | Otomatis | 15m |
| TC-058 | REQ-16 | Anti user-enumeration: email tak dikenal tetap 200 | Negative | Otomatis | 5m |
| TC-059 | REQ-16 | Rate limit request 5/jam, consume 10/15m | Boundary value | Otomatis | 5m |

## 2. Traceability — requirement yang TIDAK ter-cover penuh

| REQ | Status traceability | Alasan |
|---|---|---|
| REQ-12 (status delivered/read) | PARTIAL | Butuh runtime Baileys + nomor WA nyata. Tidak ada DB/runtime di environment ini. |
| REQ-14 (upload nyata ke B2) | PARTIAL | Butuh kredensial B2 nyata. Diuji lewat transport tiruan (unit). |
| REQ-16 (SMTP end-to-end) | PARTIAL | Butuh SMTP server. Diuji lewat unit transport; temuan BUG-01. |
| REQ-01/03/05 (route 404) | PARTIAL | Verifikasi statik (ketiadaan file) dilakukan; verifikasi HTTP 404 butuh runtime. |
| REQ-08 (migrasi ke MySQL nyata) | PARTIAL | `prisma migrate deploy` tidak bisa dijalankan tanpa MySQL. Sintaks diperiksa manual. |
| REQ-06 (webhook sampai ke endpoint tenant) | PARTIAL | Butuh endpoint HTTPS publik. Diuji lewat simulasi/transport tiruan. |
| REQ-11 (E2E lintas tenant lewat HTTP) | PARTIAL | Isolasi diuji di level service (unit). Uji HTTP lintas tenant butuh runtime + 2 tenant. |

Tidak ada REQ yang 0% ter-cover; semua punya minimal verifikasi statik atau unit.

## 3. Asumsi eksplisit

1. Requirement REQ-01..REQ-16 adalah spec yang benar; deviasi kode = temuan.
2. "315/315" adalah klaim yang harus dibuktikan ulang, bukan kebenaran (dilakukan di §0).
3. Environment ini tidak punya `.env` (hanya `.env.example`), tidak punya MySQL, dan `next dev` crash `EPERM` saat menulis `.next/dev/types` (dicatat di memori kerja 2026-10-11). Karena itu lapisan manual/E2E sebagian besar BLOCKED.
4. Semua verifikasi "PASS" bersumber dari kode nyata atau test yang benar-benar dijalankan, bukan asumsi.
5. Temuan P1 lama (SSRF download media webhook, fallback API key plaintext, hapus label lintas tenant, session timeout tak terpakai) dianggap sudah fix di branch ini dan **tidak dilaporkan ulang**.
6. VPS berjalan kode lama; laporan ini hanya tentang branch audit.
7. Severity: High = memblokir launch / kebocoran / kehilangan data; Medium = fungsi rusak atau risiko nyata; Low = kualitas/reliability.
