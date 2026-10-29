import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';
import { usePreferences } from '@/stores/preferences';
import { useViews } from '@/stores/views';

afterEach(() => {
  cleanup();
  // Stores live in module memory, so clearing localStorage doesn't reset them.
  // Without this, a search or filter remembered by one test leaked into the next.
  useViews.setState(useViews.getInitialState(), true);
  usePreferences.setState(usePreferences.getInitialState(), true);
});

// CI runners with coverage on are several times slower than a laptop; the
// default 1 s wait for async UI made page tests flaky there.
configure({ asyncUtilTimeout: 5000 });

// jsdom gaps used by Radix, cmdk and the virtualizer.
class RO { observe() {} unobserve() {} disconnect() {} }
(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver ??= RO;
if (!window.matchMedia) {
  window.matchMedia = (query: string) => ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false }) as MediaQueryList;
}
Element.prototype.scrollIntoView ??= function () {};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => {};
