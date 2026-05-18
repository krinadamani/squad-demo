# Project Context

- **Owner:** DemoUser
- **Agent:** McManus — Developer
- **Role:** Developer
- **Onboarded:** 2026-05-13

## Core Context

My demo app showcasing Squad SDK casting, onboarding, and persistent identities.

## Recent Updates

📌 Agent McManus — Developer onboarded on 2026-05-13

## Learnings

Ready to contribute to the team.


## PR #1842 — developer output — 2026-05-18T07:09:07.917Z

Building on Keyser's framing, here's my developer read in four bullets:

**Root cause #1 — Test harness shares module cache across dynamic imports.** `watch.test.ts` calls `import('@bradygaster/squad-cli/commands/watch')` in every `it` block without isolation. If `cli-entry.ts`'s ESM patch hasn't loaded when the first import fires, subsequent tests inherit a poisoned resolution cache — classic intermittent pattern, reproduces more reliably under CI parallelism than local serial runs.

**Root cause #2 — Module-level side effect in `config.ts`.** `const storage = new FSStorageProvider()` executes at import time. In the test harness, depending on how the working directory is set up, this can hit the filesystem before any test setup runs, silently failing into defaults (lines 79–81) — then subtly breaking config-dependent routing assertions without any thrown error to catch.

**Safe fix strategy** — (a) hoist the ESM patch from `cli-entry.ts` into a dedicated `setup.ts` imported first by Vitest's `setupFiles`, ensuring it runs before any dynamic imports; (b) lazy-initialize `FSStorageProvider` inside `loadWatchConfig` rather than at module scope; (c) add a `vi.isolateModules()` wrapper around the dynamic imports in `watch.test.ts` to prevent cache bleed between tests.

**Rollback plan** — The three changed files are independently reversible: revert `config.ts` to move `storage` construction inside the function body (one-liner, no API surface change), revert `cli-entry.ts` routing changes only if smoke tests show regression (patch lines 43–54 are self-contained and should not be touched), and gate the test harness changes behind a `--run-watch-tests` flag so CI can opt out while the fix stabilizes.
