import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-auth";
import moment from "moment-timezone";
import { z } from "zod";

const systemSettingsSchema = z.object({
    appName: z.string().trim().min(1).max(160),
    logoUrl: z.string().trim().max(2_048).nullish(),
    faviconUrl: z.string().trim().max(2_048).nullish(),
    timezone: z.string().trim().refine((value) => moment.tz.zone(value) !== null, "Invalid timezone"),
    enableRegistration: z.boolean(),
    bankName: z.string().trim().max(120).default(""),
    bankAccountNumber: z.string().trim().max(60).default(""),
    bankAccountHolder: z.string().trim().max(160).default(""),
    paymentNote: z.string().trim().max(500).nullish(),
    supportWhatsapp: z.string().trim().max(40).regex(/^[0-9+\-()\s]*$/, "Invalid WhatsApp number").default(""),
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

        return NextResponse.json({ status: true, message: "System config fetched", data: config || { appName: "PesanPro", faviconUrl: "/favicon.ico", timezone: "Asia/Jakarta", enableRegistration: true, bankName: "", bankAccountNumber: "", bankAccountHolder: "", paymentNote: "", supportWhatsapp: "" } });
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

        const parsed = systemSettingsSchema.safeParse(await req.json().catch(() => null));
        if (!parsed.success) {
            return NextResponse.json({ status: false, message: "Invalid system settings", error: parsed.error.flatten() }, { status: 400 });
        }
        const { appName, logoUrl, faviconUrl, timezone, enableRegistration, bankName, bankAccountNumber, bankAccountHolder, paymentNote, supportWhatsapp } = parsed.data;

        const config = await prisma.systemConfig.upsert({
            where: { id: "default" },
            update: { appName, logoUrl, faviconUrl, timezone, enableRegistration, bankName, bankAccountNumber, bankAccountHolder, paymentNote: paymentNote || null, supportWhatsapp },
            create: { id: "default", appName, logoUrl: logoUrl || "", faviconUrl: faviconUrl || "/favicon.ico", timezone, enableRegistration, bankName, bankAccountNumber, bankAccountHolder, paymentNote: paymentNote || null, supportWhatsapp }
        });

        return NextResponse.json({ status: true, message: "System settings updated", data: config });
    } catch {
        return NextResponse.json({ status: false, message: "Failed to update settings", error: "Failed to update settings" }, { status: 500 });
    }
}
