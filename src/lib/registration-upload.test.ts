import { describe, expect, it } from "vitest";
import { parseRegistrationUpload } from "./registration-upload";

function registrationForm(includeProof = true) {
  const form = new FormData();
  form.set("name", "Ayu Setiawan");
  form.set("email", "ayu@example.com");
  form.set("password", "Rahasia12345");
  form.set("planId", "plan_starter");
  form.set("billingCycle", "MONTHLY");
  form.set("reference", "Ayu Setiawan");
  if (includeProof) {
    form.append("proof", new Blob([Buffer.from([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" }), "bukti.png");
  }
  return new Request("http://localhost/api/auth/register", { method: "POST", body: form });
}

describe("registration multipart parser", () => {
  it("reads the account fields together with the payment proof", async () => {
    const parsed = await parseRegistrationUpload(registrationForm());
    expect(parsed.fields).toMatchObject({
      name: "Ayu Setiawan",
      email: "ayu@example.com",
      planId: "plan_starter",
      billingCycle: "MONTHLY",
      reference: "Ayu Setiawan",
    });
    expect(parsed.originalName).toBe("bukti.png");
    expect(parsed.declaredMimeType).toBe("image/png");
    expect(parsed.buffer.length).toBe(4);
  });

  it("refuses a registration without a proof file", async () => {
    await expect(parseRegistrationUpload(registrationForm(false)))
      .rejects.toMatchObject({ code: "PAYMENT_PROOF_REQUIRED", status: 422 });
  });

  it("refuses a JSON body instead of multipart", async () => {
    const request = new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "ayu@example.com" }),
    });
    await expect(parseRegistrationUpload(request))
      .rejects.toMatchObject({ code: "UNSUPPORTED_PAYMENT_PROOF", status: 415 });
  });
});
