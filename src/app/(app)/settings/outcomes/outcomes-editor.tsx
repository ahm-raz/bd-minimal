"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InlineInput } from "@/components/common/inline-input";
import { Panel, PanelHeader } from "@/components/common/page";
import { StageChip } from "@/components/common/chips";
import { CATEGORY_LABELS } from "@/lib/domain";
import { renameOutcome, saveStage } from "@/server/actions/settings";
import type { OutcomeItem, StageItem } from "@/server/queries/lists";

function yes(v: boolean) {
  return v ? "Yes" : <span className="text-ink-muted">No</span>;
}

export function OutcomesEditor({ outcomes, stages }: { outcomes: OutcomeItem[]; stages: StageItem[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error);
        router.refresh();
        return;
      }
      toast.success(success);
      router.refresh();
    });

  return (
    <div className="grid gap-6">
      <p className="prose-width text-small text-ink-muted">
        Meanings are fixed. You can rename labels and set open-stage probabilities, but what counts as a reply,
        a positive reply or a meeting doesn&apos;t change.
      </p>

      <Panel className="overflow-hidden">
        <PanelHeader title="Outcomes" />
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Reply</TableHead>
                <TableHead>Positive</TableHead>
                <TableHead>Meeting</TableHead>
                <TableHead>Offered for</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {outcomes.map((o) => (
                <TableRow key={o.key}>
                  <TableCell className="w-72">
                    <InlineInput
                      value={o.label}
                      label={`Label for ${o.label}`}
                      onCommit={(label) => run(() => renameOutcome({ key: o.key, label }), "Label saved")}
                    />
                  </TableCell>
                  <TableCell>{yes(o.is_reply)}</TableCell>
                  <TableCell>{yes(o.is_positive)}</TableCell>
                  <TableCell>{yes(o.is_meeting)}</TableCell>
                  <TableCell className="whitespace-normal text-ink-muted">
                    {o.allowed_categories.map((c) => CATEGORY_LABELS[c]).join(", ")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <PanelHeader title="Stages" meta="Probability drives the weighted pipeline value." />
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Stage</TableHead>
                <TableHead>Label</TableHead>
                <TableHead className="w-40">Probability</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stages.map((s) => {
                const pct = String(Math.round(s.probability * 100));
                return (
                  <TableRow key={s.key}>
                    <TableCell>
                      <StageChip stage={s.key} label={s.label} />
                    </TableCell>
                    <TableCell className="w-72">
                      <InlineInput
                        value={s.label}
                        label={`Label for ${s.label}`}
                        onCommit={(label) =>
                          run(() => saveStage({ key: s.key, label, probability: Number(pct) }), "Stage saved")
                        }
                      />
                    </TableCell>
                    <TableCell>
                      {s.is_open ? (
                        <div className="flex items-center gap-1.5">
                          <InlineInput
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={100}
                            value={pct}
                            label={`Probability for ${s.label}, percent`}
                            className="num w-20 text-right"
                            onCommit={(v) => {
                              const n = Number(v);
                              if (!Number.isInteger(n) || n < 0 || n > 100) {
                                toast.error("Use a whole number from 0 to 100.");
                                router.refresh();
                                return;
                              }
                              run(() => saveStage({ key: s.key, label: s.label, probability: n }), "Probability saved");
                            }}
                          />
                          <span className="text-ink-muted">%</span>
                        </div>
                      ) : (
                        <span className="num text-ink-muted">{pct}%</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Panel>
    </div>
  );
}
