import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("public /api/health liveness probe", () => {
  it("returns 200 with an alive status and nothing else", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", check: "liveness" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("never exposes readiness, database, tenant, session, path, or version data", async () => {
    const response = await GET();
    const body = await response.json() as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["check", "status"]);
    const serialized = JSON.stringify(body).toLowerCase();
    for (const forbidden of [
      "readiness", "database", "tenant", "session", "timestamp",
      "uptime", "version", "/www/", "freebytes", "totalbytes", "worker", "path",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
