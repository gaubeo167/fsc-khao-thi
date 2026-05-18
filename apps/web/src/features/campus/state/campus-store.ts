"use client";

import { create } from "zustand";
import { debouncedLocalStorage } from "@/lib/debounced-local-storage";
import { persist } from "zustand/middleware";

interface CampusState {
  /** The campus the user is currently scoped to.
   *  - For superadmin: their selection. `null` means "all campuses".
   *  - For everyone else: locked to their session.campusId (set on sign-in).
   */
  activeCampusId: string | null;
}

interface CampusActions {
  setActive(id: string | null): void;
}

export const useCampusStore = create<CampusState & CampusActions>()(
  persist(
    (set) => ({
      activeCampusId: null,
      setActive(id) {
        set({ activeCampusId: id });
      },
    }),
    {
      name: "fsc-campus",
      version: 1,
      storage: debouncedLocalStorage,
    },
  ),
);
