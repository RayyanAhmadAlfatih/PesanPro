import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { checkPersistentRateLimit, getClientIp, rateLimitHeaders } from "@/lib/rate-limit";
import { passwordChangeSchema } from "@/lib/password-change-input";

// Ganti password milik sesi sendiri. Rate limit mengikat percobaan ke id user
// supaya kolom "password saat ini" tidak bisa ditebak paksa lewat endpoint ini.
export async function POST(request: NextRequest) {
    const session = await auth();
    if (!session?.user?.id || session.user.accountActive === false) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = passwordChangeSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json(
            { error: "Password baru minimal 8 karakter dan password saat ini wajib diisi" },
            { status: 400 },
        );
    }

    const rateLimit = await checkPersistentRateLimit(`password-change:${session.user.id}`, 5, 15 * 60 * 1000);
    if (!rateLimit.success) {
        return NextResponse.json({ error: "Terlalu banyak percobaan. Coba lagi nanti.", code: "RATE_LIMITED" }, {
            status: 429,
            headers: rateLimitHeaders(rateLimit, 5),
        });
    }

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, email: true, password: true },
    });
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const currentMatch = await bcrypt.compare(parsed.data.currentPassword, user.password);
    if (!currentMatch) {
        await recordAudit({
            userId: user.id,
            userEmail: user.email,
            action: "user.password_change_failed",
            resource: "user",
            resourceId: user.id,
            ip: getClientIp(request.headers),
            userAgent: request.headers.get("user-agent"),
            meta: { reason: "wrong_current_password" },
        });
        return NextResponse.json({ error: "Password saat ini salah" }, { status: 400 });
    }

    const hashed = await bcrypt.hash(parsed.data.newPassword, 10);
    await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });

    await recordAudit({
        userId: user.id,
        userEmail: user.email,
        action: "user.password_changed",
        resource: "user",
        resourceId: user.id,
        ip: getClientIp(request.headers),
        userAgent: request.headers.get("user-agent"),
        meta: {},
    });

    return NextResponse.json({ status: true, message: "Password berhasil diubah" });
}
