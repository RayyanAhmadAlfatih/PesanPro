# QA 30 Okt 2026 — perbaikan title + L17-31 s.d. L17-44

## 1. Perbaikan: title browser tidak mengikuti app name

**Masalah (temuan L17-09):** form pengaturan menjanjikan "sidebar and browser
title", tetapi mengubah app name hanya mengubah sidebar. Title tab tetap
`PesanPro | Premium WhatsApp Gateway`.

**Sebab:** `src/app/layout.tsx` menyusun `metadata.title` dari
`process.env.APP_NAME` (env build-time), bukan dari `systemConfig.appName` di
database. Sidebar membaca DB (`src/app/dashboard/layout.tsx`), title tidak.

**Perbaikan (commit `89ce3de`):** `generateMetadata()` sekarang `async` dan
membaca `systemConfig.appName` lewat Prisma, dengan fallback ke `APP_NAME` /
`PesanPro` bila DB tidak tersedia (mis. saat build). Tidak ada cache, jadi
perubahan app name langsung terlihat setelah reload.

**Verifikasi:** `tsc --noEmit` bersih, `eslint` bersih. Verifikasi live menunggu
deploy (build `.next` + restart).

## 2. L17-31 s.d. L17-44 — pengumuman popup

Diuji lewat UI (browser Brave, superadmin) dan API (fetch terautentikasi).

| ID | Status | Bukti |
| --- | --- | --- |
| L17-31 | PASS | POST `publish:false` → DRAFT, `publishedAt` null |
| L17-32 | PASS | publish → popup muncul saat buka `/dashboard` |
| L17-33 | PASS | "Mengerti" + reload → popup tidak muncul |
| L17-34 | PASS | tab baru (sessionStorage kosong) tanpa popup → watermark server |
| L17-35 | PASS | publish baru → popup muncul lagi (versi 9.9.9) |
| L17-36 | PASS | edit tetap `publishedAt` lama → tidak muncul ulang |
| L17-37 | PASS | unpublish semua → 0 published, tab baru tanpa popup |
| L17-38 | PASS | ditunda di `/dashboard/sessions`, muncul di `/dashboard` |
| L17-39 | N/A | `CHANGELOG` kosong by design; sync `imported:0` |
| L17-40 | PASS | USER → `307` redirect `/dashboard`; API admin `403` |
| L17-41 | PASS | `400` "Link must be an in-app path" |
| L17-42 | PASS | `400` "At most 4 bullets" |
| L17-43 | PASS | iPhone 14 390x844: dialog 358px, tombol 44px, tanpa overflow |
| L17-44 | PASS | Escape menutup; Tab fokus "Mengerti" (ring 5px); Enter menutup |

**Catatan kecil (P3):** tombol Close (X) di dialog punya indikator fokus lebih
lemah (`outline:none`) dibanding tombol "Mengerti" yang punya ring jelas.

## 3. Kebersihan data

- Semua pengumuman uji (5 baris) sudah dihapus → `remainingAnnouncements: 0`.
- User uji `qa-l17-40@example.com` sudah dihapus → tidak ada di daftar user.
- Sistem kembali tanpa pengumuman aktif.
