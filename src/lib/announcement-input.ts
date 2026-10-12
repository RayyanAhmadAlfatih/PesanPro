import { z } from "zod";
import {
  ANNOUNCEMENT_HREF_MAX_LENGTH,
  ANNOUNCEMENT_LINE_MAX_LENGTH,
  ANNOUNCEMENT_MAX_LINES,
  ANNOUNCEMENT_TITLE_MAX_LENGTH,
  isInternalAnnouncementHref,
  parseAnnouncementLines,
} from "./announcement-policy";

/**
 * Shared by create and update, so a draft and a published row can never drift
 * apart in what they accept.
 */
export const announcementSchema = z.object({
  title: z.string().trim().min(3).max(ANNOUNCEMENT_TITLE_MAX_LENGTH),
  body: z.string().trim().min(1),
  version: z.string().trim().max(32).nullable().optional(),
  href: z.string().trim().max(ANNOUNCEMENT_HREF_MAX_LENGTH).nullable().optional(),
  publish: z.boolean().default(false),
}).strict().superRefine((value, context) => {
  const lines = parseAnnouncementLines(value.body);
  if (lines.length === 0) {
    context.addIssue({ code: "custom", path: ["body"], message: "Provide at least one bullet" });
  }
  if (lines.length > ANNOUNCEMENT_MAX_LINES) {
    context.addIssue({ code: "custom", path: ["body"], message: `At most ${ANNOUNCEMENT_MAX_LINES} bullets` });
  }
  if (lines.some((line) => line.length > ANNOUNCEMENT_LINE_MAX_LENGTH)) {
    context.addIssue({
      code: "custom",
      path: ["body"],
      message: `Each bullet is limited to ${ANNOUNCEMENT_LINE_MAX_LENGTH} characters`,
    });
  }
  if (value.href && !isInternalAnnouncementHref(value.href)) {
    context.addIssue({
      code: "custom",
      path: ["href"],
      message: "Link must be an in-app path such as /dashboard/settings",
    });
  }
});

export type AnnouncementInput = z.infer<typeof announcementSchema>;
