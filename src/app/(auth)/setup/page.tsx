import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { needsSetup } from "@/server/setup";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Set up" };
export const dynamic = "force-dynamic";

/** First run only: the first office and its founder. Returns 404 once any office exists (docs/11 section 6). */
export default async function SetupPage() {
  if (!(await needsSetup())) notFound();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-title text-ink">Create your office</h1>
        <p className="mt-1 text-small text-ink-muted">
          This page works once. You become the office&apos;s founder and add your team from Team.
        </p>
      </div>
      <SetupForm />
    </div>
  );
}
