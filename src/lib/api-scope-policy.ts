import type { ApiKeyScope } from "./api-key-service";

export function getRequiredApiScope(method: string, pathname: string): ApiKeyScope | null {
  const write = !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
  if (pathname.startsWith("/api/v1/messages")) return write ? "message:send" : "message:read";
  if (pathname.startsWith("/api/v1/media")) return write ? "media:write" : "media:read";
  if (pathname.startsWith("/api/v1/schedules")) return write ? "schedule:write" : "schedule:read";
  if (pathname.startsWith("/api/v1/autoreplies") || pathname.startsWith("/api/autoreplies/")) {
    return write ? "autoreply:write" : "autoreply:read";
  }
  if (pathname.startsWith("/api/v1/integration-tokens")) return write ? "webhook:write" : "webhook:read";
  if (pathname.startsWith("/api/v1/broadcasts") || pathname.startsWith("/api/v1/suppressions")) {
    return write ? "broadcast:write" : "broadcast:read";
  }
  if (
    pathname.startsWith("/api/v1/campaigns") ||
    pathname.startsWith("/api/v1/segments") ||
    pathname.startsWith("/api/v1/contact-tags") ||
    pathname.startsWith("/api/v1/contacts/")
  ) {
    return write ? "campaign:write" : "campaign:read";
  }
  if (/^\/api\/messages\/[^/]+\/broadcast(?:\/|$)/.test(pathname)) return write ? "broadcast:write" : "broadcast:read";
  if (pathname.startsWith("/api/messages/")) return write ? "message:send" : "message:read";
  if (pathname.startsWith("/api/media")) return write ? "media:write" : "media:read";
  if (pathname.startsWith("/api/scheduler/")) return write ? "schedule:write" : "schedule:read";
  if (pathname.startsWith("/api/webhooks/")) return write ? "webhook:write" : "webhook:read";
  if (
    pathname.startsWith("/api/sessions") ||
    pathname.startsWith("/api/chat/") ||
    pathname.startsWith("/api/contacts/") ||
    pathname.startsWith("/api/labels/")
  ) {
    return write ? "device:write" : "device:read";
  }
  return null;
}
