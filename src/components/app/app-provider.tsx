"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { Lists } from "@/server/queries/lists";
import type { LeadFormValues } from "@/lib/validation/lead";

export type LeadSheetState =
  | { mode: "new"; defaults?: Partial<LeadFormValues> }
  | { mode: "edit"; values: LeadFormValues; meta: { createdBy: string; createdAt: string; ownerId: string } };

export type LogSheetState = { leadId: string; contactId?: string | null };

type AppContextValue = {
  lists: Lists;
  leadSheet: LeadSheetState | null;
  openNewLead: (defaults?: Partial<LeadFormValues>) => void;
  openEditLead: (state: Extract<LeadSheetState, { mode: "edit" }>) => void;
  closeLeadSheet: () => void;
  logSheet: LogSheetState | null;
  openLogActivity: (state: LogSheetState) => void;
  closeLogActivity: () => void;
  /** The lead page registers its lead so the L shortcut knows what to log against. */
  currentLeadId: string | null;
  setCurrentLeadId: (id: string | null) => void;
};

const AppContext = createContext<AppContextValue | null>(null);

/** App-wide state: settings lists (loaded once in the layout) and the global side panels. */
export function AppProvider({ lists, children }: { lists: Lists; children: React.ReactNode }) {
  const [leadSheet, setLeadSheet] = useState<LeadSheetState | null>(null);
  const openNewLead = useCallback((defaults?: Partial<LeadFormValues>) => setLeadSheet({ mode: "new", defaults }), []);
  const openEditLead = useCallback((state: Extract<LeadSheetState, { mode: "edit" }>) => setLeadSheet(state), []);
  const closeLeadSheet = useCallback(() => setLeadSheet(null), []);
  const [logSheet, setLogSheet] = useState<LogSheetState | null>(null);
  const openLogActivity = useCallback((state: LogSheetState) => setLogSheet(state), []);
  const closeLogActivity = useCallback(() => setLogSheet(null), []);
  const [currentLeadId, setCurrentLeadId] = useState<string | null>(null);

  const value = useMemo(
    () => ({
      lists,
      leadSheet,
      openNewLead,
      openEditLead,
      closeLeadSheet,
      logSheet,
      openLogActivity,
      closeLogActivity,
      currentLeadId,
      setCurrentLeadId,
    }),
    [lists, leadSheet, openNewLead, openEditLead, closeLeadSheet, logSheet, openLogActivity, closeLogActivity, currentLeadId],
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
