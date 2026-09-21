import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { checkPersistentRateLimit, getClientIp, rateLimitHeaders } from "@/lib/rate-limit";
import { passwordSchema } from "@/lib/password-policy";
import { recordAudit } from "@/lib/audit";
import { provisionDefaultSubscriptionInTransaction } from "@/lib/billing";

const registerSchema = z.object({
    name: z.string().min(2),
    email: z.string().trim().toLowerCase().email().max(320),
    password: passwordSchema,
});

export async function POST(req: NextRequest) {
    // Rate limit: 5 registrations per IP per hour (Gate 0)
    const ip = getClientIp(req.headers);
    const rl = await checkPersistentRateLimit(`register:${ip}`, 5, 60 * 60 * 1000);
    if (!rl.success) {
        return NextResponse.json(
            { error: "Too many registration attempts, please try again later" },
            { status: 429, headers: rateLimitHeaders(rl, 5) }
        );
    }

    try {
        const body = await req.json();
        const { email, password, name } = registerSchema.parse(body);

        // Check if registration is enabled
        const systemConfig = await prisma.systemConfig.findUnique({ where: { id: "default" } });
        if (systemConfig && systemConfig.enableRegistration === false) {
            return NextResponse.json(
                { error: "Registration is currently disabled by the administrator" },
                { status: 403 }
            );
        }

        // Check if user already exists
        const existingUser = await prisma.user.findUnique({
            where: { email },
        });

        if (existingUser) {
            return NextResponse.json(
                { error: "User with this email already exists" },
                { status: 400 }
            );
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 12);

        // Create the user
        const newUser = await prisma.$transaction(async (tx) => {
            const user = await tx.user.create({
                data: { name, email, password: hashedPassword },
            });
            await provisionDefaultSubscriptionInTransaction(tx, user.id);
            return user;
        });

        await recordAudit({
            userId: newUser.id,
            userEmail: newUser.email,
            action: "user.register",
            resource: "user",
            resourceId: newUser.id,
            ip,
            userAgent: req.headers.get("user-agent"),
        });

        return NextResponse.json({
            success: true,
            message: "User registered successfully",
            user: { id: newUser.id, name: newUser.name, email: newUser.email },
        });
    } catch (error: unknown) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: "Invalid registration data provided" },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { error: "Internal server error during registration" },
            { status: 500 }
        );
    }
}
