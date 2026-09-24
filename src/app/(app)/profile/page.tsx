import type { Metadata } from "next";
import { requireViewer } from "@/server/auth";
import { PageHeader } from "@/components/common/page";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const viewer = await requireViewer();
  return (
    <>
      <PageHeader title="Profile" />
      <ProfileForm fullName={viewer.fullName} timezone={viewer.timezone} email={viewer.email} />
    </>
  );
}
