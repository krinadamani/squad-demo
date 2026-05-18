# pr-triage-system — Architecture Overview

High-level view of which layer owns what, and how the demo app reaches the LLM.

```mermaid
flowchart TB
    User([👤 Developer]) -->|npm start| App

    subgraph App["🟦 pr-triage-system (your code)"]
        direction TB
        A1[Load .env + intake payload]
        A2[Heuristics:<br/>severity, areas,<br/>risk flags, next actions]
        A3[Build per-role prompts<br/>lead / dev / tester / scribe]
        A4[Aggregate results into<br/>JSON + Markdown report]
        A1 --> A2 --> A3 --> A4
    end

    subgraph SDK["🟩 @bradygaster/squad-sdk"]
        direction TB
        S1[CastingEngine.castTeam<br/>deterministic team selection]
        S2[onboardAgent<br/>writes charter.md + history.md]
        S3[SquadClient<br/>session + sendAndWait]
        S4[CastingHistory<br/>persistent identities]
    end

    subgraph Copilot["🟪 GitHub Copilot LLM"]
        C1[Chat completions<br/>per role session]
    end

    App -->|cast team| S1
    App -->|onboard each member| S2
    App -->|one session per role| S3
    App -->|verify name persistence| S4
    S3 -->|GITHUB_TOKEN auth| C1
    C1 -->|role response| S3
    S3 -->|text| App

    A4 -->|writes| Files[(".demo-data/<br/>reports/*.json + .md<br/>.squad/agents/**/charter.md")]
```

> Tip: open the preview in its own tab (`Ctrl+K V`) and zoom with `Ctrl++` if the diagram looks small.

## Layer responsibilities

| Layer | Responsibility |
|---|---|
| 🟦 **pr-triage-system** | Domain logic: intake parsing, severity heuristics, prompt building, report rendering. |
| 🟩 **squad-sdk** | Team casting, agent onboarding, Copilot client/session management, identity history. |
| 🟪 **GitHub Copilot** | The LLM. The SDK talks to it; the app never calls OpenAI/Azure directly. |

See [FLOW.md](FLOW.md) for the step-by-step runtime flow.
