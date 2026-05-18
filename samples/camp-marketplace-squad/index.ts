/**
 * index.ts — CLI entry for camp-marketplace-squad.
 * Runs the squad in the terminal. For a live web dashboard use: npm run dashboard.
 */

import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSquad } from '@bradygaster/squad-sdk';
import { SquadClient } from '@bradygaster/squad-sdk/client';
import {
  loadDotEnv,
  castAndOnboard,
  runBuild,
  ROLE_DISPLAY,
  type Role,
} from './core.js';

function hr(label: string): void {
  console.log(`\n${'─'.repeat(64)}\n  ${label}\n${'─'.repeat(64)}`);
}

async function main(): Promise<void> {
  console.log('🏕️  camp-marketplace-squad — a Squad designs & ships SunnyDays\n');

  const here = dirname(fileURLToPath(import.meta.url));
  loadDotEnv(here);

  if (!process.env.GITHUB_TOKEN) {
    console.error('❌ Missing GITHUB_TOKEN. Copy .env.example to .env and set GITHUB_TOKEN.');
    process.exit(1);
  }

  hr('Step 1 — Resolve .squad/ workspace');
  const demoRoot = join(here, '.squad-data');
  const squadDir = join(demoRoot, '.squad');
  mkdirSync(squadDir, { recursive: true });
  console.log(`  squad dir: ${squadDir}`);
  console.log(`  resolveSquad() → ${resolveSquad(demoRoot) ?? '(not found)'}`);

  hr('Step 2 — Cast & onboard the team');
  const team = await castAndOnboard(demoRoot, squadDir);
  for (const m of team) {
    console.log(`  🎭 ${m.displayName.padEnd(12)} → ${ROLE_DISPLAY[m.role as Role]} (${m.role})`);
  }

  hr('Step 3 — Connect to GitHub Copilot');
  const client = new SquadClient({ githubToken: process.env.GITHUB_TOKEN });
  await client.connect();
  console.log('  ✅ Connected');

  hr('Step 4 — Squad pipeline (each agent reads prior outputs + their history.md)');
  const outputDir = join(here, 'output');
  try {
    await runBuild(client, team, squadDir, outputDir, {
      onAgentStart: (role, agent, ctx) => {
        console.log(`\n  ▶ ${ROLE_DISPLAY[role]} (${agent.displayName}) thinking…`);
        console.log(`     reading prior: ${ctx.priorRoles.length ? ctx.priorRoles.join(' → ') : '(first in line)'}`);
        console.log(`     history.md entries: ${ctx.historyEntries}`);
      },
      onAgentComplete: (role, output) => {
        console.log(`  [${ROLE_DISPLAY[role]}]`);
        console.log(`  ${output.replace(/\n/g, '\n  ')}`);
      },
      onHistoryWritten: (_role, agentName, skipped) => {
        console.log(skipped ? `     ⏭  history.md already had entry — skipped` : `     💾 appended to ${agentName}/history.md`);
      },
      onSpecParsed: (spec, source, warnings) => {
        hr('Step 4½ — Builder BuildSpec parsed');
        console.log(`  source: ${source}`);
        console.log(`  spec:   ${JSON.stringify(spec)}`);
        for (const w of warnings) console.log(`  ⚠  ${w}`);
      },
      onAppShipped: (paths) => {
        hr('Step 5 — Builder shipped the deliverable');
        console.log(`  ✅ Web app:     ${paths.app}`);
        console.log(`  📄 Team brief:  ${paths.brief}`);
      },
    });
  } finally {
    const closable = client as unknown as { disconnect?: () => Promise<void> | void };
    if (typeof closable.disconnect === 'function') await closable.disconnect();
  }

  hr('Launch');
  console.log('  npm run serve        → marketplace at http://localhost:4200');
  console.log('  npm run dashboard    → live squad UI at http://localhost:5173');
  console.log('');
}

main().catch((err) => {
  console.error('❌ Fatal:', err);
  process.exit(1);
});
