"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { Lists } from "@/server/queries/lists";
import type { LeadFormValues } from "@/lib/validation/lead";

export type LeadSheetState =
  | { mode: "new"; defaults?: Partial<LeadFormValues> }
  | { mode: "edit"; values: LeadFormValues; meta: { createdBy: string; createdAt: string; ownerId: string } };

type AppContextValue = {
  lists: Lists;
  leadSheet: LeadSheetState | null;
  openNewLead: (defaults?: Partial<LeadFormValues>) => void;
  openEditLead: (state: Extract<LeadSheetState, { mode: "edit" }>) => void;
  closeLeadSheet: () => void;
};

const AppContext = createContext<AppContextValue | null>(null);

/** App-wide state: settings lists (loaded once in the layout) and the global side panels. */
export function AppProvider({ lists, children }: { lists: Lists; children: React.ReactNode }) {
  const [leadSheet, setLeadSheet] = useState<LeadSheetState | null>(null);
  const openNewLead = useCallback((defaults?: Partial<LeadFormValues>) => setLeadSheet({ mode: "new", defaults }), []);
  const openEditLead = useCallback((state: Extract<LeadSheetState, { mode: "edit" }>) => setLeadSheet(state), []);
  const closeLeadSheet = useCallback(() => setLeadSheet(null), []);

  const value = useMemo(
    () => ({ lists, leadSheet, openNewLead, openEditLead, closeLeadSheet }),
    [lists, leadSheet, openNewLead, openEditLead, closeLeadSheet],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside the app layout");
  return ctx;
}

export function useLists(): Lists {
  return useApp().lists;
}
