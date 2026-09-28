import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-auth";
import moment from "moment-timezone";
import { z } from "zod";
import { normalizeBrandAssetUrl } from "@/lib/brand-config";

const brandUrlSchema = z.string().trim().max(2_048).nullish().refine(
    (value) => !value || Boolean(normalizeBrandAssetUrl(value)),
    "Brand asset URL must be an HTTPS URL or an absolute local path",
);

const systemSettingsSchema = z.object({
    appName: z.string().trim().min(1).max(160),
    logoUrl: brandUrlSchema,
    faviconUrl: brandUrlSchema,
    timezone: z.string().trim().refine((value) => moment.tz.zone(value) !== null, "Invalid timezone"),
    enableRegistration: z.boolean(),
});

export async function GET(request: NextRequest) {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user || user.role !== "SUPERADMIN") {
            return NextResponse.json({ status: false, message: "Forbidden", error: "Forbidden" }, { status: 403 });
        }

        const config = await prisma.systemConfig.findUnique({
            where: { id: "default" }
        });

        return NextResponse.json({ status: true, message: "System config fetched", data: config || { appName: "PesanPro", faviconUrl: "/favicon.ico", timezone: "Asia/Jakarta", enableRegistration: true } });
    } catch {
        return NextResponse.json({ status: false, message: "Failed to fetch settings", error: "Failed to fetch settings" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const user = await getAuthenticatedUser(req);
        if (!user || user.role !== "SUPERADMIN") {
            return NextResponse.json({ status: false, message: "Forbidden", error: "Forbidden" }, { status: 403 });
        }

        const parsed = systemSettingsSchema.safeParse(await req.json());
        if (!parsed.success) {
            return NextResponse.json({ status: false, message: "Invalid system settings", error: parsed.error.flatten() }, { status: 400 });
        }
        const { appName, logoUrl, faviconUrl, timezone, enableRegistration } = parsed.data;

        const config = await prisma.systemConfig.upsert({
            where: { id: "default" },
            update: { appName, logoUrl, faviconUrl, timezone, enableRegistration },
            create: { id: "default", appName, logoUrl: logoUrl || "", faviconUrl: faviconUrl || "/favicon.ico", timezone, enableRegistration }
        });

        return NextResponse.json({ status: true, message: "System settings updated", data: config });
    } catch {
        return NextResponse.json({ status: false, message: "Failed to update settings", error: "Failed to update settings" }, { status: 500 });
    }
}
