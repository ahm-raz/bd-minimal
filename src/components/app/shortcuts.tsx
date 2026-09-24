"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useApp } from "./app-provider";
import { useProfile } from "./profile-provider";

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable || !!el.closest("[role=combobox],[cmdk-root]");
}

function overlayOpen(): boolean {
  return !!document.querySelector("[role=dialog],[role=alertdialog],[role=menu],[role=listbox]");
}

/**
 * Global keyboard shortcuts (docs/06 section 6):
 * N new lead, L log activity (lead page or focused My Day row), / focus search,
 * T new task (founder), G then M / L / P to go to My Day / Leads / Pipeline. Esc closes panels (Radix).
 */
export function Shortcuts() {
  const router = useRouter();
  const { openNewLead, openLogActivity, currentLeadId } = useApp();
  const { role } = useProfile();
  const gPressed = useRef<number>(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTyping(e.target) || overlayOpen()) return;
      const key = e.key.toLowerCase();

      if (gPressed.current && Date.now() - gPressed.current < 1200) {
        gPressed.current = 0;
        const dest = { m: "/my-day", l: "/leads", p: "/pipeline" }[key];
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
        case "t":
          if (role === "founder") {
            e.preventDefault();
            if (window.location.pathname === "/tasks") window.dispatchEvent(new Event("cao:new-task"));
            else router.push("/tasks?new=1");
          }
          return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, openNewLead, openLogActivity, currentLeadId, role]);

  return null;
}
