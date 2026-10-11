import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";

const PAPER = "#FCFAF5";
const INK = "#1A3300";
const WHITE = "#FFFFFF";
const HILITE = "#FFE95C";
const MINT = "#D5F5C2";
const LINE = "#B6B6B6";
const MUTED = "#607054";

const W = 1200;
const PAD = 80;
const FONT = "Segoe UI, Arial, Helvetica, sans-serif";
const MONO = "Consolas, Menlo, monospace";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const parts = [];
let y = 0;

const rect = (x, yy, w, h, fill, stroke) =>
  parts.push(`<rect x="${x}" y="${yy}" width="${w}" height="${h}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="1"` : ""}/>`);

const text = (x, yy, s, { size = 15, fill = INK, weight = 400, mono = false, anchor = "start", spacing = 0 } = {}) =>
  parts.push(
    `<text x="${x}" y="${yy}" font-family="${mono ? MONO : FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${spacing ? ` letter-spacing="${spacing}"` : ""}>${esc(s)}</text>`,
  );

const para = (x, yy, lines, opts = {}) => {
  const { size = 15, fill = MUTED, lh = 23, weight = 400 } = opts;
  lines.forEach((line, i) => text(x, yy + i * lh, line, { size, fill, weight }));
  return yy + (lines.length - 1) * lh;
};

const eyebrow = (x, yy, s) => text(x, yy, s.toUpperCase(), { size: 11, fill: MUTED, weight: 700, spacing: 1.4 });
const title = (x, yy, s, size = 26) => text(x, yy, s, { size, weight: 700 });

const mascots = {};
const mascotMeta = {};
for (const name of ["netral", "senang", "bingung", "kirim"]) {
  const buf = await readFile(`public/brand/maskot-${name}.png`);
  mascots[name] = `data:image/png;base64,${buf.toString("base64")}`;
  mascotMeta[name] = await sharp(buf).metadata();
}
{
  const buf = await readFile("public/brand/logo-lockup.png");
  mascots.logo = `data:image/png;base64,${buf.toString("base64")}`;
  mascotMeta.logo = await sharp(buf).metadata();
}

// Always set width AND height. Without an explicit width, librsvg falls back to
// the PNG's intrinsic width, and the bird then renders centred inside that box
// instead of where it was placed.
const mascotImg = (name, x, yy, h) => {
  const m = mascotMeta[name];
  const w = Math.round((h * m.width) / m.height);
  parts.push(`<image href="${mascots[name]}" x="${x}" y="${yy}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>`);
  return w;
};

// Header
rect(0, 0, W, 72, PAPER);
parts.push(`<line x1="0" y1="72" x2="${W}" y2="72" stroke="${LINE}" stroke-width="1"/>`);
mascotImg("logo", PAD, 18, 38);
for (const [i, label] of ["Sebelum & sesudah", "Cara kerja", "Harga"].entries()) {
  text([836, 944, 1018][i], 44, label, { size: 14, fill: MUTED, anchor: "end" });
}
rect(W - PAD - 78, 22, 78, 30, INK);
text(W - PAD - 39, 42, "Masuk", { size: 14, fill: PAPER, weight: 600, anchor: "middle" });
y = 72;

// Hero
rect(0, y, W, 400, PAPER);
text(PAD, y + 116, "Aplikasi Anda butuh kirim WhatsApp?", { size: 42, weight: 800 });
text(PAD, y + 168, "Cukup satu API.", { size: 42, weight: 800, fill: MUTED });
para(PAD, y + 216, ["Hubungkan nomor WhatsApp Anda, lalu kirim pesan dan terima balasan", "lewat REST API dan webhook. Isi pesan tidak kami simpan."], { size: 17, lh: 26 });
rect(PAD, y + 274, 232, 48, HILITE, INK);
text(PAD + 116, y + 304, "Masuk ke dashboard", { size: 16, weight: 600, anchor: "middle" });
text(PAD + 254, y + 304, "Buat akun", { size: 14, weight: 600 });
parts.push(`<line x1="${PAD + 254}" y1="${y + 310}" x2="${PAD + 318}" y2="${y + 310}" stroke="${LINE}" stroke-width="1"/>`);
text(PAD, y + 356, "Tanpa biaya per pesan. Isi pesan tidak disimpan. Berhenti kapan saja.", { size: 14, fill: MUTED });
mascotImg("kirim", W - PAD - 240, y + 60, 290);
y += 400;

// Sebelum & sesudah
rect(0, y, W, 520, WHITE);
parts.push(`<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${LINE}" stroke-width="1"/>`);
eyebrow(PAD, y + 56, "Sebelum & sesudah");
title(PAD, y + 92, "Dari kirim manual jadi satu panggilan API.");
const panelW = (W - PAD * 2 - 24) / 2;
const panel = (x, label, items) => {
  rect(x, y + 124, panelW, 214, PAPER, LINE);
  text(x + 24, y + 162, label, { size: 17, weight: 700 });
  items.forEach((item, i) => {
    parts.push(`<line x1="${x + 24}" y1="${y + 194 + i * 34}" x2="${x + 46}" y2="${y + 194 + i * 34}" stroke="${LINE}" stroke-width="1"/>`);
    text(x + 58, y + 198 + i * 34, item, { size: 13, fill: MUTED });
  });
};
panel(PAD, "Sebelum", ["Nomor pelanggan dicatat satu per satu di HP.", "Pesan yang sama diketik ulang untuk setiap penerima.", "Pengiriman berhenti saat HP dipakai hal lain.", "Tidak ada catatan pesan mana yang gagal."]);
panel(PAD + panelW + 24, "Sesudah", ["Pesan masuk antrian dan dikirim dengan jeda acak.", "Kalau gagal, sistem mencoba ulang sendiri.", "Status setiap pesan tersimpan sebagai metadata.", "Pesan masuk diteruskan ke webhook Anda."]);
rect(PAD, y + 356, W - PAD * 2, 124, WHITE, LINE);
text(PAD + 24, y + 388, "POST /api/v1/messages/text", { size: 12, mono: true, weight: 700, fill: MUTED });
text(W - PAD - 24, y + 388, "dijawab 202, pesan masuk antrian", { size: 12, fill: MUTED, anchor: "end" });
parts.push(`<line x1="${PAD}" y1="${y + 404}" x2="${W - PAD}" y2="${y + 404}" stroke="${LINE}" stroke-width="1"/>`);
["curl -X POST https://<domain>/api/v1/messages/text \\", '  -H "x-api-key: <kunci-api>" \\', '  -H "Idempotency-Key: 7f3c1a90-2b6e-4d18-9a55-1c0e2f8b4d61" \\', '  -d \'{"sessionId":"<id-sesi>","recipient":"628123456789","text":"Halo"}\''].forEach((line, i) =>
  text(PAD + 24, y + 430 + i * 17, line, { size: 12, mono: true }),
);
y += 520;

// Antrian pesan
rect(0, y, W, 400, PAPER);
parts.push(`<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${LINE}" stroke-width="1"/>`);
eyebrow(PAD, y + 56, "Antrian pesan");
title(PAD, y + 92, "Pesan yang gagal tidak hilang begitu saja.");
para(PAD, y + 126, ["Setiap pengiriman disimpan sebagai pekerjaan di database, bukan di memori server. Kalau prosesnya berhenti", "di tengah jalan, pekerjaan itu diklaim ulang dan dilanjutkan setelah server hidup lagi."], { size: 15, lh: 23 });
parts.push(`<line x1="${PAD}" y1="${y + 182}" x2="${W - PAD}" y2="${y + 182}" stroke="${LINE}" stroke-width="1"/>`);
[
  ["Masa sewa", "Setiap pekerjaan yang sedang dikerjakan punya batas waktu. Kalau pemiliknya mati, pekerjaan itu kembali ke antrian."],
  ["Percobaan ulang terbatas", "Kegagalan dicoba ulang dengan jeda bertambah, lalu berhenti dengan alasan yang bisa dibaca."],
  ["Idempotency key", "Permintaan yang sama dikirim dua kali tidak menghasilkan dua pesan, karena setiap permintaan membawa kunci unik."],
].forEach(([t, d], i) => {
  const ry = y + 218 + i * 56;
  text(PAD, ry, t, { size: 15, weight: 600 });
  text(PAD + 250, ry, d, { size: 14, fill: MUTED });
  parts.push(`<line x1="${PAD}" y1="${ry + 20}" x2="${W - PAD}" y2="${ry + 20}" stroke="${LINE}" stroke-width="1"/>`);
});
y += 400;

// Cara kerja
rect(0, y, W, 460, WHITE);
parts.push(`<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${LINE}" stroke-width="1"/>`);
eyebrow(PAD, y + 56, "Cara kerja");
title(PAD, y + 92, "Empat langkah dari nomor kosong ke pesan pertama.");
const stepW = (W - PAD * 2 - 2) / 2;
[
  ["01", "Hubungkan nomor", "Buka WhatsApp di HP, pindai kode QR dari dashboard. Setiap nomor berjalan sebagai sesi terpisah."],
  ["02", "Buat kunci API", "Pilih scope sesuai kebutuhan integrasi. Setiap kunci bisa dibatasi per alamat IP dan diberi kedaluwarsa."],
  ["03", "Kirim pesan", "Panggil REST API untuk teks, media, dan dokumen. Setiap permintaan membawa idempotency key."],
  ["04", "Terima event", "Webhook mengirim pesan masuk, perubahan status pengiriman, dan update koneksi ke server Anda."],
].forEach(([n, t, d], i) => {
  const cx = PAD + (i % 2) * (stepW + 2);
  const cy = y + 132 + Math.floor(i / 2) * 152;
  rect(cx, cy, stepW, 150, PAPER, LINE);
  text(cx + 24, cy + 34, n, { size: 13, mono: true, weight: 700, fill: MUTED });
  text(cx + 24, cy + 64, t, { size: 18, weight: 700 });
  para(cx + 24, cy + 92, d.match(/.{1,52}(\s|$)/g).map((s) => s.trim()).slice(0, 2), { size: 13, lh: 20 });
});
y += 460;

// Privasi
rect(0, y, W, 460, MINT);
parts.push(`<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${LINE}" stroke-width="1"/>`);
eyebrow(PAD, y + 56, "Privasi");
title(PAD, y + 92, "Kami tidak menyimpan isi pesan Anda.");
para(PAD, y + 126, ["PesanPro meneruskan pesan ke sistem Anda. Setelah itu tidak ada alasan bagi kami untuk", "menyimpannya, jadi memang tidak kami simpan."], { size: 15, lh: 23 });
[
  ["Isi pesan tidak disimpan", "Teks dan caption tidak pernah ditulis ke database."],
  ["Media tidak diunduh", "Foto, video, dan dokumen tidak ditarik ke server kami."],
  ["Metadata dibatasi 30 hari", "Hanya nomor, status kirim, dan waktu. Dihapus otomatis."],
  ["Bisa diputus kapan saja", "Lepas tautan dari dashboard, atau dari HP Anda."],
].forEach(([t, d], i) => {
  const cx = PAD + (i % 2) * 340;
  const cy = y + 196 + Math.floor(i / 2) * 92;
  text(cx, cy, t, { size: 15, weight: 600 });
  text(cx, cy + 22, d, { size: 13, fill: MUTED });
});
text(PAD, y + 402, "Baca kebijakan privasi", { size: 14, weight: 600 });
parts.push(`<line x1="${PAD}" y1="${y + 408}" x2="${PAD + 168}" y2="${y + 408}" stroke="${LINE}" stroke-width="1"/>`);
mascotImg("senang", W - PAD - 230, y + 120, 250);
y += 460;

// Harga
rect(0, y, W, 400, PAPER);
parts.push(`<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${LINE}" stroke-width="1"/>`);
eyebrow(PAD, y + 56, "Harga");
title(PAD, y + 92, "Bayar per bulan, tanpa biaya per pesan.");
const cardW = (W - PAD * 2 - 40) / 3;
[["Starter", "Rp 75.000"], ["Bisnis", "Rp 149.000"], ["Pro", "Rp 299.000"]].forEach(([n, p], i) => {
  const cx = PAD + i * (cardW + 20);
  rect(cx, y + 132, cardW, 176, WHITE, LINE);
  text(cx + 24, y + 170, n, { size: 17, weight: 700 });
  text(cx + 24, y + 214, p, { size: 30, weight: 800 });
  text(cx + 24, y + 238, "per bulan", { size: 12, fill: MUTED });
  parts.push(`<line x1="${cx + 24}" y1="${y + 258}" x2="${cx + cardW - 24}" y2="${y + 258}" stroke="${LINE}" stroke-width="1"/>`);
  text(cx + 24, y + 282, "Isi paket dari database Plan", { size: 12, fill: MUTED });
});
y += 400;

// FAQ
rect(0, y, W, 520, WHITE);
parts.push(`<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${LINE}" stroke-width="1"/>`);
eyebrow(PAD, y + 56, "Pertanyaan umum");
title(PAD, y + 92, "Hal yang biasanya ditanyakan lebih dulu.");
[
  "Apakah nomor WhatsApp saya bisa diblokir?",
  "Apakah PesanPro membaca isi pesan saya?",
  "Apa yang terjadi kalau pesan gagal terkirim?",
  "Bisakah satu akun memakai beberapa nomor?",
  "Apakah harus selalu menyalakan HP?",
  "Berapa lama data pengiriman disimpan?",
].forEach((q, i) => {
  const qy = y + 148 + i * 56;
  text(PAD, qy, q, { size: 16, weight: 600 });
  text(W - PAD - 380, qy, "+", { size: 20, fill: MUTED, anchor: "end" });
  parts.push(`<line x1="${PAD}" y1="${qy + 20}" x2="${W - PAD - 380}" y2="${qy + 20}" stroke="${LINE}" stroke-width="1"/>`);
});
mascotImg("bingung", W - PAD - 240, y + 140, 230);
y += 520;

// Penutup
rect(0, y, W, 220, PAPER);
parts.push(`<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${LINE}" stroke-width="1"/>`);
title(PAD, y + 92, "Siap kirim pesan pertama?", 28);
para(PAD, y + 128, ["Buat akun, hubungkan satu nomor, dan panggil API. Tidak ada biaya per pesan yang perlu dihitung dulu."], { size: 14 });
rect(W - PAD - 150, y + 78, 150, 46, HILITE, INK);
text(W - PAD - 75, y + 106, "Buat akun", { size: 15, weight: 600, anchor: "middle" });
y += 220;

// Footer
rect(0, y, W, 110, PAPER);
parts.push(`<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${LINE}" stroke-width="1"/>`);
const footLogoW = mascotImg("logo", PAD, y + 44, 24);
text(PAD + footLogoW + 16, y + 62, "v0.1.0", { size: 12, fill: MUTED, mono: true });
text(W - PAD, y + 62, "Kebijakan privasi", { size: 14, fill: MUTED, anchor: "end" });
text(W - PAD - 150, y + 62, "Ketentuan layanan", { size: 14, fill: MUTED, anchor: "end" });
y += 110;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${y}" viewBox="0 0 ${W} ${y}">
<rect width="${W}" height="${y}" fill="${PAPER}"/>
${parts.join("\n")}
</svg>`;

await writeFile("landing-preview.svg", svg);
const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
await writeFile("LANDING-PREVIEW.png", png);
console.log(`LANDING-PREVIEW.png ${W}x${y}, ${Math.round(png.length / 1024)} KB`);
