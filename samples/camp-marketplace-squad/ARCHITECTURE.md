# camp-marketplace-squad — Architecture & Flow

## 1. High-level architecture

Three independent processes, each on its own port, sharing the same workspace files.

```mermaid
flowchart TB
  subgraph User["👤 User"]
    BROWSER1[Browser → :5173<br/>Live squad dashboard]
    BROWSER2[Browser → :4200<br/>SunnyDays marketplace]
    TERM[Terminal → npm start<br/>CLI mode]
  end

  subgraph Sample["🏕️ camp-marketplace-squad/"]
    subgraph Entry["Entry points"]
      INDEX[index.ts<br/>CLI runner]
      DASH[dashboard.ts<br/>SSE server :5173]
      SERVE[serve.ts<br/>App host :4200]
    end

    CORE[core.ts<br/>Squad pipeline + events]
    TPL[app-template.ts<br/>HTML/CSS/JS for SunnyDays]

    subgraph Output["output/"]
      APPHTML[index.html<br/>📦 the shipped app]
      BRIEF[team-brief.md<br/>📄 team's collected outputs]
    end

    subgraph Squad[".squad-data/.squad/agents/"]
      A1[mcmanus/<br/>charter.md + history.md]
      A2[verbal/<br/>charter.md + history.md]
      A3[fenster/<br/>charter.md + history.md]
      A4[keaton/<br/>charter.md + history.md]
    end

    subgraph Web["web/public/"]
      UI[index.html + app.js + styles.css<br/>dashboard frontend]
    end
  end

  subgraph External["External services"]
    SDK[("@bradygaster/squad-sdk")]
    COPILOT[("GitHub Copilot<br/>via SquadClient")]
  end

  TERM --> INDEX
  BROWSER1 --> DASH
  BROWSER2 --> SERVE

  INDEX --> CORE
  DASH --> CORE
  DASH --> UI

  CORE --> TPL
  CORE --> SDK
  CORE --> COPILOT
  CORE --> Squad
  CORE --> APPHTML
  CORE --> BRIEF

  SERVE --> APPHTML

  classDef entry fill:#fff7ed,stroke:#ff7a45,color:#1f2937
  classDef core fill:#dbeafe,stroke:#2563eb,color:#1e40af
  classDef output fill:#f0fdf4,stroke:#16a34a,color:#14532d
  classDef ext fill:#f3f4f6,stroke:#6b7280,color:#1f2937

  class INDEX,DASH,SERVE entry
  class CORE,TPL core
  class APPHTML,BRIEF,Squad output
  class SDK,COPILOT,External ext
```

### What each file owns

| File | Role | Runs as |
|---|---|---|
| index.ts | Terminal-only entry; orchestrates the squad and prints to stdout | `npm start` |
| dashboard.ts | HTTP + SSE server for the live build UI | `npm run dashboard` (port 5173) |
| serve.ts | Static HTTP server for the shipped marketplace | `npm run serve` (port 4200) |
| core.ts | Shared pipeline: cast → onboard → run each agent → ship the app, with event hooks | imported by all three |
| app-template.ts | The actual product code (HTML/CSS/JS) the Builder ships | imported by core.ts |
| web/public/ | Dashboard frontend (vanilla JS, SSE consumer) | served by dashboard.ts |

---

## 2. Squad build pipeline (per run)

```mermaid
sequenceDiagram
  participant U as User
  participant D as dashboard.ts<br/>(or index.ts)
  participant C as core.ts
  participant SDK as squad-sdk
  participant FS as filesystem<br/>(.squad-data/)
  participant CP as Copilot
  participant TPL as app-template.ts
  participant OUT as output/

  U->>D: POST /api/build  (or npm start)
  D->>C: castAndOnboard()
  C->>SDK: engine.castTeam('usual-suspects')
  SDK-->>C: [McManus(lead), Verbal(dev), Fenster(tester), Keaton(scribe)]
  C->>FS: onboardAgent() × 4  → writes charter.md & history.md

  D->>C: runBuild(events)

  loop For each role: lead → developer → tester → scribe
    C->>FS: read charter.md
    C->>FS: count history.md entries
    C-->>D: onAgentStart(role, agent, context)
    Note over D: chip "↩ reading: PM"<br/>chip "📜 history: N entries"<br/>card → thinking

    C->>CP: createSession() + sendAndWait(prompt)
    Note over CP: prompt includes:<br/>• charter excerpt<br/>• product brief<br/>• prior agents' outputs
    CP-->>C: text response

    C-->>D: onAgentComplete(role, output)
    Note over D: card → done<br/>output displayed

    C->>FS: appendAgentHistory()<br/>(skip if duplicate marker exists)
    C-->>D: onHistoryWritten(role, name, skipped)
    Note over D: 💾 saved / ⏭ skipped tag
  end

  C->>TPL: buildAppHtml()
  TPL-->>C: full HTML string
  C->>OUT: write output/index.html
  C->>OUT: write output/team-brief.md
  C-->>D: onAppShipped(paths)
  Note over D: ship card shows<br/>Launch marketplace ↗

  D-->>U: SSE done
```

### Key invariants

- **Order is fixed**: `lead → developer → tester → scribe`. Each agent's prompt includes every prior agent's output, so context strictly grows.
- **History is durable**: each role's bullets get appended to that agent's `history.md` exactly once per product. Re-running for the same product skips writes (visible as ⏭ in the dashboard).
- **Cast is deterministic**: same universe + same required roles + same team size → same characters, every run.
- **LLM is in its lane**: Copilot only powers agent *reasoning*. The product data (camps) and product code (HTML) come from `app-template.ts`, not the LLM.

---

## 3. Marketplace runtime (what parents see)

```mermaid
flowchart LR
  subgraph Browser["🌐 Browser (per-tab)"]
    UI[SunnyDays UI<br/>Browse / Cart / Checkout]
    STATE["In-memory state:<br/>cart = [{ campId, qty }]"]
    DATA[(CAMPS array<br/>8 hardcoded camps)]
  end

  subgraph Server["serve.ts on :4200"]
    HTML[output/index.html<br/>single self-contained file]
  end

  Browser -->|GET /| Server
  Server -->|200 HTML| Browser

  UI <--> STATE
  UI <--> DATA

  classDef br fill:#fff7ed,stroke:#ff7a45
  classDef sv fill:#dbeafe,stroke:#2563eb
  class UI,STATE,DATA br
  class HTML sv
```

**Notes**

- No backend round-trips after the initial page load. Filtering, add-to-cart, checkout — all client-side JS against the in-memory `cart` array.
- Refreshing the tab clears the cart (the QA Lead flags this in their output).
- Checkout is a mock: a fake order ID is generated from `Date.now()`. No payment processor is contacted.

---

## 4. Dashboard live-update flow (SSE)

```mermaid
sequenceDiagram
  participant B as Browser :5173
  participant D as dashboard.ts
  participant C as core.ts

  B->>D: GET / → index.html + app.js
  B->>D: GET /api/brief → product brief JSON
  B->>D: GET /api/team → cast info → render empty cards
  Note over B: User clicks "Run the squad"

  B->>D: POST /api/build
  D-->>B: 200 + Content-Type: text/event-stream

  D->>C: runBuild(events)
  loop Each agent
    C-->>D: onAgentStart
    D-->>B: event: agent_start
    Note over B: card → thinking + context chips

    C-->>D: onAgentComplete
    D-->>B: event: agent_complete
    Note over B: card → done + output

    C-->>D: onHistoryWritten
    D-->>B: event: history_written
    Note over B: 💾 / ⏭ tag
  end
  C-->>D: onAppShipped
  D-->>B: event: app_shipped
  Note over B: ship card + launch link

  D-->>B: event: done → stream closes
```

The SSE pattern (`text/event-stream` over a long-lived POST response) means the browser gets each agent's output the moment Copilot returns it — no polling, no websockets.
