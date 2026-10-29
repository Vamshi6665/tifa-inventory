/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import type { Plugin } from 'vite';

const src = fileURLToPath(new URL('./src', import.meta.url));

// Vercel preview deployments (pull requests) run on sample data unless
// VITE_DATA_SOURCE is set for the Preview environment, so a preview can't touch
// the shop's live data before the database migration has been run.
if (process.env.VERCEL_ENV === 'preview' && !process.env.VITE_DATA_SOURCE) process.env.VITE_DATA_SOURCE = 'demo';

/** Preload the Latin UI font so text paints in its final face without a late swap. */
function preloadFont(): Plugin {
  return {
    name: 'tifa-preload-font',
    enforce: 'post',
    transformIndexHtml(html, ctx) {
      const font = Object.keys(ctx.bundle ?? {}).find((f) => /instrument-sans-latin-standard-normal.*\.woff2$/.test(f));
      if (!font) return html;
      const base = ctx.server ? '/' : (process.env.VITE_BASE ?? '/');
      return html.replace('</title>', `</title>\n    <link rel="preload" href="${base}${font}" as="font" type="font/woff2" crossorigin />`);
    },
  };
}

export default defineConfig({
  plugins: [react(), preloadFont()],
  resolve: { alias: { '@': src } },
  build: {
    target: 'es2022',
    sourcemap: true,
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        // Only the framework gets a fixed vendor chunk (long-cached across releases).
        // Everything else is split by the bundler along lazy-import boundaries.
        manualChunks(id: string) {
          if (/node_modules[\\/](react|react-dom|scheduler|react-router)[\\/]/.test(id)) return 'react';
          return undefined;
        },
      },
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./src/test/setup.ts'],
          include: ['src/**/*.test.{ts,tsx}'],
          css: false,
        },
      },
      {
        extends: true,
        test: { name: 'api', environment: 'node', include: ['api/**/*.test.ts', 'scripts/**/*.test.ts'] },
      },
      {
        extends: true,
        test: {
          name: 'db',
          environment: 'node',
          include: ['supabase/tests/**/*.test.ts'],
          testTimeout: 30000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.*', 'src/test/**', 'src/main.tsx', 'src/data/demo/seed.ts'],
      reporter: ['text-summary', 'html', 'json-summary'],
    },
  },
});
