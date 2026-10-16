# PesanPro — Fast Test Plan (risk-based, pre-launch)

**Tujuan:** menjalankan 400+ kasus roadmap `Roadmap-mentest-fitur.md` (Phase L0–L18)
jauh lebih cepat, **tanpa** memotong coverage di jalur kritis (auth, tenant
isolation, billing, keamanan).

**Prinsip yang dipakai**

1. **Risk-based, bukan urutan fase.** Kita tidak mengejar L0→L18 berurutan. Kita
   urutkan berdasar *dampak bila gagal* × *kemungkinan gagal*.
2. **Otomasi dulu.** Apa pun yang bisa dijalankan mesin (unit/integration/contract)
   diotomasi. Manual hanya untuk hal yang benar-benar butuh mata/manusia.
3. **Smoke dulu, lalu pendalaman.** Satu smoke pass cepat memvalidasi "sistem
   hidup", baru dalami per area.
4. **Batch manual.** Kasus manual yang sejenis digabung dalam satu sesi browser
   agar tidak bolak-balik setup.
5. **Parallel.** Test otomatis jalan paralel; verifikasi manual dibagi antar
   "aktor" (SUPERADMIN / USER-A / USER-B) dan dikerjakan berbarengan.
6. **Tidak ada jalan pintas** di Tier-0 (auth, tenant isolation, billing, security).

---

## 1. Risk tiering — memetakan 18 phase ke 4 tier

| Tier | Fokus | Phase roadmap | Alasan |
|---|---|---|---|
| **T0 — Blocker** | Auth, Tenant isolation/IDOR, Billing & quota, Security (SSRF/upload/secret) | L1, L2, L8, L14 (auth/scope), L16 (quota) | Satu kegagalan = tidak boleh launch. Ini gate keras. |
| **T1 — Revenue path** | WhatsApp session, Message queue, Broadcast, Media/B2, Webhook signature | L3, L6, L9, L13, L14 (idempotency/IP) | Inti produk. Gagal = pelanggan tidak bisa pakai. |
| **T2 — Fitur lanjutan** | Scheduler, Auto-reply, Campaign/Segment, Integrations | L10, L11, L12, L15 | Penting tapi ada degradasi yang bisa ditoleransi. |
| **T3 — Operasional & polish** | Dashboard, Settings, Notifications, System monitor, Resilience drill | L0, L17, L18 | Bisa diuji terakhir; sebagian butuh infra. |

---

## 2. Lapis eksekusi (layer) & estimasi waktu

Urutan eksekusi dari yang paling cepat & paling luas dampaknya.

| Lapis | Isi | Metode | Estimasi | Coverage |
|---|---|---|---|---|
| **L0 · Baseline otomatis** | typecheck, lint, `vitest run`, build, `npm audit`, `git diff --check` | mesin, paralel | ~8–15 mnt (sekali) | Seluruh 79 file test existing + static |
| **L1 · Verifikasi source jalur kritis** | Baca runtime path auth/tenant/quota/webhook/media, konfirmasi kontrol | review terarah + grep | ~60–90 mnt | L1,L2,L8,L13,L14,L16 (kontrol server-side) |
| **L2 · Test regresi baru** | Tulis unit/integration untuk celah yang belum tertutup | mesin | ~30–45 mnt | Mengubah kasus manual → otomatis |
| **L3 · Smoke live (read-only)** | `GET /api/health*`, `/`, `/terms`, `/privacy`, 404 | curl | ~5 mnt | L0-01..L0-15 |
| **L4 · Manual batch (browser)** | Auth flow, RBAC sidebar, session QR, chat/broadcast UI, billing UI | browser, 2–3 akun | ~3–4 jam dibatch | L1 UI, L2 UI, L3, L4, L5, L7, L9, L16, L17 |
| **L5 · Manual batch (device/WA)** | Scan QR, kirim/terima, delivery state, pairing code | HP + browser | ~1–2 jam | L3-11..L3-21, L4-01..L4-25, L5 |
| **L6 · Integrasi eksternal** | Google Forms, CF7/WooCommerce, SMTP reset | sandbox eksternal | ~1 jam | L15, L1-16..L1-22 |
| **L7 · Resilience drill (ditunda)** | restart worker/app, kill saat PROCESSING, backup/restore, webhook down→up | infra terkontrol | ~2–3 jam | L6, L18 — butuh environment staging |

**Total jalur cepat (L0–L2 + L3):** ± 2–3 jam untuk menutup **semua gate T0 yang
bisa diotomasi/verifikasi statis**, sebelum menyentuh browser.

---

## 3. Peta otomasi — apa yang jadi mesin vs manusia

### Otomatis (mesin)
- **Auth & password policy** — validasi schema register, policy password, rate-limit bucket, reset token single-use/expiry → *unit test*.
- **Tenant isolation / IDOR** — setiap lookup di-scope `tenantId`/`userId`; bisa diuji dengan Prisma mock / test container.
- **API key** — scope policy (`getRequiredApiScope`), hash-at-rest, IP allowlist, idempotency conflict → *unit test*.
- **Billing/quota** — `reserveUsage`/`commit`/`release`, batas `consumed+reserved+amount`, idempotency → *unit test*.
- **Webhook signature** — HMAC, toleransi ±300s, `timingSafeEqual`, replay → *unit test*.
- **Media/SSRF** — validasi URL, path traversal, size cap, magic-byte → *unit test*.
- **Queue durability** — claim atomicity, lease, attempts<maxAttempts, dead-letter → *unit test*.
- **Broadcast CSV/Spintax/policy** — parsing, dedupe, validasi → *unit test*.
- **Auto-reply policy** — matching EXACT/CONTAINS/REGEX, schedule, cooldown, chain depth → *unit test*.
- **Schedule policy** — cron, timezone, missed-run → *unit test*.
- **Segment policy** — filter AND, consent → *unit test*.

### Manual (manusia), dibatch
- Alur UI end-to-end (klik, redirect, toast, sidebar).
- Scan QR WhatsApp nyata & status real-time.
- Kirim/terima pesan nyata + delivery/read.
- Upload media dari browser → cek di B2.
- Billing UI (submit bukti bayar, approve/reject).
- Integrasi Google Forms / CF7 di sisi eksternal.

### Ditunda (butuh infra)
- Restart/kill worker saat ada queue (L6, L18).
- Backup & restore drill.
- Concurrent quota boundary dengan beban nyata.
- Webhook receiver down→up.

---

## 4. Urutan eksekusi yang disarankan (jalur cepat)

```
HARI 1 (otomasi + statis)
 1. L0  Baseline gates          → bukti PASS/FAIL mesin
 2. L1  Verifikasi source T0    → PASS/FAIL per kontrol (auth, tenant, quota, security)
 3. L2  Tambal regresi          → tutup celah otomasi
 4. L3  Smoke live read-only    → L0-01..L0-15

HARI 2 (manual batch, paralel antar akun)
 5. L4  Batch A: auth+RBAC (SUPERADMIN, USER-A, USER-B bersamaan)
 6. L5  Batch B: WhatsApp session + messaging (device)
 7. L6  Batch C: integrasi eksternal

HARI 3 (staging)
 8. L7  Resilience drill + backup/restore
```

---

## 5. Teknik percepatan konkret

1. **`vitest run --maxWorkers` dinaikkan** (dari `1` ke jumlah core-1) untuk run
   penuh; `--maxWorkers=1` hanya dipakai saat mengisolasi kegagalan.
2. **Smoke gate tunggal**: satu skrip curl menjalankan seluruh L0 read-only
   sekaligus, bukan 16 langkah manual.
3. **Fixture bersama**: buat helper seed (tenant A/B, session A/B, api key) sekali,
   pakai ulang di semua test integration.
4. **Contract test > E2E**: untuk webhook, API key, dan scope, uji kontrak
   fungsi (cepat, deterministik) alih-alih E2E browser.
5. **Batch manual dengan checklist tunggal**: satu sesi browser mengerjakan
   semua kasus yang butuh login SUPERADMIN; satu sesi untuk USER-A/B.
6. **Sensor otomatis**: skrip grep untuk memastikan tidak ada token/secret yang
   bocor di response/log (L18-21) dijalankan sebagai bagian gate, bukan manual.

---

## 6. Definisi "selesai" per lapis

| Lapis | Selesai bila |
|---|---|
| L0 | Semua gate hijau (atau kegagalan terbukti artefak environment, bukan kode) |
| L1 | Setiap kontrol T0 punya verdict PASS/FAIL/PARTIAL + bukti `file:line` |
| L2 | Celah otomasi kritis tertutup; test baru hijau |
| L3 | Semua endpoint read-only mengembalikan status yang diharapkan |
| L4–L6 | Setiap kasus roadmap punya verdict + bukti (HTTP/status/response/screenshot) |
| L7 | Restart/recovery/backup terbukti di staging |

---

## 7. Yang TIDAK dikompromikan (no shortcut)

- Auth: register/login/rate-limit/reset token/session invalidation.
- Tenant isolation: **setiap** resource lookup harus scoped; satu IDOR = blocker.
- Billing/quota: reservation atomic, tidak boleh overshoot/leak.
- Security: SSRF, path traversal, upload validation, secret at-rest, error tidak bocor.

---

## 8. Aturan siklus

- **Tidak ada perbaikan kode di tengah siklus test.** Semua temuan dicatat sebagai
  GitHub issue (severity + `file:line` + repro + dampak).
- Perbaikan dilakukan **setelah** siklus test selesai, minimal, reversible, hanya
  di file yang memang perlu.
- Branch/PR berprefix `workbuddy-xxx`.
