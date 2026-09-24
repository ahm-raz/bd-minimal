import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { needsSetup } from "@/server/setup";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Set up" };
export const dynamic = "force-dynamic";

/** First run only. Returns 404 once any profile exists (docs/03). */
export default async function SetupPage() {
  if (!(await needsSetup())) notFound();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-title text-ink">Create the founder account</h1>
        <p className="mt-1 text-small text-ink-muted">This page works once. After that, people join by invite.</p>
      </div>
      <SetupForm />
    </div>
  );
}
