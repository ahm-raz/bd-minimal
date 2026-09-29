"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { Lists } from "@/server/queries/lists";
import type { LeadFormValues } from "@/lib/validation/lead";
import type { Department } from "@/lib/department";

export type LeadSheetState =
  | { mode: "new"; defaults?: Partial<LeadFormValues> }
  | { mode: "edit"; values: LeadFormValues; meta: { createdBy: string; createdAt: string; ownerId: string } };

export type LogSheetState = { leadId: string; contactId?: string | null };

/** The post side panel (docs/09 section 4): a new post (founder), a new idea (SMM), or an existing post. */
export type PostSheetState = { mode: "new"; day?: string } | { mode: "idea" } | { mode: "open"; id: string };

type AppContextValue = {
  lists: Lists;
  /** The department view (founder's choice; fixed for BDs and SMMs). */
  department: Department;
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
  postSheet: PostSheetState | null;
  openPostSheet: (state: PostSheetState) => void;
  closePostSheet: () => void;
};

const AppContext = createContext<AppContextValue | null>(null);

/** App-wide state: settings lists (loaded once in the layout) and the global side panels. */
export function AppProvider({
  lists,
  department,
  children,
}: {
  lists: Lists;
  department: Department;
  children: React.ReactNode;
}) {
  const [leadSheet, setLeadSheet] = useState<LeadSheetState | null>(null);
  const openNewLead = useCallback((defaults?: Partial<LeadFormValues>) => setLeadSheet({ mode: "new", defaults }), []);
  const openEditLead = useCallback((state: Extract<LeadSheetState, { mode: "edit" }>) => setLeadSheet(state), []);
  const closeLeadSheet = useCallback(() => setLeadSheet(null), []);
  const [logSheet, setLogSheet] = useState<LogSheetState | null>(null);
  const openLogActivity = useCallback((state: LogSheetState) => setLogSheet(state), []);
  const closeLogActivity = useCallback(() => setLogSheet(null), []);
  const [currentLeadId, setCurrentLeadId] = useState<string | null>(null);
  const [postSheet, setPostSheet] = useState<PostSheetState | null>(null);
  const openPostSheet = useCallback((state: PostSheetState) => setPostSheet(state), []);
  const closePostSheet = useCallback(() => setPostSheet(null), []);

  const value = useMemo(
    () => ({
      lists,
      department,
      leadSheet,
      openNewLead,
      openEditLead,
      closeLeadSheet,
      logSheet,
      openLogActivity,
      closeLogActivity,
      currentLeadId,
      setCurrentLeadId,
      postSheet,
      openPostSheet,
      closePostSheet,
    }),
    [
      lists,
      department,
      leadSheet,
      openNewLead,
      openEditLead,
      closeLeadSheet,
      logSheet,
      openLogActivity,
      closeLogActivity,
      currentLeadId,
      postSheet,
      openPostSheet,
      closePostSheet,
    ],
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
