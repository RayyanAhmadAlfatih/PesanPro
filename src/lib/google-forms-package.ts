import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { buildPluginZip, type PluginZipEntry } from "./wordpress-plugin-zip";

export const GOOGLE_FORMS_ZIP_FILENAME = "pesanpro-google-forms.zip";
export const GOOGLE_FORMS_ZIP_ROOT_DIR = "pesanpro-google-forms";

const BUNDLED_GOOGLE_FORMS_DIR = path.join(process.cwd(), "integrations", "google-forms");

/**
 * The Google Forms connector sources bundled with the repository, packaged as
 * a ready-to-import Apps Script archive. Reuses the stored-entry ZIP builder
 * from the WordPress plugin packager — the sources are a few kilobytes, so no
 * compression dependency is needed.
 */
export async function collectGoogleFormsFiles(): Promise<PluginZipEntry[]> {
  const entries = await readdir(BUNDLED_GOOGLE_FORMS_DIR, { withFileTypes: true });
  const files: PluginZipEntry[] = [];
  for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    if (entry.name.startsWith(".")) continue;
    files.push({
      name: `${GOOGLE_FORMS_ZIP_ROOT_DIR}/${entry.name}`,
      data: await readFile(path.join(BUNDLED_GOOGLE_FORMS_DIR, entry.name)),
    });
  }
  if (!files.some((file) => file.name === `${GOOGLE_FORMS_ZIP_ROOT_DIR}/Code.gs`)) {
    throw new Error("Bundled Google Forms connector is missing Code.gs");
  }
  return files;
}

export async function resolveGoogleFormsZipBytes(): Promise<Buffer> {
  return buildPluginZip(await collectGoogleFormsFiles());
}
