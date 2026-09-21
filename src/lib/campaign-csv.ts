function safeCell(value: unknown) {
  const text = String(value ?? "");
  const neutralized = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${neutralized.replace(/"/g, '""')}"`;
}

export function campaignResultsCsv(rows: Array<Record<string, unknown>>) {
  const columns = ["recipient", "snapshotStatus", "queueStatus", "messageStatus", "errorCode"];
  return `${columns.map(safeCell).join(",")}\r\n${rows.map((row) => columns.map((column) => safeCell(row[column])).join(",")).join("\r\n")}\r\n`;
}
