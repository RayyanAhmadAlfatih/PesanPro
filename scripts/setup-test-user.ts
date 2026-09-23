
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

async function main() {
    if (process.env.NODE_ENV === "production") {
        throw new Error("Refusing to create a test superadmin in production");
    }
    const email = process.env.PESANPRO_TEST_USER_EMAIL?.trim();
    const apiKey = process.env.PESANPRO_TEST_API_KEY?.trim();
    const plainPassword = process.env.PESANPRO_TEST_USER_PASSWORD;
    if (!email || !apiKey || !plainPassword) {
        throw new Error("PESANPRO_TEST_USER_EMAIL, PESANPRO_TEST_API_KEY, and PESANPRO_TEST_USER_PASSWORD are required");
    }
    if (plainPassword.length < 12) throw new Error("PESANPRO_TEST_USER_PASSWORD must be at least 12 characters");
    const password = await bcrypt.hash(plainPassword, 12);

    const user = await prisma.user.upsert({
        where: { email },
        update: { apiKey, role: 'SUPERADMIN' },
        create: {
            email,
            password,
            name: "Test User",
            apiKey,
            role: 'SUPERADMIN'
        }
    });

    console.log(`Test user ${user.email} is ready; API key value was not logged.`);
    
    // Also ensure a session exists for testing
    const session = await prisma.session.upsert({
        where: { sessionId: "test-session" },
        update: { userId: user.id },
        create: {
            sessionId: "test-session",
            name: "Test Session",
            userId: user.id,
            status: "CONNECTED"
        }
    });
    console.log(`Session ${session.sessionId} ready.`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
