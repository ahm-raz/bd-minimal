# Lead timeline: flow

How the **Timeline** panel on the lead page (`/leads/:id`) is built, filtered and edited.
Spec: `docs/07-screens.md` section 5. Code: `src/components/leads/timeline.tsx`, `src/server/queries/lead-detail.ts`, `src/server/actions/activities.ts`.

## 1. Where the entries come from

Every entry is written by the app or by a database trigger. The timeline only reads.

```mermaid
flowchart LR
    subgraph "User actions"
      U1[Add lead]
      U2["Log activity<br/>(lead page, My Day, L)"]
      U3["Create opportunity<br/>(+ New, Meeting booked prompt)"]
      U4["Move stage<br/>(Pipeline drag, stage dropdown,<br/>Won / Lost dialogs)"]
      U5["Reassign lead (founder)"]
    end
    U1 --> L[(leads)]
    U1 -- "trigger: first owner event" --> OE[(lead_owner_events)]
    U2 -- "log_activity()" --> A[(activities)]
    U3 --> O[(opportunities)]
    U4 --> O
    O -- "trigger: on insert or stage change" --> SE[(opportunity_stage_events)]
    U5 --> L
    L -- "trigger: owner changed" --> OE
```

## 2. How the page loads and merges them

```mermaid
flowchart TD
    P["/leads/:id"] --> Q["getLeadDetail (RLS decides access;<br/>hidden lead → 404)"]
    Q --> R1["activities for the lead<br/>newest first, up to 500"]
    Q --> R2[lead_owner_events for the lead]
    Q --> R3[opportunities for the lead]
    R3 --> R4[opportunity_stage_events<br/>for those opportunities]
    R1 --> M
    R2 -- "drop the first event<br/>(from_owner empty = creation)" --> M
    R4 --> M
    LC["lead.created_at"] --> M
    M["Merge into one list<br/>time: occurred_at · changed_at · created_at"] --> S[Sort newest first]
    S --> F{Filter chip}
    F -- All --> V1[Every entry]
    F -- Activities --> V2[Activities only]
    F -- Pipeline --> V3[Stage changes + reassignments]
```

Activities sort by **when it happened** (`occurred_at`), so a backdated activity lands at its real place in the list, not at the top.

## 3. What each entry shows

```mermaid
flowchart LR
    T[Every row] --> TM["Time on the left,<br/>in the viewer's time zone"]
    T --> K{Kind}
    K -- Activity --> A["Type · outcome chip · 'with' contact<br/>notes in quotes · logger's initials<br/>⋯ menu when allowed"]
    K -- Stage change --> S["Opportunity title<br/>From stage 'to' To stage<br/>or 'created in' Stage · mover's initials"]
    K -- Reassign --> R["Reassigned from X to Y"]
    K -- Created --> C["Lead added by X<br/>(All only, always last)"]
```

Outcome chip colours: Interested accent · Meeting booked green · Not now amber · Bounced red · Not interested muted · No response and Done neutral.

## 4. Edit and delete an activity

```mermaid
flowchart TD
    A[Activity row] --> W{Who is viewing?}
    W -- Founder --> FM["⋯ → Edit · Delete<br/>any activity, any time"]
    W -- BD --> B1{"Logged it themself<br/>and logged under 24 hours ago?"}
    B1 -- No --> NM[No ⋯ menu]
    B1 -- Yes --> BM["⋯ → Edit"]
    FM --> ED
    BM --> ED["Edit activity dialog<br/>Outcome · When · Notes<br/>(type and contact can't change)"]
    ED --> SV[Save activity]
    SV --> CK{Server checks}
    CK -- "not own / past 24 hours (BD)" --> E1["You can only edit activities you logged.<br/>Activities lock 24 hours after they're logged."]
    CK -- "outcome not allowed for the category" --> E2[Inline: Pick one of the outcomes offered for this type.]
    CK -- "When in the future or over 7 days back" --> E3[Inline error on When]
    CK -- OK --> OK1["Saved · timeline re-sorts<br/>lead status is not recalculated"]
    FM -- Delete --> DL["Activity deleted<br/>(database allows founder only)"]
```

- The 24-hour window counts from when the activity was **logged** (`created_at`), not from its **When** date.
- The ⋯ menu is hidden by the UI; the server action and RLS reject the same cases anyway.

## 5. Acceptance

Anything logged elsewhere (My Day, Log activity, Pipeline board, Won / Lost dialogs, reassign) shows up in this timeline, in time order. Founder-only actions (Delete, Reassign) are hidden from BDs and rejected by the server.
