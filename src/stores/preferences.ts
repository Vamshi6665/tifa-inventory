import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type ThemePref = 'system' | 'light' | 'dark';
export type Density = 'comfortable' | 'compact';
export type WidgetId = 'attention' | 'restock' | 'categories' | 'activity' | 'insights' | 'freshness';

export const ALL_WIDGETS: Array<{ id: WidgetId; label: string; description: string }> = [
  { id: 'attention', label: 'Needs attention', description: 'Out of stock, low and unreadable counts' },
  { id: 'insights', label: 'Insights', description: 'Patterns worth acting on this week' },
  { id: 'restock', label: 'Restock suggestions', description: 'What to order, with quantities' },
  { id: 'categories', label: 'Category health', description: 'Stock levels by category' },
  { id: 'freshness', label: 'Count freshness', description: 'How recently each category was counted' },
  { id: 'activity', label: 'Recent activity', description: 'Latest counts and changes' },
];

interface PreferencesState {
  theme: ThemePref;
  density: Density;
  reduceMotion: boolean;
  sidebarCollapsed: boolean;
  widgets: WidgetId[];
  hiddenWidgets: WidgetId[];
  notificationsSeenAt: string | null;
  dismissedNotifications: string[];
  set: <K extends keyof Omit<PreferencesState, 'set' | 'reset'>>(key: K, value: PreferencesState[K]) => void;
  reset: () => void;
}

const defaults = {
  theme: 'system' as ThemePref,
  density: 'comfortable' as Density,
  reduceMotion: false,
  sidebarCollapsed: false,
  widgets: ALL_WIDGETS.map((w) => w.id),
  hiddenWidgets: [] as WidgetId[],
  notificationsSeenAt: null,
  dismissedNotifications: [] as string[],
};

export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      ...defaults,
      set: (key, value) => set({ [key]: value } as Partial<PreferencesState>),
      reset: () => set(defaults),
    }),
    { name: 'tifa.preferences', version: 1, storage: createJSONStorage(() => localStorage) },
  ),
);

/** Applies theme/density/motion to <html>; keeps "system" in sync with the OS. */
export function applyPreferences(state: Pick<PreferencesState, 'theme' | 'density' | 'reduceMotion'>) {
  const root = document.documentElement;
  const dark = state.theme === 'dark' || (state.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  root.dataset.theme = dark ? 'dark' : 'light';
  root.dataset.density = state.density;
  if (state.reduceMotion) root.dataset.motion = 'reduced';
  else delete root.dataset.motion;
  document.querySelector('meta[name="theme-color"]:not([media])')?.setAttribute('content', dark ? '#1a120e' : '#f4f7f5');
}
