"use client";

import { useSyncExternalStore } from "react";

const TICK_MS = 30_000;
let snapshot = 0;

function subscribe(callback: () => void) {
  const t = setInterval(callback, TICK_MS);
  return () => clearInterval(t);
}

function getSnapshot() {
  // Round to the tick so the value is stable between renders.
  const now = Math.floor(Date.now() / TICK_MS) * TICK_MS;
  if (now !== snapshot) snapshot = now;
  return snapshot;
}

/** Current time (updated every 30s) on the client; null during server render and hydration. */
export function useNow(): Date | null {
  const ms = useSyncExternalStore(subscribe, getSnapshot, () => 0);
  return ms ? new Date(ms) : null;
}
