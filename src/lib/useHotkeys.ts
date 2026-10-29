import { useEffect, useRef } from 'react';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const modKey = isMac ? '⌘' : 'Ctrl';

function isTyping(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

/**
 * Global shortcuts. "mod" is ⌘ on Mac, Ctrl elsewhere. Single-key shortcuts
 * never fire while the person is typing in a field (WCAG 2.1.4).
 */
export function useHotkeys(map: Record<string, (e: KeyboardEvent) => void>, enabled = true) {
  const ref = useRef(map);
  ref.current = map;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey;
      const key = e.key.toLowerCase();
      for (const [combo, fn] of Object.entries(ref.current)) {
        const parts = combo.split('+');
        const wantsMod = parts.includes('mod');
        const wantsShift = parts.includes('shift');
        const k = parts[parts.length - 1];
        if (k !== key || wantsMod !== mod || wantsShift !== e.shiftKey || e.altKey) continue;
        if (!wantsMod && isTyping(e.target)) continue;
        e.preventDefault();
        fn(e);
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
