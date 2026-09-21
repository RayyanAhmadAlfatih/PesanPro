import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.join(process.cwd(), "integrations/wordpress/pesanpro-contact-form-7");
const files = [
  "pesanpro-contact-form-7.php",
  "includes/class-pesanpro-cf7-plugin.php",
  "includes/class-pesanpro-cf7-settings.php",
  "includes/class-pesanpro-cf7-queue.php",
  "uninstall.php",
].map((file) => readFileSync(path.join(root, file), "utf8"));
const source = files.join("\n");

describe("Contact Form 7 WordPress package", () => {
  it("uses official WordPress and Contact Form 7 server-side APIs", () => {
    expect(source).toContain("register_setting(");
    expect(source).toContain("current_user_can( 'manage_options' )");
    expect(source).toContain("wpcf7_mail_sent");
    expect(source).toContain("WPCF7_Submission::get_instance()");
    expect(source).toContain("get_posted_data()");
    expect(source).toContain("wp_safe_remote_post(");
    expect(source).toContain("wp_schedule_single_event(");
  });

  it("never uses browser secrets, raw POST input, curl, or response-body persistence", () => {
    expect(source).not.toMatch(/\$_(?:POST|GET|REQUEST)/);
    expect(source).not.toMatch(/curl_(?:init|exec|setopt)/i);
    expect(source).not.toMatch(/response_body|responseBody/);
    expect(source).not.toMatch(/value=["'][^"']*ppint_/);
    expect(source).toContain("autocomplete=\"new-password\"");
  });

  it("implements atomic claim, bounded retry, stable idempotency, and safe uninstall", () => {
    expect(source).toMatch(/ORDER BY available_at ASC, id ASC LIMIT 1/);
    expect(source).toContain("const MAX_ATTEMPTS = 8");
    expect(source).toContain("Idempotency-Key");
    expect(source).toContain("PESANPRO_CF7_REMOVE_DATA");
    expect(source).toContain("redirection' => 0");
  });
});
