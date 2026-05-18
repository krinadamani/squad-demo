# Project Context

- **Owner:** DemoUser
- **Agent:** Fenster — Tester
- **Role:** Tester
- **Onboarded:** 2026-05-13

## Core Context

My demo app showcasing Squad SDK casting, onboarding, and persistent identities.

## Recent Updates

📌 Agent Fenster — Tester onboarded on 2026-05-13

## Learnings

Ready to contribute to the team.


## PR #1842 — tester output — 2026-05-18T07:09:26.757Z

Building on the Developer's root causes and fix strategy:

**1. ESM patch ordering — regression test.** Add a Vitest `setupFiles` smoke test that asserts `require.extensions` (or the ESM hook) is registered *before* any `import('@bradygaster/squad-cli/commands/watch')` resolves. Run this as the first test in CI order; a failure here immediately surfaces the load-order race the Developer identified at `cli-entry.ts:43–54`.

**2. Module cache isolation — parallelism harness check.** Wrap every `it` block in `watch-mode.test.ts` with `vi.isolateModules()` and add a CI step that runs the suite twice: once serially (`--pool=forks --poolOptions.forks.singleFork`) and once with full parallelism. A test that passes only serially confirms the poisoned-cache intermittency the Developer flagged.

**3. Lazy `FSStorageProvider` — filesystem boundary test.** After the lazy-init fix in `config.ts`, add a test that imports `loadWatchConfig` with `process.cwd()` pointed at a temp directory containing no config file, asserting an explicit error or documented default is returned — not a silent fallback (lines 79–81). This pins the contract so a future module-scope regression surfaces immediately.

**4. Exit criteria for merge.** All three test additions green on CI in parallel mode; `cli-entry.ts` ESM patch test passes in isolation *without* `setup.ts` pre-import (to confirm it's not mask-by-setup); no new `console.warn` output in the watch-mode test run (silence = swallowed config errors); EECOM + one Lead sign-off as Keyser gated.
