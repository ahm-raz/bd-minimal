"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "@/components/app/nav-progress";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, FileUp, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Chip, type Tone } from "@/components/common/chips";
import { EmptyState } from "@/components/common/empty-state";
import { FormField } from "@/components/common/form-field";
import { PageHeader, Panel, PanelHeader, StatBlock, StatGrid } from "@/components/common/page";
import { RelativeTime } from "@/components/common/relative-time";
import { SelectField } from "@/components/common/select-field";
import { useApp } from "@/components/app/app-provider";
import { useProfile } from "@/components/app/profile-provider";
import { TEMPLATE_HEADERS } from "@/lib/import/columns";
import { toCsv } from "@/lib/import/csv";
import { MAX_IMPORT_BYTES, MAX_IMPORT_ROWS } from "@/lib/import/validate";
import { formatNumber } from "@/lib/format";
import type { MemberItem } from "@/server/queries/lists";
import type { ImportPreview } from "@/server/import/lead-import";
import { setImportPermission } from "@/server/actions/team";

export type ImportHistoryRow = {
  id: string;
  code: string;
  filename: string;
  createdBy: string;
  status: "validated" | "imported" | "failed" | "cancelled";
  totalRows: number;
  importedRows: number;
  invalidRows: number;
  errorSummary: string | null;
  createdAt: string;
};

const STATUS: Record<ImportHistoryRow["status"], { label: string; tone: Tone }> = {
  validated: { label: "Checked, not imported", tone: "neutral" },
  imported: { label: "Imported", tone: "ok" },
  failed: { label: "Failed", tone: "bad" },
  cancelled: { label: "Cancelled", tone: "muted" },
};

type Phase = "idle" | "analyzing" | "preview" | "importing" | "done";

/** Upload with progress (fetch can't report upload progress). Resolves with the JSON body and status. */
function upload(form: FormData, onProgress: (pct: number) => void): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/leads/import/preview");
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => resolve({ status: xhr.status, body: xhr.response });
    xhr.onerror = () => reject(new Error("network"));
    xhr.send(form);
  });
}

export function ImportView({
  history,
  isFounder,
  members,
}: {
  history: ImportHistoryRow[];
  isFounder: boolean;
  members: MemberItem[];
}) {
  const router = useRouter();
  const profile = useProfile();
  const { lists } = useApp();
  const niches = lists.niches.filter((n) => n.is_active);
  const channels = lists.channels.filter((c) => c.is_active);
  const owners = members.filter((m) => m.is_active && (m.role === "bd" || m.role === "founder"));

  const [file, setFile] = useState<File | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(profile.id);
  const [nicheId, setNicheId] = useState<string | null>(profile.primaryNicheId ?? niches[0]?.id ?? null);
  const [channelId, setChannelId] = useState<string | null>(channels[0]?.id ?? null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [result, setResult] = useState<{ imported: number; code: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Leaving mid-import: warn (the import itself is one transaction, so nothing is ever half done).
  useEffect(() => {
    if (phase !== "importing" && phase !== "analyzing") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [phase]);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setRequestError(null);
    setPhase("idle");
    if (inputRef.current) inputRef.current.value = "";
  };

  const pick = (f: File | null | undefined) => {
    if (!f) return;
    setFile(f);
    setPreview(null);
    setResult(null);
    setRequestError(null);
    setPhase("idle");
  };

  const analyze = async () => {
    if (!file) return;
    setRequestError(null);
    if (file.size > MAX_IMPORT_BYTES) {
      setRequestError(`The file is over ${MAX_IMPORT_BYTES / 1024 / 1024} MB. Split it into smaller files.`);
      return;
    }
    const form = new FormData();
    form.set("file", file);
    if (isFounder && ownerId) form.set("defaultOwnerId", ownerId);
    if (nicheId) form.set("defaultNicheId", nicheId);
    if (channelId) form.set("defaultChannelId", channelId);
    setPhase("analyzing");
    setProgress(0);
    try {
      const { status, body } = await upload(form, setProgress);
      if (status !== 200) {
        setRequestError((body as { error?: string } | null)?.error ?? "The file couldn't be checked. Try again.");
        setPhase("idle");
        return;
      }
      setPreview(body as ImportPreview);
      setPhase("preview");
      router.refresh();
    } catch {
      setRequestError("The upload was interrupted. Check your connection and try again. Nothing was imported.");
      setPhase("idle");
    }
  };

  const confirm = async () => {
    if (!preview?.batchId) return;
    setPhase("importing");
    setRequestError(null);
    try {
      const res = await fetch("/api/leads/import/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ batchId: preview.batchId }),
      });
      const body = (await res.json().catch(() => null)) as { imported?: number; code?: string; error?: string } | null;
      if (!res.ok) {
        setRequestError(body?.error ?? "Import failed. No leads were added.");
        setPreview({ ...preview, valid: false });
        setPhase("preview");
        router.refresh();
        return;
      }
      setResult({ imported: body?.imported ?? 0, code: body?.code ?? preview.code ?? "" });
      setPhase("done");
      toast.success(`${formatNumber(body?.imported ?? 0)} leads imported`);
      router.refresh();
    } catch {
      // The request may or may not have reached the server; the history below shows which.
      setRequestError("The connection dropped. Check Import history below: an import either finished or added nothing.");
      setPhase("preview");
      router.refresh();
    }
  };

  const cancel = async () => {
    if (preview?.batchId && preview.valid) {
      await fetch("/api/leads/import/cancel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ batchId: preview.batchId }),
      }).catch(() => undefined);
      router.refresh();
    }
    reset();
  };

  const downloadTemplate = () => downloadCsv("leads-template.csv", toCsv([TEMPLATE_HEADERS]));
  const downloadErrors = () =>
    preview &&
    downloadCsv(
      `${preview.filename.replace(/\.csv$/i, "")}-errors.csv`,
      toCsv([["Row", "Field", "Problem"], ...preview.errors.map((e) => [e.row ?? "", e.field ?? "", e.message])]),
    );

  const member = (id: string) => members.find((m) => m.id === id);

  return (
    <>
      <Link href="/leads" className="mb-2 inline-flex items-center gap-1 text-small text-ink-muted hover:text-ink">
        <ArrowLeft className="size-3.5" aria-hidden /> Leads
      </Link>
      <PageHeader
        title="Import leads"
        meta="From a CSV file"
        actions={
          <Button variant="secondary" onClick={downloadTemplate}>
            <Download aria-hidden /> Download template
          </Button>
        }
      />

      {phase !== "done" && (
        <Panel className="mb-6" aria-label="Upload">
          <PanelHeader title="1. Choose the file" meta={`CSV, up to ${MAX_IMPORT_BYTES / 1024 / 1024} MB and ${formatNumber(MAX_IMPORT_ROWS)} rows`} />
          <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <label
              htmlFor="csv-file"
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                pick(e.dataTransfer.files[0]);
              }}
              className={cn(
                "flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors",
                dragging ? "border-accent-strong bg-accent-soft" : "border-line-strong hover:bg-surface-muted",
              )}
            >
              <FileUp className="size-6 text-ink-muted" aria-hidden />
              {file ? (
                <span className="text-body font-medium text-ink" data-testid="import-file">
                  {file.name} <span className="num font-normal text-ink-muted">· {formatBytes(file.size)}</span>
                </span>
              ) : (
                <span className="text-body text-ink">
                  Drop a CSV here, or <span className="font-medium text-accent-strong">choose a file</span>
                </span>
              )}
              <span className="text-small text-ink-muted">Save Excel files as CSV UTF-8 first.</span>
              <input
                ref={inputRef}
                id="csv-file"
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(e) => pick(e.target.files?.[0])}
              />
            </label>

            <div className="flex flex-col gap-4">
              <p className="text-small text-ink-muted">
                Used for rows without their own value. Leads are marked <strong className="font-medium text-ink">CSV import</strong>{" "}
                and don&apos;t count toward Leads added.
              </p>
              {isFounder && (
                <FormField label="Owner" htmlFor="import-owner" helper="An Owner email column can give rows to other BDs.">
                  <SelectField
                    id="import-owner"
                    value={ownerId}
                    onChange={setOwnerId}
                    options={owners.map((m) => ({ value: m.id, label: m.id === profile.id ? `${m.full_name} (you)` : m.full_name }))}
                  />
                </FormField>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Default niche" htmlFor="import-niche">
                  <SelectField id="import-niche" value={nicheId} onChange={setNicheId} options={niches.map((n) => ({ value: n.id, label: n.name }))} />
                </FormField>
                <FormField label="Default channel" htmlFor="import-channel">
                  <SelectField
                    id="import-channel"
                    value={channelId}
                    onChange={setChannelId}
                    options={channels.map((c) => ({ value: c.id, label: c.name }))}
                  />
                </FormField>
              </div>
              <div className="mt-auto flex flex-wrap items-center gap-3">
                <Button onClick={analyze} disabled={!file || phase === "importing"} pending={phase === "analyzing"} pendingText={progress < 100 ? `Uploading ${progress}%` : "Checking rows…"}>
                  Check file
                </Button>
                {file && phase !== "analyzing" && (
                  <Button variant="ghost" onClick={reset}>
                    Clear
                  </Button>
                )}
              </div>
            </div>
          </div>
          {requestError && phase !== "preview" && (
            <p role="alert" className="mx-4 mb-4 rounded-md bg-bad-soft px-3 py-2 text-small text-bad" data-testid="import-request-error">
              {requestError}
            </p>
          )}
        </Panel>
      )}

      {preview && phase !== "done" && (
        <PreviewPanel
          preview={preview}
          phase={phase}
          requestError={requestError}
          onConfirm={confirm}
          onCancel={cancel}
          onDownloadErrors={downloadErrors}
        />
      )}

      {phase === "done" && result && (
        <Panel className="mb-6 p-6" role="status" data-testid="import-done">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-ok" aria-hidden />
            <div className="flex flex-col gap-3">
              <div>
                <h2 className="text-section text-ink">
                  {formatNumber(result.imported)} {result.imported === 1 ? "lead" : "leads"} imported
                </h2>
                <p className="text-small text-ink-muted">
                  Batch {result.code}. Each lead has the source CSV import.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild>
                  <Link href={`/leads?view=all&batch=${preview?.batchId ?? ""}`}>View these leads</Link>
                </Button>
                <Button variant="secondary" onClick={reset}>
                  Import another file
                </Button>
              </div>
            </div>
          </div>
        </Panel>
      )}

      {isFounder && <PermissionsPanel members={members} />}

      <Panel aria-label="Import history">
        <PanelHeader title="Import history" meta={isFounder ? "Everyone's imports" : "Your imports"} />
        {history.length === 0 ? (
          <EmptyState>No imports yet. Checked and imported files show up here.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-body" data-testid="import-history">
              <thead className="bg-surface-muted">
                <tr className="border-b border-line text-left text-small text-ink-muted">
                  <th scope="col" className="h-9 px-3 font-medium">When</th>
                  <th scope="col" className="h-9 px-3 font-medium">Batch</th>
                  <th scope="col" className="h-9 px-3 font-medium">File</th>
                  {isFounder && <th scope="col" className="h-9 px-3 font-medium">By</th>}
                  <th scope="col" className="h-9 px-3 text-right font-medium">Rows</th>
                  <th scope="col" className="h-9 px-3 font-medium">Result</th>
                  <th scope="col" className="h-9 px-3" />
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-b border-line last:border-0">
                    <td className="px-3 py-2 whitespace-nowrap text-ink-muted">
                      <RelativeTime at={h.createdAt} tz={profile.timezone} />
                    </td>
                    <td className="num px-3 py-2 whitespace-nowrap">{h.code}</td>
                    <td className="max-w-56 truncate px-3 py-2" title={h.filename}>
                      {h.filename}
                    </td>
                    {isFounder && <td className="px-3 py-2 whitespace-nowrap">{member(h.createdBy)?.full_name ?? ""}</td>}
                    <td className="num px-3 py-2 text-right">
                      {h.status === "imported" ? formatNumber(h.importedRows) : formatNumber(h.totalRows)}
                    </td>
                    <td className="px-3 py-2">
                      <Chip tone={STATUS[h.status].tone}>{STATUS[h.status].label}</Chip>
                      {h.status === "failed" && h.errorSummary && (
                        <span className="ml-2 text-small text-ink-muted">{h.errorSummary}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {h.status === "imported" && (
                        <Link href={`/leads?view=all&batch=${h.id}`} className="text-small text-accent-strong hover:underline">
                          View leads
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

function PreviewPanel({
  preview,
  phase,
  requestError,
  onConfirm,
  onCancel,
  onDownloadErrors,
}: {
  preview: ImportPreview;
  phase: Phase;
  requestError: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  onDownloadErrors: () => void;
}) {
  const [showWarnings, setShowWarnings] = useState(false);
  const failed = !preview.valid;
  return (
    <Panel className="mb-6" aria-label="Check result" data-testid="import-preview">
      <PanelHeader
        title="2. Check and import"
        meta={
          <span>
            {preview.filename}
            {preview.code && <span className="num"> · {preview.code}</span>} · Source: CSV import
          </span>
        }
      />
      <div className="flex flex-col gap-4 p-4">
        {failed ? (
          <div role="alert" className="flex items-start gap-2 rounded-md bg-bad-soft px-3 py-2.5 text-body text-bad" data-testid="import-failed">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>
              <strong className="font-semibold">{requestError ?? "Import failed. No leads were added."}</strong>{" "}
              {!requestError && "Fix the problems below in your file and upload it again."}
            </p>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-body text-ok-ink">
            <CheckCircle2 className="size-4" aria-hidden /> Every row passed. Nothing is saved until you import.
          </p>
        )}

        {!preview.fileError && (
          <StatGrid className="sm:grid-cols-5">
            <StatBlock label="Rows" value={formatNumber(preview.totalRows)} sub={preview.blankRows ? `${preview.blankRows} blank skipped` : undefined} />
            <StatBlock label="Valid" value={formatNumber(preview.validRows)} />
            <StatBlock label="With problems" value={formatNumber(preview.invalidRows)} className={cn(preview.invalidRows > 0 && "[&_.num]:text-bad")} />
            <StatBlock label="Duplicates" value={formatNumber(preview.duplicates)} />
            <StatBlock label="Warnings" value={formatNumber(preview.warningsCount)} />
          </StatGrid>
        )}

        {preview.errors.length > 0 && (
          <section aria-label="Problems" className="rounded-lg border border-line">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
              <h3 className="text-small font-medium text-ink">
                Problems <span className="num text-ink-muted">{formatNumber(preview.errorCount)}</span>
                {preview.errorCount > preview.errors.length && (
                  <span className="font-normal text-ink-muted"> (first {preview.errors.length} shown)</span>
                )}
              </h3>
              <Button variant="ghost" size="sm" onClick={onDownloadErrors}>
                <Download aria-hidden /> Download report
              </Button>
            </div>
            <div className="max-h-80 overflow-auto">
              <table className="w-full text-body" data-testid="import-errors">
                <thead className="sticky top-0 bg-surface-muted">
                  <tr className="text-left text-small text-ink-muted">
                    <th scope="col" className="h-8 w-20 px-3 font-medium">Row</th>
                    <th scope="col" className="h-8 w-44 px-3 font-medium">Field</th>
                    <th scope="col" className="h-8 px-3 font-medium">Problem</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.errors.map((e, i) => (
                    <tr key={i} className="border-t border-line align-top">
                      <td className="num px-3 py-1.5">{e.row ?? "File"}</td>
                      <td className="px-3 py-1.5 text-ink-muted">{e.field ?? ""}</td>
                      <td className="px-3 py-1.5">{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {preview.columns.length > 0 && (
          <details className="rounded-lg border border-line" open={preview.valid}>
            <summary className="cursor-pointer px-3 py-2 text-small font-medium text-ink">Columns and defaults</summary>
            <div className="grid gap-4 border-t border-line p-3 lg:grid-cols-2">
              <table className="w-full text-small" data-testid="import-mapping">
                <thead>
                  <tr className="text-left text-ink-muted">
                    <th scope="col" className="pb-1 font-medium">In your file</th>
                    <th scope="col" className="pb-1 font-medium">Imported as</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.columns.map((c) => (
                    <tr key={c.index} className="border-t border-line align-top">
                      <td className="py-1 pr-3">{c.header || <span className="text-ink-muted">(no header)</span>}</td>
                      <td className="py-1">
                        {c.label ? <span className="text-ink">{c.label}</span> : <span className="text-ink-muted">Not imported</span>}
                        {c.note && c.label && <span className="block text-micro font-normal text-ink-muted">{c.note}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.missingFields.length > 0 && (
                <div>
                  <p className="pb-1 text-small font-medium text-ink-muted">Not in your file</p>
                  <ul className="divide-y divide-line text-small">
                    {preview.missingFields.map((m) => (
                      <li key={m.field} className="flex justify-between gap-3 py-1">
                        <span>{m.label}</span>
                        <span className="text-ink-muted">{m.outcome}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </details>
        )}

        {preview.warnings.length > 0 && (
          <div className="rounded-lg border border-line">
            <button
              type="button"
              aria-expanded={showWarnings}
              onClick={() => setShowWarnings((v) => !v)}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-small font-medium text-ink"
            >
              Warnings <span className="num text-ink-muted">{formatNumber(preview.warnings.length)}</span>
            </button>
            {showWarnings && (
              <ul className="max-h-60 divide-y divide-line overflow-auto border-t border-line text-small" data-testid="import-warnings">
                {preview.warnings.map((w, i) => (
                  <li key={i} className="flex gap-3 px-3 py-1.5">
                    <span className="num w-14 shrink-0 text-ink-muted">{w.row ? `Row ${w.row}` : "File"}</span>
                    <span>{w.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={onConfirm}
            disabled={failed}
            pending={phase === "importing"}
            pendingText={`Importing ${formatNumber(preview.validRows)} leads…`}
          >
            Import {formatNumber(preview.validRows)} {preview.validRows === 1 ? "lead" : "leads"}
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={phase === "importing"}>
            <X aria-hidden /> {failed ? "Start over" : "Cancel"}
          </Button>
          {!failed && preview.expiresAt && (
            <span className="text-small text-ink-muted">Import within 30 minutes, or check the file again.</span>
          )}
        </div>
      </div>
    </Panel>
  );
}

/** Founder: which BDs may import (docs/03). Takes effect at once, also for an import already in preview. */
function PermissionsPanel({ members }: { members: MemberItem[] }) {
  const router = useRouter();
  const bds = members.filter((m) => m.role === "bd" && m.is_active);
  const [pending, startTransition] = useTransition();
  const [local, setLocal] = useState<Record<string, boolean>>({});
  if (bds.length === 0) return null;
  const toggle = (id: string, enabled: boolean) => {
    setLocal((l) => ({ ...l, [id]: enabled }));
    startTransition(async () => {
      const res = await setImportPermission({ id, enabled });
      if (!res.ok) {
        toast.error(res.error);
        setLocal((l) => ({ ...l, [id]: !enabled }));
        return;
      }
      toast.success(enabled ? "Import turned on" : "Import turned off");
      router.refresh();
    });
  };
  return (
    <Panel className="mb-6" aria-label="Who can import">
      <PanelHeader title="Who can import" meta="You always can. Turn it on per BD." />
      <ul className="divide-y divide-line" aria-busy={pending || undefined}>
        {bds.map((m) => {
          const on = local[m.id] ?? m.can_import_leads;
          return (
            <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <label htmlFor={`perm-${m.id}`} className="text-body text-ink">
                {m.full_name}
                <span className="block text-small text-ink-muted">{m.email}</span>
              </label>
              <Switch
                id={`perm-${m.id}`}
                aria-label={`${m.full_name} can import leads`}
                checked={on}
                onCheckedChange={(v) => toggle(m.id, v)}
              />
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function downloadCsv(name: string, csv: string) {
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function formatBytes(n: number) {
  return n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}
