# Technical debt

## Paid down by 2.0

| v1 debt | 2.0 |
|---|---|
| One ~2,700-line HTML file mixing markup, styles and logic | Feature folders, typed components, pure domain modules |
| No automated tests; correctness checked by hand | 271 automated tests across unit, integration, database and browser |
| Copy-pasted logic for stock state and par checks; first-number parsing misread 7 real items | One `parseQuantity` / `stockState`, tested against the shop's real values |
| Hand-edited colours drifting between pages | Token file with contrast checks in CI |
| Pagination fix applied in one place (Trends) | Pagination centralised in the data layer and tested |
| Icon CDN that 404'd unnoticed | Bundled icons |
| Editing in GitHub's web editor with no checks | Branch + pull request + CI + Vercel preview per change |

## Remaining, by priority

| Item | Why it matters | Effort | Priority |
|---|---|---|---|
| Live policies and the `profiles` definition aren't in the repo; the migration is tested on a reconstruction | Check on staging before production (MIGRATION.md §1) | S | P1 |
| Database definitions live only in Supabase; v1's later patches (profiles, category access, schedules) were never committed | Commit a schema dump (`supabase db dump`) so the repo is the source of truth | S | P2 |
| Generated database types (`supabase gen types`) not wired in | Adapter uses hand-written row mappers | S | P2 |
| No error reporting service | Production errors are invisible | S | P2 |
| Saved views and preferences are per device | People switching devices lose views | M | P3 |
| Notifications are derived on the client, not stored | No history of past alerts; no push/email | M | P3 |
| Chart.js canvas charts (with table fallbacks) | Could move to SVG for full accessibility and smaller size | M | P3 |
| Demo seed in the main bundle graph (lazy) | Fine now; would grow with richer demo data | S | P3 |
| Coverage gaps in reports and settings pages (Vitest) | Covered by E2E, not unit tests | S | P3 |
| `style-src 'unsafe-inline'` in CSP | Needed by runtime styles; low risk | M | P3 |
