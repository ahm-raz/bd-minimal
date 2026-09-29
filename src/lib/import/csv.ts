/**
 * RFC 4180 CSV parser for lead imports (docs/04, CSV import). Small on purpose: no dependency, every case
 * tested. Handles a UTF-8 BOM, CRLF or LF line ends, quoted fields with commas, quotes ("") and line breaks.
 * Malformed input gives a structured error; it never throws.
 */

export type CsvResult =
  | { ok: true; header: string[]; rows: { line: number; cells: string[] }[] }
  | { ok: false; error: string };

/** Bytes to text: strict UTF-8, BOM removed. */
export function decodeCsv(bytes: Uint8Array): { ok: true; text: string } | { ok: false; error: string } {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { ok: true, text: text.charCodeAt(0) === 0xfeff ? text.slice(1) : text };
  } catch {
    return { ok: false, error: "The file isn't UTF-8 text. In Excel use Save as, CSV UTF-8, and upload that file." };
  }
}

/**
 * Parse CSV text. `line` is the spreadsheet row number of each record (header = 1), counting records,
 * not physical lines, so it matches what people see in Excel.
 */
export function parseCsv(input: string): CsvResult {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  let i = 0;
  let quotedStartRecord = 0;

  const endField = () => {
    record.push(field);
    field = "";
  };
  const endRecord = () => {
    endField();
    records.push(record);
    record = [];
  };

  while (i < text.length) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        // After a closing quote only a separator or line end may follow.
        const n = text[i];
        if (n !== undefined && n !== "," && n !== "\n" && n !== "\r") {
          return { ok: false, error: `Row ${records.length + 1}: text after a closing quote. Check the quotes in that row.` };
        }
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      if (field.length > 0) {
        return { ok: false, error: `Row ${records.length + 1}: a quote in the middle of a value. Wrap the value in quotes and double the inner quote ("").` };
      }
      inQuotes = true;
      quotedStartRecord = records.length + 1;
      i++;
      continue;
    }
    if (c === ",") {
      endField();
      i++;
      continue;
    }
    if (c === "\r" || c === "\n") {
      endRecord();
      i += c === "\r" && text[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    field += c;
    i++;
  }
  if (inQuotes) {
    return { ok: false, error: `Row ${quotedStartRecord}: a quoted value is never closed. Check for a missing quote.` };
  }
  if (field.length > 0 || record.length > 0) endRecord();

  // A trailing blank line is not a record.
  while (records.length > 0 && isBlank(records[records.length - 1]!)) records.pop();
  if (records.length === 0) return { ok: false, error: "The file is empty." };

  const header = records[0]!.map((h) => h.trim());
  const rows: { line: number; cells: string[] }[] = [];
  for (let r = 1; r < records.length; r++) {
    const cells = records[r]!;
    if (cells.length > header.length && !cells.slice(header.length).every((c) => c.trim() === "")) {
      return {
        ok: false,
        error: `Row ${r + 1} has ${cells.length} values but the header has ${header.length} columns. Check for an unquoted comma.`,
      };
    }
    rows.push({ line: r + 1, cells: cells.slice(0, header.length) });
  }
  return { ok: true, header, rows };
}

export function isBlank(cells: string[]): boolean {
  return cells.every((c) => c.trim() === "");
}

/** Quote a value for a CSV we generate (template, error report). Also defuses formulas when opened in Excel. */
export function csvCell(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
