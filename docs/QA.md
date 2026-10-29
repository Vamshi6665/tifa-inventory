# QA report and test plan

## Results (latest run)

| Suite | Tool | Tests | Result |
|---|---|---|---|
| Quantity rules, forecasting, reorder, permissions, search, CSV, dates | Vitest | 93 | Pass |
| Quantity rules against the shop's real import (194 distinct values, 450 items) | Vitest | 5 | Pass |
| Data grid component | Vitest + Testing Library | 13 | Pass |
| Page integration (real routes, demo backend, three roles, approvals, pre-update mode) | Vitest + Testing Library | 25 | Pass |
| Demo backend rules (mirror of RLS) | Vitest | 17 | Pass |
| Supabase adapter (paging, live column names, v1 roles, errors) | Vitest | 11 | Pass |
| Running on the v1 database before the update (v1-style writes, features off, approvals) | Vitest | 16 | Pass |
| Assistant (local answers) | Vitest | 7 | Pass |
| Accessibility per page (jsdom) | axe-core | 12 | Pass |
| Assistant API endpoint | Vitest (node) | 10 | Pass |
| Design-token contrast | Vitest + script | 1 (100 checks) | Pass |
| Migration and RLS on a reconstruction of the v1 database | Vitest + PGlite (real Postgres) | 31 | Pass |
| **Vitest total** | | **241** | **Pass** |
| End-to-end flows, axe in both themes, keyboard, 10 breakpoints, live updates, 5,000 rows | Playwright (Chromium) | 30 | Pass |
| Lighthouse, 8 pages × 2 form factors | Lighthouse 13 | 16 runs | See PERFORMANCE.md |
| Static analysis | TypeScript strict, ESLint + jsx-a11y | — | Clean |
| Dependencies | npm audit | — | 0 vulnerabilities |

Line coverage from Vitest alone: 77% overall and 99% for `domain/`. Playwright covers the remaining UI paths.

**Tool choice.** The brief listed Jest, Vitest, Cypress and Playwright. Running two unit runners and two browser runners would double maintenance for no extra confidence, so this uses Vitest (Vite-native, Jest-compatible API) and Playwright (multi-browser, faster, built-in tracing). React Testing Library covers components either way.

## Test plan

**Risk-based priorities**, highest first: permission boundaries (data exposure, tampering) → stock correctness (counts, receiving, free-text values) → forecasts and reorder quantities (money) → data loss (deletes, history) → usability and accessibility → performance.

**Environments:** jsdom for components and pages against the demo backend; PGlite for SQL; Chromium for E2E against the production build; Lighthouse against the production build.

**Entry/exit:** every pull request runs typecheck, lint, contrast, Vitest with coverage, bundle budget and the Playwright suite (`.github/workflows/ci.yml`). Merge requires all green.

## Test cases by area (abridged; full cases are the test files)

| Area | Key cases |
|---|---|
| Sign-in | Redirect to sign-in and back to the requested page; sign-out clears session and cache; viewers can't reach counting or admin pages |
| Inventory | Add item with validation; inline count with Enter/Escape/validation; staff can't edit par; only allowed categories visible; quick filters; saved views; CSV and Excel exports match what's on screen |
| Counting | Enter saves and advances; empty Enter confirms; progress; per-category access |
| Purchasing | Suggestions → draft → sent → received; stock increases by the received amount; drafts can't be received; suppliers with open orders can't be removed |
| Team | Change role and categories; admins can't demote themselves; last admin protected |
| Database | Idempotent migration on the v1 schema (enum and text roles); v1 roles, grants and schedules kept; new sign-ups stay pending; approvals in one transaction; admin protections; append-only history and audit log; RPC permission checks; constraint violations |
| Assistant API | Method, auth, invalid session, input limits, RLS-scoped reads, rate limiting, upstream failures, prompt-injection stripping |

## Real data

`quantity.real.test.ts` runs the quantity rules over every count value in the shop's original import (`migrate.html`): 1,721 entries, 194 distinct. 1,628 read as the same number as v1's rule; 25 are flagged for a person (mixed units like "1 box + 10 packs", lists, text that doesn't start with a number). Across the 450 imported items, 414 keep the same alert. Six false "low" alerts go away ("1new+.75" with par 1 is 1.75, not 1), one false "out of stock" becomes "needs review" ("Tifa logo-1 boxes" was read as −1), and 29 items move to "needs review": 23 have a par but no count yet, and 6 have wording that can't be read reliably. A snapshot locks every value's outcome.

## Edge cases covered

Free-text counts ("6 x 5kg buckets", "2 boxes", "ask kitchen"), percentages, same-unit sums ("1 new + 3"), zero words ("out", "sold out"), empty and whitespace counts, 120-character limit, negative par, accented search ("crème brûlée"), formula injection in exports, date-only strings across time zones, weeks with no counts (carry-forward), deliveries inside the forecast window, fewer than two usage periods, no usage, 5,000 items, 320px screens, reduced motion, a demo session per browser tab.

## Failure scenarios

| Scenario | Expected behaviour | Covered by |
|---|---|---|
| Server rejects an inline edit | Value rolls back; toast explains | hooks (optimistic rollback), adapter error mapping |
| Session expires | "Your session has ended. Sign in again." | adapter error mapping |
| Permission denied | "You don't have permission to do that." | demo backend + RLS tests |
| Network down | "Can't reach the server. Check your connection." | adapter error mapping |
| A page crashes | Route error screen with reload; other pages unaffected | router error element |
| Two people edit at once | Last write wins; both see the change live; both writes in history | live-update E2E |
| Assistant not configured or rate-limited | Falls back to local answers | API tests |

## Regression

Bugs found during this build, each now covered by a test so it can't return: unstable store selector causing an infinite render loop; date-only strings shown a day early in US time zones; cross-tab updates reading stale storage; focus lost after closing dialogs; buttons with no accessible name on phones; label/name mismatches; horizontal scrolling at 320px; React bundled into the chart chunk.

## Not covered yet

Firefox and WebKit runs (configured locally as Chromium only), manual screen-reader passes, the k6 load test against staging, and E2E against a live Supabase staging project.
