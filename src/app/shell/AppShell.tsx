import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { usePreferences } from '@/stores/preferences';
import { cx } from '@/lib/cx';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { MobileNav } from './MobileNav';
import { PageSkeleton } from './PageSkeleton';
import { useHotkeys } from '@/lib/useHotkeys';
import { useMediaQuery } from '@/lib/useMediaQuery';
import styles from './AppShell.module.css';

// Not part of first paint; fetched when the browser is idle so they're ready before anyone presses ⌘K.
const loadPalette = () => import('./CommandPalette');
const loadAssistant = () => import('@/features/assistant/AssistantSheet');
const CommandPalette = lazy(() => loadPalette().then((m) => ({ default: m.CommandPalette })));
const AssistantSheet = lazy(() => loadAssistant().then((m) => ({ default: m.AssistantSheet })));

export function AppShell() {
  const collapsed = usePreferences((s) => s.sidebarCollapsed);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [paletteUsed, setPaletteUsed] = useState(false);
  const [assistantUsed, setAssistantUsed] = useState(false);
  useEffect(() => void (paletteOpen && setPaletteUsed(true)), [paletteOpen]);
  useEffect(() => void (assistantOpen && setAssistantUsed(true)), [assistantOpen]);
  const location = useLocation();
  const first = useRef(true);
  const phone = useMediaQuery('(max-width: 768px)');

  useEffect(() => {
    const prefetch = () => {
      void loadPalette();
      void loadAssistant();
    };
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(prefetch, { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const t = setTimeout(prefetch, 2000);
    return () => clearTimeout(t);
  }, []);

  useHotkeys({
    'mod+k': () => setPaletteOpen((o) => !o),
    '/': () => setPaletteOpen(true),
    'mod+j': () => setAssistantOpen((o) => !o),
  });

  // Route change: move focus to the new page's heading so keyboard and
  // screen-reader users land at the top of the new content (WCAG 2.4.3).
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const id = requestAnimationFrame(() => {
      document.getElementById('page-title')?.focus({ preventScroll: false });
      document.getElementById('main')?.scrollTo?.({ top: 0 });
      window.scrollTo({ top: 0 });
    });
    return () => cancelAnimationFrame(id);
  }, [location.pathname]);

  return (
    <div className={cx(styles.shell, collapsed && styles.collapsed)}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      {!phone && <Sidebar />}
      <div className={styles.column}>
        <Topbar onOpenPalette={() => setPaletteOpen(true)} onOpenAssistant={() => setAssistantOpen(true)} />
        <main id="main" className={styles.main} tabIndex={-1}>
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      {phone && <MobileNav />}
      <Suspense fallback={null}>
        {(paletteOpen || paletteUsed) && <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} onOpenAssistant={() => setAssistantOpen(true)} />}
        {(assistantOpen || assistantUsed) && <AssistantSheet open={assistantOpen} onOpenChange={setAssistantOpen} />}
      </Suspense>
    </div>
  );
}
