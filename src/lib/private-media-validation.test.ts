import { describe, expect, it } from "vitest";
import { inspectPrivateMedia } from "./private-media-validation";

function makeZip(entryNames: string[]) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const name of entryNames) {
    const filename = Buffer.from(name, "utf8");
    const local = Buffer.alloc(30 + filename.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(filename.length, 26);
    filename.copy(local, 30);
    localParts.push(local);

    const central = Buffer.alloc(46 + filename.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(filename.length, 28);
    central.writeUInt32LE(localOffset, 42);
    filename.copy(central, 46);
    centralParts.push(central);

    localOffset += local.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entryNames.length, 8);
  eocd.writeUInt16LE(entryNames.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(localOffset, 16);

  return Buffer.concat([...localParts, centralDirectory, eocd]);
}

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

describe("private media OOXML validation", () => {
  it.each([
    [DOCX, "word/document.xml", "docx"],
    [XLSX, "xl/workbook.xml", "xlsx"],
    [PPTX, "ppt/presentation.xml", "pptx"],
  ])("accepts a structurally matching %s archive", (mime, mainEntry, extension) => {
    const buffer = makeZip(["[Content_Types].xml", "_rels/.rels", mainEntry]);
    expect(inspectPrivateMedia(buffer, mime)).toMatchObject({ mimeType: mime, extension });
  });

  it.each([DOCX, XLSX, PPTX])("rejects a generic ZIP mislabeled as %s", (mime) => {
    const buffer = makeZip(["notes.txt", "images/example.png"]);
    expect(() => inspectPrivateMedia(buffer, mime)).toThrowError(/declared media type/);
  });

  it("rejects a cross-format OOXML declaration", () => {
    const buffer = makeZip(["[Content_Types].xml", "word/document.xml"]);
    expect(() => inspectPrivateMedia(buffer, XLSX)).toThrowError(/declared media type/);
  });

  it("rejects a malformed ZIP central directory", () => {
    const buffer = Buffer.from("504b030400000000", "hex");
    expect(() => inspectPrivateMedia(buffer, DOCX)).toThrowError(/declared media type/);
  });
});
