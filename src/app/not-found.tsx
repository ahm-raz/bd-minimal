import Link from "next/link";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-sm rounded-lg border border-line bg-surface p-6">
        <h1 className="text-title text-ink">Page not found</h1>
        <p className="mt-2 text-body text-ink-muted">
          This page doesn&apos;t exist, or you don&apos;t have access to it. Check the link, or go back to My Day.
        </p>
        <Link
          href="/my-day"
          className="mt-4 inline-flex h-8 items-center rounded-md bg-accent-strong px-3 text-body font-medium text-on-accent hover:bg-accent-hover"
        >
          Go to My Day
        </Link>
      </div>
    </main>
  );
}
