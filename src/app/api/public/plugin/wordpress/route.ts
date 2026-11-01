import { NextResponse } from "next/server";
import { PLUGIN_ZIP_FILENAME, resolvePluginZipBytes } from "@/lib/wordpress-plugin-zip";

export const dynamic = "force-dynamic";

/**
 * Public download of the WordPress integration plugin.
 *
 * The plugin is an open integration artifact, not tenant data: developers
 * reading the public guides must be able to fetch it before they have an
 * account. Serving the superadmin-uploaded archive when one exists lets the
 * operator ship plugin updates from the dashboard without a deploy.
 */
export async function GET() {
  try {
    const zip = await resolvePluginZipBytes();
    return new NextResponse(new Uint8Array(zip), {
      status: 200,
      headers: {
        "content-type": "application/zip",
        "content-length": String(zip.length),
        "content-disposition": `attachment; filename="${PLUGIN_ZIP_FILENAME}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    console.error("Plugin download failed:", error);
    return NextResponse.json(
      { status: false, error: "PLUGIN_PACKAGE_UNAVAILABLE", message: "Paket plugin belum tersedia. Coba lagi atau hubungi admin." },
      { status: 500 },
    );
  }
}
