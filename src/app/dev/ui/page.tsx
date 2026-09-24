import { notFound } from "next/navigation";
import { Mail, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Chip, StageChip, StatusChip } from "@/components/common/chips";
import { PaceBar } from "@/components/common/pace-bar";
import { EmptyState } from "@/components/common/empty-state";
import { FormField } from "@/components/common/form-field";
import { PageHeader, Panel, PanelHeader, StatBlock, StatGrid } from "@/components/common/page";
import { LEAD_STATUSES, STAGE_KEYS } from "@/lib/domain";
import { formatMoney } from "@/lib/format";
import { SheetDemo } from "./sheet-demo";

export const metadata = { title: "UI review" };

const STAGE_LABELS: Record<(typeof STAGE_KEYS)[number], string> = {
  qualified: "Qualified",
  meeting_done: "Meeting done",
  proposal_sent: "Proposal sent",
  negotiation: "Negotiation",
  won: "Won",
  lost: "Lost",
};

/** Hidden design review page (docs/08, M0). 404 in production. */
export default function DevUiPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="mx-auto max-w-[1440px] p-6">
      <PageHeader title="UI review" meta="Tokens and components from docs/06" actions={<SheetDemo />} />

      <div className="grid gap-6">
        <Panel>
          <PanelHeader title="Buttons" />
          <div className="flex flex-wrap items-center gap-3 p-4">
            <Button>
              <Plus /> Save lead
            </Button>
            <Button variant="secondary">Cancel</Button>
            <Button variant="ghost">Edit</Button>
            <Button variant="destructive">Delete lead</Button>
            <Button variant="link">Open lead</Button>
            <Button size="form">Log activity</Button>
            <Button disabled>Assign task</Button>
            <Button variant="secondary" size="icon" aria-label="Send email">
              <Mail />
            </Button>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Inputs" />
          <div className="grid gap-4 p-4 sm:grid-cols-3">
            <FormField label="Company name" htmlFor="dev-company" required>
              <Input id="dev-company" placeholder="Bright Smile Dental" />
            </FormField>
            <FormField
              label="Phone"
              htmlFor="dev-phone"
              error="This phone number isn't valid for United States. Include the area code."
            >
              <Input id="dev-phone" defaultValue="555 0100" aria-invalid aria-describedby="dev-phone-msg" />
            </FormField>
            <FormField label="Website" htmlFor="dev-web" helper="We check your own leads for duplicates.">
              <Input id="dev-web" placeholder="brightsmile.com" />
            </FormField>
            <FormField label="Notes" htmlFor="dev-notes" className="sm:col-span-3">
              <Textarea id="dev-notes" placeholder="What problem do they likely have?" />
            </FormField>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Chips" />
          <div className="flex flex-col gap-3 p-4">
            <div className="flex flex-wrap gap-2">
              {STAGE_KEYS.map((k) => (
                <StageChip key={k} stage={k} label={STAGE_LABELS[k]} />
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {LEAD_STATUSES.map((s) => (
                <StatusChip key={s} status={s} />
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Chip tone="bad">Overdue</Chip>
              <Chip tone="warn">Due today</Chip>
              <Chip tone="ok">Done</Chip>
              <Chip>Repeats</Chip>
              <Chip tone="accent">High</Chip>
            </div>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Pace bar" meta="Wednesday 13:30, weekly target 112" />
          <div className="grid gap-6 p-4 sm:grid-cols-3">
            <PaceBar label="Leads" actual={70} target={112} pace={67} />
            <PaceBar label="Leads" actual={58} target={112} pace={67} />
            <PaceBar label="Leads" actual={40} target={112} pace={67} />
            <PaceBar label="Outreach" actual={9} target={15} />
          </div>
        </Panel>

        <StatGrid>
          <StatBlock label="Leads added" value="118" sub="Target 112" />
          <StatBlock label="Replies" value="9" sub="Reply rate 7.6%" />
          <StatBlock label="Won revenue" value={formatMoney(3500)} sub="1 deal" />
          <StatBlock label="Active MRR" value={formatMoney(300)} />
        </StatGrid>

        <Panel>
          <PanelHeader title="Table" />
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Next action</TableHead>
                  <TableHead className="text-right">Complete</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">Bright Smile Dental</TableCell>
                  <TableCell>
                    <StatusChip status="replied" />
                  </TableCell>
                  <TableCell>Send case study</TableCell>
                  <TableCell className="num text-right">90%</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Clinic Pro Dental</TableCell>
                  <TableCell>
                    <StatusChip status="new" />
                  </TableCell>
                  <TableCell className="text-ink-muted">None</TableCell>
                  <TableCell className="num text-right">30%</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Empty state" />
          <EmptyState action={<Button>New lead</Button>}>No leads yet. Press N to add your first one.</EmptyState>
        </Panel>
      </div>
    </main>
  );
}
