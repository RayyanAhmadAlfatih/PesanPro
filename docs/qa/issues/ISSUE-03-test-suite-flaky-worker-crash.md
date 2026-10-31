# ISSUE-03 — Suite test flaky: worker vitest crash pada sebagian run (klaim 315/315 tidak deterministik)

- **Severity:** Low
- **REQ:** (baseline / reliability, bukan REQ fungsional)
- **TC:** TC-000 (PASS dengan catatan)
- **Branch:** `workbuddy-audit-privacy-branding-2026-10-11` (HEAD `c6fbc9a`)

## Ringkasan

`npm test` (`vitest run --maxWorkers=1`) dijalankan dua kali dengan perintah identik. Run kedua lulus penuh (81/81 berkas, 315/315 test). Run pertama menampilkan `Test Files 80 passed (81)`, `Tests 311 passed (315)`, `Errors 1`, `Worker exited unexpectedly`. Artinya pada run tersebut 1 berkas dan 4 test **tidak pernah dieksekusi**, tetapi pelaporan tetap terlihat "hampir hijau".

## Bukti

Run 1 (bersamaan dengan aktivitas lokal lain yang berat):
```
Test Files  80 passed (81)
     Tests  311 passed (315)
    Errors  1 error
Caused by: Error: Worker exited unexpectedly
```

Run 2 (idle):
```
Test Files  81 passed (81)
     Tests  315 passed (315)
EXIT=0
```

Konfigurasi: `vitest.config.mjs` — `environment: "node"`, tanpa `pool`/`singleFork` eksplisit. Script: `"test": "vitest run --maxWorkers=1"`.

## Langkah reproduksi

1. Pastikan mesin dalam kondisi idle → `npm test` → lulus 315/315.
2. Jalankan `npm test` lagi sambil menjalankan beban CPU/IO berat lain (mis. build paralel).
3. Sebagian run akan menampilkan `Worker exited unexpectedly` dengan jumlah test < 315.

Catatan: crash tidak selalu terpicu; ini non-deterministik. Frekuensi teramati 1 dari 2 run di sesi ini, dengan run pertama bertepatan dengan aktivitas lokal berat.

## Dampak

- CI dapat merah pada pohon yang bersih, atau lebih berbahaya: **hijau sambil diam-diam melewati berkas** (4 test tidak jalan tetapi tidak ada `FAIL` per-test).
- Klaim "315/315 lulus" tidak dapat diperlakukan sebagai bukti deterministik sampai penyebab crash dihilangkan.
- Tidak memengaruhi runtime produksi; murni reliability pipeline.

## Catatan

Kemungkinan penyebab: tekanan resource (memori/IO) saat `--maxWorkers=1` memakai pool forks; kandidat pemicu adalah berkas uji berat (`payment-proof`, `private-media-storage`, `autoreply-simulation` yang memproses 5.000 event) atau komponen native (sharp/node-webpmux). Belum dipastikan penyebab akarnya; perlu run berulang terisolasi untuk menetapkannya.
