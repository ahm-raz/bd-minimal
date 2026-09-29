import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { decodeCsv, parseCsv } from "@/lib/import/csv";
import { IMPORT_FIELDS, mapColumns, type ColumnMapping } from "@/lib/import/columns";
import {
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  MAX_REPORTED_ERRORS,
  validateRows,
  type ImportIssue,
} from "@/lib/import/validate";
import { getLists } from "@/server/queries/lists";
import { dbErrorMessage } from "@/server/result";
import type { Viewer } from "@/server/auth";

/**
 * CSV lead import, server side (docs/04 section 10). Step 1 analyses the file and stores a batch; step 2
 * imports that stored batch in one database transaction (import_lead_batch). Nothing here writes a lead.
 */

export type ImportPreview = {
  batchId: string | null;
  code: string | null;
  filename: string;
  valid: boolean;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicates: number;
  blankRows: number;
  warningsCount: number;
  errorCount: number;
  columns: (ColumnMapping & { label: string | null })[];
  missingFields: { field: string; label: string; outcome: string }[];
  errors: ImportIssue[];
  warnings: ImportIssue[];
  /** When nothing could even be read (bad file, bad header), the reason. */
  fileError: string | null;
  expiresAt: string | null;
};

export class ImportHttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const defaultsSchema = z.object({
  defaultOwnerId: z.uuid().nullable(),
  defaultNicheId: z.uuid().nullable(),
  defaultChannelId: z.uuid().nullable(),
});

/** Permission is the database's call (can_import_leads), checked on every request. */
export async function assertCanImport(): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("can_import_leads");
  if (error) throw new ImportHttpError(500, "Couldn't check your permission. Try again.");
  if (!data) throw new ImportHttpError(403, "You don't have permission to import leads. Ask the founder to turn it on.");
}

function emptyPreview(filename: string, fileError: string): ImportPreview {
  return {
    batchId: null,
    code: null,
    filename,
    valid: false,
    totalRows: 0,
    validRows: 0,
    invalidRows: 0,
    duplicates: 0,
    blankRows: 0,
    warningsCount: 0,
    errorCount: 1,
    columns: [],
    missingFields: [],
    errors: [{ row: null, field: null, message: fileError }],
    warnings: [],
    fileError,
    expiresAt: null,
  };
}

/** Checks that need no parsing: presence, size, type, and that it's text at all. */
function checkFile(file: FormDataEntryValue | null): File {
  if (!(file instanceof File)) throw new ImportHttpError(400, "Choose a CSV file to upload.");
  const name = file.name || "upload.csv";
  if (/\.(xlsx|xlsm|xls|numbers|ods)$/i.test(name)) {
    throw new ImportHttpError(415, "That's a spreadsheet file. In Excel use Save as, CSV UTF-8, and upload the .csv file.");
  }
  if (!/\.(csv|txt)$/i.test(name)) throw new ImportHttpError(415, "Upload a .csv file.");
  // Browsers send text/csv, or application/vnd.ms-excel for .csv on Windows, or nothing.
  if (file.type && !/^(text\/(csv|plain|comma-separated-values)|application\/(csv|vnd\.ms-excel|octet-stream))$/i.test(file.type)) {
    throw new ImportHttpError(415, "Upload a .csv file.");
  }
  if (file.size === 0) throw new ImportHttpError(400, "The file is empty.");
  if (file.size > MAX_IMPORT_BYTES) {
    throw new ImportHttpError(413, `The file is over ${MAX_IMPORT_BYTES / 1024 / 1024} MB. Split it into smaller files.`);
  }
  return file;
}

export async function previewImport(viewer: Viewer, form: FormData): Promise<ImportPreview> {
  await assertCanImport();
  const file = checkFile(form.get("file"));
  const filename = file.name.slice(0, 255);
  const defaults = defaultsSchema.safeParse({
    defaultOwnerId: (form.get("defaultOwnerId") as string) || null,
    defaultNicheId: (form.get("defaultNicheId") as string) || null,
    defaultChannelId: (form.get("defaultChannelId") as string) || null,
  });
  if (!defaults.success) throw new ImportHttpError(400, "Pick the defaults again and retry.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.includes(0)) return emptyPreview(filename, "This isn't a text file. Upload a CSV saved from Excel or Google Sheets.");
  const decoded = decodeCsv(bytes);
  if (!decoded.ok) return emptyPreview(filename, decoded.error);
  const parsed = parseCsv(decoded.text);
  if (!parsed.ok) return emptyPreview(filename, parsed.error);
  if (parsed.rows.length === 0) return emptyPreview(filename, "The file has a header row but no leads.");
  if (parsed.rows.length > MAX_IMPORT_ROWS) {
    return emptyPreview(filename, `The file has ${parsed.rows.length} rows. Import up to ${MAX_IMPORT_ROWS} at a time.`);
  }

  const mapping = mapColumns(parsed.header);
  const lists = await getLists();
  const result = validateRows(mapping, mapping.errors.length ? [] : parsed.rows, {
    viewer: { id: viewer.id, role: viewer.role },
    niches: lists.niches,
    channels: lists.channels,
    campaigns: lists.campaigns,
    members: lists.members,
    defaults: {
      ownerId: viewer.role === "founder" ? defaults.data.defaultOwnerId : viewer.id,
      nicheId: defaults.data.defaultNicheId,
      channelId: defaults.data.defaultChannelId,
    },
  });

  const errors: ImportIssue[] = [
    ...mapping.errors.map((message) => ({ row: null, field: null, message })),
    ...result.errors,
  ].slice(0, MAX_REPORTED_ERRORS);
  const warnings: ImportIssue[] = [
    ...mapping.warnings.map((message) => ({ row: null, field: null, message })),
    ...result.warnings,
  ];
  let errorCount = mapping.errors.length + result.errorCount;
  let invalidRows = mapping.errors.length ? parsed.rows.length : result.invalidRows;
  let duplicates = result.duplicateRows;
  const totalRows = mapping.errors.length ? parsed.rows.length : result.totalRows;

  const supabase = await createClient();
  const sha = createHash("sha256").update(bytes).digest("hex");
  const { data: earlier } = await supabase
    .from("lead_import_batches")
    .select("code, imported_at")
    .eq("file_sha256", sha)
    .eq("status", "imported")
    .order("imported_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (earlier) {
    warnings.unshift({
      row: null,
      field: null,
      message: `This exact file was imported before (${earlier.code}). Its leads will show as duplicates.`,
    });
  }

  const valid = errorCount === 0 && result.rows.length > 0;
  const { data: batch, error } = await supabase
    .from("lead_import_batches")
    .insert({
      created_by: viewer.id,
      created_by_role: viewer.role,
      filename,
      file_sha256: sha,
      default_owner_id: viewer.role === "founder" ? (defaults.data.defaultOwnerId ?? viewer.id) : viewer.id,
      status: valid ? "validated" : "failed",
      total_rows: totalRows,
      valid_rows: valid ? result.rows.length : Math.max(0, totalRows - invalidRows),
      invalid_rows: invalidRows,
      duplicate_rows: duplicates,
      warning_count: warnings.length,
      errors,
      error_summary: valid ? null : summary(errorCount, invalidRows),
      rows: valid ? result.rows : null,
    })
    .select("id, code, expires_at")
    .single();
  if (error || !batch) {
    throw new ImportHttpError(/Too many imports/.test(error?.message ?? "") ? 429 : 500, dbErrorMessage(error, "The file couldn't be checked. Try again."));
  }

  let expiresAt: string | null = batch.expires_at;
  if (valid) {
    // Against what's already in the database (same owner): report now; import_lead_batch checks again.
    const { data: conflicts } = await supabase.rpc("import_conflicts", { p_batch: batch.id });
    if (conflicts && conflicts.length > 0) {
      for (const c of conflicts) {
        if (errors.length < MAX_REPORTED_ERRORS) errors.push({ row: c.row_number, field: null, message: `Already in your leads: ${c.reason}.` });
      }
      errorCount += conflicts.length;
      invalidRows += conflicts.length;
      duplicates += conflicts.length;
      await supabase
        .from("lead_import_batches")
        .update({
          status: "failed",
          errors,
          invalid_rows: invalidRows,
          duplicate_rows: duplicates,
          valid_rows: Math.max(0, totalRows - invalidRows),
          error_summary: summary(errorCount, invalidRows),
        })
        .eq("id", batch.id);
      expiresAt = null;
    }
  }

  const ok = errorCount === 0 && valid;
  return {
    batchId: batch.id,
    code: batch.code,
    filename,
    valid: ok,
    totalRows,
    validRows: ok ? result.rows.length : Math.max(0, totalRows - invalidRows),
    invalidRows,
    duplicates,
    blankRows: result.blankRows,
    warningsCount: warnings.length,
    errorCount,
    columns: mapping.columns.map((c) => ({ ...c, label: c.field ? IMPORT_FIELDS[c.field].label : null })),
    missingFields: result.missingFields,
    errors,
    warnings: warnings.slice(0, MAX_REPORTED_ERRORS),
    fileError: null,
    expiresAt: ok ? expiresAt : null,
  };
}

function summary(errorCount: number, invalidRows: number): string {
  return `${errorCount} ${errorCount === 1 ? "problem" : "problems"} in ${invalidRows} ${invalidRows === 1 ? "row" : "rows"}. No leads were added.`;
}

const batchSchema = z.object({ batchId: z.uuid() });

/** Step 2: import the stored, validated batch. All rows or none (one transaction in import_lead_batch). */
export async function confirmImport(input: unknown): Promise<{ imported: number; code: string }> {
  const parsed = batchSchema.safeParse(input);
  if (!parsed.success) throw new ImportHttpError(400, "That import wasn't found. Upload the file again.");
  await assertCanImport();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_lead_batch", { p_batch: parsed.data.batchId });
  if (error) {
    const reason = dbErrorMessage(error, "The database refused the import.");
    // The transaction rolled back; record why on the batch (still 'validated', so this update is allowed).
    await supabase
      .from("lead_import_batches")
      .update({ status: "failed", error_summary: `${reason} No leads were added.` })
      .eq("id", parsed.data.batchId)
      .eq("status", "validated");
    const status = error.code === "42501" ? 403 : 422;
    throw new ImportHttpError(status, `Import failed. No leads were added. ${reason}`);
  }
  const { data: batch } = await supabase.from("lead_import_batches").select("code").eq("id", parsed.data.batchId).single();
  return { imported: data ?? 0, code: batch?.code ?? "" };
}

export async function cancelImport(input: unknown): Promise<void> {
  const parsed = batchSchema.safeParse(input);
  if (!parsed.success) throw new ImportHttpError(400, "That import wasn't found.");
  const supabase = await createClient();
  await supabase
    .from("lead_import_batches")
    .update({ status: "cancelled" })
    .eq("id", parsed.data.batchId)
    .eq("status", "validated");
}
