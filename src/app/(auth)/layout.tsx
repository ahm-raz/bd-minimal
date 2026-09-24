/** Centered panel for sign-in, invite, reset and setup pages. */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-sm">
        <p className="mb-6 text-section text-ink">Client Acquisition OS</p>
        <div className="rounded-lg border border-line bg-surface p-6">{children}</div>
      </div>
    </main>
  );
}
