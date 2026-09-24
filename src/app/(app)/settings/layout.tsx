import { notFound } from "next/navigation";
import { requireFounder, requireViewer } from "@/server/auth";
import { PageHeader } from "@/components/common/page";
import { SettingsTabs } from "./settings-tabs";

export default async function SettingsLayout({ children }: LayoutProps<"/settings">) {
  await requireViewer();
  if (!(await requireFounder())) notFound();
  return (
    <>
      <PageHeader title="Settings" />
      <SettingsTabs />
      <div className="mt-6">{children}</div>
    </>
  );
}
