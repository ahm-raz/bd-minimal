# 06 — Design system

## 1. Direction

This is a tool people live in for eight hours a day, mostly typing and scanning lists. It should feel like a well-kept logbook: calm, dense, precise. It should not look like a marketing dashboard.

- **One signature element: the pace bar.** Every target shows actual versus target, plus a thin marker for where you should be by now (docs/05, section 3). It appears on My Day, Tasks and Performance. Everything else stays quiet so this reads instantly.
- **Numbers are the content.** Use tabular figures everywhere, align numbers right in tables, never decorate them.
- **Color carries meaning, not decoration.** A single accent for interaction; status colors only for status.
- **No template chrome:**
  - no gradient washes
  - no identical shadowed cards for every block
  - no all-caps eyebrow labels
  - no arrows appended to button text
  - no emoji in the UI

## 2. Color tokens

Define as CSS variables in `globals.css` and map them into Tailwind and the shadcn theme. Light theme only in v1.

| Token | Hex | Use |
|---|---|---|
| `--canvas` | `#F5F6F8` | app background |
| `--surface` | `#FFFFFF` | panels, tables, forms |
| `--surface-muted` | `#EEF0F3` | table header, hover rows, inactive chips |
| `--line` | `#DFE3E8` | borders, dividers |
| `--ink` | `#161B22` | primary text |
| `--ink-muted` | `#5A6472` | secondary text, labels |
| `--ink-faint` | `#8A93A0` | placeholders, disabled |
| `--accent` | `#0E6272` | primary buttons, links, active nav, focus ring, pace bar fill |
| `--accent-hover` | `#0A4E5B` | |
| `--accent-soft` | `#E1EFF1` | selected rows, active nav background |
| `--ok` / `--ok-soft` | `#2E7D4F` / `#E2F2E8` | done, won, on pace |
| `--warn` / `--warn-soft` | `#A8660B` / `#FBEFD9` | due today, slightly behind, stuck |
| `--bad` / `--bad-soft` | `#B8322A` / `#FBE5E2` | overdue, far behind, errors, flags |

Rules:
- Text on `--accent` is white.
- Text on soft backgrounds uses the matching strong color.
- All text pairs must meet WCAG AA contrast. Check `--ink-muted` on `--canvas` in review.

**Stage chips** (soft background, strong text), progressing from neutral to accent:

| Stage | Background | Text |
|---|---|---|
| Qualified | `#EEF0F3` | `#5A6472` |
| Meeting done | `#E6EEF6` | `#2F5A85` |
| Proposal sent | `#E1EFF1` | `#0E6272` |
| Negotiation | `#DCEBE6` | `#1D6B57` |
| Won | `#E2F2E8` | `#2E7D4F` |
| Lost | `#F3F1F1` | `#8A6F6C` |

**Lead status chips:**
- New and Contacted: neutral
- Replied: accent-soft
- Qualified: the Meeting done colors
- Customer: ok
- Nurture: warn-soft
- Not interested, Lost and Bad fit: muted, with the text struck through for Bad fit only

## 3. Typography

- **Family:** IBM Plex Sans (400, 500, 600) via `next/font/google`, with `font-feature-settings: "tnum"` on numbers (a `.num` utility). Fallback: `system-ui, sans-serif`.
- IBM Plex Mono (400) for IDs, URLs in read-only views, and keyboard shortcut hints only.

| Name | Size / line | Weight | Use |
|---|---|---|---|
| display-num | 28 / 32 | 600 | big numbers on scoreboard cards |
| title | 20 / 28 | 600 | page titles |
| section | 15 / 22 | 600 | block headings |
| body | 14 / 20 | 400 | default |
| body-strong | 14 / 20 | 500 | table primary column, names |
| small | 13 / 18 | 400 | secondary lines, helper text |
| micro | 12 / 16 | 500 | chips, counters |

- Sentence case everywhere, including headings and buttons.
- Keep prose lines to 72 characters or fewer (helper text, empty states).

## 4. Layout

- **Sidebar:** 232px, surface color, right border.
  - Top: app name.
  - Nav items: icon + label; active = accent-soft background + accent text.
  - Bottom: user name, role and time zone, with a menu for Profile and Sign out.
- **Top bar in each page:** page title on the left. Right side: the date-range picker (Performance and Feed) and the primary action button.
- **Content** max width 1440px, 24px padding. Tables are full width.
- **Spacing** on a 4px scale: 4, 8, 12, 16, 24, 32.
- **Radius:** 6px for inputs, buttons and chips; 10px for panels and dialogs. Tables have no outer radius inside panels.
- **Elevation:**
  - panels: 1px `--line` border, no shadow
  - popovers, dialogs and side panels: shadow `0 8px 24px rgba(22,27,34,.12)`
- **Side panel (sheet):** 560px wide, slides in from the right, used for Add lead, Log activity, drill-downs and Quick view. Esc closes it; unsaved changes prompt "Discard changes?"
- **Breakpoints:** designed for 1280–1536px. It must still work at 390px wide: the sidebar becomes a top menu button, tables scroll horizontally, and the board scrolls sideways.

## 5. Components (shadcn/ui based)

| Component | Notes |
|---|---|
| Button | primary (accent), secondary (surface + line), ghost, destructive (bad). Height 32px; 36px in forms. Labels are verbs: "Save lead", "Log activity", "Assign task". |
| Input, Select, Combobox, Textarea, DatePicker | 36px; label above; helper or error text below. Errors use `--bad` text and border. |
| Chip / Badge | micro type, 20px tall, soft background |
| Pace bar | 6px track (`--surface-muted`), fill colored by pace state, 2px-wide ink marker for pace. Label: `58 / 112` left, `52%` right, tabular. |
| Data table | TanStack. 40px rows, sticky header, sortable columns, row hover `--surface-muted`, click opens the record. Checkbox column only where bulk actions exist. Page size 50, with "Load more". |
| Kanban column | header with stage chip, count, and total value; cards 8px apart; drop zone highlight `--accent-soft` |
| Opportunity card | company (body-strong), title (small, muted), value (num), owner initials (founder view), days-in-stage, amber clock when stuck |
| Stat block | label (small, muted), value (display-num), optional delta or pace bar. Plain surface with no shadow; blocks sit in a grid divided by 1px lines, not separate cards. |
| Empty state | one sentence saying what goes here, plus one primary action |
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
- **Loading:** skeleton rows for tables, never full-page spinners after first load.
- **Motion:** only in response to actions.
  - side panel slides in over 160ms
  - a card lifts while dragged
  - a pace bar fill animates once, over 300ms, when its value changes
  - respect `prefers-reduced-motion`
- **Focus:** a visible 2px accent focus ring on every interactive element.
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
