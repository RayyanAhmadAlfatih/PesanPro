# ISSUE-04 — WhatsApp auth state gagal disimpan: `The provided value for the column is too long for the column's type. Column: encValue`

- **Severity:** High
- **REQ:** REQ-10 / REQ-11 (sesi WhatsApp & isolasi), dan langsung menyentuh tujuan launch ("pesan tidak terkirim", "nomor ke-ban")
- **TC:** temuan saat runtime VPS 2026-10-12 (bukan dari siklus QA lokal)
- **Status root cause:** **belum dipastikan** — butuh 2 query di VPS (lihat §Diagnostik)
- **Penting:** **BUKAN** akibat branch audit. Lihat §Atribusi.

## Ringkasan

Saat runtime VPS, error ini berulang terus di `logs/pm2-error.log`:

```
Invalid `prisma.authState.upsert()` invocation:
The provided value for the column is too long for the column's type. Column: encValue
{"tag":"Auth","message":"Error writing auth state: ..."}
```

Artinya state autentikasi WhatsApp (creds + Signal keys) **tidak bisa ditulis ke database**. Setiap kegagalan ditelan oleh `try/catch` dan hanya jadi log — aplikasi tetap terlihat sehat.

## Bukti (file:line)

- `src/modules/whatsapp/auth/usePrismaAuthState.ts:72-86` — `writeData()` memanggil `prisma.authState.upsert({ create/update: { encValue, iv, authTag } })`. Kegagalan ditangkap di `:83-85` dan hanya di-log (`logger.error("Auth", 'Error writing auth state:', error)`), tidak dilempar.
- `prisma/schema.prisma:1053-1063` — `model AuthState`, `encValue String? @db.Text` (MySQL TEXT, batas 65.535 **byte**).
- `prisma/migrations/20250825000000_gate0_init/migration.sql:151` — `encValue TEXT NULL`. Tidak ada migrasi lain yang meng-`ALTER` kolom ini.
- `src/lib/crypto.ts:19-32` — `encrypt()` mengembalikan `encrypted.toString("base64")`. Base64 memperbesar ~4/3, jadi plaintext > ~49 KB akan melewati batas TEXT.
- Log VPS: error yang sama sudah ada sejak **2026-10-09 09:41** (sebelum deploy branch audit).

## Atribusi — kenapa ini bukan dari branch audit

- `git diff --stat main..HEAD` untuk `src/modules/whatsapp/auth/`, `src/lib/crypto.ts`, dan `prisma/schema.prisma` → **hanya** `prisma/schema.prisma` yang berubah, dan itu **cuma** penambahan `Contact.welcomedAt`. File auth dan crypto **tidak disentuh**.
- Error identik muncul di log tanggal 2026-10-09, saat VPS masih menjalankan kode lama.

Kesimpulan: **bug pre-existing**, bukan regresi dari deploy ini.

## Diagnostik (jalankan di VPS, hasilnya menentukan fix)

```bash
# 1) Tipe kolom yang SEBENARNYA ada di DB VPS
mysql -u PesanPro -p pesanpro -e "SHOW COLUMNS FROM AuthState;"

# 2) Ukuran baris terbesar — kunci mana yang bikin gagal
mysql -u PesanPro -p pesanpro -e "SELECT sessionId, \`key\`, LENGTH(encValue) AS len FROM AuthState ORDER BY len DESC LIMIT 10;"
```

Dua kemungkinan, dan query di atas yang membedakannya:

| Kemungkinan | Tanda di hasil query | Arah fix |
|---|---|---|
| **A. Schema drift** — kolom di DB lebih kecil dari TEXT (mis. `varchar(191)`), walau migrasi bilang TEXT | `SHOW COLUMNS` menampilkan `varchar(...)`, bukan `text` | `ALTER TABLE AuthState MODIFY encValue MEDIUMTEXT NULL;` |
| **B. Nilai memang besar** — kolom sudah TEXT, tapi payload > ~49 KB | `SHOW COLUMNS` = `text`, dan `len` mendekati/melewati 65.535 | Naikkan ke `MEDIUMTEXT` (16 MB) **atau** simpan state besar di luar baris tunggal |

Hipotesis A lebih mungkin, karena riwayat skema VPS tidak bersih (ada migrasi untracked dari branch lain).

## Dampak

- State WhatsApp tidak tersimpan. Sesi tidak dapat dipulihkan dengan benar setelah restart; kredensial Signal (pre-key/session) hilang tiap kali ditulis.
- Indikasi kuat dari log: `Closing open session in favor of incoming prekey bundle` muncul berulang (`pm2-error.log`, 2026-10-12 10:56–11:01). Ini konsisten dengan sesi yang terus-menerus tidak punya state tersimpan. (Korelasi, bukan bukti pasti.)
- Risiko nyata terhadap tujuan launch: sesi tidak stabil → pesan gagal terkirim → dan pada ekstremnya berkontribusi pada ban nomor.
- Gagal senyap: tidak ada error yang terlihat pengguna, hanya di log.

## Langkah reproduksi

1. Deploy, lalu sambungkan (pairing) sebuah sesi WhatsApp.
2. Amati `pm2 logs pesanpro` / `logs/pm2-error.log`.
3. Error `encValue` muncul berulang setiap kali Baileys mencoba menyimpan creds/keys.

## Catatan

Perbaikan **belum** dilakukan: sesuai aturan kerja, bug dicatat sebagai issue dulu, tidak di-patch di luar scope siklus. Menunggu hasil diagnostik di atas untuk menentukan arah fix yang benar.
