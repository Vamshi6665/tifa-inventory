# Performance audit

Measured with Lighthouse 13 against the production build (demo data source, served locally with gzip). Scores are in `docs/lighthouse/summary.json`; `scripts/lighthouse.sh` regenerates the full reports.

## Lighthouse results

| Page | Mobile perf | Desktop perf | Accessibility | Best practices | Mobile LCP | Desktop LCP | CLS |
|---|---|---|---|---|---|---|---|
| Sign in | 100 | 100 | 100 | 100 | 1.0 s | 0.3 s | 0 |
| Overview | 93 | 100 | 100 | 100 | 3.2 s | 0.7 s | 0 |
| Inventory (data grid) | 86–92* | 100 | 100 | 100 | 3.3–3.6 s | 0.8 s | 0 |
| Stock count | 93 | 100 | 100 | 100 | 3.2 s | 0.7 s | 0 |
| Reorder | 93 | 100 | 100 | 100 | 3.2 s | 0.7 s | 0 |
| Purchase orders | 91 | 100 | 100 | 100 | 3.3 s | 0.8 s | 0 |
| Analytics | 92 | 100 | 100 | 100 | 3.0 s | 0.7 s | 0.006 |
| Settings | 93 | 100 | 100 | 100 | 3.2 s | 0.7 s | 0 |

\* Range across runs; Lighthouse's simulated throttling varies a few points between runs.
SEO scores 63 on purpose: `robots.txt` blocks indexing because this is a private business tool.

**Against the 95+ target:** met on desktop everywhere and on mobile for sign-in. Mobile app pages land at 86–93 under Lighthouse's default mobile profile (simulated slow 4G, 150ms round trips, 4× CPU slowdown). The remaining cost is the framework JavaScript on the critical path; what would close the gap is listed at the end.

## What changed during the audit

Measured, fixed, re-measured:

| Change | Effect |
|---|---|
| Fixed a chunking rule that bundled React into the chart chunk, forcing Chart.js onto first load | First-load JS 270KB → 175KB gzipped |
| Removed the data grid from the design-system barrel (its CSS side effect kept it in the first-load graph) | Grid (30KB gz) loads only on pages with tables |
| Command palette, assistant, charts, Excel writer and forms validation load on demand; palette and assistant prefetch when the browser is idle | Nothing unused on first paint, no delay when opened |
| Current page's code starts downloading in parallel with sign-in instead of after it | Removes a serial round trip |
| Font preloaded (one 56KB Latin variable file, `font-display: swap`) | Text paints in its final face without a late swap |
| Cached profile lets the shell draw before the profile request returns | One fewer round trip before first content |
| Reorder suggestions wait for suppliers and schedules before rendering | Reorder CLS 0.25 → 0 |
| Removed Framer Motion; all animation is CSS transform/opacity | Smaller bundle, GPU-composited motion |

## Bundle (gzipped)

| Chunk | Size | Loaded |
|---|---|---|
| React, React DOM, React Router | 95KB | First load (long-cached vendor file) |
| Query cache, Radix menus/popover, shell | ~78KB | First load |
| Data grid (TanStack Table + Virtual) | 30KB | Pages with tables |
| Chart.js | 58KB | Item trend chart and analytics only |
| zod | 22KB | Forms |
| Excel writer | 19KB | On export |
| Each page | 3–7KB | On visit |

CI fails the build if first-load JavaScript exceeds 190KB or any lazy chunk exceeds 65KB (`scripts/bundle-budget.mjs`).

## Runtime performance

- **5,000 items** (E2E test): page ready in ~1.5 s, 28 table rows in the DOM thanks to virtualization, search across all items in 100–320 ms.
- Inline edits are optimistic: the value changes on Enter, and rolls back with a message if the server rejects it.
- Expensive derivations (stock state, fill level, forecasts, restock list, insights) are memoised per data change, not per render.
- Assets are content-hashed and served with `Cache-Control: immutable` for a year.

## Load testing

`scripts/load/k6-inventory.js` simulates 10 people browsing and up to 20 counting at once against a staging Supabase project, with thresholds of p95 < 600 ms for lists and < 400 ms for count RPCs and < 1% errors. It has not been run yet: it needs a staging project and isn't safe to point at production.

## What would get mobile to 95+

1. Server-render or pre-render the app shell (e.g. move to React Router framework mode with SSR on Vercel), so the first meaningful paint doesn't wait for JavaScript.
2. Lazy-load the account/theme menus and toaster (≈20KB) so the first-load chunk carries only what draws the first screen.
3. Measure on the shop's real devices with field data (Vercel Speed Insights) rather than lab throttling alone.
