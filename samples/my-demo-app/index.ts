/**
 * my-demo-app — Engineering Intake + PR Triage assistant
 *
 * Demonstrates:
 *  1. Resolve local workspace state under .demo-data/.squad
 *  2. Cast a deterministic triage team
 *  3. Onboard agents for persistent team continuity
 *  4. Run lightweight engineering triage heuristics on issue/PR input
 *  5. Emit JSON + Markdown triage reports for human review
 */

import { execSync } from 'node:child_process';
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

type IntakeKind = 'issue' | 'pr';

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
    provider: 'openai' | 'azure-openai' | 'ollama' | 'fallback';
    model: string;
  };
}

interface LlmSettings {
  provider: 'openai' | 'azure-openai' | 'ollama' | 'fallback';
  model: string;
  baseUrl: string;
  apiKey?: string;
  apiVersion?: string;
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

function getLlmSettings(): LlmSettings {
  const providerEnv = (process.env.LLM_PROVIDER ?? '').toLowerCase();
  const openAiKey = process.env.OPENAI_API_KEY;
  const azureOpenAiKey = process.env.AZURE_OPENAI_API_KEY ?? openAiKey;
  const azureBaseUrl = process.env.AZURE_OPENAI_ENDPOINT ?? process.env.OPENAI_BASE_URL;
  const azureDeployment = process.env.AZURE_OPENAI_DEPLOYMENT;

  if (providerEnv === 'azure-openai') {
    return {
      provider: 'azure-openai',
      model: azureDeployment ?? process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
      baseUrl: azureBaseUrl ?? '',
      apiKey: azureOpenAiKey,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION ?? '2024-10-21',
    };
  }

  if (providerEnv === 'openai' || (!providerEnv && openAiKey)) {
    return {
      provider: 'openai',
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
      baseUrl: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
      apiKey: openAiKey,
    };
  }

  if (providerEnv === 'fallback') {
    return {
      provider: 'fallback',
      model: 'heuristic-fallback',
      baseUrl: '',
    };
  }

  return {
    provider: 'ollama',
    model: process.env.OLLAMA_MODEL ?? 'llama3.1',
    baseUrl: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
  };
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
  role: 'lead' | 'developer' | 'tester' | 'scribe',
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

function getAzureOpenAiBearerToken(): string {
  const envToken = process.env.AZURE_OPENAI_BEARER_TOKEN?.trim();
  if (envToken && !envToken.startsWith('your_')) {
    return envToken;
  }

  const useAzCli = (process.env.AZURE_OPENAI_USE_AZ_CLI ?? 'true').toLowerCase();
  if (useAzCli === 'false') {
    throw new Error('AZURE_OPENAI_BEARER_TOKEN is not set and AZURE_OPENAI_USE_AZ_CLI=false');
  }

  try {
    const raw = execSync(
      'az account get-access-token --resource https://cognitiveservices.azure.com/ --output json',
      { encoding: 'utf8' },
    );
    const parsed = JSON.parse(raw) as { accessToken?: string };
    const token = parsed.accessToken?.trim();
    if (!token) {
      throw new Error('Azure CLI returned an empty access token');
    }
    return token;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Unable to obtain Azure bearer token. Run 'az login' and ensure access to the Azure OpenAI resource, or set AZURE_OPENAI_BEARER_TOKEN. Details: ${reason}`,
    );
  }
}

async function callLlm(settings: LlmSettings, systemPrompt: string, userPrompt: string): Promise<string> {
  if (settings.provider === 'fallback') {
    throw new Error('LLM provider set to fallback mode');
  }

  if (settings.provider === 'azure-openai') {
    if (!settings.baseUrl) {
      throw new Error('AZURE_OPENAI_ENDPOINT (or OPENAI_BASE_URL) is not set');
    }
    if (!settings.model) {
      throw new Error('AZURE_OPENAI_DEPLOYMENT is not set');
    }

    const authMode = (process.env.AZURE_OPENAI_AUTH_MODE ?? 'entra').toLowerCase();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (authMode === 'key') {
      if (!settings.apiKey || settings.apiKey.startsWith('your_')) {
        throw new Error('AZURE_OPENAI_API_KEY is not set for key auth mode');
      }
      headers['api-key'] = settings.apiKey;
    } else {
      headers.Authorization = `Bearer ${getAzureOpenAiBearerToken()}`;
    }

    const base = settings.baseUrl.replace(/\/$/, '');
    const apiVersion = settings.apiVersion ?? '2024-10-21';
    const url = `${base}/openai/deployments/${settings.model}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        temperature: 0.2,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Azure OpenAI API error ${response.status}: ${body}`);
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error('Azure OpenAI API returned an empty response');
    }
    return content;
  }

  if (settings.provider === 'openai') {
    if (!settings.apiKey) {
      throw new Error('OPENAI_API_KEY is not set');
    }

    const response = await fetch(`${settings.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${body}`);
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error('OpenAI API returned an empty response');
    }
    return content;
  }

  const response = await fetch(`${settings.baseUrl}/api/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: settings.model,
      stream: false,
      prompt: `${systemPrompt}\n\n${userPrompt}`,
      options: {
        temperature: 0.2,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Ollama API error ${response.status}: ${body}`);
  }

  const json = (await response.json()) as { response?: string };
  const content = json.response?.trim();
  if (!content) {
    throw new Error('Ollama returned an empty response');
  }
  return content;
}

function roleInstructions(role: 'lead' | 'developer' | 'tester' | 'scribe'): string {
  if (role === 'lead') {
    return 'Classify severity, choose owner role, and list approval/escalation guidance in 4 concise bullets.';
  }
  if (role === 'developer') {
    return 'Identify likely root cause areas, safe fix strategy, and rollback plan in 4 concise bullets.';
  }
  if (role === 'tester') {
    return 'Propose focused regression test plan and CI checks in 4 concise bullets.';
  }
  return 'Produce a concise triage summary suitable for PR comment with risks and next actions in 4 concise bullets.';
}

function readAgentCharter(squadDir: string, agentName: string): string {
  const charterPath = join(squadDir, 'agents', agentName.toLowerCase(), 'charter.md');
  if (!existsSync(charterPath)) {
    return 'No charter found.';
  }
  return truncateForPrompt(readFileSync(charterPath, 'utf8'));
}

async function generateAgentOutput(
  role: 'lead' | 'developer' | 'tester' | 'scribe',
  payload: IntakePayload,
  severity: 'low' | 'medium' | 'high',
  areas: string[],
  riskFlags: string[],
  actions: string[],
  team: CastMember[],
  squadDir: string,
  settings: LlmSettings,
): Promise<string> {
  const agent = team.find((member) => member.role === role);
  const displayName = agent?.displayName ?? role;
  const charter = agent ? readAgentCharter(squadDir, agent.name) : 'No charter found.';

  const systemPrompt = [
    `You are ${displayName} with role ${role} in an engineering intake and PR triage workflow.`,
    'Keep output concise, actionable, and focused on software delivery risk management.',
    'Do not include markdown headings.',
  ].join(' ');

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
    `Task: ${roleInstructions(role)}`,
  ].join('\n');

  try {
    const response = await callLlm(settings, systemPrompt, userPrompt);
    return response;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return `${buildFallbackOutput(role, payload, severity, areas)} [fallback used: ${reason}]`;
  }
}

async function buildReport(payload: IntakePayload, team: CastMember[], squadDir: string): Promise<TriageReport> {
  const settings = getLlmSettings();
  const severity = classifySeverity(payload);
  const areas = detectAreas(payload);
  const riskFlags = computeRiskFlags(payload, severity);
  const ownerRole = suggestedOwnerRole(severity, areas);
  const actions = nextActions(payload, severity, areas);

  console.log(`  LLM provider: ${settings.provider}`);
  console.log(`  LLM model: ${settings.model}`);

  const lead = await generateAgentOutput('lead', payload, severity, areas, riskFlags, actions, team, squadDir, settings);
  console.log('\n  [Lead LLM Output]');
  console.log(`  ${lead.replace(/\n/g, '\n  ')}`);

  const developer = await generateAgentOutput('developer', payload, severity, areas, riskFlags, actions, team, squadDir, settings);
  console.log('\n  [Developer LLM Output]');
  console.log(`  ${developer.replace(/\n/g, '\n  ')}`);

  const tester = await generateAgentOutput('tester', payload, severity, areas, riskFlags, actions, team, squadDir, settings);
  console.log('\n  [Tester LLM Output]');
  console.log(`  ${tester.replace(/\n/g, '\n  ')}`);

  const scribe = await generateAgentOutput('scribe', payload, severity, areas, riskFlags, actions, team, squadDir, settings);
  console.log('\n  [Scribe LLM Output]');
  console.log(`  ${scribe.replace(/\n/g, '\n  ')}`);

  return {
    generatedAt: new Date().toISOString(),
    intake: payload,
    severity,
    areas,
    riskFlags,
    suggestedOwnerRole: ownerRole,
    nextActions: actions,
    agentOutputs: {
      lead,
      developer,
      tester,
      scribe,
    },
    llm: {
      provider: settings.provider,
      model: settings.model,
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
  lines.push(`- LLM model: ${report.llm.model}`);
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
  console.log('🎬 my-demo-app — Engineering Intake + PR Triage\n');

  const here = dirname(fileURLToPath(import.meta.url));
  loadDotEnv(here);

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
  const requiredRoles = ['lead', 'developer', 'tester', 'scribe'] as const;

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
      projectContext: 'My demo app showcasing Squad SDK casting, onboarding, and persistent identities.',
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

  hr('Step 6 — Run triage + emit report');

  const report = await buildReport(payload, team, squadDir);
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

  hr('Step 7 — Casting history (persistent names)');

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
  console.log('  Cast #2 names:', team2.map((member) => member.name).join(', '));

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