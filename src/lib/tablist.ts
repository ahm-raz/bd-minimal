import type { KeyboardEvent } from "react";

/**
 * Arrow keys, Home and End move between the tabs of a hand-made `role="tablist"` and select the one they
 * land on (WAI-ARIA tabs pattern, automatic activation). Pair with tabIndex 0 on the selected tab, -1 on the rest.
 */
export function onTablistKeyDown(e: KeyboardEvent<HTMLElement>) {
  const tabs = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]:not([disabled])'));
  const at = tabs.indexOf(document.activeElement as HTMLElement);
  if (at < 0) return;
  const next =
    e.key === "ArrowRight" || e.key === "ArrowDown"
      ? (at + 1) % tabs.length
      : e.key === "ArrowLeft" || e.key === "ArrowUp"
        ? (at - 1 + tabs.length) % tabs.length
        : e.key === "Home"
          ? 0
          : e.key === "End"
            ? tabs.length - 1
            : -1;
  if (next < 0) return;
  e.preventDefault();
  tabs[next]!.focus();
  tabs[next]!.click();
}
