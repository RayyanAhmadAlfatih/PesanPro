# Tutorial QA Testing A–Z — Metode "Fast Risk-Based" (versi PesanPro)

Panduan lengkap, dari nol sampai handoff, untuk menguji aplikasi besar (400+ kasus) **jauh lebih
cepat** tanpa memotong coverage di jalur kritis. Ditulis berdasarkan siklus nyata di PesanPro
(Next.js 16 + React 19 + Prisma + Baileys, 117 route API, 79 file test).

> **Filosofi inti:** kita tidak mengejar urutan fase roadmap (L0→L18). Kita mengejar
> **dampak × kemungkinan gagal**. Otomasi dulu → verifikasi statis → smoke → manual terbatch →
> resilience ditunda. Tidak ada jalan pintas di **auth, tenant isolation, billing, keamanan**.

---

## Daftar isi

- [Bagian 0 — Prasyarat & setup environment](#bagian-0)
- [Bagian 1 — Fase R: Recon (memahami repo)](#bagian-1)
- [Bagian 2 — Fase G: Baseline gates otomatis](#bagian-2)
- [Bagian 3 — Fase S: Verifikasi source jalur kritis](#bagian-3)
- [Bagian 4 — Fase M: Smoke live read-only](#bagian-4)
- [Bagian 5 — Fase B: Uji manual terbatch](#bagian-5)
- [Bagian 6 — Fase T: Tulis regression test baru](#bagian-6)
- [Bagian 7 — Fase I: Catat temuan jadi GitHub issue](#bagian-7)
- [Bagian 8 — Fase F: Siklus perbaikan (fix)](#bagian-8)
- [Bagian 9 — Fase V: Verifikasi akhir & handoff](#bagian-9)
- [Lampiran A — Template siap pakai](#lampiran-a)
- [Lampiran B — Troubleshooting environment](#lampiran-b)
- [Lampiran C — Cheat sheet perintah](#lampiran-c)

---

<a name="bagian-0"></a>
## Bagian 0 — Prasyarat & setup environment

### 0.1 Prasyarat

| Kebutuhan | Catatan |
|---|---|
| Node.js | Versi sesuai `engines`/runtime proyek (PesanPro: Node 22) |
| npm | Untuk install & audit |
| Git | Branch kerja berprefix `workbuddy-xxx` |
| Akses DB (opsional) | Hanya perlu bila menjalankan app/worker; test unit PesanPro tidak butuh DB nyata |
| Akses domain live (opsional) | Hanya untuk smoke read-only |
| `gh` CLI atau GitHub connector | Untuk membuat issue; kalau tidak ada, siapkan file body siap-tempel |

### 0.2 Setup awal (sekali per sesi)

```bash
# 1. Masuk ke folder proyek & pastikan branch kerja
git status
git checkout -b workbuddy-qa-<tahun-bulan>     # bila belum ada

# 2. Install dependency
npm install

# 3. PENTING: generate Prisma Client secara manual
npx prisma generate
```

> **Kenapa `prisma generate` manual?** Di banyak environment, postinstall `@prisma/client`
> tidak berjalan (mis. gagal karena file ter-lock). Akibatnya `tsc` meledak dengan ratusan error
> palsu seperti `Module '"@prisma/client"' has no exported member 'Prisma'`. Itu **artefak
> environment**, bukan bug kode. Jalankan `prisma generate` → typecheck hijau.

### 0.3 Verifikasi toolchain

```bash
npx tsc --version
npx eslint --version
npx vitest --version
npx next --version
```

Kalau ada yang error `could not be found` (mis. esbuild), install belum tuntas → ulangi `npm install`.

---

<a name="bagian-1"></a>
## Bagian 1 — Fase R: Recon (memahami repo sebelum menyentuh apa pun)

Tujuan: tahu **apa yang harus diuji** dan **di mana buktinya**, dalam ≤ 15 menit.

### 1.1 Peta cepat repo

```bash
# Struktur atas
ls -la

# Semua route API (permukaan serang utama)
find src/app/api -name "route.ts" | sort | wc -l
find src/app/api -name "route.ts" | sort

# Semua file test yang sudah ada (jangan ulangi yang sudah tertutup)
find src -name "*.test.ts" -o -name "*.test.tsx" | sort | wc -l

# Skema DB (sumber kebenaran invariant tenant/kuota)
grep -n "^model " prisma/schema.prisma
```

### 1.2 Baca dokumen kunci

- `AGENTS.md` → aturan proyek, invariant non-negotiable, gerbang wajib.
- `DESIGN.md` → sumber kebenaran UI (bila menguji UI).
- `AUDIT-REPORT-*.md` + `docs/*issues*.md` → temuan lama. **Verifikasi status fix, jangan lapor ulang.**
- Roadmap test (mis. `Roadmap-mentest-fitur.md`) → daftar kasus; akan kita remap ke tier risiko.

### 1.3 Keluaran Fase R

- Daftar route + jumlah test existing.
- Daftar temuan lama beserta status (fixed/open).
- Peta 18 phase roadmap → 4 tier risiko (lihat Bagian 3.1).

---

<a name="bagian-2"></a>
## Bagian 2 — Fase G: Baseline gates otomatis

Tujuan: bukti "kondisi awal" sebelum menyentuh kode. Jalankan **semua** dan catat hasil mentah.

```bash
npx tsc --noEmit                 # typecheck
npx eslint .                     # lint
npx vitest run --maxWorkers=1    # test (mulai dari 1 worker agar deterministik)
npx next build --webpack         # build produksi
npm audit                        # semua dependency
npm audit --omit=dev             # KHUSUS runtime produksi (ini yang paling penting)
git diff --check                 # whitespace/conflict
```

**Cara membaca hasil:**

| Gate | Hijau bila | Kalau merah |
|---|---|---|
| typecheck | exit 0, 0 error | Cek dulu apakah karena Prisma belum di-generate |
| lint | exit 0 | Perbaiki sebelum lanjut (bukan temuan QA, tapi blocker) |
| vitest | `N passed`, 0 `failed` | Pisahkan kegagalan nyata vs artefak teardown (lihat Lampiran B) |
| build | exit 0, ada `.next/BUILD_ID` | Cek apakah gagal karena shim cleanup atau kode |
| `npm audit --omit=dev` | 0 critical, 0 high | Ini temuan **High** → masuk daftar issue |

**Jalankan paralel** untuk hemat waktu: typecheck + lint bersamaan (keduanya ringan), lalu test,
lalu build. Gunakan `run_in_background` untuk perintah panjang.

---

<a name="bagian-3"></a>
## Bagian 3 — Fase S: Verifikasi source jalur kritis (inti kecepatan)

Ini pengganti ratusan test manual: **baca jalur runtime-nya** dan pastikan kontrolnya ada.

### 3.1 Petakan roadmap → 4 tier risiko

| Tier | Fokus | Kenapa |
|---|---|---|
| **T0 — Blocker** | Auth, Tenant isolation/IDOR, Billing & kuota, Keamanan (SSRF/upload/secret) | Satu gagal = tidak boleh launch |
| **T1 — Revenue** | Sesi WhatsApp, Message queue, Broadcast, Media/B2, Webhook signature | Inti produk |
| **T2 — Lanjutan** | Scheduler, Auto-reply, Campaign/Segment, Integrasi | Ada degradasi yang bisa ditoleransi |
| **T3 — Operasional** | Dashboard, Settings, Notifikasi, Resilience drill | Terakhir; sebagian butuh infra |

### 3.2 Checklist verifikasi per area (T0 wajib)

**Auth**
- [ ] Validasi input register (schema/zod) & policy password.
- [ ] Rate limit login/register/reset (kunci = IP/email, bukan yang bisa dipalsukan).
- [ ] Login tidak membocorkan keberadaan akun (respons seragam).
- [ ] Token reset: hash-at-rest, single-use, TTL, **divalidasi sebelum kerja mahal (bcrypt)**.
- [ ] Invalidasi sesi via `sessionVersion`/`status` dicek tiap request.
- [ ] Tidak ada config timeout mati.

**Tenant isolation / IDOR**
- [ ] Setiap lookup resource di-scope `tenantId`/`userId`.
- [ ] Cross-tenant id → 403/404 seragam (tidak membocorkan eksistensi).
- [ ] Role tidak mem-bypass ownership (mis. superadmin tetap tidak bisa baca device tenant lain).
- [ ] Operasi tulis (update/delete) **dan** baca ber-scope.

**Billing / kuota**
- [ ] Reservasi kuota atomic (serializable + retry P2034).
- [ ] Cek batas `consumed + reserved + amount ≤ limit`.
- [ ] Reservasi tidak pernah "yatim" saat settle/delete gagal.
- [ ] Semua objek storage (media, bukti bayar) dihitung ke entitlement.

**Keamanan**
- [ ] SSRF: semua fetch URL yang dipengaruhi user lewat guard (allowlist + validasi DNS + redirect).
- [ ] Path traversal: sanitasi `basename` + charset + assert containment sebelum tulis file.
- [ ] Upload: magic-byte vs MIME, allowlist, cap ukuran **saat streaming** (bukan setelah buffer).
- [ ] Secret: tidak ada hardcoded; logger meredaksi token/secret; error publik tidak bocorkan detail.
- [ ] Dependency: `npm audit --omit=dev` bersih dari critical/high.

### 3.3 Cara mencatat bukti

Setiap kontrol → satu baris: **verdict + `file:line`**.

```
| Kontrol                        | Bukti                          | Verdict |
|--------------------------------|--------------------------------|---------|
| Login rate limit 5/15mnt       | src/lib/auth.ts:30             | PASS    |
| Reset token divalidasi dulu    | src/lib/password-reset.ts:98   | PASS    |
| Label remove di-scope session  | labels/[jid]/labels/route.ts:87| PASS    |
| reconcileCampaign tanpa tenant | campaign-queue.ts:206          | PARTIAL |
```

> Verdict: **PASS / FAIL / PARTIAL / BLOCKED / NOT TESTED**. Jangan pakai "OK" tanpa bukti.

---

<a name="bagian-4"></a>
## Bagian 4 — Fase M: Smoke live read-only

Validasi cepat bahwa sistem "hidup". **Hanya GET/HEAD**, jangan ada mutasi.

```bash
BASE="https://<domain-anda>"
for p in "/" "/api/health/live" "/api/health/ready" "/terms" "/privacy" \
         "/robots.txt" "/sitemap.xml"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "$BASE$p")
  echo "GET $p -> $code"
done

# 404 custom
curl -s -o /dev/null -w "GET /random-xyz -> %{http_code}\n" "$BASE/random-xyz"

# Tidak ada kebocoran file sensitif
for f in "/.env" "/.git/config" "/prisma/schema.prisma"; do
  curl -s -o /dev/null -w "$f -> %{http_code}\n" "$BASE$f"
done

# Header keamanan
curl -sI "$BASE/" | grep -iE "strict-transport|x-frame|x-content-type|content-security|referrer-policy|permissions-policy"

# Error tidak bocorkan stack trace
curl -s -w "\nHTTP %{http_code}\n" "$BASE/api/v1/messages"        # tanpa auth
curl -s -w "\nHTTP %{http_code}\n" "$BASE/api/v1/media" -H "x-api-key: invalid"
```

**Yang dinilai:** status 200/401/404 sesuai desain, header keamanan ada, tidak ada stack trace,
tidak ada file sensitif terekspos.

> ⚠️ **Jangan** menjalankan uji yang mengonsumsi rate limit global (mis. banyak request
> `/api/auth/register`) sebelum Anda memastikan `TRUST_PROXY` benar — kalau salah, bucket
> per-IP bisa runtuh jadi global dan memblokir user nyata.

---

<a name="bagian-5"></a>
## Bagian 5 — Fase B: Uji manual terbatch

Prinsip: **satu sesi browser = satu peran**, kerjakan semua kasus peran itu sekaligus.

| Batch | Peran | Cakupan |
|---|---|---|
| A | SUPERADMIN | Kelola user, plan, verifikasi bayar, system monitor, settings |
| B | USER-A | Register→login, buat sesi WA, kirim pesan, broadcast, media, API key, webhook |
| C | USER-B | **Tenant isolation**: coba akses resource A pakai id milik A → harus 403/404 |
| D | Device/HP | Scan QR, kirim/terima nyata, status delivery/read, pairing code |
| E | Eksternal | Google Forms/CF7/WooCommerce, reset password via SMTP |

**Aturan batch:**
1. Siapkan data seed (tenant A/B, sesi, API key) **sekali**.
2. Untuk tiap kasus, catat: ID, aksi, hasil diharapkan, hasil nyata, bukti (status/response/screenshot).
3. Batch C (isolation) **wajib** — ini jalur yang paling sering bocor dan paling berbahaya.

---

<a name="bagian-6"></a>
## Bagian 6 — Fase T: Tulis regression test baru

Setiap kali Anda **mengubah perilaku**, tambah test. Ini yang mengubah kasus manual jadi otomatis
permanen.

### 6.1 Pola mock tanpa DB (PesanPro style)

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ dbCall: vi.fn() }));

vi.mock("./prisma", () => ({ prisma: { model: { updateMany: mocks.dbCall } } }));

import { fungsiYangDiuji } from "./modul";

describe("perilaku yang diubah", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dbCall.mockResolvedValue({ count: 1 });
  });

  it("menegakkan invariant baru", async () => {
    const hasil = await fungsiYangDiuji(/* input */);
    expect(hasil).toEqual(/* ekspektasi */);
    expect(mocks.dbCall.mock.calls[0][0].where).toMatchObject(/* scope tenant dsb */);
  });
});
```

### 6.2 Tips

- Mock di level modul (`./prisma`, `./storage-quota`) agar test tetap murni unit.
- Untuk route handler, mock dependensi lalu panggil `GET()`/`POST()` langsung.
- Uji **failure path**, bukan hanya happy path.
- Kalau menambah wrapper baru (mis. kuota) pada fungsi yang sudah punya test, tambahkan stub
  di test lama alih-alih mengubah logika test.

---

<a name="bagian-7"></a>
## Bagian 7 — Fase I: Catat temuan jadi GitHub issue

**Aturan keras: JANGAN patch di tengah siklus test.** Kumpulkan dulu.

### 7.1 Format issue wajib

```
## [SEVERITY] Judul singkat
**Severity:** High | Medium | Low
**Labels:** security, bug, tenant-isolation, ...
**Bukti:** file:line (dengan potongan kode sebelum fix)
**Reproduksi:** langkah / perintah curl konkret
**Dampak:** apa yang bisa terjadi kalau tidak diperbaiki
**Fix yang disarankan:** arah perbaikan minimal
```

### 7.2 Kalau `gh` tidak tersedia

Tulis semua body ke satu file (`qa/GITHUB-ISSUES.md`) sebagai **siap-tempel**, lalu:
- Aktifkan konektor GitHub, atau
- Install `gh` → `gh issue create --title "..." --body-file issue.md`.

### 7.3 Klasifikasi severity

| Severity | Kriteria |
|---|---|
| **High** | RCE/SSRF/auth bypass/IDOR lintas tenant/DoS mudah, atau data hilang |
| **Medium** | Kebocoran informasi, weakness yang butuh kondisi tertentu, bug billing |
| **Low** | Hardening, observability, performa, housekeeping |

---

<a name="bagian-8"></a>
## Bagian 8 — Fase F: Siklus perbaikan (fix)

Baru sekarang sentuh kode. Aturan: **minimal, aman, reversible, hanya file yang perlu.**

### 8.1 Urutan

1. Perbaiki dari severity tertinggi → terendah.
2. Satu file = satu tanggung jawab perubahan; file terkait boleh ikut bila memang perlu.
3. **Jangan** refactor/rename kode yang sudah bekerja.
4. Tambah/perbarui regression test untuk perilaku yang berubah.
5. Jalankan ulang **semua** gate setelah tiap blok perubahan.

### 8.2 Contoh pola perbaikan aman

- **Wrapper akuntansi yang hilang** → bungkus operasi dengan helper yang sudah ada (`runWithStorageQuota`),
  lalu lepaskan saat delete.
- **Rate limit terlalu luas** → tambahkan scope (`tenantId`) ke key.
- **Retry tanpa batas** → tambahkan cap attempt + backoff (tahan lease alih-alih lepas lock).
- **Predikat tenant hilang** → `findUnique` → `findFirst` ber-`tenantId`, `update` → `updateMany` ber-`tenantId`.
- **`catch {}` senyap** → ganti dengan `logger.error`.
- **Header keamanan hilang** → tambahkan `headers()` di config (mulai dari `frame-ancestors` saja
  agar tidak mematahkan script inline Next.js).

### 8.3 Kapan MENUNDA (dan katakan terus terang)

Tunda bila perbaikan menuntut salah satu ini — sebutkan alasannya di ringkasan:
- Mengubah **kontrak API publik** atau UX terdokumentasi (butuh keputusan produk).
- Mengubah **skema DB** (butuh migrasi + verifikasi upgrade).
- **Merestrukturisasi jalur yang sudah bekerja** (risiko regresi > manfaat).
- Tidak ada fix upstream (mis. advisory tanpa rilis patch) dan tidak terekpos.

---

<a name="bagian-9"></a>
## Bagian 9 — Fase V: Verifikasi akhir & handoff

```bash
npx tsc --noEmit
npx eslint .
npx vitest run --maxWorkers=1
npx next build --webpack
npm audit --omit=dev
git diff --check
git diff --stat          # pastikan hanya file yang relevan yang berubah
```

### 9.1 Paket handoff

| Dokumen | Isi |
|---|---|
| `qa/FAST-TEST-PLAN.md` | Strategi + urutan + estimasi waktu |
| `qa/TEST-REPORT.md` | Verdict per area + bukti |
| `qa/GITHUB-ISSUES.md` | Body issue siap-file |
| `qa/CHANGE-SUMMARY.md` | Ringkasan perubahan + cara verifikasi tiap fix |

### 9.2 Aturan pelaporan (dari `AGENTS.md`)

- Pisahkan **hasil terverifikasi** dari **asumsi tersisa**.
- Jangan klaim "siap produksi" tanpa bukti runtime produksi, restart drill, cek isolasi tenant,
  dan bukti backup/restore.
- Sebutkan apa yang **belum** diuji beserta alasannya.

---

<a name="lampiran-a"></a>
## Lampiran A — Template siap pakai

### A.1 Baris hasil test

```
| ID     | Aksi                  | Diharapkan        | Nyata            | Verdict | Bukti            |
|--------|-----------------------|-------------------|------------------|---------|------------------|
| L1-12  | Login email tak ada   | 401 seragam       | 401 seragam      | PASS    | curl + respons   |
| L2-04  | Akses sesi tenant B   | 403/404           | 403              | PASS    | screenshot       |
| L9-07  | Broadcast 5rb nomor   | ≤ batas waktu     | timeout 30s      | FAIL    | log worker       |
```

### A.2 Body issue (High)

```markdown
## [HIGH] <judul>
**Severity:** High
**Labels:** security, <area>

### Bukti
`src/lib/<file>.ts:NN`
```ts
<potongan kode sebelum fix>
```

### Reproduksi
```bash
<perintah curl / langkah>
```

### Dampak
<konsekuensi konkret>

### Fix yang disarankan
<arah minimal>
```

### A.3 Ringkasan perubahan

```markdown
### <file>
**Temuan:** <ID>
<apa yang diubah dan mengapa, 1–3 baris>
**Verifikasi:** <perintah / langkah>
```

---

<a name="lampiran-b"></a>
## Lampiran B — Troubleshooting environment

| Gejala | Penyebab | Solusi |
|---|---|---|
| `tsc` error `@prisma/client has no exported member 'Prisma'` | Prisma Client belum di-generate | `npx prisma generate` |
| `vitest` gagal di `afterAll`/`afterEach` dengan `safe-delete ... ETIMEDOUT` / `SAFE_DELETE_BULK_CONFIRM_REQUIRED` | Shim penghapus file environment memblokir `rm -rf` teardown | Artefak environment. Jalankan file test itu **terisolasi** untuk membuktikan lulus |
| `next build` gagal `SAFE_DELETE_BULK_CONFIRM_REQUIRED` saat cleanup `.next` | Shim membatasi jumlah penghapusan per-turn (mis. 50) | Jalankan build dengan guard dimatikan **untuk perintah itu saja**; build hanya menghapus `.next` (output, bukan data user) |
| `npm install` sangat lambat (10–20 mnt) | Postinstall native (prisma engines, esbuild, sharp) | Sabar; jalankan `run_in_background`. Kalau `EBUSY` di binary Node → ulangi install |
| `gh: command not found` | GitHub CLI tidak terpasang | Pakai file body siap-tempel atau konektor GitHub |
| NextAuth login uji via curl selalu 302/400 | Perlu alur CSRF | GET `/api/auth/csrf` dulu, pakai cookie + `csrfToken` ke `/api/auth/callback/credentials` |
| `npm audit` tinggi di dev-only | Rantai dev (eslint-config-next, patch-package) | Ukur dengan `npm audit --omit=dev` untuk menilai risiko produksi |

**Prinsip:** selalu **bedakan artefak environment dari kegagalan kode** dengan menjalankan ulang
kasus terkait secara terisolasi, dan laporkan perbedaannya.

---

<a name="lampiran-c"></a>
## Lampiran C — Cheat sheet perintah

```bash
# --- Setup ---
npm install && npx prisma generate

# --- Gerbang wajib ---
npx tsc --noEmit
npx eslint .
npx vitest run --maxWorkers=1
npx next build --webpack
npm audit --omit=dev
git diff --check

# --- Jalankan 1 test terisolasi (bukti artefak) ---
npx vitest run src/lib/<file>.test.ts --maxWorkers=1

# --- Recon ---
find src/app/api -name "route.ts" | sort          # daftar route
find src -name "*.test.ts" | wc -l                # jumlah test
grep -rn "catch {" src/ | head                    # cari swallow error
grep -rn "findUnique({ where: { id" src/ | head   # calon IDOR

# --- Smoke live ---
BASE="https://<domain>"
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/api/health/ready"
curl -sI "$BASE/" | grep -iE "x-frame|x-content-type|content-security"

# --- Handoff ---
git diff --stat
git add -A && git commit -m "test+fix: QA hardening (<tanggal>)"
```

---

## Estimasi waktu (jalur cepat)

| Fase | Estimasi | Catatan |
|---|---|---|
| Setup + recon | 20–30 mnt | Sekali per sesi |
| Baseline gates | 15–30 mnt | Paralel; build paling lama |
| Verifikasi source T0 | 60–90 mnt | Pengganti ratusan test manual |
| Smoke live | 5 mnt | Read-only |
| Manual terbatch | 3–6 jam | Paralel antar peran |
| Regression test | 30–45 mnt | Untuk tiap perubahan |
| Fix + verifikasi | 1–3 jam | Tergantung jumlah temuan |
| Resilience drill | 2–3 jam | Ditunda, butuh staging |

**Total jalur cepat (T0 tertutup penuh): ± 3–4 jam** sebelum menyentuh browser.
