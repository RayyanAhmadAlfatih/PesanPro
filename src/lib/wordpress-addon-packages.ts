import { resolveBundledPluginZip } from "./wordpress-plugin-zip";

export const WOOCOMMERCE_PLUGIN_DIR = "pesanpro-woocommerce";
export const WOOCOMMERCE_ZIP_FILENAME = "pesanpro-woocommerce.zip";
export const ELEMENTOR_PLUGIN_DIR = "pesanpro-elementor-form";
export const ELEMENTOR_ZIP_FILENAME = "pesanpro-elementor-form.zip";

export function resolveWooCommercePluginZipBytes(): Promise<Buffer> {
  return resolveBundledPluginZip(WOOCOMMERCE_PLUGIN_DIR);
}

export function resolveElementorPluginZipBytes(): Promise<Buffer> {
  return resolveBundledPluginZip(ELEMENTOR_PLUGIN_DIR);
}
