import { describe, expect, it } from "vitest";
import { getRequiredApiScope } from "./api-scope-policy";

describe("API route scope policy", () => {
  it("maps read and write operations to separate scopes", () => {
    expect(getRequiredApiScope("GET", "/api/sessions")).toBe("device:read");
    expect(getRequiredApiScope("POST", "/api/sessions")).toBe("device:write");
    expect(getRequiredApiScope("GET", "/api/messages/device/chat/list")).toBe("message:read");
    expect(getRequiredApiScope("POST", "/api/messages/device/chat/send")).toBe("message:send");
    expect(getRequiredApiScope("GET", "/api/v1/broadcasts")).toBe("broadcast:read");
    expect(getRequiredApiScope("POST", "/api/v1/broadcasts")).toBe("broadcast:write");
    expect(getRequiredApiScope("GET", "/api/messages/device/broadcast/history")).toBe("broadcast:read");
    expect(getRequiredApiScope("GET", "/api/v1/autoreplies?sessionId=device")).toBe("autoreply:read");
    expect(getRequiredApiScope("POST", "/api/v1/autoreplies/preview")).toBe("autoreply:write");
    expect(getRequiredApiScope("GET", "/api/v1/integration-tokens")).toBe("webhook:read");
    expect(getRequiredApiScope("POST", "/api/v1/integration-tokens")).toBe("webhook:write");
  });

  it("defaults administrative routes to no API-key access", () => {
    expect(getRequiredApiScope("GET", "/api/users")).toBeNull();
    expect(getRequiredApiScope("PATCH", "/api/settings/system")).toBeNull();
    expect(getRequiredApiScope("POST", "/api/team")).toBeNull();
  });
});
