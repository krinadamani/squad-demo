/**
 * pr-triage-system — Engineering Intake + PR Triage assistant
 *
 * Demonstrates:
 *  1. Resolve local workspace state under .demo-data/.squad
 *  2. Cast a deterministic triage team
 *  3. Onboard agents for persistent team continuity
 *  4. Run lightweight engineering triage heuristics on issue/PR input
 *  5. Per-role LLM commentary via GitHub Copilot (SquadClient)
 *  6. Emit JSON + Markdown triage reports for human review
 *
 * GITHUB_TOKEN required (token must have GitHub Copilot access).
 */

import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveSquad,
  CastingEngine,
  CastingHistory,
  onboardAgent,
} from '@bradygaster/squad-sdk';
import type { CastMember } from '@bradygaster/squad-sdk';
import { SquadClient } from '@bradygaster/squad-sdk/client';

type IntakeKind = 'issue' | 'pr';
type Role = 'lead' | 'developer' | 'tester' | 'scribe';

interface IntakePayload {
  kind: IntakeKind;
  id: number;
  repo: string;
  title: string;
  description: string;
  labels: string[];
  author: string;
  changedFiles?: string[];
  ciStatus?: 'passing' | 'failing' | 'unknown';
}

interface TriageReport {
  generatedAt: string;
  intake: IntakePayload;
  severity: 'low' | 'medium' | 'high';
  areas: string[];
  riskFlags: string[];
  suggestedOwnerRole: 'developer' | 'tester' | 'lead';
  nextActions: string[];
  agentOutputs: {
    lead: string;
    developer: string;
    tester: string;
    scribe: string;
  };
  llm: {
    provider: 'github-copilot';
  };
}

function hr(label: string): void {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${label}`);
  console.log('─'.repeat(60));
}

function parseInputArg(): string | null {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--input');
  if (idx === -1 || idx === args.length - 1) {
    return null;
  }
  return args[idx + 1];
}

function stripWrappingQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function loadDotEnv(sampleRoot: string): void {
  const envPath = join(sampleRoot, '.env');
  if (!existsSync(envPath)) {
    return;
  }

  const content = readFileSync(envPath, 'utf8');
  const lines = content.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const equalsIndex = line.indexOf('=');
    if (equalsIndex <= 0) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    const value = stripWrappingQuotes(line.slice(equalsIndex + 1).trim());

    if (!key || process.env[key] !== undefined) {
      continue;
    }

    process.env[key] = value;
  }
}

function defaultPayload(): IntakePayload {
  return {
    kind: 'pr',
    id: 1842,
    repo: 'bradygaster/squad',
    title: 'Fix flaky CI in CLI watch mode',
    description:
      'Intermittent failures in watch mode integration tests. Includes changes in CLI command routing and test harness setup.',
    labels: ['bug', 'ci', 'cli'],
    author: 'octocat',
    changedFiles: [
      'packages/squad-cli/src/cli/commands/watch/config.ts',
      'packages/squad-cli/src/cli-entry.ts',
      'test/watch-mode.test.ts',
    ],
    ciStatus: 'failing',
  };
}

function loadPayload(inputPath: string | null, sampleRoot: string): IntakePayload {
  if (!inputPath) {
    return defaultPayload();
  }

  const absoluteInputPath = join(sampleRoot, inputPath);
  const content = readFileSync(absoluteInputPath, 'utf8');
  const parsed = JSON.parse(content) as IntakePayload;
  return parsed;
}

function classifySeverity(payload: IntakePayload): 'low' | 'medium' | 'high' {
  const text = `${payload.title} ${payload.description}`.toLowerCase();
  const labels = payload.labels.map((label) => label.toLowerCase());

  if (
    payload.ciStatus === 'failing' ||
    labels.includes('security') ||
    text.includes('outage') ||
    text.includes('data loss')
  ) {
    return 'high';
  }

  if (
    labels.includes('bug') ||
    labels.includes('incident') ||
    text.includes('flaky') ||
    text.includes('regression')
  ) {
    return 'medium';
  }

  return 'low';
}

function detectAreas(payload: IntakePayload): string[] {
  const files = payload.changedFiles ?? [];
  const areas = new Set<string>();

  for (const file of files) {
    if (file.includes('/cli/')) {
      areas.add('cli');
    }
    if (file.includes('/sdk/')) {
      areas.add('sdk');
    }
    if (file.includes('test') || file.includes('__tests__')) {
      areas.add('tests');
    }
    if (file.endsWith('.md')) {
      areas.add('docs');
    }
  }

  if (areas.size === 0) {
    areas.add(payload.kind === 'issue' ? 'intake' : 'unknown');
  }

  return Array.from(areas);
}

function computeRiskFlags(payload: IntakePayload, severity: 'low' | 'medium' | 'high'): string[] {
  const flags: string[] = [];

  if (severity === 'high') {
    flags.push('High severity signal from CI/labels/content');
  }
  if ((payload.changedFiles?.length ?? 0) > 10) {
    flags.push('Large change set; review scope risk');
  }
  if (payload.ciStatus === 'failing') {
    flags.push('CI failing; merge should be blocked');
  }
  if (payload.kind === 'pr' && (payload.changedFiles?.length ?? 0) === 0) {
    flags.push('PR missing changed file metadata');
  }

  return flags;
}

function suggestedOwnerRole(severity: 'low' | 'medium' | 'high', areas: string[]): 'developer' | 'tester' | 'lead' {
  if (severity === 'high') {
    return 'lead';
  }
  if (areas.includes('tests')) {
    return 'tester';
  }
  return 'developer';
}

function nextActions(payload: IntakePayload, severity: 'low' | 'medium' | 'high', areas: string[]): string[] {
  const actions: string[] = [];

  actions.push('Confirm reproduction details and expected behavior in issue/PR thread.');
  actions.push('Assign primary owner and reviewer pair.');

  if (payload.ciStatus === 'failing') {
    actions.push('Stabilize CI before merge; capture failing test evidence.');
  }
  if (areas.includes('cli')) {
    actions.push('Run CLI smoke tests and command routing regression checks.');
  }
  if (areas.includes('tests')) {
    actions.push('Audit flaky tests for timing and environment coupling.');
  }
  if (severity === 'high') {
    actions.push('Escalate to on-call lead and require explicit human approval gate.');
  }

  return actions;
}

function buildFallbackOutput(
  role: Role,
  payload: IntakePayload,
  severity: 'low' | 'medium' | 'high',
  areas: string[],
): string {
  if (role === 'lead') {
    return `Prioritize ${payload.kind.toUpperCase()} #${payload.id} as ${severity.toUpperCase()} and enforce approval before merge.`;
  }
  if (role === 'developer') {
    return `Assess impacted areas: ${areas.join(', ')}. Draft minimal safe fix and rollback plan.`;
  }
  if (role === 'tester') {
    return 'Design focused regression checks for affected modules and verify CI stability.';
  }
  return 'Publish triage summary, risks, and action checklist to the team thread.';
}

function truncateForPrompt(text: string, maxChars = 1800): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}...`;
}

function roleInstructions(role: Role): string {
  if (role === 'lead') {
    return 'Classify severity, choose owner role, and list approval/escalation guidance in 4 concise bullets.';
  }
  if (role === 'developer') {
    return 'Using the Lead\'s severity and ownership framing, identify likely root cause areas, a safe fix strategy, and rollback plan in 4 concise bullets.';
  }
  if (role === 'tester') {
    return 'Based on the Developer\'s proposed fix strategy, propose focused regression tests, CI checks, and exit criteria in 4 concise bullets. Reference specific risks the Developer raised.';
  }
  return 'Synthesize the Lead, Developer, and Tester outputs into a concise PR-comment-ready triage summary in 4 concise bullets. Highlight blockers, owner, fix approach, and verification plan.';
}

function readAgentCharter(squadDir: string, agentName: string): string {
  const charterPath = join(squadDir, 'agents', agentName.toLowerCase(), 'charter.md');
  if (!existsSync(charterPath)) {
    return 'No charter found.';
  }
  return truncateForPrompt(readFileSync(charterPath, 'utf8'));
}

function appendToAgentHistory(squadDir: string, agentName: string, intake: IntakePayload, role: Role, output: string): void {
  const historyPath = join(squadDir, 'agents', agentName.toLowerCase(), 'history.md');
  if (!existsSync(historyPath)) {
    return; // Skip if history file doesn't exist yet
  }

  const intakeMarker = `${intake.kind.toUpperCase()} #${intake.id} — ${role} output`;

  try {
    const existing = readFileSync(historyPath, 'utf8');
    if (existing.includes(intakeMarker)) {
      console.log(`     ⏭  ${agentName} history already has ${intake.kind.toUpperCase()} #${intake.id} (${role}) — skipping`);
      return;
    }

    const timestamp = new Date().toISOString();
    const entry = `\n## ${intakeMarker} — ${timestamp}\n\n${output}\n`;
    writeFileSync(historyPath, existing + entry, 'utf8');
  } catch (err) {
    console.warn(`⚠️  Failed to write to agent history: ${historyPath}`, err);
  }
}

async function callCopilot(
  client: SquadClient,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const session = await client.createSession({
    systemMessage: { mode: 'append', content: systemPrompt },
    onPermissionRequest: () => ({ kind: 'approved' }),
  });

  const anySession = session as unknown as {
    sendAndWait?: (msg: { prompt: string }, timeoutMs?: number) => Promise<unknown>;
    close?: () => Promise<void> | void;
  };

  try {
    if (!anySession.sendAndWait) {
      throw new Error('Session does not support sendAndWait');
    }

    const result = await anySession.sendAndWait({ prompt: userPrompt }, 120_000);
    const data = (result as Record<string, unknown> | undefined)?.['data'] as
      | Record<string, unknown>
      | undefined;
    const content =
      (typeof data?.['content'] === 'string' ? (data['content'] as string) : '') ||
      (typeof result === 'string' ? result : '');
    const trimmed = content.trim();
    if (!trimmed) {
      throw new Error('Copilot returned an empty response');
    }
    return trimmed;
  } finally {
    if (typeof anySession.close === 'function') {
      await anySession.close();
    }
  }
}

async function generateAgentOutput(
  client: SquadClient,
  role: Role,
  payload: IntakePayload,
  severity: 'low' | 'medium' | 'high',
  areas: string[],
  riskFlags: string[],
  actions: string[],
  team: CastMember[],
  squadDir: string,
  priorOutputs: Partial<Record<Role, string>>,
): Promise<string> {
  const agent = team.find((member) => member.role === role);
  const displayName = agent?.displayName ?? role;
  const charter = agent ? readAgentCharter(squadDir, agent.name) : 'No charter found.';

  const systemPrompt = [
    `You are ${displayName} with role ${role} in an engineering intake and PR triage workflow.`,
    'Keep output concise, actionable, and focused on software delivery risk management.',
    'Build on the prior teammates\' outputs when provided. Do not contradict them without justification.',
    'Do not include markdown headings.',
  ].join(' ');

  const priorLines: string[] = [];
  const priorOrder: Role[] = ['lead', 'developer', 'tester', 'scribe'];
  for (const priorRole of priorOrder) {
    if (priorRole === role) break;
    const text = priorOutputs[priorRole];
    if (text) {
      priorLines.push(`--- ${priorRole.toUpperCase()} output ---\n${truncateForPrompt(text, 1200)}`);
    }
  }

  const userPrompt = [
    `Ticket: ${payload.kind.toUpperCase()} #${payload.id} in ${payload.repo}`,
    `Title: ${payload.title}`,
    `Description: ${payload.description}`,
    `Labels: ${payload.labels.join(', ') || '(none)'}`,
    `Changed files: ${(payload.changedFiles ?? []).join(', ') || '(unknown)'}`,
    `CI status: ${payload.ciStatus ?? 'unknown'}`,
    `Heuristic severity: ${severity}`,
    `Detected areas: ${areas.join(', ')}`,
    `Risk flags: ${riskFlags.join(' | ') || 'none'}`,
    `Proposed next actions: ${actions.join(' | ')}`,
    `Agent charter excerpt: ${charter}`,
    priorLines.length
      ? `Prior teammate outputs to build on:\n${priorLines.join('\n\n')}`
      : 'You are the first role; no prior teammate outputs yet.',
    `Task: ${roleInstructions(role)}`,
  ].join('\n');

  try {
    return await callCopilot(client, systemPrompt, userPrompt);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return `${buildFallbackOutput(role, payload, severity, areas)} [fallback used: ${reason}]`;
  }
}

async function buildReport(
  client: SquadClient,
  payload: IntakePayload,
  team: CastMember[],
  squadDir: string,
): Promise<TriageReport> {
  const severity = classifySeverity(payload);
  const areas = detectAreas(payload);
  const riskFlags = computeRiskFlags(payload, severity);
  const ownerRole = suggestedOwnerRole(severity, areas);
  const actions = nextActions(payload, severity, areas);

  console.log('  LLM provider: github-copilot');
  console.log('  Pipeline: lead → developer → tester → scribe (each sees prior outputs)');

  const outputs: Partial<Record<Role, string>> = {};

  outputs.lead = await generateAgentOutput(client, 'lead', payload, severity, areas, riskFlags, actions, team, squadDir, outputs);
  console.log('\n  [Lead LLM Output]');
  console.log(`  ${outputs.lead.replace(/\n/g, '\n  ')}`);
  const leadAgent = team.find((m) => m.role === 'lead');
  if (leadAgent && outputs.lead) {
    appendToAgentHistory(squadDir, leadAgent.name, payload, 'lead', outputs.lead);
  }

  outputs.developer = await generateAgentOutput(client, 'developer', payload, severity, areas, riskFlags, actions, team, squadDir, outputs);
  console.log('\n  [Developer LLM Output]');
  console.log(`  ${outputs.developer.replace(/\n/g, '\n  ')}`);
  const devAgent = team.find((m) => m.role === 'developer');
  if (devAgent && outputs.developer) {
    appendToAgentHistory(squadDir, devAgent.name, payload, 'developer', outputs.developer);
  }

  outputs.tester = await generateAgentOutput(client, 'tester', payload, severity, areas, riskFlags, actions, team, squadDir, outputs);
  console.log('\n  [Tester LLM Output]');
  console.log(`  ${outputs.tester.replace(/\n/g, '\n  ')}`);
  const testerAgent = team.find((m) => m.role === 'tester');
  if (testerAgent && outputs.tester) {
    appendToAgentHistory(squadDir, testerAgent.name, payload, 'tester', outputs.tester);
  }

  outputs.scribe = await generateAgentOutput(client, 'scribe', payload, severity, areas, riskFlags, actions, team, squadDir, outputs);
  console.log('\n  [Scribe LLM Output]');
  console.log(`  ${outputs.scribe.replace(/\n/g, '\n  ')}`);
  const scribeAgent = team.find((m) => m.role === 'scribe');
  if (scribeAgent && outputs.scribe) {
    appendToAgentHistory(squadDir, scribeAgent.name, payload, 'scribe', outputs.scribe);
  }

  return {
    generatedAt: new Date().toISOString(),
    intake: payload,
    severity,
    areas,
    riskFlags,
    suggestedOwnerRole: ownerRole,
    nextActions: actions,
    agentOutputs: {
      lead: outputs.lead,
      developer: outputs.developer,
      tester: outputs.tester,
      scribe: outputs.scribe,
    },
    llm: {
      provider: 'github-copilot',
    },
  };
}

function toMarkdown(report: TriageReport): string {
  const lines: string[] = [];
  lines.push(`# Triage Report: ${report.intake.kind.toUpperCase()} #${report.intake.id}`);
  lines.push('');
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(`- Repo: ${report.intake.repo}`);
  lines.push(`- Title: ${report.intake.title}`);
  lines.push(`- Author: ${report.intake.author}`);
  lines.push(`- Severity: ${report.severity}`);
  lines.push(`- Suggested owner role: ${report.suggestedOwnerRole}`);
  lines.push(`- LLM provider: ${report.llm.provider}`);
  lines.push('');
  lines.push('## Risk flags');
  if (report.riskFlags.length === 0) {
    lines.push('- None detected');
  } else {
    for (const risk of report.riskFlags) {
      lines.push(`- ${risk}`);
    }
  }
  lines.push('');
  lines.push('## Next actions');
  for (const action of report.nextActions) {
    lines.push(`- ${action}`);
  }
  lines.push('');
  lines.push('## Agent outputs');
  lines.push(`- Lead: ${report.agentOutputs.lead}`);
  lines.push(`- Developer: ${report.agentOutputs.developer}`);
  lines.push(`- Tester: ${report.agentOutputs.tester}`);
  lines.push(`- Scribe: ${report.agentOutputs.scribe}`);
  lines.push('');
  return lines.join('\n');
}

async function main(): Promise<void> {
  console.log('🎬 pr-triage-system — Engineering Intake + PR Triage\n');

  const here = dirname(fileURLToPath(import.meta.url));
  loadDotEnv(here);

  if (!process.env.GITHUB_TOKEN) {
    console.error('\n❌ Missing GITHUB_TOKEN environment variable.\n');
    console.error('Setup:');
    console.error('  1. Generate a token at https://github.com/settings/tokens');
    console.error('  2. Ensure your account has GitHub Copilot enabled');
    console.error('  3. Set GITHUB_TOKEN in .env or your shell environment\n');
    process.exit(1);
  }

  hr('Step 1 — Resolve .squad/ directory');

  const demoRoot = join(here, '.demo-data');
  const squadDir = join(demoRoot, '.squad');

  if (!existsSync(squadDir)) {
    mkdirSync(squadDir, { recursive: true });
    console.log(`✅ Created demo .squad/ at: ${squadDir}`);
  } else {
    console.log(`✅ .squad/ already exists at: ${squadDir}`);
  }

  const resolved = resolveSquad(demoRoot);
  console.log(`   resolveSquad() → ${resolved ?? '(not found)'}`);

  hr('Step 2 — Load intake payload');

  const inputPath = parseInputArg();
  const payload = loadPayload(inputPath, here);
  console.log(`  Intake type: ${payload.kind}`);
  console.log(`  Ticket: ${payload.repo}#${payload.id}`);
  console.log(`  Title: ${payload.title}`);
  console.log(`  Labels: ${payload.labels.join(', ') || '(none)'}`);

  hr('Step 3 — Cast triage team');

  const engine = new CastingEngine();
  const requiredRoles: Role[] = ['lead', 'developer', 'tester', 'scribe'];

  const team: CastMember[] = engine.castTeam({
    universe: 'usual-suspects',
    teamSize: requiredRoles.length,
    requiredRoles: [...requiredRoles],
  });

  console.log('\n  Universe: The Usual Suspects');
  console.log(`  Team size: ${team.length}\n`);

  for (const member of team) {
    console.log(`  🎭 ${member.displayName}`);
    console.log(`     Personality: ${member.personality}`);
    console.log(`     Backstory:   ${member.backstory}\n`);
  }

  hr('Step 4 — Onboard agents');

  for (const member of team) {
    const agentDir = join(squadDir, 'agents', member.name.toLowerCase());
    if (existsSync(agentDir)) {
      console.log(`  ⏭  ${member.name} already onboarded — skipping`);
      continue;
    }

    const result = await onboardAgent({
      teamRoot: demoRoot,
      agentName: member.name.toLowerCase(),
      role: member.role,
      displayName: member.displayName,
      projectContext: 'PR Triage System showcasing Squad SDK casting, onboarding, and persistent identities.',
      userName: 'DemoUser',
    });

    console.log(`  ✅ ${member.displayName}`);
    console.log(`     Dir:     ${result.agentDir}`);
    console.log(`     Charter: ${result.charterPath}`);
    console.log(`     History: ${result.historyPath}`);
  }

  hr('Step 5 — Team roster');

  console.log('\n  ┌─────────────┬──────────────────┬──────────────────────────────────────────┐');
  console.log('  │ Name        │ Role             │ Personality                              │');
  console.log('  ├─────────────┼──────────────────┼──────────────────────────────────────────┤');

  for (const member of team) {
    const name = member.name.padEnd(11);
    const role = member.role.padEnd(16);
    const personality = member.personality.slice(0, 40).padEnd(40);
    console.log(`  │ ${name} │ ${role} │ ${personality} │`);
  }

  console.log('  └─────────────┴──────────────────┴──────────────────────────────────────────┘');

  hr('Step 6 — Connect to GitHub Copilot');

  const client = new SquadClient({ githubToken: process.env.GITHUB_TOKEN });

  try {
    await client.connect();
    console.log('  ✅ Connected to Copilot');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n❌ Connection failed: ${msg}\n`);
    console.error('Verify your GITHUB_TOKEN is valid and has Copilot access.\n');
    process.exit(1);
  }

  hr('Step 7 — Run triage + emit report');

  let report: TriageReport;
  try {
    report = await buildReport(client, payload, team, squadDir);
  } finally {
    const closable = client as unknown as { disconnect?: () => Promise<void> | void };
    if (typeof closable.disconnect === 'function') {
      await closable.disconnect();
    }
  }

  const reportsDir = join(demoRoot, 'reports');
  mkdirSync(reportsDir, { recursive: true });

  const baseName = `${payload.kind}-${payload.id}`;
  const jsonPath = join(reportsDir, `${baseName}.json`);
  const mdPath = join(reportsDir, `${baseName}.md`);

  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  writeFileSync(mdPath, toMarkdown(report), 'utf8');

  console.log(`  Severity: ${report.severity}`);
  console.log(`  Suggested owner role: ${report.suggestedOwnerRole}`);
  console.log(`  Risk flags: ${report.riskFlags.length}`);
  console.log(`  JSON report: ${jsonPath}`);
  console.log(`  Markdown report: ${mdPath}`);

  hr('Step 8 — Casting history (persistent names)');

  const history = new CastingHistory();
  const config = {
    universe: 'usual-suspects' as const,
    teamSize: 4,
    requiredRoles: [...requiredRoles],
  };

  history.recordCast(team, config);

  const team2 = engine.castTeam(config);
  history.recordCast(team2, config);

  console.log(`\n  Casting records: ${history.size}`);
  console.log('  Cast #1 names:', team.map((member) => member.name).join(', '));
  console.log('  Cast #2 names:', team2.map((member: CastMember) => member.name).join(', '));

  const match = team.every((member, index) => member.name === team2[index].name);
  console.log(`  Names match across casts: ${match ? '✅ Yes' : '❌ No'}`);

  const serialized = history.serializeHistory();
  console.log(`  Serialized history version: ${serialized.version}`);
  console.log(`  Records in history: ${serialized.records.length}`);

  const keyserHistory = history.getAgentHistory('Keyser');
  console.log(`  Keyser appeared in ${keyserHistory.length} cast(s)`);

  hr('Done! 🎉');
}

main().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
