# ISSUE-05 — `src/proxy.ts` membelokkan 404 dan aset statis ke halaman login

- **Severity:** Medium (UX publik + SEO)
- **REQ:** — (temuan runtime VPS 2026-10-12, halaman publik)
- **Status:** **sudah diperbaiki** di branch ini (lihat §Perbaikan)
- **Catatan:** pre-existing, bukan dari branch audit (`src/proxy.ts` dan `middleware.ts` tidak diubah oleh branch audit)

## Ringkasan

Dua bug di `src/proxy.ts` menyebabkan halaman publik berperilaku salah:

1. **Setiap path yang tidak dikenal dibelokkan ke `/auth/login`**, sehingga 404 asli tidak pernah muncul.
2. **Aset statis hanya diizinkan di root**, sehingga file di subfolder (`/brand/*.png`, `/templates/*`) ikut dibelokkan ke login.

## Bukti (file:line, sebelum perbaikan)

**Bug 1 — default "require auth for everything else"** (`src/proxy.ts:161-167`):

```ts
// Default: require auth for everything else
const session = await auth();
if (!session?.user || session.user.accountActive === false) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
}
return NextResponse.next();
```

Path apa pun yang tidak masuk cabang sebelumnya (`/dashboard`, `/api/`, `/`, atau `publicRoutes`) jatuh ke sini. Pengunjung tanpa sesi → **redirect ke login**, bukan 404.

Efek samping lain yang ikut rusak: `/robots.txt`, `/sitemap.xml`, dan `/error` juga tidak pernah tampil (semuanya dibelokkan ke login).

**Bug 2 — aset statis hanya di root** (`src/proxy.ts:45-49`):

```ts
// Allow known static asset extensions in root path only (e.g. /vercel.svg)
const staticExtensions = [".svg", ".ico", ".png", ...];
if (pathname.lastIndexOf("/") === 0 && staticExtensions.some(ext => pathname.endsWith(ext))) {
    return NextResponse.next();
}
```

`pathname.lastIndexOf("/") === 0` hanya benar untuk path tanpa subfolder (`/vercel.svg`). Untuk `/brand/logo-lockup.png`, `lastIndexOf("/")` bernilai `6`, jadi kondisinya **false** → jatuh ke bug 1 → dibelokkan ke login.

## Langkah reproduksi

1. Buka `https://<domain>/halaman-tidak-ada` di jendela tanpa login.
2. Amati: URL berubah menjadi `/auth/login?callbackUrl=/halaman-tidak-ada`, bukan halaman 404.
3. Buka `https://<domain>/robots.txt` → juga dibelokkan ke login.
4. Minta langsung `https://<domain>/brand/logo-lockup.png` → dibelokkan ke login (bukan 200 image/png).

## Dampak

- Pengunjung yang salah ketik URL disuruh login, bukan diberi tahu halamannya tidak ada. Membingungkan dan terlihat seperti bug.
- `robots.txt` dan `sitemap.xml` tidak dapat dibaca crawler → **SEO terganggu**.
- Setiap aset di subfolder yang diminta langsung gagal. Ini juga menjelaskan gambar rusak **jika** browser meminta path mentah (lihat ISSUE-06 untuk jalur `next/image`).

## Perbaikan (sudah diterapkan)

`src/proxy.ts`:

1. Cek ekstensi statis tidak lagi mensyaratkan root, dan `.txt`/`.xml` ikut diizinkan:
   ```ts
   const staticExtensions = [".svg", ".ico", ".png", ".jpg", ".jpeg", ".webp", ".woff", ".woff2", ".ttf", ".txt", ".xml"];
   if (staticExtensions.some(ext => pathname.endsWith(ext))) {
       return NextResponse.next();
   }
   ```
2. Cabang default tidak lagi membelokkan ke login; Next.js dibiarkan merender halaman 404:
   ```ts
   // Everything left is either a public page or a path that does not exist.
   // Dashboard and API routes are handled above, so nothing here needs
   // protection.
   return NextResponse.next();
   ```

**Alasan aman:** semua route nyata sudah punya cabang sendiri (`/dashboard` wajib login, `/api/*` wajib sesi atau API key, `/` dan `/auth/*` publik). Yang tersisa hanyalah halaman publik (`/terms`, `/privacy`, `/error`, `/robots.txt`, `/sitemap.xml`) dan path yang memang tidak ada — keduanya tidak perlu dilindungi, dan yang tidak ada akan jadi 404.

**Verifikasi:** `npx tsc --noEmit` → 0 error · `npx vitest run src/proxy.health.test.ts` → 7/7 lulus · `npx eslint src/proxy.ts` → 0 error.

**Rollback:** `git checkout -- src/proxy.ts`
