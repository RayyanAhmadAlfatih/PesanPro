import { z } from "zod";
import { MessageJobError } from "./message-job-errors";

const fieldValueSchema = z.union([
  z.string().max(2000),
  z.array(z.string().max(1000)).max(20),
]);

export const formFieldsSchema = z.record(z.string().trim().min(1).max(120), fieldValueSchema).superRefine((fields, context) => {
  const entries = Object.entries(fields);
  if (entries.length > 100) context.addIssue({ code: "custom", message: "A form submission can contain at most 100 fields" });
  const total = entries.reduce((sum, [key, value]) => sum + key.length + (Array.isArray(value) ? value.join(", ").length : value.length), 0);
  if (total > 20_000) context.addIssue({ code: "custom", message: "Form fields exceed the 20,000 character limit" });
});

function clean(value: string) {
  return value.replaceAll("\0", "").replace(/\r\n?/g, "\n").trim();
}

export function normalizeFormFields(fields: Record<string, string | string[]>) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [
    clean(key),
    Array.isArray(value) ? value.map(clean).filter(Boolean).join(", ") : clean(value),
  ]));
}

export function formMetadata(fields: Record<string, string>, extras: Record<string, string | number | boolean | null | undefined> = {}) {
  return {
    ...Object.fromEntries(Object.entries(extras).map(([key, value]) => [key, value ?? null])),
    ...Object.fromEntries(Object.entries(fields).map(([key, value]) => [`field.${key}`, value])),
  };
}

export function buildDefaultFormMessage(provider: "Google Forms" | "Contact Form 7", formTitle: string | undefined, fields: Record<string, string>) {
  const header = `${provider}${formTitle ? ` - ${clean(formTitle)}` : ""}`;
  const lines = [header, ...Object.entries(fields).map(([key, value]) => `${key}: ${value || "-"}`)];
  const message = lines.join("\n").trim();
  if (!message || message.length > 4096) throw new MessageJobError("INVALID_MESSAGE", "Rendered form message must contain 1-4096 characters", 422, false);
  return message;
}
