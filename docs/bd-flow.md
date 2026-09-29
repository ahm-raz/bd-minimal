# BD flow: visual guide

What a BD (business developer) sees and does in the app, one diagram per area.
Built step by step during the BD walkthrough. Founder and social media manager flows come later.

## 1. Sign in and page access

```mermaid
flowchart TD
    A[Open /login] --> B{Email + password correct?}
    B -- No --> C["Error: Email or password is incorrect."] --> A
    B -- Yes --> D{Account active?}
    D -- No --> E["Your access has been turned off. Contact the founder."]
    D -- Yes --> F[My Day]
    F --> G[BD sidebar: My Day · Leads · Pipeline · Tasks · Performance]
    G --> H{Types a blocked URL?}
    H -- "/team, /feed, /settings" --> I["Back to My Day: That page is for the founder."]
    H -- "/content" --> J["Back to My Day: That page isn't part of your role."]
```

My Day on an empty database:

```mermaid
flowchart LR
    MD[My Day] --> T1["Today so far<br/>Leads added · Outreach · Follow-ups<br/>(numbers; bars once the founder sets targets)"]
    MD --> T2["Replies · Meetings booked<br/>(+ Proposals sent if targeted)"]
    MD --> T3["Tasks from the founder"]
    MD --> T4["Follow-ups: Overdue · Today<br/>Coming up: next 7 days"]
    T1 -- click a counter --> DD[Side list of the items behind the number]
    T2 -- click --> DD
```

## 2. New lead form

```mermaid
flowchart TD
    A["Press N or + Lead"] --> B[New lead panel<br/>Niche pre-filled with the BD's primary niche]
    B --> C[Fill sections:<br/>Company · Primary contact · More contacts<br/>Location · Online · Classification · Sales context · First step]
    C --> D{Company name, website,<br/>contact email or LinkedIn<br/>matches one of MY leads?}
    D -- Yes --> E["Yellow: You already have X (status)"]
    E -- Open lead --> F[Go to existing lead]
    E -- Add anyway --> C
    D -- No --> G[Click Save lead]
    G --> H{Validation}
    H -- "Name < 2 chars · no first name · no niche / channel" --> X1[Inline field error]
    H -- "No email, phone, mobile, LinkedIn, company phone<br/>(or Upwork URL when channel is Upwork)" --> X2[Red box: Add at least one way to reach them]
    H -- "Bad format: website, LinkedIn, phone vs country,<br/>email, maps link, rating, review count, tags" --> X1
    H -- "Next action without due, or due without action" --> X1
    X1 --> C
    X2 --> C
    H -- OK --> I[Saved with status New<br/>Normalized: https website, E.164 phones,<br/>lowercase emails and tags]
    I --> J[DB computes completeness: 10 checks × 10%]
    I --> K["My Day: Leads added +1"]
    I --> L{Next action due?}
    L -- Today or overdue --> M[My Day → Follow-ups]
    L -- Next 7 days --> N[My Day → Coming up]
    L -- None --> O[Leads → No next action view]
    G -. Save and add another .-> P[Form clears, keeps niche, channel,<br/>campaign and source] --> C
```

Form sections and what each field feeds:

```mermaid
flowchart LR
    subgraph Required
      R1[Company name]
      R2[Primary contact first name]
      R3[Niche]
      R4[Channel]
      R5[One way to reach them]
    end
    subgraph "Completeness (10% each)"
      C1[Website]
      C2[Company LinkedIn]
      C3[City + state]
      C4[Pain point]
      C5[Lead source]
      C6[Primary contact job title]
      C7[Primary contact LinkedIn]
      C8[Primary contact email]
      C9[Primary contact phone or mobile]
      C10[Any contact is decision maker]
    end
    S[State, US only] -- suggests --> TZ[Lead time zone<br/>manual pick wins]
    CH[Channel = Upwork] -- shows --> UP[Upwork job URL<br/>counts as a way to reach them]
    CO[Country] -- validates --> PH[All phone numbers]
    MP[Make primary] -- changes --> C6
```

## 3. Lead page

```mermaid
flowchart TD
    LP["/leads/:id"] --> HD[Header]
    LP --> NA[Next action box]
    LP --> TL[Timeline]
    LP --> CP[Contacts panel]
    LP --> OP[Opportunities panel]
    LP --> DT[Details panel]

    HD --> S1["Status chip → pick any of 9 statuses by hand<br/>(next matching event may change it again)"]
    HD --> S2[Priority chip → High / Medium / Low]
    HD --> S3["Lead's local time (from lead time zone)"]
    HD --> S4["Log activity (L)"]
    HD --> S5["⋯ → Edit (BD)<br/>Flag · Reassign · Delete are founder only"]

    NA --> N1{Has next action?}
    N1 -- No --> N2["No next action. Plan the next step."<br/>→ Add next action]
    N1 -- Yes --> N3[Text + due label<br/>grey future · amber today · red overdue]
    N3 --> N4[Edit → Save / Cancel / Clear next action]
    N3 --> N5[Done, log it → Log activity form]

    CP --> C1[Copy email / phone · open LinkedIn]
    CP --> C2["+ Add → contact sheet (max 10)"]
    CP --> C3["⋯ → Edit · Make primary · Remove"]
    C3 --> C4{Last contact?}
    C4 -- Yes --> C5[Remove not offered:<br/>a lead needs at least one contact]

    TL --> F1[Filter: All · Activities · Pipeline]
    TL --> F2[Activities: BD can edit own for 24 hours]
    TL --> F3["Lead added by … (All only)"]
```

## 4. Log activity

```mermaid
flowchart TD
    O["Open: Log activity button · L · Done, log it · Log on My Day row"] --> T[Pick Type<br/>grouped by category]
    T --> OC[Outcome list filtered by category<br/>default: No response / Interested / Done]
    OC --> W["Contact (primary by default) · When (now, max 7 days back, not future) · Notes"]
    W --> NX{Next action}
    NX -- "What's next + Due" --> V
    NX -- "No next step ticked" --> V
    NX -- "Both empty and outcome not<br/>Not interested / Bounced" --> ER["Blocked: Say what the next step is,<br/>or tick No next step. · Pick a due date."] --> NX
    NX -- "Empty, outcome Not interested / Bounced" --> V
    V[Log activity] --> DB[(Database)]
    DB --> A1[Timeline entry<br/>BD can edit own for 24 hours]
    DB --> A2[Lead status rule]
    DB --> A3[Next action replaced or cleared]
    DB --> A4[My Day counters]
    DB --> A5[Founder feed event]
    DB --> A6[Count tasks re-checked]
```

Status rule applied by the database:

```mermaid
flowchart TD
    S{Lead is Qualified, Customer,<br/>Lost or Bad fit?} -- Yes --> K[Status unchanged]
    S -- No --> N1{Outcome = Not interested?}
    N1 -- Yes --> NI[Not interested]
    N1 -- No --> N2{"Outcome is a reply?<br/>Interested · Not now · Meeting booked"}
    N2 -- Yes --> RP[Replied]
    N2 -- No --> N3{Lead is New and type<br/>isn't Reply received?}
    N3 -- Yes --> CT[Contacted]
    N3 -- No --> K
```

Which counter goes up:

```mermaid
flowchart LR
    C1["Outreach category<br/>(first touch)"] --> M1[Outreach]
    C2[Follow-up category] --> M2[Follow-ups]
    R["Outcome Interested · Not now ·<br/>Not interested · Meeting booked"] --> M3[Replies]
    P[Outcome Interested · Meeting booked] --> M4[Positive replies]
    MB[Outcome Meeting booked] --> M5[Meetings booked]
    MB --> OPP[Prompt: Create an opportunity?]
```

## 5. A lead's status over its life

Worked example from the walkthrough (Smile Dental Austin):

```mermaid
flowchart LR
    N[New] -- "5a: LinkedIn connection request<br/>(outreach)" --> C[Contacted]
    C -- "5b: LinkedIn follow-up<br/>No response: no change" --> C
    C -- "5c: Reply received · Interested" --> R[Replied]
    R -- "5e: set by hand" --> NU[Nurture]
    NU -- "any reply outcome" --> R
    R -- "Reply · Not interested" --> NI[Not interested]
    NI -- "a later reply" --> R
    R -- "6: opportunity created" --> Q[Qualified]
    Q -- "7: deal Won" --> CU[Customer]
    CU -- "7b: won deal moved back to an open stage" --> Q
    Q -- "7b: last open deal Lost<br/>and no won deal" --> L[Lost]
    L -- "deal reopened" --> Q
    X["Bad fit (by hand)"] -. "activities never change it" .- X
```

- Editing an activity (5d, own activities, 24 hours) never changes the status.
- Customer, Lost, Not interested and Bad fit leads leave My Day follow-ups and the **My open leads** view; **All my leads** still shows them.

## 6. Opportunity and pipeline

```mermaid
flowchart TD
    MB["Log: Meeting booked"] --> P{"Create an opportunity?"}
    P -- Not now --> NP[Lead stays Replied]
    P -- Create --> O
    NB["Lead page → Opportunities → + New"] --> O["Title + Estimated value required<br/>Expected close optional<br/>Same title can't be open twice"]
    O --> Q[Stage: Qualified<br/>Lead → Qualified]
    Q --> MD[Meeting done] --> PS[Proposal sent] --> NG[Negotiation]
    PSL["Log: Proposal sent"] -- "offers: Move to Proposal sent" --> PS
    NG --> W{Won}
    NG --> LS{Lost}
    W -- "Final value + Contract type<br/>(+ Monthly amount if monthly)" --> WN[Won · Lead → Customer]
    LS -- "Reason required, note optional" --> LN[Lost · Lead → Lost<br/>unless another deal is open or won]
    WN -- "back to an open stage:<br/>'This will remove it from won revenue.'" --> Q
    LN -- "back to an open stage:<br/>'This reopens it and clears the lost reason.'" --> Q
```

Moves: drag on **Pipeline**, or the stage dropdown in the lead page's Opportunities panel. Any stage can go to any stage; every move shows in the timeline under **Pipeline**.
