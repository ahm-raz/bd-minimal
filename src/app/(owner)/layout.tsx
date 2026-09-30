import { notFound } from "next/navigation";
import { LogOut } from "lucide-react";
import { requirePlatformAdmin } from "@/server/auth";
import { NavProgressProvider } from "@/components/app/nav-progress";
import { Button } from "@/components/ui/button";

/**
 * The platform owner's dashboard (docs/11 section 6): a separate account in no office. It only manages offices;
 * it has no sales pages and sees no office's data. Everyone else gets 404.
 */
export default async function OwnerLayout({ children }: LayoutProps<"/">) {
  const owner = await requirePlatformAdmin();
  if (!owner) notFound();
  return (
    <NavProgressProvider>
      <div className="flex min-h-screen flex-col bg-canvas">
        <header className="flex h-14 items-center justify-between gap-3 border-b border-line bg-surface px-4 sm:px-6">
          <p className="flex items-center gap-2.5 text-section text-ink">
            <span
              aria-hidden
              className="flex size-7 items-center justify-center rounded-md bg-accent-strong font-display text-body font-semibold text-on-accent"
            >
              C
            </span>
            <span>Client Acquisition OS</span>
            <span className="text-small text-ink-muted">Owner</span>
          </p>
          <div className="flex items-center gap-3">
            <span className="hidden text-small text-ink-muted sm:inline" data-testid="owner-email">
              {owner.email}
            </span>
            <form action="/auth/signout" method="post">
              <Button type="submit" variant="secondary" size="sm">
                <LogOut aria-hidden /> Sign out
              </Button>
            </form>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-[1440px] flex-1 p-4 sm:p-6">
          {children}
        </main>
      </div>
    </NavProgressProvider>
  );
}
