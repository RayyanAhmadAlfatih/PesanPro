import nextEnv from "@next/env";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const prisma = new PrismaClient();
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function rejectInput(message) {
    console.error(message);
    process.exitCode = 1;
    return false;
}

async function main() {
    const email = process.argv[2]?.trim().toLowerCase();
    const password = process.argv[3] ?? process.env.ADMIN_PASSWORD;

    if (!email) {
        rejectInput("Please provide email. Usage: npm run make-admin -- <email> [password]");
        return;
    }

    if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
        rejectInput("Please provide a valid email address.");
        return;
    }

    const existingUser = await prisma.user.findUnique({
        where: { email }
    });

    if (existingUser) {
        console.log(`User ${email} found. Promoting to SUPERADMIN...`);
        await prisma.user.update({
            where: { email },
            data: {
                role: 'SUPERADMIN',
                status: 'ACTIVE',
                ownerId: null,
                sessionVersion: { increment: 1 }
            }
        });
        console.log("User promoted successfully!");
    } else {
        if (!password) {
            rejectInput("Password required. Set ADMIN_PASSWORD or use: npm run make-admin -- <email> <password>");
            return;
        }

        if (password.length < 10 || password.length > 128 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
            rejectInput("Password must be 10-128 characters and contain uppercase, lowercase, and a number.");
            return;
        }

        console.log(`Creating new SUPERADMIN user ${email}...`);
        const hashedPassword = await bcrypt.hash(password, 12);
        
        await prisma.user.create({
            data: {
                email,
                name: "Super Admin",
                password: hashedPassword,
                role: 'SUPERADMIN'
            }
        });
        console.log("Super Admin created successfully!");
    }
}

main()
    .catch((error) => {
        if (error?.code === "P2021") {
            console.error("Database schema is not ready. Run `npm run db:migrate` before `npm run make-admin`.");
        } else if (error?.code === "P1001") {
            console.error("Cannot reach the database. Check DATABASE_URL and ensure MySQL is running.");
        } else {
            console.error(error instanceof Error ? error.message : error);
        }
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
