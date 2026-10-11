import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const SHEETS = [
  { file: "Sheet-Maskot/Sheet-A.jpg", names: ["netral", "senang", "bingung", "kirim"] },
  { file: "Sheet-Maskot/Sheet-B.jpg", names: ["400", "401", "403", "404"] },
  { file: "Sheet-Maskot/Sheet-C.jpg", names: ["500", "502", "503", "pulih"] },
];

const OUT_DIR = "public/brand";
const TOLERANCE = 42;

/**
 * Remove the background by flooding inward from the border.
 *
 * The mascot body is warm cream and the sheet background is nearly the same
 * tone, so a plain "make light pixels transparent" pass would eat the bird.
 * Flooding from the border only clears pixels reachable from outside, and the
 * dark outline stops the fill, so the body survives.
 */
async function cutAndClean(input, outPath) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const [br, bg, bb] = [data[0], data[1], data[2]];

  const seen = new Uint8Array(width * height);
  const stack = new Int32Array(width * height);
  let top = 0;

  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const p = y * width + x;
    if (seen[p]) return;
    const i = p * channels;
    const dr = data[i] - br;
    const dg = data[i + 1] - bg;
    const db = data[i + 2] - bb;
    if (Math.sqrt(dr * dr + dg * dg + db * db) >= TOLERANCE) return;
    seen[p] = 1;
    data[i + 3] = 0;
    stack[top++] = p;
  };

  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }

  while (top > 0) {
    const p = stack[--top];
    const x = p % width;
    const y = (p - x) / width;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }

  await sharp(data, { raw: { width, height, channels } }).png().trim().toFile(outPath);
  const meta = await sharp(outPath).metadata();
  return `${meta.width}x${meta.height}`;
}

await mkdir(OUT_DIR, { recursive: true });

for (const sheet of SHEETS) {
  const meta = await sharp(sheet.file).metadata();
  const cellW = Math.floor(meta.width / 2);
  const cellH = Math.floor(meta.height / 2);
  const cells = [
    { left: 0, top: 0 },
    { left: cellW, top: 0 },
    { left: 0, top: cellH },
    { left: cellW, top: cellH },
  ];

  for (let i = 0; i < sheet.names.length; i += 1) {
    const cut = await sharp(sheet.file)
      .extract({ left: cells[i].left, top: cells[i].top, width: cellW, height: cellH })
      .png()
      .toBuffer();
    const out = `${OUT_DIR}/maskot-${sheet.names[i]}.png`;
    const size = await cutAndClean(cut, out);
    console.log(`${sheet.file} [${i + 1}] -> ${out} ${size}`);
  }
}
