"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "@/components/app/nav-progress";
import { toast } from "sonner";
import { pathInDepartment, showsSales } from "@/lib/department";
import { useApp } from "./app-provider";
import { useProfile } from "./profile-provider";

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable ||
    !!el.closest("[role=combobox],[cmdk-root]")
  );
}

function overlayOpen(): boolean {
  return !!document.querySelector("[role=dialog],[role=alertdialog],[role=menu],[role=listbox]");
}

/**
 * Global keyboard shortcuts (docs/06 section 6):
 * N new lead, L log activity (lead page or focused My Day row), / focus search,
 * T new task (founder), G then M / L / P / C to go to My Day / Leads / Pipeline / Content. Esc closes panels (Radix).
 * Social media managers have no sales shortcuts (N, L, /, G L, G P) (docs/09 section 1).
 */
export function Shortcuts() {
  const router = useRouter();
  const { openNewLead, openLogActivity, currentLeadId, department } = useApp();
  const { role } = useProfile();
  const gPressed = useRef<number>(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTyping(e.target) || overlayOpen()) return;
      const key = e.key.toLowerCase();

      if (gPressed.current && Date.now() - gPressed.current < 1200) {
        gPressed.current = 0;
        const dests: Record<string, string> =
          role === "social"
            ? { m: "/my-day", c: "/content", n: "/notifications" }
            : role === "founder"
              ? { m: "/my-day", l: "/leads", p: "/pipeline", c: "/content", n: "/notifications" }
              : { m: "/my-day", l: "/leads", p: "/pipeline", n: "/notifications" };
        const dest = dests[key] && pathInDepartment(dests[key], department) ? dests[key] : undefined;
        if (dest) {
          e.preventDefault();
          router.push(dest);
        }
        return;
      }

      switch (key) {
        case "g":
          gPressed.current = Date.now();
          return;
      }
      // T (new task) works in every founder view; the sales keys don't exist in Social media.
      if (key === "t" && role === "founder") {
        e.preventDefault();
        if (window.location.pathname === "/tasks") window.dispatchEvent(new Event("cao:new-task"));
        else router.push("/tasks?new=1");
        return;
      }
      if (!showsSales(department)) return;

      switch (key) {
        case "n":
          e.preventDefault();
          openNewLead();
          return;
        case "l": {
          const row = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>("[data-lead-id]");
          const leadId = row?.dataset.leadId ?? currentLeadId;
          e.preventDefault();
          if (leadId) openLogActivity({ leadId, contactId: row?.dataset.contactId ?? null });
          else toast("Open a lead, or pick a row on My Day, then press L.");
          return;
        }
        case "/": {
          e.preventDefault();
          const search = document.getElementById("lead-search");
          if (search) search.focus();
          else router.push("/leads?focus=search");
          return;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, openNewLead, openLogActivity, currentLeadId, role, department]);

  return null;
}
