import { NextResponse } from "next/server";
import { GOOGLE_FORMS_ZIP_FILENAME, resolveGoogleFormsZipBytes } from "@/lib/google-forms-package";

export const dynamic = "force-dynamic";

/**
 * Public download of the Google Forms Apps Script connector.
 *
 * Same rationale as the WordPress plugin download: the connector is an open
 * integration artifact, not tenant data. Developers reading the public guide
 * must be able to fetch it before they have an account, and the guide must
 * not point at a repository folder that has no web URL.
 */
export async function GET() {
  try {
    const zip = await resolveGoogleFormsZipBytes();
    return new NextResponse(new Uint8Array(zip), {
      status: 200,
      headers: {
        "content-type": "application/zip",
        "content-length": String(zip.length),
        "content-disposition": `attachment; filename="${GOOGLE_FORMS_ZIP_FILENAME}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    console.error("Google Forms package download failed:", error);
    return NextResponse.json(
      { status: false, error: "PLUGIN_PACKAGE_UNAVAILABLE", message: "Paket Google Forms belum tersedia. Coba lagi atau hubungi admin." },
      { status: 500 },
    );
  }
}
