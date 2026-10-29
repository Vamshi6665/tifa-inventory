# Design system

Source of truth: `src/design-system/tokens.css`. Every text/background pair is checked by `scripts/contrast.mjs` (100 checks, all passing, run in CI).

## Direction

Premium and quiet, with an identity taken from the shop itself. Light mode is the frosted glass of a gelato case; dark mode is cacao — visibly brown surfaces, not tinted black. Tifa's own green is the single accent. Glass (blur + translucency) is reserved for floating layers: top bar, command palette, menus, bulk-action bar, mobile tab bar. The one memorable element is the **stock meter**: a level bar with a fixed par mark at 40%, used the same way on the overview, grid and item pages, so "how full is this pan" reads instantly everywhere.

## Colour

| Role | Light | Dark |
| --- | --- | --- |
| Background | `#F4F7F5` | `#1A120E` |
| Surface | `#FFFFFF` | `#231914` |
| Text | `#0D2418` (forest) | `#F6EDE5` |
| Secondary text | `#3A5C47` (sage) | `#CDBBAE` |
| Accent (fills) | `#1F9A62` | `#3CC488` |
| Accent (buttons, text) | `#17784D` | `#5AD39C` |
| Brand mark | `#2AAE72` | `#3CC488` |

Semantic: danger, warning (with a separate 3:1 fill for meters), review (violet, for counts the system can't read), info. Each has a soft background with ≥4.5:1 text contrast. Stock states map to them consistently: out → danger, low → warning, needs review → review, in stock → accent, no par → neutral.

## Type

Instrument Sans (variable weight 400–700 and width 75–100%), self-hosted with the Latin subset preloaded. One family used through its axes: headings at 92% width and tighter tracking; big numbers at 80% width with tabular figures so columns of quantities align. Scale (px): 12, 13, 14, 15, 17, 20, 24, 30, 38 — the two largest are fluid with `clamp()`.

## Space, radius, layers

8-point grid with a 4px half-step (`--space-1` … `--space-8`). Radius is hierarchical, not uniform: 5px badges, 8px controls, 12px panels, 18px dialogs, full for pills. Z-index tokens for sticky, nav, overlay, dialog, popover, toast, tooltip.

## Motion

Durations 120/200/320ms; easing out, in-out and a gentle spring for things that open. All animation is CSS transform/opacity (GPU-composited). Motion answers actions — dialogs, menus, the bulk bar, toggles, meters filling — rather than decorating page loads. `prefers-reduced-motion` and the in-app "Reduce motion" setting both collapse durations to ~0.

## Components

`Button` / `IconButton` (icon-only buttons require a label; optional indicator dot), `TextField`, `TextArea`, `SelectField` (native select for mobile and screen readers), `SearchInput`, `Checkbox` (native input, custom box, indeterminate), `Switch`, `Segmented`, `Tabs`, `Badge` / `StockBadge`, `StockMeter`, `Panel`, `Stat`, `Dialog` (centred, side sheet, bottom sheet on phones), `ConfirmDialog`, `Menu`, `Popover`, `Tooltip`, `Skeleton`, `Spinner`, `EmptyState`, `Avatar`, `Kbd`, `PageHeader`, and `DataGrid`.

Rules the components enforce: one visible focus treatment everywhere; 44px touch targets on coarse pointers; 16px inputs on phones (no iOS zoom); dialogs move focus in and return it to the trigger; every page has one `h1` that receives focus on navigation.

## Writing

Sentence case, plain verbs, buttons say what happens ("Save count", "Receive and update stock"), toasts echo the verb ("Count confirmed"). Errors say what happened and what to do; empty states invite the next action. No all-caps labels.
