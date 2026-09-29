/** Centered panel for sign-in, invite, reset and setup pages. */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-sm animate-enter">
        <p className="mb-6 flex items-center gap-2.5 text-section text-ink">
          <span
            aria-hidden
            className="flex size-7 items-center justify-center rounded-md bg-accent-strong font-display text-body font-semibold text-on-accent"
          >
            C
          </span>
          Client Acquisition OS
        </p>
        <div className="rounded-lg border border-line bg-surface p-6 shadow-raised">{children}</div>
      </div>
    </main>
  );
}
