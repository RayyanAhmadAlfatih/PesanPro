import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import webpmux from "node-webpmux";

const { Image: WebPImage } = webpmux;

const execFileAsync = promisify(execFile);
const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_DURATION_SECONDS = 10;

export type StickerType = "default" | "full" | "crop" | "circle" | "rounded";

export type StickerOptions = {
  id?: string;
  pack?: string;
  author?: string;
  categories?: string[];
  type?: StickerType | string;
  quality?: number;
  background?: string;
};

function clampQuality(quality: number | undefined) {
  return Math.min(100, Math.max(1, Number.isFinite(quality) ? Math.round(quality!) : 80));
}

async function imageToWebp(input: Buffer, options: StickerOptions): Promise<Buffer> {
  const metadata = await sharp(input, { animated: true, limitInputPixels: 40_000_000 }).metadata();
  if (!metadata.format) throw new Error("Unsupported image format");

  const type = options.type ?? "default";
  const fit = type === "crop" || type === "circle" || type === "rounded" ? "cover" : "contain";
  const background = options.background === "transparent"
    ? { r: 0, g: 0, b: 0, alpha: 0 }
    : options.background ?? { r: 0, g: 0, b: 0, alpha: 0 };

  return sharp(input, { animated: true, limitInputPixels: 40_000_000 })
    .resize(512, 512, { fit, background })
    .webp({ quality: clampQuality(options.quality), loop: 0 })
    .toBuffer();
}

async function videoToWebp(input: Buffer, options: StickerOptions): Promise<Buffer> {
  const directory = await mkdtemp(path.join(tmpdir(), "pesanpro-sticker-"));
  const inputPath = path.join(directory, `${randomUUID()}.media`);
  const outputPath = path.join(directory, "sticker.webp");
  const quality = clampQuality(options.quality);
  const filter = "scale=512:512:force_original_aspect_ratio=decrease,fps=10,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000";

  try {
    await writeFile(inputPath, input);
    await execFileAsync("ffmpeg", [
      "-y",
      "-i", inputPath,
      "-t", String(MAX_VIDEO_DURATION_SECONDS),
      "-vf", filter,
      "-vcodec", "libwebp",
      "-lossless", "0",
      "-compression_level", "6",
      "-q:v", String(quality),
      "-loop", "0",
      "-an",
      "-vsync", "0",
      outputPath,
    ], { timeout: 30_000, maxBuffer: 1024 * 1024 });
    return await readFile(outputPath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function buildExif(options: StickerOptions): Buffer {
  const metadata = JSON.stringify({
    "sticker-pack-id": options.id ?? randomUUID(),
    "sticker-pack-name": options.pack ?? "",
    "sticker-pack-publisher": options.author ?? "",
    emojis: options.categories ?? [],
  });
  const metadataBytes = Buffer.from(metadata, "utf8");
  const exif = Buffer.concat([
    Buffer.from([
      0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41,
      0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
    ]),
    metadataBytes,
  ]);
  exif.writeUInt32LE(metadataBytes.length, 14);
  return exif;
}

async function addExif(webp: Buffer, options: StickerOptions): Promise<Buffer> {
  const image = new WebPImage();
  await image.load(webp);
  image.exif = buildExif(options);
  return image.save(null);
}

export default class Sticker {
  constructor(
    private readonly input: Buffer,
    private readonly options: StickerOptions = {},
  ) {}

  async toBuffer(): Promise<Buffer> {
    if (!Buffer.isBuffer(this.input) || this.input.length === 0) {
      throw new Error("Sticker input must be a non-empty buffer");
    }
    if (this.input.length > MAX_INPUT_BYTES) {
      throw new Error("Sticker input exceeds the 10 MB limit");
    }

    let webp: Buffer;
    try {
      webp = await imageToWebp(this.input, this.options);
    } catch (imageError) {
      try {
        webp = await videoToWebp(this.input, this.options);
      } catch {
        throw imageError;
      }
    }

    return addExif(webp, this.options);
  }
}
