import { useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/design-system';
import { DataProvider } from '@/data/DataProvider';
import { DataError, type DataSource } from '@/data/source';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { applyPreferences, usePreferences } from '@/stores/preferences';

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 10 * 60_000,
        refetchOnWindowFocus: true,
        retry: (count, error) => !(error instanceof DataError && ['unauthorized', 'forbidden', 'not_found', 'validation'].includes(error.code)) && count < 2,
      },
      mutations: { retry: false },
    },
  });
}

function PreferenceSync() {
  const theme = usePreferences((s) => s.theme);
  const density = usePreferences((s) => s.density);
  const reduceMotion = usePreferences((s) => s.reduceMotion);
  useEffect(() => {
    applyPreferences({ theme, density, reduceMotion });
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => applyPreferences({ theme, density, reduceMotion });
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [theme, density, reduceMotion]);
  return null;
}

export function Providers({ source, children, client }: { source: DataSource; children: ReactNode; client?: QueryClient }) {
  const [qc] = useState(() => client ?? makeQueryClient());
  const resolvedTheme = typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  return (
    <QueryClientProvider client={qc}>
      <DataProvider source={source}>
        <AuthProvider>
          <TooltipProvider delayDuration={400}>
            <PreferenceSync />
            {children}
            <Toaster position="bottom-right" theme={resolvedTheme} richColors closeButton duration={4000} toastOptions={{ style: { fontFamily: 'var(--font-sans)' } }} />
          </TooltipProvider>
        </AuthProvider>
      </DataProvider>
    </QueryClientProvider>
  );
}
