import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ enqueue: vi.fn(), readToken: vi.fn(() => "ppint_valid") }));
vi.mock("@/lib/integration-service", () => ({ enqueueIntegrationMessage: mocks.enqueue, readIntegrationToken: mocks.readToken }));

import { POST as googleForms } from "@/app/api/v1/integrations/google-forms/route";
import { POST as contactForm7 } from "@/app/api/v1/integrations/contact-form-7/route";

function request(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "stable-key" }, body: JSON.stringify(body) });
}

describe("Phase 9.1 form connector API boundaries", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.enqueue.mockResolvedValue({ messageJobId: "job-1" }); });

  it("normalizes Google Forms fields and enforces GOOGLE_FORMS token identity", async () => {
    const response = await googleForms(request("/api/v1/integrations/google-forms", { responseId: "r-1", formId: "f-1", recipient: "628123456789", fields: { Nama: "Yusuf" } }));
    expect(response.status).toBe(202);
    expect(mocks.enqueue).toHaveBeenCalledWith(expect.objectContaining({ expectedType: "GOOGLE_FORMS", idempotencyKey: "stable-key", message: expect.objectContaining({ sourceId: "r-1" }) }));
  });

  it("uses a dedicated CONTACT_FORM_7 token identity", async () => {
    const response = await contactForm7(request("/api/v1/integrations/contact-form-7", { submissionId: "s-1", formId: 7, site: "https://wordpress.example", recipient: "628123456789", fields: { "your-name": "Yusuf" } }));
    expect(response.status).toBe(202);
    expect(mocks.enqueue).toHaveBeenCalledWith(expect.objectContaining({ expectedType: "CONTACT_FORM_7", message: expect.objectContaining({ sourceId: "s-1" }) }));
  });

  it("accepts the exact timestamp shape the WordPress plugin sends", async () => {
    // gmdate('c') produces "+00:00", not "Z". A strict datetime parse made every
    // real Contact Form 7 submission fail with 422 while the synthetic test
    // payload (which omitted submittedAt) passed.
    const response = await contactForm7(request("/api/v1/integrations/contact-form-7", {
      submissionId: "s-2",
      formId: "7",
      formTitle: "Hubungi Kami",
      submittedAt: "2026-11-02T02:47:17+00:00",
      site: "https://wordpress.example/",
      recipient: "628123456789",
      fields: { "your-name": "Yusuf" },
    }));
    expect(response.status).toBe(202);
    expect(mocks.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.objectContaining({ metadata: expect.objectContaining({ submittedAt: "2026-11-02T02:47:17+00:00" }) }),
    }));
  });

  it("accepts a non-UTC offset from a site-configured timezone", async () => {
    const response = await contactForm7(request("/api/v1/integrations/contact-form-7", {
      submissionId: "s-3",
      formId: "7",
      submittedAt: "2026-11-02T09:47:17+07:00",
      site: "https://wordpress.example/",
      recipient: "628123456789",
      fields: { "your-name": "Yusuf" },
    }));
    expect(response.status).toBe(202);
  });

  it("rejects oversized field collections before queue access", async () => {
    const fields = Object.fromEntries(Array.from({ length: 101 }, (_, index) => [`field-${index}`, "x"]));
    const response = await googleForms(request("/api/v1/integrations/google-forms", { responseId: "r-2", recipient: "628123456789", fields }));
    expect(response.status).toBe(422);
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
});
