# Accessibility report (WCAG 2.2 AA)

## How it's tested

| Check | Tool | Result |
|---|---|---|
| Every page and the login screen, light and dark, including colour contrast | axe-core in Chromium (Playwright, WCAG 2.0/2.1/2.2 A and AA tags) | **0 violations** |
| Every page in jsdom (fast feedback during development) | axe-core via Vitest | 0 violations |
| All 100 token colour pairs (text 4.5:1, body 7:1, UI parts 3:1) | `scripts/contrast.mjs` (in CI) | 100/100 |
| Lighthouse accessibility, 6 pages × mobile and desktop | Lighthouse 13 | **100 on all 12** |
| Static rules | eslint-plugin-jsx-a11y | Clean; four documented exceptions |
| Keyboard flows | Playwright | Skip link, focus to page heading, dialog focus trap and return, palette, grid rows |

## Issues found during the build and fixed

These were caught by the tests above, not assumed:

1. **Buttons with no accessible name on phones (4.1.2).** The search button and the grid's Filter/Views buttons hid their text with `display: none` at small widths. Text is now visually hidden but still the name.
2. **Label in name mismatches (2.5.3).** Five controls had an `aria-label` that didn't contain their visible text (e.g. visible "Same", announced as "Pistachio is still 4"). Speech-input users say what they see; labels now start with the visible words.
3. **ARIA on a non-interactive wrapper (4.1.2).** The notification bell's wrapper span received popup attributes. The bell button now carries them and shows the unread dot itself.
4. **Duplicate navigation landmarks.** Sidebar and tab bar were both in the DOM; now only the one that fits the viewport renders.
5. **Focus lost after closing dialogs (2.4.3).** Focus fell to the page body; dialogs now remember and restore the element that opened them.
6. **Insufficient contrast for UI parts (1.4.11).** Control borders, the accent fill and the amber meter fill were below 3:1; adjusted.

## Criteria notes

- **1.3.1 Info and relationships:** real tables with `scope`, `aria-sort`, `aria-rowcount`/`aria-rowindex` under virtualization; fieldsets for grouped choices; lists keep `role="list"` (Safari drops list semantics without it).
- **1.4.1 Use of colour:** stock state is always a word ("Low", "Out of stock") as well as a colour; meters have text labels with percent of par.
- **1.4.10 Reflow:** no horizontal scrolling at 320px on any page (tested at 10 widths); wide tables scroll inside their own frame.
- **1.4.13 Content on hover:** tooltips are supplementary; nothing essential is hover-only.
- **2.1.1 Keyboard / 2.1.4 Character shortcuts:** everything works by keyboard; single-key shortcuts (`/`, `j`, `k`, `x`) never fire while typing in a field.
- **2.3.3 Animation from interactions / reduced motion:** honours the OS setting plus an in-app switch.
- **2.4.7 / 2.4.13 Focus visible and appearance:** 2px outline with offset in the accent colour, ≥3:1 against both themes.
- **2.5.8 Target size:** 44px controls on touch screens; 36px on desktop.
- **3.3.1 / 3.3.3 Error identification and suggestion:** inline errors linked with `aria-describedby`, `aria-invalid`, and specific fixes ("Par must be a number from 0 to 100,000").
- **4.1.3 Status messages:** row counts after filtering, count progress and toasts are announced via live regions.

## Not yet verified

Manual screen-reader passes (VoiceOver on iOS/macOS, NVDA on Windows) and testing with users who rely on assistive technology. Automated tools catch a subset of issues; schedule a manual pass before calling this fully conformant.
