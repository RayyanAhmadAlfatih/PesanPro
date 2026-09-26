import sharp from "sharp";
import { getEnv } from "./env";
import { inspectPrivateMedia, type MediaInspection } from "./private-media-validation";

export type PreparedMedia = {
  buffer: Buffer;
  inspection: MediaInspection;
};

export async function prepareMediaForStorage(
  buffer: Buffer,
  declaredMimeType: string,
  options: { convertImageToWebp?: boolean } = {},
): Promise<PreparedMedia> {
  const inspection = inspectPrivateMedia(buffer, declaredMimeType);
  const convertImage = options.convertImageToWebp ?? getEnv().MEDIA_IMAGE_WEBP_ENABLED;
  if (!convertImage || inspection.mediaType !== "IMAGE") return { buffer, inspection };

  try {
    const optimized = await sharp(buffer)
      .rotate()
      .webp({ quality: getEnv().MEDIA_IMAGE_WEBP_QUALITY, smartSubsample: true })
      .toBuffer();
    return {
      buffer: optimized,
      inspection: inspectPrivateMedia(optimized, "image/webp"),
    };
  } catch {
    return { buffer, inspection };
  }
}
