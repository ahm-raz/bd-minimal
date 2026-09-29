import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireViewer } from "@/server/auth";
import { createClient } from "@/lib/supabase/server";
import { getLists } from "@/server/queries/lists";
import { ImportView, type ImportHistoryRow } from "./import-view";

export const metadata: Metadata = { title: "Import leads" };

/** CSV import (docs/07 section 3a): founder, or a BD the founder allowed. The API checks again. */
export default async function ImportLeadsPage() {
  const viewer = await requireViewer();
  if (!viewer.canImportLeads) redirect("/leads?notice=import-only");
  const supabase = await createClient();
  const [lists, { data: batches }] = await Promise.all([
    getLists(),
    supabase
      .from("lead_import_batches")
      .select("id, code, filename, created_by, status, total_rows, imported_rows, invalid_rows, error_summary, created_at, imported_at")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  const history: ImportHistoryRow[] = (batches ?? []).map((b) => ({
    id: b.id,
    code: b.code,
    filename: b.filename,
    createdBy: b.created_by,
    status: b.status as ImportHistoryRow["status"],
    totalRows: b.total_rows,
    importedRows: b.imported_rows,
    invalidRows: b.invalid_rows,
    errorSummary: b.error_summary,
    createdAt: b.created_at,
  }));
  return <ImportView history={history} isFounder={viewer.role === "founder"} members={lists.members} />;
}
