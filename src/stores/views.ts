import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ColumnFiltersState, ColumnOrderState, ColumnSizingState, SortingState, VisibilityState } from '@tanstack/react-table';

export interface GridState {
  sorting: SortingState;
  columnFilters: ColumnFiltersState;
  columnOrder: ColumnOrderState;
  columnVisibility: VisibilityState;
  columnSizing: ColumnSizingState;
  globalFilter: string;
}

export interface SavedView {
  id: string;
  gridId: string;
  name: string;
  state: GridState;
  createdAt: string;
}

interface ViewsState {
  views: SavedView[];
  /** Last-used layout per grid, restored on return. */
  lastState: Record<string, Partial<GridState>>;
  save: (gridId: string, name: string, state: GridState) => SavedView;
  remove: (id: string) => void;
  rename: (id: string, name: string) => void;
  remember: (gridId: string, state: Partial<GridState>) => void;
}

export const useViews = create<ViewsState>()(
  persist(
    (set) => ({
      views: [],
      lastState: {},
      save: (gridId, name, state) => {
        const view: SavedView = { id: crypto.randomUUID(), gridId, name: name.trim().slice(0, 60) || 'Untitled view', state, createdAt: new Date().toISOString() };
        set((s) => ({ views: [...s.views, view] }));
        return view;
      },
      remove: (id) => set((s) => ({ views: s.views.filter((v) => v.id !== id) })),
      rename: (id, name) => set((s) => ({ views: s.views.map((v) => (v.id === id ? { ...v, name: name.trim().slice(0, 60) || v.name } : v)) })),
      remember: (gridId, state) => set((s) => ({ lastState: { ...s.lastState, [gridId]: state } })),
    }),
    { name: 'tifa.views', version: 1, storage: createJSONStorage(() => localStorage) },
  ),
);
