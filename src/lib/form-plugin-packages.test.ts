import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function packageSource(root: string, files: string[]) {
  return files.map((file) => readFileSync(path.join(process.cwd(), "integrations/wordpress", root, file), "utf8")).join("\n");
}

const woo = packageSource("pesanpro-woocommerce", [
  "pesanpro-woocommerce.php",
  "includes/class-pesanpro-woo-plugin.php",
  "includes/class-pesanpro-woo-settings.php",
  "includes/class-pesanpro-woo-queue.php",
  "includes/class-pesanpro-woo-message.php",
  "uninstall.php",
]);

const elementor = packageSource("pesanpro-elementor-form", [
  "pesanpro-elementor-form.php",
  "includes/class-pesanpro-elementor-plugin.php",
  "includes/class-pesanpro-elementor-settings.php",
  "includes/class-pesanpro-elementor-queue.php",
  "includes/class-pesanpro-elementor-message.php",
  "uninstall.php",
]);

const forms = readFileSync(path.join(process.cwd(), "integrations/google-forms/Code.gs"), "utf8");

describe("WooCommerce WordPress package", () => {
  it("stores a separate message template for every order event", () => {
    expect(woo).toContain("woocommerce_new_order");
    expect(woo).toContain("woocommerce_order_status_changed");
    for (const event of ["order.created", "order.updated", "order.paid", "order.completed", "order.cancelled", "order.refunded"]) {
      expect(woo).toContain(`'${event}'`);
    }
    expect(woo).toContain("enabled_events");
    expect(woo).toContain("'message'   => $message");
    expect(woo).toContain("PesanPro_Woo_Message::render(");
  });

  it("keeps delivery restart-safe and the token out of the browser", () => {
    expect(woo).toContain("ORDER BY available_at ASC, id ASC LIMIT 1");
    expect(woo).toContain("DATE_ADD(locked_at, INTERVAL 5 MINUTE)");
    expect(woo).toContain("const MAX_ATTEMPTS = 8");
    expect(woo).toContain("Idempotency-Key");
    expect(woo).toContain("redirection' => 0");
    expect(woo).toContain("PESANPRO_WOO_REMOVE_DATA");
    expect(woo).toContain("autocomplete=\"new-password\"");
    expect(woo).not.toMatch(/\$_(?:POST|GET|REQUEST)/);
    expect(woo).not.toMatch(/curl_(?:init|exec|setopt)/i);
    expect(woo).not.toMatch(/ppint_[A-Za-z0-9_-]{20,}/);
  });
});

describe("Elementor Form WordPress package", () => {
  it("uses the existing WORDPRESS token lane without a new integration type", () => {
    expect(elementor).toContain("elementor_pro/forms/new_record");
    expect(elementor).toContain("api/v1/integrations/wordpress");
    expect(elementor).not.toMatch(/api\/v1\/integrations\/(?:contact-form-7|woocommerce|google-forms)/);
    expect(elementor).toContain("'message'      => $message");
  });

  it("keeps per-form templates scoped to the forms the owner listed", () => {
    expect(elementor).toContain("row_for(");
    expect(elementor).toContain("form_scope");
    expect(elementor).toContain("PesanPro_Elementor_Message::render(");
    expect(elementor).toContain("recipient_missing");
    expect(elementor).toContain("const MAX_BYTES = 4096");
  });

  it("keeps delivery restart-safe and the token out of the browser", () => {
    expect(elementor).toContain("ORDER BY available_at ASC, id ASC LIMIT 1");
    expect(elementor).toContain("DATE_ADD(locked_at, INTERVAL 5 MINUTE)");
    expect(elementor).toContain("Idempotency-Key");
    expect(elementor).toContain("redirection' => 0");
    expect(elementor).toContain("PESANPRO_ELEMENTOR_REMOVE_DATA");
    expect(elementor).toContain("autocomplete=\"new-password\"");
    expect(elementor).not.toMatch(/\$_(?:POST|GET|REQUEST)/);
    expect(elementor).not.toMatch(/ppint_[A-Za-z0-9_-]{20,}/);
  });
});

describe("Google Forms connector package", () => {
  it("renders the per-form template client-side and sends it as message", () => {
    expect(forms).toContain("PESANPRO_MESSAGE_TEMPLATE");
    expect(forms).toContain("PESANPRO_TEMPLATE_PREFIX");
    expect(forms).toContain("pesanProRenderMessage(");
    expect(forms).toContain("payload.message");
    expect(forms).toContain("PESANPRO_MAX_MESSAGE_LENGTH");
  });
});
