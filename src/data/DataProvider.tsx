import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { DataSource, LiveTable } from './source';
import { keysFor } from './keys';

const Ctx = createContext<DataSource | null>(null);

export function DataProvider({ source, children }: { source: DataSource; children: ReactNode }) {
  const qc = useQueryClient();
  // Live updates: any change in the database refreshes the affected queries.
  useEffect(
    () =>
      source.subscribe((table: LiveTable) => {
        for (const key of keysFor(table)) void qc.invalidateQueries({ queryKey: key });
      }),
    [source, qc],
  );
  return <Ctx.Provider value={source}>{children}</Ctx.Provider>;
}

export function useData(): DataSource {
  const s = useContext(Ctx);
  if (!s) throw new Error('useData must be used inside <DataProvider>');
  return s;
}

export async function createDefaultSource(): Promise<DataSource> {
  const mode = import.meta.env.VITE_DATA_SOURCE;
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (mode === 'demo' || ((!url || !key) && import.meta.env.DEV)) {
    const { createDemoSource } = await import('./demo/demoSource');
    return createDemoSource();
  }
  // A production build without database settings must not quietly show sample data.
  if (!url || !key) throw new Error('This build has no database settings (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY).');
  const { createSupabaseSource } = await import('./supabaseSource');
  return createSupabaseSource(url, key);
}
