import { NextResponse } from "next/server";
import { ELEMENTOR_ZIP_FILENAME, resolveElementorPluginZipBytes } from "@/lib/wordpress-addon-packages";

export const dynamic = "force-dynamic";

/** Open integration artifact, not tenant data: the public guide must work before sign-up. */
export async function GET() {
  try {
    const zip = await resolveElementorPluginZipBytes();
    return new NextResponse(new Uint8Array(zip), {
      status: 200,
      headers: {
        "content-type": "application/zip",
        "content-length": String(zip.length),
        "content-disposition": `attachment; filename="${ELEMENTOR_ZIP_FILENAME}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    console.error("Elementor plugin download failed:", error);
    return NextResponse.json(
      { status: false, error: "PLUGIN_PACKAGE_UNAVAILABLE", message: "Paket plugin Elementor belum tersedia. Coba lagi atau hubungi admin." },
      { status: 500 },
    );
  }
}
