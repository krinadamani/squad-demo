# Project Context

- **Owner:** DemoUser
- **Agent:** Verbal — Scribe
- **Role:** Scribe
- **Onboarded:** 2026-05-13

## Core Context

My demo app showcasing Squad SDK casting, onboarding, and persistent identities.

## Recent Updates

📌 Agent Verbal — Scribe onboarded on 2026-05-13

## Learnings

Ready to contribute to the team.


## PR #1842 — scribe output — 2026-05-18T07:09:41.867Z

**PR #1842 — Triage Summary (Verbal/Scribe)**

- **🚫 Blocked — HIGH severity.** CI is failing on watch-mode integration tests across three files (`cli-entry.ts`, `config.ts`, `watch-mode.test.ts`). Do not merge on green CI alone; explicit approval from EECOM (owner) + one Lead sign-off required.

- **Root causes identified.** Two compounding issues: (1) ESM monkey-patch in `cli-entry.ts:43–54` is load-order sensitive — test harness dynamic imports can fire before the patch registers, poisoning the module cache under CI parallelism; (2) `FSStorageProvider` instantiates at module scope in `config.ts`, hitting the filesystem before test setup and silently swallowing config errors into defaults (lines 79–81).

- **Fix approach (EECOM owns).** (a) Hoist ESM patch into a dedicated `setup.ts` loaded via Vitest `setupFiles`; (b) lazy-initialize `FSStorageProvider` inside `loadWatchConfig`; (c) wrap `watch-mode.test.ts` `it` blocks with `vi.isolateModules()`. INCO reviews for any UX-visible command behavior changes before merge.

- **Verification gate.** Capture failing test evidence reproduced locally, not just in CI. Run suite twice — serially (`--pool=forks --singleFork`) and in parallel — to confirm the cache-poisoning race is resolved. Add a `loadWatchConfig` boundary test asserting an explicit error or documented default (not silent fallback) when no config file is present.
