import { z } from "zod";

// Message content for Baileys - can be text object or media object
export const messageContentSchema = z.union([
    z.object({ text: z.string() }),
    z.object({ image: z.object({ url: z.string() }), caption: z.string().optional() }),
    z.object({ video: z.object({ url: z.string() }), caption: z.string().optional() }),
    z.object({ document: z.object({ url: z.string() }), mimetype: z.string().optional(), fileName: z.string().optional() }),
]);

export const broadcastSchema = z.object({
    sessionId: z.string().min(1),
    recipients: z.array(z.string()).min(1),
    message: z.string().min(1), // Accept string from frontend, convert to object in API
    delay: z.number().min(500).max(60000).optional().default(2000)
});

