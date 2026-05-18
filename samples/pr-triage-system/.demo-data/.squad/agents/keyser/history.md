# Project Context

- **Owner:** DemoUser
- **Agent:** Keyser — Lead
- **Role:** Lead
- **Onboarded:** 2026-05-13

## Core Context

My demo app showcasing Squad SDK casting, onboarding, and persistent identities.

## Recent Updates

📌 Agent Keyser — Lead onboarded on 2026-05-13

## Learnings

Ready to contribute to the team.


## PR #1842 — lead output — 2026-05-18T07:08:32.082Z

**PR #1842 — Fix flaky CI in CLI watch mode — Triage (Keyser, Lead)**

**Severity: HIGH — merge blocked.** CI is actively failing on watch-mode integration tests. Changed files span routing entry point (`cli-entry.ts`), command config, and test harness — a broad surface for regression in a latency-sensitive path.

**Owner: EECOM (Core Dev), reviewer: INCO (CLI UX).** Routing rules assign `src/cli/` to EECOM as primary; INCO gates on any UX-affecting command behavior changes. No hand-off to Network unless dispatch serialization is implicated.

**Before merge, require:**
- Failing test evidence captured and reproduced locally (not just in CI) — watch-mode tests show no real-timing coverage; suspect environment coupling or process lifecycle leak in the test harness setup
- ESM monkey-patch in `cli-entry.ts:43-54` confirmed not regressed by routing changes — it's load-order sensitive and breaks silently
- Silent config parse failure at `config.ts:79-81` flagged for follow-up issue (not a blocker here, but must not be worsened by this PR)

**Escalation gate:** Require explicit human approval from EECOM owner + one Lead sign-off before merge. Do not auto-merge on green CI alone — watch for intermittent re-failures across at least 2 consecutive clean runs given the flaky history. If fix touches signal handler timing (3-second `unref` window), escalate to full regression suite.
