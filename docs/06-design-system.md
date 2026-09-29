# 06 — Design system

## 1. Direction

This is a tool people live in for eight hours a day, mostly typing and scanning lists. It should feel like a well-kept logbook: calm, dense, precise, on warm paper. It should not look like a marketing dashboard.

Revised 2026-09-29 (UI polish): warm neutrals, a serif for titles, hairline elevation, and short purposeful motion. The density and the rules below stay.

- **One signature element: the pace bar.** Every target shows actual versus target, plus a thin marker for where you should be by now (docs/05, section 3). It appears on My Day, Tasks and Performance. Everything else stays quiet so this reads instantly.
- **Numbers are the content.** Use tabular figures everywhere, align numbers right in tables, never decorate them.
- **Color carries meaning, not decoration.** A single accent for interaction; status colors only for status.
- **No template chrome:**
  - no gradient washes
  - no heavy drop shadows: panels get a hairline lift (`--shadow-card`), only overlays float
  - no all-caps eyebrow labels
  - no arrows appended to button text
  - no emoji in the UI

## 2. Color tokens

Define as CSS variables in `globals.css` and map them into Tailwind and the shadcn theme. Light and dark themes (below); the dark values are written once with `@variant dark`.

| Token | Hex | Use |
|---|---|---|
| `--canvas` | `#FAF9F5` | app background (warm ivory) |
| `--surface` | `#FFFFFF` | panels, tables, forms |
| `--surface-muted` | `#F3F1EC` | table header, hover rows, inactive chips |
| `--line` | `#E5E2D9` | borders, dividers |
| `--line-strong` | `#D4D0C4` | input and secondary-button borders |
| `--ink` | `#1F1E1B` | primary text |
| `--ink-muted` | `#5E5A52` | secondary text, labels |
| `--ink-faint` | `#8D897F` | placeholders, disabled |
| `--accent` | `#0E6272` | primary buttons, links, active nav, focus ring, pace bar fill |
| `--accent-hover` | `#0A4E5B` | |
| `--accent-soft` | `#E2EFF0` | selected rows, active nav background |
| `--ok` / `--ok-soft` | `#2E7D4F` / `#E3F1E6` | done, won, on pace |
| `--warn` / `--warn-soft` | `#A8660B` / `#FAEFDA` | due today, slightly behind, stuck |
| `--bad` / `--bad-soft` | `#B8322A` / `#FAE4E0` | overdue, far behind, errors, flags |

Rules:
- Text on `--accent` is white.
- Text on soft backgrounds uses the matching strong color.
- All text pairs must meet WCAG AA contrast. Check `--ink-muted` on `--canvas` in review.

**Stage chips** (soft background, strong text), progressing from neutral to accent:

| Stage | Background | Text |
|---|---|---|
| Qualified | `#F0EEE8` | `#5E5A52` |
| Meeting done | `#E7EEF5` | `#2F5A85` |
| Proposal sent | `#E2EFF0` | `#0E6272` |
| Negotiation | `#DCEBE5` | `#1D6B57` |
| Won | `#E3F1E6` | `#276B43` |
| Lost | `#F3EFEE` | `#74605B` |

Chip text on soft fills is darkened to meet AA (`--ok-ink`, `--warn-ink`, `--lost-ink`). Stage colours are Tailwind tokens: `bg-stage-won text-stage-won-ink`.

**Lead status chips:**
- New and Contacted: neutral
- Replied: accent-soft
- Qualified: the Meeting done colors
- Customer: ok
- Nurture: warn-soft
- Not interested, Lost and Bad fit: muted, with the text struck through for Bad fit only

### Dark theme

Each person picks **Light**, **Dark** or **Same as system** in the user menu (bottom of the sidebar). The choice is saved per browser. The same token names switch to warm near-blacks, so components never hard-code colors. Every text/background pair meets AA.

| Token | Dark value | | Token | Dark value |
|---|---|---|---|---|
| canvas | `#141412` | | accent | `#4FB3C2` |
| surface | `#1C1B19` | | accent-soft | `#13292C` |
| surface-muted | `#262521` | | ok / ok-soft | `#5CC28A` / `#11261A` |
| line | `#302E2A` | | warn / warn-soft | `#E0A24A` / `#2A200F` |
| ink | `#EEECE6` | | bad / bad-soft | `#F07A70` / `#2E1714` |
| ink-muted | `#AAA69C` | | on-accent, on-bad (text on solid fills) | `#0F0F0E` |

In dark mode, text on solid accent and bad fills turns black (`on-accent`, `on-bad`), because the fills get lighter. Backdrops behind panels and dialogs are black at 60%.

## 3. Typography

A Claude-style pairing. Anthropic's own typefaces are licensed, so these are the closest free equivalents, all via `next/font/google` (no extra library):
- **Interface: Inter** (variable), with tabular figures on numbers (the `.num` utility). Fallback: `system-ui, sans-serif`.
- **Display: Source Serif 4** (500, 600) for page titles (`text-title`), dialog and sheet titles, and big numbers (`text-display-num`). Applied by the type token itself, so no extra class.
- **Mono: JetBrains Mono** (400) for IDs, URLs in read-only views, and keyboard shortcut hints only.

| Name | Size / line | Weight | Use |
|---|---|---|---|
| display-num | 30 / 34, −0.015em | 600 serif | big numbers on scoreboard cards |
| title | 22 / 28, −0.01em | 600 serif | page titles |
| section | 15 / 22 | 600 | block headings |
| body | 14 / 20 | 400 | default |
| body-strong | 14 / 20 | 500 | table primary column, names |
| small | 13 / 18 | 400 | secondary lines, helper text |
| micro | 12 / 16 | 500 | chips, counters |

- Sentence case everywhere, including headings and buttons.
- Keep prose lines to 72 characters or fewer (helper text, empty states).
- No arbitrary sizes (`text-[10px]` and the like); the smallest text is `micro`.

## 4. Layout

- **Sidebar:** 232px, surface color, right border.
  - Top: app name.
  - Nav items: icon + label; active = accent-soft background + accent text.
  - Bottom: user name, role and time zone, with a menu for Profile and Sign out.
- **Top bar in each page:** page title on the left. Right side: the date-range picker (Performance and Feed) and the primary action button.
- **Content** max width 1440px, 24px padding. Tables are full width.
- **Founder's department switcher** sits under the app name (docs/07, Navigation).
- **Spacing** on a 4px scale: 4, 8, 12, 16, 24, 32.
- **Radius:** 6px small controls, 8px inputs and buttons, 12px panels and dialogs; chips are pills. Tables have no outer radius inside panels. Use the tokens, never `rounded-[…]`.
- **Elevation** (three tokens, warm-tinted):
  - `shadow-card`: panels, stat grids, buttons: a hairline lift on top of the 1px `--line` border
  - `shadow-raised`: hover on interactive cards (pipeline cards), the sign-in panel
  - `shadow-overlay`: popovers, menus, dialogs and side panels
  - overlays sit on a 25% ink backdrop with a 2px blur
- **Side panel (sheet):** 560px wide, slides in from the right, used for Add lead, Log activity, drill-downs and Quick view. Esc closes it; unsaved changes prompt "Discard changes?"
- **Breakpoints:** designed for 1280–1536px, adapted (not shrunk) below:
  - under 1024px the sidebar becomes a top bar with a menu button
  - under 640px the leads list is a card per lead, and the content month view is an agenda of days with posts
  - under 768px the pipeline shows one stage at a time with a stage picker; drag starts after a short press on touch screens
  - other tables scroll sideways inside their panel; side panels are full width
  - on touch screens (`pointer: coarse`) icon buttons and nav links grow to 40px and keyboard hints are hidden

## 5. Components (shadcn/ui based)

| Component | Notes |
|---|---|
| Button | primary (accent), secondary (surface + line), ghost, destructive (bad). Height 32px; 36px in forms. Labels are verbs: "Save lead", "Log activity", "Assign task". `pending` shows a spinner, disables it and sets `aria-busy`; every submit button uses it. A 1px press-down on click. |
| Input, Select, Combobox, Textarea, DatePicker | 36px; label above; helper or error text below. Errors use `--bad` text and border. |
| Chip / Badge | micro type, 20px tall, pill, soft background |
| Pace bar | 6px track (`--surface-muted`), fill colored by pace state, 2px-wide ink marker for pace. Label: `58 / 112` left, `52%` right, tabular. |
| Data table | TanStack. 40px rows, sticky header, sortable columns, row hover `--surface-muted`, click opens the record. Checkbox column only where bulk actions exist. Page size 50, with "Load more". |
| Kanban column | header with stage chip, count, and total value; cards 8px apart; drop zone highlight `--accent-soft` |
| Opportunity card | company (body-strong), title (small, muted), value (num), owner initials (founder view), days-in-stage, amber clock when stuck |
| Stat block | label (small, muted), value (display-num), optional delta or pace bar. Blocks sit in one grid divided by 1px lines (the grid has `shadow-card`), not separate cards. |
| Empty state | one sentence saying what goes here, plus one primary action |
| Skeleton | `PageSkeleton` with the page's shape (`table`, `board`, `cards`, `detail`) and `ListSkeleton` for lists in panels and popovers; a soft shimmer, `role="status"` with a label |
| Loading bar | a 2px accent bar at the top while a filter, range or date change fetches (`useFilterNav`); old results dim to 60% with `aria-busy` |
| Toast (sonner) | bottom-right, 4s. Success: "Lead saved". Error: what failed and what to do. |
| Command menu (cmdk) | Ctrl/Cmd+K: search leads, contacts, companies and opportunities, plus actions ("New lead", "Log activity") |

## 6. Interaction

- **Keyboard shortcuts** (show in tooltips and the command menu):
  - N: new lead
  - L: log activity (on a lead page, or the selected My Day row)
  - T: new task (founder)
  - /: focus search
  - Ctrl/Cmd+K: command menu
  - G then M / L / P: go to My Day / Leads / Pipeline
  - Esc: close panel
- **Saving:** optimistic where safe (ticking a task, moving a card). Roll back with an error toast if the server rejects.
- **Loading:** list and board routes have a `loading.tsx` skeleton shaped like the page (not the lead page: streaming would answer 200 before a 404); filter changes use the loading bar; buttons show their own spinner. Never full-page spinners after first load.
- **Motion:** short, eased out (`--ease-out-soft`), CSS only, and only on arrivals and actions:
  - pages fade up 4px over 180ms (`(app)/template.tsx`)
  - side panels slide fully in over 240ms, out over 180ms; dialogs fade and scale from 97% over 200ms
  - menus and popovers fade and zoom over 150ms
  - pipeline cards lift on hover and while dragged; the active nav item grows an accent bar
  - form errors fade in over 150ms; the pace bar fill animates once over 300ms
  - live feed rows fade in once when they arrive; nothing loops except loading indicators
  - the global `prefers-reduced-motion` rule turns all of it off
- **Focus:** one style on every interactive element: a 2px solid accent outline, keyboard only (`:focus-visible`), offset 2px (0 on inputs). A "Skip to content" link is the first tab stop.
- **Accessibility:** form errors are tied to their field (`aria-describedby`, `aria-invalid`, done by `FormField`); hand-made tab bars take arrow keys (`onTablistKeyDown`); information shown on hover (flag notes, grid values, card details) is also in screen-reader text or a focusable tooltip.
- **Money:** `$12,000`; decimals only if non-zero cents. **Percent:** `34.5%`. **Dates:** see docs/04, section 8.

## 7. UI copy rules

- Name things by what users understand: "Follow-ups due", not "Pending next actions".
- A button says exactly what happens, and the toast uses the same verb: "Assign task" → "Task assigned".
- **Errors say what happened and how to fix it.** No apologies, no vague "Something went wrong."
  - "This phone number isn't valid for United States. Include the area code."
  - "You can't delete leads. Mark it as Bad fit instead."
- **Empty states invite action:**
  - "No leads yet. Press N to add your first one."
  - "Nothing due today. Pick a lead and plan its next step."
- Use the person's first name in founder views ("Ahmed's leads"). Use "you" in BD views.

Copy for every screen is in `docs/07-screens.md`.
