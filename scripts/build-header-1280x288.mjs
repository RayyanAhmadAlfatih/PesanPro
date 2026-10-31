/**
 * Build the PesanPro header banner (1280x288).
 *
 * Design language borrowed from the reference the user approved: flat solid
 * geometry, no outlines, thick rings, speech-bubble motifs (circle + small
 * tail), heavy cropping at the corners, and a deliberately empty centre.
 *
 * Content: our dove mascot flying out of the bottom-right corner toward the
 * left, carrying a sealed envelope. No wordmark.
 *
 * Palette stays inside DESIGN.md. The reference tones map like this:
 *   strong yellow  -> --pp-highlight #FFE95C
 *   olive          -> --pp-muted     #607054
 *   pale yellow    -> a tint of the highlight (#FBEFA8), same hue, no new colour
 *
 * Usage: node scripts/build-header-1280x288.mjs [path-to-mascot.png]
 */
import sharp from "sharp";

const SRC = process.argv[2] ?? "public/brand/maskot-terbang.png";

const WIDTH = 1280;
const HEIGHT = 288;

const WHITE = "#FFFFFF";
const YELLOW = "#FFE95C"; // --pp-highlight
const PALE = "#FBEFA8"; // tint of --pp-highlight
const OLIVE = "#607054"; // --pp-muted

const MASCOT_HEIGHT = 205;
const MASCOT_RIGHT = 40;
const MASCOT_BOTTOM = 6;

/**
 * Decoration layer. Every element is intentionally cropped by a canvas edge,
 * exactly like the reference — nothing floats fully inside the frame.
 * The top-right cluster is kept above the mascot so the two never collide.
 */
const decoration = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <!-- top left: bold yellow ring -->
  <circle cx="-34" cy="-70" r="145" fill="none" stroke="${YELLOW}" stroke-width="38" />

  <!-- top centre: pale dots -->
  <circle cx="652" cy="-36" r="54" fill="${PALE}" />
  <circle cx="730" cy="26" r="19" fill="${PALE}" />

  <!-- top right: olive speech bubble with stem and swirl, cropped by the corner -->
  <line x1="1232" y1="-26" x2="1232" y2="12" stroke="${OLIVE}" stroke-width="20" />
  <path d="M1252 24 C1268 38 1278 44 1294 46" fill="none" stroke="${OLIVE}" stroke-width="18" />
  <polygon points="1216,27 1202,44 1234,34" fill="${OLIVE}" />
  <circle cx="1232" cy="10" r="23" fill="${OLIVE}" />

  <!-- bottom left: pale ring, olive ring, olive dot -->
  <circle cx="84" cy="268" r="104" fill="none" stroke="${PALE}" stroke-width="38" />
  <circle cx="214" cy="300" r="56" fill="none" stroke="${OLIVE}" stroke-width="24" />
  <circle cx="322" cy="238" r="13" fill="${OLIVE}" />

  <!-- bottom right: yellow blob the mascot flies out of -->
  <circle cx="1296" cy="330" r="126" fill="${YELLOW}" />

  <!-- small olive bubble travelling ahead of the dove -->
  <polygon points="912,186 897,204 933,193" fill="${OLIVE}" />
  <circle cx="930" cy="170" r="24" fill="${OLIVE}" />

  <!-- dotted wake, kept short so the centre stays empty -->
  <path d="M1250 262 C1160 268 1040 258 900 232" fill="none" stroke="${OLIVE}"
        stroke-width="7" stroke-linecap="round" stroke-dasharray="0.1 20" />
</svg>`;

const mascot = await sharp(SRC)
  .trim({ threshold: 1 })
  .resize({ height: MASCOT_HEIGHT, fit: "inside" })
  .png()
  .toBuffer();
const mascotMeta = await sharp(mascot).metadata();

const out = "public/brand/header-1280x288.png";
const info = await sharp({
  create: { width: WIDTH, height: HEIGHT, channels: 4, background: WHITE },
})
  .composite([
    { input: Buffer.from(decoration), top: 0, left: 0 },
    {
      input: mascot,
      top: HEIGHT - mascotMeta.height - MASCOT_BOTTOM,
      left: WIDTH - mascotMeta.width - MASCOT_RIGHT,
    },
  ])
  .png()
  .toFile(out);

console.log(`${out} ${info.width}x${info.height}`);
