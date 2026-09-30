"use client";

import { createContext, useContext } from "react";
import type { Role } from "@/lib/domain";

export type ProfileContextValue = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  timezone: string;
  primaryNicheId: string | null;
  canImportLeads: boolean;
  officeId: string;
  officeName: string;
  officeTimezone: string;
  isPlatformAdmin: boolean;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ value, children }: { value: ProfileContextValue; children: React.ReactNode }) {
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

/** The signed-in person's id, name, role and time zone. Loaded once in the (app) layout. */
export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used inside the app layout");
  return ctx;
}

export function useIsFounder(): boolean {
  return useProfile().role === "founder";
}
