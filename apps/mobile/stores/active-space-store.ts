/**
 * The space each project shows on its home (project flag `chat`): web's
 * `/chat` and `/c/<slug>` routes as one value per project. Null: the
 * person's own space (their DM with My Kortix), web's landing page. In
 * memory only: a cold start opens the personal space, as web's home does.
 */

import { create } from 'zustand';

interface ActiveSpaceState {
  /** project id → space id. Absent: the personal space. */
  byProject: Record<string, string>;
  /** Show this space on the project's home; null shows the personal space. */
  setActiveSpace: (projectId: string, spaceId: string | null) => void;
  /** Where the details page opens: its people, or the Add sheet. Read once by the page. */
  detailsSection: 'people' | 'add' | null;
  setDetailsSection: (section: 'people' | 'add' | null) => void;
  /** Sign-out: forget every choice. */
  reset: () => void;
}

export const useActiveSpaceStore = create<ActiveSpaceState>()((set) => ({
  byProject: {},
  setActiveSpace: (projectId, spaceId) =>
    set((state) => {
      if ((state.byProject[projectId] ?? null) === spaceId) return state;
      const byProject = { ...state.byProject };
      if (spaceId) byProject[projectId] = spaceId;
      else delete byProject[projectId];
      return { byProject };
    }),
  detailsSection: null,
  setDetailsSection: (detailsSection) => set({ detailsSection }),
  reset: () => set({ byProject: {}, detailsSection: null }),
}));

/** The space id the project's home shows, or null for the personal space. */
export function useActiveSpaceId(projectId: string): string | null {
  return useActiveSpaceStore((state) => state.byProject[projectId] ?? null);
}
