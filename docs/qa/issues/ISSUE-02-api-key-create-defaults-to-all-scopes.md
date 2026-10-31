# ISSUE-02 — Endpoint buat API key menerima `scopes` kosong dan diam-diam memberikan SEMUA scope

- **Severity:** Medium
- **REQ:** REQ-09 ("API key baru: default scope kosong + 3 preset")
- **TC:** TC-041 (FAIL)
- **Branch:** `workbuddy-audit-privacy-branding-2026-10-11` (HEAD `c6fbc9a`)

## Ringkasan

UI memaksa pemilihan scope (default kosong, minimal 1). Tetapi endpoint yang sama menerima permintaan tanpa `scopes`, dan service lalu jatuh ke `DEFAULT_API_KEY_SCOPES` yang berisi **seluruh 16 scope**. Jadi caller yang memanggil endpoint langsung dapat membuat kredensial dengan hak maksimum, bertentangan dengan least privilege dan REQ-09.

## Bukti (file:line)

- `src/app/api/user/api-keys/route.ts:17` — `scopes: z.array(z.enum(API_KEY_SCOPES)).min(1).max(...).optional()` → boleh tidak dikirim.
- `src/lib/api-key-service.ts:28` — `export const DEFAULT_API_KEY_SCOPES: ApiKeyScope[] = [...API_KEY_SCOPES];` (semua scope).
- `src/lib/api-key-service.ts:113` — `const scopes = validateScopes(input.scopes ?? DEFAULT_API_KEY_SCOPES);`
- `src/lib/api-key-service.ts:69-73` — `validateScopes` hanya menolak bila `parsed.length === 0`; karena default berisi 16 scope, validasi lolos.

## Langkah reproduksi

1. Login sebagai tenant (session cookie).
2. `POST /api/user/api-keys` dengan body `{ "name": "Audit key" }` (tanpa `scopes`).
3. Respons `201` berisi `data.scopes` = 16 scope (device/message/media/schedule/broadcast/campaign/autoreply/webhook, read+write).

Alternatif: kirim `"scopes": []` → ditolak `400` (karena `min(1)`); tetapi menghilangkan field sepenuhnya justru lolos dengan semua scope.

## Dampak

- Kredensial over-privileged tanpa peringatan. Jika bocor, dampak lintas fitur (kirim pesan, broadcast, baca media, kelola webhook).
- Melanggar secure defaults / least privilege yang menjadi prinsip keamanan wajib.
- Tidak cross-tenant (tetap milik tenant pemanggil), sehingga severity Medium, bukan High.

## Catatan

UI (`src/app/dashboard/developer/page.tsx:44,123`) sudah benar: `useState<string[]>([])` dan tombol submit `disabled` saat kosong. Celah hanya di jalur API langsung.
