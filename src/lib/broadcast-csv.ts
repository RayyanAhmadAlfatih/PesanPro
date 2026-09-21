import { MessageJobError } from "./message-job-errors";
import { prepareRecipientDataSnapshots, type RecipientVariables } from "./broadcast-policy";

export const MAX_BROADCAST_CSV_BYTES = 2 * 1024 * 1024;
const HEADER_NAMES = new Set([
  "phone",
  "phone_number",
  "mobile",
  "number",
  "recipient",
  "jid",
  "nomor",
  "nomor_hp",
  "no_hp",
  "telepon",
  "telephone",
  "whatsapp",
  "no_whatsapp",
  "wa",
]);
const MAX_VARIABLE_VALUE_LENGTH = 1000;

function invalidCsv(message: string): never {
  throw new MessageJobError("INVALID_RECIPIENT_CSV", message, 422, false);
}

function normalizedHeader(value: string, index: number) {
  const trimmed = value.replace(/^\uFEFF/, "").trim();
  if (!trimmed) return `field_${index + 1}`;
  let normalized = trimmed
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  if (!normalized) normalized = `field_${index + 1}`;
  if (/^[0-9]/.test(normalized)) normalized = `field_${normalized}`.slice(0, 64);
  return normalized;
}

export async function parseBroadcastRecipientCsv(stream: ReadableStream<Uint8Array> | null) {
  if (!stream) invalidCsv("CSV request body is required");
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const rows: string[][] = [];
  let bytes = 0;
  let field = "";
  let row: string[] = [];
  let quoted = false;
  let quotePending = false;

  const pushField = () => {
    if (field.length > 4096) invalidCsv("CSV field is too long");
    row.push(field.trim());
    field = "";
    if (row.length > 20) invalidCsv("CSV cannot exceed 20 columns");
  };
  const pushRow = () => {
    pushField();
    if (row.some(Boolean)) rows.push(row);
    row = [];
    if (rows.length > 5001) invalidCsv("CSV cannot exceed 5000 recipient rows plus one header");
  };
  const consume = (text: string, final = false) => {
    let startIndex = 0;
    if (quotePending) {
      if (text[0] === '"') {
        field += '"';
        startIndex = 1;
      } else {
        quoted = false;
      }
      quotePending = false;
    }
    for (let index = startIndex; index < text.length; index += 1) {
      const character = text[index];
      if (quoted) {
        if (character === '"') {
          if (text[index + 1] === '"') {
            field += '"';
            index += 1;
          } else if (index === text.length - 1 && !final) {
            quotePending = true;
          } else {
            quoted = false;
          }
        } else {
          field += character;
        }
        continue;
      }
      if (character === '"' && field.length === 0) quoted = true;
      else if (character === "," || character === ";") pushField();
      else if (character === "\n") pushRow();
      else if (character !== "\r") field += character;
    }
    if (final && quotePending) {
      quotePending = false;
      quoted = false;
    }
  };

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BROADCAST_CSV_BYTES) invalidCsv("CSV cannot exceed 2 MB");
      consume(decoder.decode(chunk.value, { stream: true }));
    }
    consume(decoder.decode(), true);
  } catch (error) {
    if (error instanceof MessageJobError) throw error;
    invalidCsv("CSV must use valid UTF-8 encoding");
  }
  if (quoted) invalidCsv("CSV contains an unterminated quoted field");
  if (field || row.length > 0) pushRow();
  if (rows.length === 0) invalidCsv("CSV does not contain recipient rows");

  rows[0][0] = rows[0][0]?.replace(/^\uFEFF/, "") ?? "";
  const recipientColumn = rows[0].findIndex((value) => HEADER_NAMES.has(normalizedHeader(value, 0)));
  const hasHeader = recipientColumn >= 0;
  const selectedRecipientColumn = hasHeader ? recipientColumn : 0;
  const dataRows = hasHeader ? rows.slice(1) : rows;

  const headers = hasHeader ? rows[0].map((value, index) => normalizedHeader(value, index)) : ["phone"];
  if (new Set(headers).size !== headers.length) invalidCsv("CSV headers become duplicate variable names after normalization");
  const variableHeaders = hasHeader
    ? headers.filter((_name, index) => index !== selectedRecipientColumn)
    : [];
  if (variableHeaders.length > 19) invalidCsv("CSV cannot contain more than 19 personalization columns");

  const recipientData = dataRows.map((item) => {
    const recipient = item[selectedRecipientColumn]?.trim();
    if (!recipient) return null;
    const variables: RecipientVariables = {};
    if (hasHeader) {
      for (let index = 0; index < headers.length; index += 1) {
        if (index === selectedRecipientColumn) continue;
        const value = item[index]?.trim() ?? "";
        if (value.length > MAX_VARIABLE_VALUE_LENGTH) invalidCsv(`CSV value for ${headers[index]} cannot exceed ${MAX_VARIABLE_VALUE_LENGTH} characters`);
        variables[headers[index]] = value;
      }
    }
    return { recipient, variables };
  }).filter((value): value is { recipient: string; variables: RecipientVariables } => Boolean(value));

  if (recipientData.length === 0) invalidCsv("CSV does not contain recipients in its selected column");
  const snapshots = prepareRecipientDataSnapshots(recipientData);
  const validSnapshots = snapshots.filter((snapshot) => snapshot.status === "PENDING");
  if (validSnapshots.length === 0) invalidCsv("CSV does not contain valid private recipients");

  return {
    recipients: validSnapshots.map((snapshot) => snapshot.jid),
    recipientData: validSnapshots.map((snapshot) => ({ recipient: snapshot.jid, variables: snapshot.variables ?? {} })),
    rowsRead: recipientData.length,
    duplicatesRemoved: recipientData.length - snapshots.length,
    groupsExcluded: snapshots.filter((snapshot) => snapshot.status === "SKIPPED").length,
    headers,
    variableHeaders,
  };
}
