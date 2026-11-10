import { z } from "zod";

// Skema input ganti password. Dipisah dari route.ts sesuai kontrak repo:
// skema zod tidak diekspor dari route handler.
export const passwordChangeSchema = z
    .object({
        currentPassword: z.string().min(1).max(128),
        newPassword: z.string().min(8).max(128),
    })
    .strict();

export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>;
