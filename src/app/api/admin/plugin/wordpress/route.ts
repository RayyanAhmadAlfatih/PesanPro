import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, isAdmin } from "@/lib/api-auth";
import { parsePrivateMediaUpload } from "@/lib/private-media-upload";
import { recordAudit } from "@/lib/audit";
import { getClientIp } from "@/lib/rate-limit";
import {
  PLUGIN_ZIP_FILENAME,
  PLUGIN_ZIP_MAX_BYTES,
  deleteCustomPluginZip,
  looksLikeZip,
  readCustomPluginZip,
  saveCustomPluginZip,
} from "@/lib/wordpress-plugin-zip";

export const dynamic = "force-dynamic";

const ACCEPTED_MIME_TYPES = new Set([
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream",
]);

function unauthorized() {
  return NextResponse.json({ status: false, error: "Forbidden" }, { status: 403 });
}

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user || !isAdmin(user.role)) return unauthorized();

  const custom = await readCustomPluginZip();
  return NextResponse.json({
    status: true,
    data: {
      customUploaded: Boolean(custom),
      sizeBytes: custom?.length ?? null,
      maxBytes: PLUGIN_ZIP_MAX_BYTES,
      filename: PLUGIN_ZIP_FILENAME,
    },
  });
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user || !isAdmin(user.role)) return unauthorized();

  let upload: Awaited<ReturnType<typeof parsePrivateMediaUpload>>;
  try {
    upload = await parsePrivateMediaUpload(request, { maxBytes: PLUGIN_ZIP_MAX_BYTES });
  } catch {
    return NextResponse.json(
      { status: false, error: "INVALID_PLUGIN_UPLOAD", message: "Unggahan harus berupa file ZIP melalui form multipart." },
      { status: 400 },
    );
  }

  if (!ACCEPTED_MIME_TYPES.has(upload.declaredMimeType.toLowerCase())) {
    return NextResponse.json(
      { status: false, error: "UNSUPPORTED_PLUGIN_FILE", message: "File harus berformat ZIP." },
      { status: 415 },
    );
  }
  if (!looksLikeZip(upload.buffer)) {
    return NextResponse.json(
      { status: false, error: "INVALID_PLUGIN_ZIP", message: "Berkas ini bukan ZIP yang sah. Periksa file, lalu unggah ulang." },
      { status: 422 },
    );
  }

  await saveCustomPluginZip(upload.buffer);
  await recordAudit({
    userId: user.id,
    userEmail: user.email,
    action: "admin.plugin_zip_upload",
    resource: "wordpress_plugin",
    resourceId: PLUGIN_ZIP_FILENAME,
    ip: getClientIp(request.headers),
    userAgent: request.headers.get("user-agent"),
    meta: { sizeBytes: upload.buffer.length, originalName: upload.originalName },
  });

  return NextResponse.json({
    status: true,
    message: "Paket plugin baru aktif. Unduhan di dashboard user langsung memakai berkas ini.",
    data: { customUploaded: true, sizeBytes: upload.buffer.length, filename: PLUGIN_ZIP_FILENAME },
  });
}

export async function DELETE(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user || !isAdmin(user.role)) return unauthorized();

  const removed = await deleteCustomPluginZip();
  if (removed) {
    await recordAudit({
      userId: user.id,
      userEmail: user.email,
      action: "admin.plugin_zip_remove",
      resource: "wordpress_plugin",
      resourceId: PLUGIN_ZIP_FILENAME,
      ip: getClientIp(request.headers),
      userAgent: request.headers.get("user-agent"),
    });
  }
  return NextResponse.json({
    status: true,
    message: removed
      ? "Unggahan dihapus. Unduhan kembali memakai plugin bawaan aplikasi."
      : "Tidak ada unggahan khusus; unduhan sudah memakai plugin bawaan aplikasi.",
    data: { customUploaded: false },
  });
}
