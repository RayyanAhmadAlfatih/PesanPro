import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { AuthenticationCreds, AuthenticationState, BufferJSON, initAuthCreds, SignalDataTypeMap } from "@whiskeysockets/baileys";
import { logger } from "@/lib/logger";
import { encrypt, decrypt, isEncryptedRecord } from "@/lib/crypto";

export async function migrateLegacyAuthStateRecords(): Promise<number> {
    const legacyRecords = await prisma.authState.findMany({
        where: {
            value: { not: Prisma.DbNull },
            OR: [{ encValue: null }, { iv: null }, { authTag: null }],
        },
        select: { id: true, value: true },
    });

    for (const record of legacyRecords) {
        const serialized = JSON.stringify(
            record.value,
            BufferJSON.replacer as unknown as Parameters<typeof JSON.stringify>[1],
        );
        const encrypted = encrypt(serialized);
        await prisma.authState.update({
            where: { id: record.id },
            data: { ...encrypted, value: Prisma.DbNull },
        });
    }

    if (legacyRecords.length > 0) {
        logger.success("Auth", `Encrypted ${legacyRecords.length} legacy WhatsApp credential records.`);
    }
    return legacyRecords.length;
}

export const createPrismaAuthState = async (sessionId: string): Promise<{ state: AuthenticationState, saveCreds: () => Promise<void> }> => {

    // Helper to read JSON with Buffer handling — supports encrypted (Gate 0) and legacy plaintext
    const readData = async (type: string, id: string) => {
        try {
            const key = `${type}-${id}`;
            const data = await prisma.authState.findUnique({
                where: { sessionId_key: { sessionId, key } }
            });
            if (!data) return null;

            // Prefer encrypted fields (Gate 0)
            if (isEncryptedRecord(data as unknown as { encValue?: string | null; iv?: string | null; authTag?: string | null })) {
                try {
                    const rec = data as unknown as { encValue: string; iv: string; authTag: string };
                    const plaintext = decrypt(rec.encValue, rec.iv, rec.authTag);
                    return JSON.parse(plaintext, BufferJSON.reviver);
                } catch (e) {
                    logger.error("Auth", `Failed to decrypt auth state ${key}:`, e);
                    // Fall back to legacy value if decrypt fails (e.g. key rotation issue)
                    if (data.value) {
                        return JSON.parse(JSON.stringify(data.value), BufferJSON.reviver);
                    }
                    return null;
                }
            }

            if (data.value) {
                return JSON.parse(JSON.stringify(data.value), BufferJSON.reviver);
            }
            return null;
        } catch (error) {
            logger.error("Auth", 'Error reading auth state:', error);
            return null;
        }
    };

    // Helper to write data — always encrypted (Gate 0)
    const writeData = async (type: string, id: string, data: unknown) => {
        try {
            const key = `${type}-${id}`;
            const serialized = JSON.stringify(data, BufferJSON.replacer as unknown as Parameters<typeof JSON.stringify>[1]);
            const { encValue, iv, authTag } = encrypt(serialized);

            await prisma.authState.upsert({
                where: { sessionId_key: { sessionId, key } },
                create: { sessionId, key, encValue, iv, authTag, value: Prisma.DbNull },
                update: { encValue, iv, authTag, value: Prisma.DbNull },
            });
        } catch (error) {
             logger.error("Auth", 'Error writing auth state:', error);
        }
    };

    const removeData = async (type: string, id: string) => {
        try {
            const key = `${type}-${id}`;
             await prisma.authState.deleteMany({
                where: { sessionId, key }
            });
        } catch (error) {
            // ignore
        }
    }


    const creds: AuthenticationCreds = (await readData('creds', 'me')) || initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data: { [key: string]: SignalDataTypeMap[typeof type] } = {};
                    await Promise.all(ids.map(async id => {
                        let value = await readData(type, id);
                        if (type === 'app-state-sync-key' && value) {
                            value = BufferJSON.reviver(null, value);
                        }
                        if (value) {
                            data[id] = value;
                        }
                    }));
                    return data;
                },
                set: async (data) => {
                     const tasks: Promise<void>[] = [];
                    for (const category in data) {
                        const categoryData = data[category as keyof typeof data];
                        if (!categoryData) continue;
                        
                        for (const id in categoryData) {
                            const value = categoryData[id];
                             if (value) {
                                tasks.push(writeData(category, id, value));
                            } else {
                                tasks.push(removeData(category, id));
                            }
                        }
                    }
                    await Promise.all(tasks);
                }
            }
        },
        saveCreds: async () => {
            await writeData('creds', 'me', creds);
        }
    }
}
