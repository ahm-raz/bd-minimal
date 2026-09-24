"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

const NOTICES: Record<string, string> = {
  "founder-only": "That page is for the founder.",
};

/** Shows a toast for `?notice=` set by the proxy, then removes it from the URL. */
export function RouteNotice() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const notice = params.get("notice");

  useEffect(() => {
    if (!notice) return;
    const text = NOTICES[notice];
    if (text) toast(text, { id: `notice-${notice}` });
    const next = new URLSearchParams(params.toString());
    next.delete("notice");
    router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [notice, params, pathname, router]);

  return null;
}
