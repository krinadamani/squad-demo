# camp-marketplace-squad

A Squad SDK sample where a small product team **designs and ships** a kids
summer camp marketplace web app called **SunnyDays**.

The squad has four roles, each playing a different part of building real
software, with each agent reading the prior teammates' outputs:

| Role (SDK)  | Real-world role  | Deliverable                          |
| ----------- | ---------------- | ------------------------------------ |
| `lead`      | Product Manager  | Product brief, user stories, scope   |
| `developer` | Builder          | Stack, components, the actual app    |
| `tester`    | QA Lead          | Acceptance criteria & edge cases     |
| `scribe`    | Launch Lead      | README, run instructions, demo flow  |

The Builder's tangible output is a working `output/index.html` you can open
in a browser — browse camps, add to cart, mock-checkout, get an order ID.

---

## Setup

```powershell
cd samples\camp-marketplace-squad
copy .env.example .env
# Edit .env and set GITHUB_TOKEN to a token with Copilot access
npm install
```

## Run the squad (designs + ships the app)

```powershell
npm start
```

This will:
1. Cast a deterministic 4-person team
2. Onboard agents under `.squad-data/.squad/agents/{name}/`
3. Run the pipeline: Product Manager → Builder → QA → Launch Lead
4. Append each agent's output to their `history.md` (deduped by product)
5. Write the actual app to `output/index.html` + team brief to `output/team-brief.md`

## Watch the squad live (recommended)

```powershell
npm run dashboard
```

Opens a live dashboard at **http://localhost:5173** where you can:
- See the product brief the squad is shipping
- Click **Run the squad** and watch each agent card light up in order
- See exactly which prior outputs + history entries each agent is reading
- See the shipped-app card appear with a link to launch the marketplace
- Browse any agent's `history.md` from prior runs

## Launch the marketplace

```powershell
npm run serve
```

Open the printed URL (default `http://localhost:4200`) and try:
- Filter by **STEM** → Add **Code Creators** → Add **Maker Lab**
- Open **Cart** → bump quantity → **Proceed to checkout**
- Fill the form → **Pay & confirm** → see the order ID

Storage is **in-memory** (per-tab) — refreshing the page clears the cart.
That tradeoff is explicit in the QA Lead's output.

---

## What you learn from this sample

1. **A squad isn't just one LLM** — each role brings a different lens (product
   value, implementation, quality, communication) and they build on each other.
2. **Persistent identities** — the same cast of agents appears every run, and
   their `history.md` files accumulate their decisions over time.
3. **Real artifacts** — the squad doesn't just talk; it ships `output/index.html`
   that you can actually use.

Compare with [`pr-triage-system`](../pr-triage-system) (same agents, different
mission: triaging incoming PRs instead of building a product).
