import { NextResponse } from "next/server";
import { WOOCOMMERCE_ZIP_FILENAME, resolveWooCommercePluginZipBytes } from "@/lib/wordpress-addon-packages";

export const dynamic = "force-dynamic";

/** Open integration artifact, not tenant data: the public guide must work before sign-up. */
export async function GET() {
  try {
    const zip = await resolveWooCommercePluginZipBytes();
    return new NextResponse(new Uint8Array(zip), {
      status: 200,
      headers: {
        "content-type": "application/zip",
        "content-length": String(zip.length),
        "content-disposition": `attachment; filename="${WOOCOMMERCE_ZIP_FILENAME}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    console.error("WooCommerce plugin download failed:", error);
    return NextResponse.json(
      { status: false, error: "PLUGIN_PACKAGE_UNAVAILABLE", message: "Paket plugin WooCommerce belum tersedia. Coba lagi atau hubungi admin." },
      { status: 500 },
    );
  }
}
