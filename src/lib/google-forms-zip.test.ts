import { describe, expect, it } from "vitest";
import { collectGoogleFormsFiles, GOOGLE_FORMS_ZIP_FILENAME, resolveGoogleFormsZipBytes } from "./google-forms-package";
import { looksLikeZip } from "./wordpress-plugin-zip";

describe("Google Forms connector packaging", () => {
  it("collects every bundled connector file under one root directory", async () => {
    const files = await collectGoogleFormsFiles();
    expect(files.map((file) => file.name)).toEqual([
      "pesanpro-google-forms/Code.gs",
      "pesanpro-google-forms/README.md",
      "pesanpro-google-forms/appsscript.json",
    ]);
  });

  it("builds a valid ZIP archive of the connector", async () => {
    const zip = await resolveGoogleFormsZipBytes();
    expect(looksLikeZip(zip)).toBe(true);
    expect(zip.length).toBeGreaterThan(0);
    // The three connector files are a few kilobytes; the stored-entry archive
    // must be larger than the sources' total plus ZIP overhead floors.
    expect(zip.length).toBeGreaterThan(1000);
    expect(GOOGLE_FORMS_ZIP_FILENAME).toBe("pesanpro-google-forms.zip");
  });
});
