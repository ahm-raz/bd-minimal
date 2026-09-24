import type { Metadata } from "next";
import { requireViewer } from "@/server/auth";
import { PageHeader } from "@/components/common/page";
import { formatLocalDate, todayIn } from "@/lib/dates";

export const metadata: Metadata = { title: "My Day" };

export default async function MyDayPage() {
  const viewer = await requireViewer();
  const today = todayIn(viewer.timezone);
  return (
    <>
      <PageHeader title="My Day" meta={<span data-testid="today">{formatLocalDate(today)}</span>} />
      <p className="text-body text-ink-muted">Nothing due today. Open Leads and plan next steps for new leads.</p>
    </>
  );
}
