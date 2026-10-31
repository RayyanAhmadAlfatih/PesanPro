# Prompt Maskot PesanPro (burung merpati)

Dokumen ini berisi prompt siap tempel untuk membuat maskot PesanPro. Prompt ditulis
dalam bahasa Inggris karena model gambar mengikuti instruksi anatomi dan gaya jauh
lebih patuh dalam bahasa Inggris.

**Palet yang dipakai (jangan diubah, ini dari DESIGN.md):**

| Peran | Hex |
|---|---|
| Garis luar dan detail mata | `#1A3300` (olive sangat gelap) |
| Badan dan kertas amplop | `#FCFAF5` (krem hangat) |
| Paruh dan kaki | `#FFE95C` (kuning mentega) |
| Syal dan aksen kecil | `#D5F5C2` (mint) |

---

## 1. Kenapa prompt pertama gagal terbaca sebagai merpati

Prompt lama hanya menulis "dove". Model gambar default-nya menghasilkan anak burung
gemuk dengan paruh segitiga, yang terbaca sebagai anak ayam. Perbaikannya ada dua:

1. **Sebutkan anatomi merpati satu per satu.** Badan gempal dengan dada penuh, kepala
   kecil dan bulat, paruh pendek ramping dengan bonggol cere di pangkalnya, ekor
   berbentuk kipas yang melebar datar, kaki pendek, mata bulat kecil dengan cincin
   terang. Tanpa jambul, tanpa ekor runcing.
2. **Larang bentuk yang salah secara eksplisit.** Anak ayam, burung pipit, bebek,
   proporsi burung penyanyi, ekor runcing, jambul.

---

## 2. Prompt utama: satu sheet, 11 pose

Tempel apa adanya. Grid 4 kolom x 3 baris, sel ke-12 dibiarkan kosong.

```text
Flat vector character sheet of a mascot: an adult dove (burung merpati), NOT a chick,
NOT a sparrow, NOT a songbird. Adult dove anatomy, drawn simply and consistently in
every cell: plump rounded body with a full chest, small round head, short slender beak
with a soft cere bump at its base, wide fan-shaped tail that spreads flat, short legs,
small round eye with a thin light ring, smooth rounded silhouette. No crest. No long
pointed tail.

Grid layout: 4 columns by 3 rows, evenly spaced, identical scale in every cell, the
twelfth cell left empty. Every pose shows the whole bird, at the same distance from
the camera, facing slightly three-quarters toward the viewer's left.

Row 1:
1. neutral: calm resting expression, wings folded, standing straight.
2. happy: eyes closed in a smile, both wings raised open in welcome.
3. puzzled: head tilted, one wing raised to its chin, a single small question mark
   floating above its head.
4. delivering: holding a small sealed envelope crosswise in its beak, proud upright
   posture.

Row 2:
5. 400 bad request: looking down at a crumpled torn note on the ground, one eyebrow
   raised, mildly annoyed but not frightened.
6. 401 unauthorized: holding up a small key that clearly does not fit, apologetic
   half-smile, one wing scratching the back of its head.
7. 403 forbidden: standing squarely in front of a plain low barrier, wings folded,
   firm and polite, refusing to pass.
8. 404 not found: looking around an empty patch of ground, holding an empty envelope
   upside down, searching expression.

Row 3:
9. 500 internal error: a small tangled knot of ribbon on the ground beside it, worried
   wide eyes, one wing pressed to its forehead.
10. 502 bad gateway: its envelope has bounced back and landed on its head, dazed flat
    expression, envelope resting on its crown.
11. 503 unavailable: sitting down calmly with a small pause symbol beside it, eyes half
    closed, patient sleepy expression, clearly temporary rather than panicked.

Style: flat vector illustration, clean uniform dark outlines of even weight,
sticker-like clarity. Absolutely no gradients, no 3D rendering, no drop shadows, no
glossy highlights, no textures, no rendering noise.

Strictly limited palette, no other colors: outlines and eye details in very dark olive
green #1A3300, body and envelope paper in warm cream #FCFAF5, beak and legs in butter
yellow #FFE95C, scarf and small accent shapes in mint green #D5F5C2.

Background fully transparent. Centered composition. No text, no labels, no numbers, no
captions anywhere in the image.
```

**Pengaturan yang disarankan:** rasio 3:2 (misal `1536x1024`), kualitas tertinggi,
latar transparan.

**Urutan baca hasilnya:** kiri ke kanan, atas ke bawah. Netral, senang, bingung,
membawa amplop, lalu 400, 401, 403, 404, lalu 500, 502, 503.

---

## 3. Prompt yang saya rekomendasikan: pecah jadi 3 sheet

Satu sheet berisi 11 pose membagi kanvas jadi terlalu kecil. Pada `1536x1024` setiap
pose hanya dapat sekitar 384x341 piksel, dan detail seperti kunci, palang pintu, atau
simpul pita akan hancur. Pecah jadi 3 sheet berisi 4 pose dengan grid 2x2 pada
`1024x1024`, sehingga setiap pose dapat sekitar 512x512 piksel.

Gunakan **kalimat pembuka dan penutup yang sama** dari prompt di atas (anatomi merpati,
gaya, palet, latar transparan, tanpa teks), lalu ganti bagian grid dan daftar pose
dengan salah satu di bawah ini.

**Sheet A, ekspresi dasar.** Grid 2 kolom x 2 baris.

```text
Grid layout: 2 columns by 2 rows, evenly spaced, identical scale in every cell. Every
pose shows the whole bird, at the same distance from the camera, facing slightly
three-quarters toward the viewer's left.

1. neutral: calm resting expression, wings folded, standing straight.
2. happy: eyes closed in a smile, both wings raised open in welcome.
3. puzzled: head tilted, one wing raised to its chin, a single small question mark
   floating above its head.
4. delivering: holding a small sealed envelope crosswise in its beak, proud upright
   posture.
```

**Sheet B, kesalahan permintaan klien.** Grid 2 kolom x 2 baris.

```text
Grid layout: 2 columns by 2 rows, evenly spaced, identical scale in every cell. Every
pose shows the whole bird, at the same distance from the camera, facing slightly
three-quarters toward the viewer's left.

1. 400 bad request: looking down at a crumpled torn note on the ground, one eyebrow
   raised, mildly annoyed but not frightened.
2. 401 unauthorized: holding up a small key that clearly does not fit, apologetic
   half-smile, one wing scratching the back of its head.
3. 403 forbidden: standing squarely in front of a plain low barrier, wings folded,
   firm and polite, refusing to pass.
4. 404 not found: looking around an empty patch of ground, holding an empty envelope
   upside down, searching expression.
```

**Sheet C, kesalahan di sisi server.** Grid 2 kolom x 2 baris.

```text
Grid layout: 2 columns by 2 rows, evenly spaced, identical scale in every cell. Every
pose shows the whole bird, at the same distance from the camera, facing slightly
three-quarters toward the viewer's left.

1. 500 internal error: a small tangled knot of ribbon on the ground beside it, worried
   wide eyes, one wing pressed to its forehead.
2. 502 bad gateway: its envelope has bounced back and landed on its head, dazed flat
   expression, envelope resting on its crown.
3. 503 unavailable: sitting down calmly with a small pause symbol beside it, eyes half
   closed, patient sleepy expression, clearly temporary rather than panicked.
4. recovered: standing upright again with a relieved smile, wings relaxed, holding the
   envelope properly once more.
```

Pose keempat di Sheet C saya tambahkan supaya grid tetap penuh dan sekaligus berguna:
pasangan untuk halaman yang sudah pulih, misalnya setelah 503.

---

## 4. Prompt satu pose (untuk mengulang satu gambar saja)

Kalau satu pose hasilnya jelek, jangan buat ulang seluruh sheet. Pakai template ini dan
isi bagian `[POSE]`.

```text
Flat vector mascot sticker of an adult dove (burung merpati), NOT a chick, NOT a
sparrow, NOT a songbird. Adult dove anatomy: plump rounded body with a full chest,
small round head, short slender beak with a soft cere bump at its base, wide fan-shaped
tail that spreads flat, short legs, small round eye with a thin light ring, smooth
rounded silhouette. No crest, no long pointed tail.

Pose: [POSE]

Flat vector illustration, clean uniform dark outlines of even weight, sticker-like
clarity, no gradients, no 3D, no drop shadows, no glossy highlights, no textures.
Palette only: outlines and eye details #1A3300, body and envelope paper #FCFAF5, beak
and legs #FFE95C, scarf and accents #D5F5C2. Transparent background, single centered
pose, whole bird visible, no text.
```

Isi `[POSE]` dengan salah satu:

| Kode | Isi `[POSE]` |
|---|---|
| netral | calm resting expression, wings folded, standing straight |
| senang | eyes closed in a smile, both wings raised open in welcome |
| bingung | head tilted, one wing raised to its chin, a single small question mark above its head |
| membawa amplop | holding a small sealed envelope crosswise in its beak, proud upright posture |
| terbang | flying cheerfully upward, both wings spread wide and raised mid-flap, body tilted diagonally as if gliding up to the right, short legs tucked back under the tail, a sealed envelope held crosswise in its beak, eyes closed in a happy smile, mint scarf trailing behind in the wind |
| 400 | looking down at a crumpled torn note on the ground, one eyebrow raised, mildly annoyed |
| 401 | holding up a small key that clearly does not fit, apologetic half-smile, one wing scratching its head |
| 403 | standing squarely in front of a plain low barrier, wings folded, firm and polite |
| 404 | looking around an empty patch of ground, holding an empty envelope upside down, searching |
| 500 | a small tangled knot of ribbon on the ground beside it, worried wide eyes, one wing pressed to its forehead |
| 502 | its envelope has bounced back and landed on its head, dazed flat expression |
| 503 | sitting down calmly with a small pause symbol beside it, eyes half closed, patient sleepy expression |

---

## 5. Negative prompt

Tempel di kolom negative prompt kalau tool Anda punya. Kalau tidak, tambahkan sebagai
kalimat "Avoid: ..." di akhir prompt.

```text
chick, baby bird, duckling, sparrow, songbird, pointed tail, crest, mohawk, realistic
feathers, photorealistic, 3D render, clay render, plastic toy, glossy, gradient, drop
shadow, glow, background scenery, floor line, horizon, text, watermark, letters,
numbers, human hands, extra wings, extra legs, duplicate heads, multiple birds in one
cell, cropped bird
```

---

## 6. Setelah gambar jadi

Simpan tiap pose sebagai PNG terpisah di `public/brand/` dengan nama
`maskot-<kode>.png`, mengikuti yang sudah ada:

- `maskot-1-netral.png`
- `maskot-2-senang.png`
- `maskot-3-bingung.png`
- `maskot-4-kirim.png`

Pose tambahan yang sudah ada di `public/brand/`:

- `maskot-terbang.png` — pose terbang membawa amplop, dipakai untuk header banner.
  Banner 1280x288 dibuat ulang lewat `node scripts/build-header-1280x288.mjs`.

Kalau tool Anda hanya menghasilkan satu sheet, potong dengan `sharp` dalam **dua
tahap**. Memanggil `.extract().trim()` dalam satu rantai akan gagal dengan pesan
`bad extract area`, karena sharp menjalankan `trim` sebelum `extract`:

```js
const sharp = require("sharp");
const W = 384, H = 1024; // ukuran satu sel pada sheet 1536x1024
for (let i = 0; i < 4; i++) {
  const cut = await sharp(src).extract({ left: i * W, top: 0, width: W, height: H }).png().toBuffer();
  await sharp(cut).trim().toFile(`public/brand/maskot-${i + 1}.png`);
}
```
