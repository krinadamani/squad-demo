---
marp: true
theme: default
paginate: true
size: 16:9
header: 'camp-marketplace-squad'
footer: 'Squad SDK · sample'
style: |
  section {
    font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
    font-size: 26px;
    color: #1f2937;
    background: #fff7ed;
  }
  section.lead {
    background: linear-gradient(135deg, #ff7a45 0%, #e85d2a 100%);
    color: white;
    text-align: center;
  }
  section.lead h1 { font-size: 64px; margin-bottom: 0.2em; }
  section.lead h2 { font-weight: 400; opacity: 0.95; }
  h1 { color: #e85d2a; }
  h2 { color: #1f2937; }
  code { background: #fde4cc; padding: 0.1em 0.3em; border-radius: 4px; color: #b8430e; }
  pre code { background: #1f2937; color: #f9fafb; }
  table { font-size: 22px; }
  th { background: #fde4cc; }
  blockquote { border-left: 4px solid #ff7a45; color: #6b7280; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5em; }
  .pill { display: inline-block; background: #fde4cc; color: #b8430e; padding: 0.15em 0.7em; border-radius: 999px; font-size: 0.85em; font-weight: 600; }
---

<!-- _class: lead -->

# 🏕️ camp-marketplace-squad

## Building a real product with an AI team
A walkthrough of the Squad SDK sample

---

## Why use the Squad framework? 🎁

Roles, charters, history, casting, the live event stream — all from the SDK. You don't build it.

<div class="cols">

<div>

### Out of the box

- 🎭 **CastingEngine** — pick a team by universe (`usual-suspects`, `oceans-eleven`, custom) and required roles
- 📜 **`onboardAgent()`** — scaffolds charters + history per agent
- 🔌 **`SquadClient`** — one-line GitHub Copilot integration with session lifecycle, permissions, tool surface
- 📡 **Event bus** — `agent_start`, `tool_call`, etc. for live UIs
- 🗂️ **Convention-based filesystem** — `.squad/agents/{name}/` works across all samples

</div>

<div>

### What you'd otherwise build

- Persona/role assignment logic
- Per-agent persistent storage layout
- Prompt assembly with charter + history
- LLM client + retry + timeout + auth
- Streaming pipe to your UI
- Tool/permission abstraction
- Cross-sample interop conventions

</div>

</div>

> **Bring your domain. Skip the plumbing.**

---

## Squad's superpowers in this sample

| Squad gives you | We used it for | Lines of code we *didn't* write |
|---|---|---|
| `CastingEngine.castTeam()` | Picking 4 named characters with the right roles | ~150 |
| `onboardAgent()` | Creating `charter.md` + `history.md` per agent | ~80 |
| `SquadClient` + session | Talking to Copilot with system prompts & permissions | ~200 |
| Built-in universes | "Usual Suspects" personalities for free | ~100 |
| Conventional layout | Other Squad samples can read our agents | priceless |

**Net result:** [core.ts](core.ts) is ~340 lines. A from-scratch equivalent would be **easily 5×** that — and wouldn't compose with other Squad tools.

---

## What you'll see today

1. **The product** — SunnyDays, a kids summer camp marketplace
2. **The team** — four AI agents with charters, history, and roles
3. **The pipeline** — how they collaborate to actually ship code
4. **The dashboard** — watch it happen live
5. **A live demo**

<!--
Speaker notes: This is a demo of the Squad SDK pattern applied to product building.
The goal is to show a small AI team behaving like a real team — with role separation,
memory, and a shippable artifact at the end.
-->

---

## The product: SunnyDays ☀️

A single-page marketplace where parents can:

- 🔍 **Browse** ~8 hand-picked summer camps (sports, STEM, arts, outdoors, ...)
- 🧺 **Add to cart** with quantity controls
- 💳 **Mock checkout** that produces an order confirmation

**No backend, no database, no framework** — vanilla HTML/CSS/JS, in-memory cart.

> The point isn't the marketplace. The point is *who built it.*

---

## The team — four roles, one shared brief

| Role | Display name | What they do |
|---|---|---|
| `lead` | **Product Manager** | Writes the vision, user stories, success metric |
| `developer` | **Builder** | Picks the stack, designs components, **emits a `BuildSpec`** |
| `tester` | **QA Lead** | Defines acceptance criteria & edge cases |
| `scribe` | **Launch Lead** | Synthesizes everything into a launch script |

Each is a **persona** powered by GitHub Copilot, with:
- A persistent **charter** (their personality + working style)
- A persistent **history** (what they've worked on before)

---

## How a role plays its turn

```
┌──────────────────────────────────────────────────────────────┐
│  Pipeline prompt to Copilot for this role:                   │
│                                                              │
│  • Product brief (audience, problem, must-haves)             │
│  • Charter excerpt for "you"                                 │
│  • All prior teammates' outputs                              │
│  • Role-specific task                                        │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
            Copilot returns a tight, bulleted response
                              │
                              ▼
            Runtime saves to history.md + passes forward
```

Each turn **builds on every previous turn** — the developer sees the brief, the QA Lead sees the plan, the Launch Lead sees everything.

---

## The Builder's special move 🛠️

The Builder doesn't just *describe* the app — it **drives the build.**

Its output must include a fenced JSON block:

```json
{
  "brandColor":      "#1e40af",
  "brandColorDark":  "#1e3a8a",
  "heroTitle":       "☀️ SunnyDays Camps",
  "heroTagline":     "Find the perfect summer for your kid",
  "ctaLabel":        "Reserve spot",
  "featuredCategory": "STEM"
}
```

The runtime **parses, validates, and applies it** → those values reach the shipped HTML/CSS.

---

## The flow — top to bottom
```
1. cast & onboard team       (CastingEngine + charters)
       │
2. Product Manager → brief
       │
3. Builder → plan + JSON spec
       │
   ┌───┴───────────────────────────┐
   │  parseBuildSpec() validates    │
   │  buildAppHtml(spec) writes     │
   │  → output/index.html SHIPPED   │
   └───┬───────────────────────────┘
       │
4. QA Lead → AC (sees the shipped artifact)
       │
5. Launch Lead → demo script (sees the shipped artifact)
       │
6. team-brief.md written
```

---

## Persistent memory — agents that remember

Each agent has a folder on disk:

```
.squad-data/.squad/agents/
   ├── matilda/
   │   ├── charter.md     ← who they are
   │   └── history.md     ← what they've done
   ├── benji/
   │   ├── charter.md
   │   └── history.md
   └── ...
```

- **Charter** is read into every prompt → consistent personality across runs
- **History** is appended after each turn → re-runs are de-duplicated by marker
- Agents survive between runs, between products, between teammates

---

## Three ways to run

<div class="cols">

<div>

### 🖥️ CLI

```bash
npm start
```

Terminal-only. Step-by-step pipeline output. Good for CI, scripting, screenshots.

</div>

<div>

### 🎬 Dashboard

```bash
npm run dashboard
# → :5173
```

Live web UI. Watch agents activate, see their outputs stream in, view history.

</div>

</div>

### 🌐 Then launch the marketplace

```bash
npm run serve     # → :4200
```

Serves the shipped `output/index.html`. Real, working SPA.

---

## Live dashboard — what you see

- **Three panels:** Brief / Pipeline / Ship status + history viewer
- **Four agent cards** light up in sequence:
  - 🟡 Pending → 🔵 Thinking (pulsing) → 🟢 Done
- **Context strip** on each card shows what they're reading (prior outputs, charter, history count)
- **Ship card** populates the moment the Builder ships — shows applied `BuildSpec` and any warnings
- **History viewer** lets you inspect any agent's full memory

All driven by **Server-Sent Events** from the pipeline.

---

## Architecture at a glance

```
        ┌──────────┐         ┌──────────────────┐
        │   CLI    │────┐    │   Dashboard UI   │
        │ index.ts │    │    │ web/public/*.js  │
        └──────────┘    │    └────────┬─────────┘
                        │             │ SSE
                        ▼             ▼
                  ┌────────────────────────┐
                  │       core.ts          │  ← shared pipeline
                  │  • runBuild()          │
                  │  • parseBuildSpec()    │
                  └────┬─────────┬─────────┘
                       │         │
              ┌────────▼──┐  ┌───▼──────────────┐
              │ Squad SDK │  │ app-template.ts  │
              │ + Copilot │  │ buildAppHtml()   │
              └───────────┘  └──────────────────┘
                       │              │
                       ▼              ▼
                 .squad/agents/  output/index.html
                 (charters,       (the shipped
                  history)         marketplace)
```

---

## Demo time 🎬

1. `npm run dashboard` → open **http://localhost:5173**
2. Click **Run squad build**
3. Watch the four cards light up in order
4. See the **Ship card** populate with the parsed `BuildSpec`
5. In a second terminal: `npm run serve`
6. Click **Launch marketplace ↗** → shop, add to cart, mock checkout

<br/>

> ☝️ Try changing the product brief in `core.ts` and re-running. Watch the Builder pick different colors and copy.

---

<!-- _class: lead -->

# Questions?

📁 `samples/camp-marketplace-squad/`
📄 [ARCHITECTURE.md](./ARCHITECTURE.md) — diagrams + invariants
📖 [README.md](./README.md) — quick start

**Thanks!**
