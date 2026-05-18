/**
 * core.ts — Shared triage pipeline used by both CLI (index.ts) and web server (server.ts).
 *
 * Exposes `runTriage` with an event-emitter style callback so consumers can stream
 * progress (agent thinking → reading prior context → output ready → history persisted).
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CastingEngine,
  onboardAgent,
} from '@bradygaster/squad-sdk';
import type { CastMember } from '@bradygaster/squad-sdk';
import { SquadClient } from '@bradygaster/squad-sdk/client';

export type IntakeKind = 'issue' | 'pr';
export type Role = 'lead' | 'developer' | 'tester' | 'scribe';
export type Severity = 'low' | 'medium' | 'high';

export interface IntakePayload {
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

export interface TriageReport {
  generatedAt: string;
  intake: IntakePayload;
  severity: Severity;
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
  llm: { provider: 'github-copilot' };
}

export interface TriageEvents {
  onStage?: (stage: string, detail?: Record<string, unknown>) => void;
  onTeamCast?: (team: CastMember[]) => void;
  onHeuristics?: (data: { severity: Severity; areas: string[]; riskFlags: string[]; nextActions: string[]; suggestedOwnerRole: 'developer' | 'tester' | 'lead' }) => void;
  onAgentStart?: (role: Role, agent: CastMember, context: { charter: string; priorRoles: Role[]; historyEntries: number }) => void;
  onAgentToken?: (role: Role, chunk: string) => void;
  onAgentComplete?: (role: Role, output: string) => void;
  onHistoryWritten?: (role: Role, agentName: string, skipped: boolean) => void;
  onReportSaved?: (paths: { json: string; md: string }) => void;
}

export function classifySeverity(payload: IntakePayload): Severity {
  const text = `${payload.title} ${payload.description}`.toLowerCase();
  const labels = payload.labels.map((l) => l.toLowerCase());
  if (
    payload.ciStatus === 'failing' ||
    labels.includes('security') ||
    text.includes('outage') ||
    text.includes('data loss')
  ) return 'high';
  if (
    labels.includes('bug') ||
    labels.includes('incident') ||
    text.includes('flaky') ||
    text.includes('regression')
  ) return 'medium';
  return 'low';
}

export function detectAreas(payload: IntakePayload): string[] {
  const files = payload.changedFiles ?? [];
  const areas = new Set<string>();
  for (const file of files) {
    if (file.includes('/cli/')) areas.add('cli');
    if (file.includes('/sdk/')) areas.add('sdk');
    if (file.includes('backend') || file.includes('/api/')) areas.add('backend');
    if (file.includes('frontend') || file.includes('dashboard') || file.endsWith('.tsx')) areas.add('frontend');
    if (file.endsWith('.py')) areas.add('python');
    if (file.includes('test') || file.includes('__tests__')) areas.add('tests');
    if (file.endsWith('.md')) areas.add('docs');
  }
  if (areas.size === 0) areas.add(payload.kind === 'issue' ? 'intake' : 'unknown');
  return Array.from(areas);
}

export function computeRiskFlags(payload: IntakePayload, severity: Severity): string[] {
  const flags: string[] = [];
  if (severity === 'high') flags.push('High severity signal from CI/labels/content');
  if ((payload.changedFiles?.length ?? 0) > 10) flags.push('Large change set; review scope risk');
  if (payload.ciStatus === 'failing') flags.push('CI failing; merge should be blocked');
  if (payload.kind === 'pr' && (payload.changedFiles?.length ?? 0) === 0) flags.push('PR missing changed file metadata');
  return flags;
}

export function suggestedOwnerRole(severity: Severity, areas: string[]): 'developer' | 'tester' | 'lead' {
  if (severity === 'high') return 'lead';
  if (areas.includes('tests')) return 'tester';
  return 'developer';
}

export function nextActions(payload: IntakePayload, severity: Severity, areas: string[]): string[] {
  const actions: string[] = [];
  actions.push('Confirm reproduction details and expected behavior in issue/PR thread.');
  actions.push('Assign primary owner and reviewer pair.');
  if (payload.ciStatus === 'failing') actions.push('Stabilize CI before merge; capture failing test evidence.');
  if (areas.includes('cli')) actions.push('Run CLI smoke tests and command routing regression checks.');
  if (areas.includes('tests')) actions.push('Audit flaky tests for timing and environment coupling.');
  if (areas.includes('frontend')) actions.push('Validate UI in target browsers; check SSR/CSR hydration paths.');
  if (areas.includes('backend')) actions.push('Load-test the affected endpoints in staging.');
  if (areas.includes('python')) actions.push('Run pytest with -x and capture warnings as errors.');
  if (severity === 'high') actions.push('Escalate to on-call lead and require explicit human approval gate.');
  return actions;
}

function buildFallbackOutput(role: Role, payload: IntakePayload, severity: Severity, areas: string[]): string {
  if (role === 'lead') return `Prioritize ${payload.kind.toUpperCase()} #${payload.id} as ${severity.toUpperCase()} and enforce approval before merge.`;
  if (role === 'developer') return `Assess impacted areas: ${areas.join(', ')}. Draft minimal safe fix and rollback plan.`;
  if (role === 'tester') return 'Design focused regression checks for affected modules and verify CI stability.';
  return 'Publish triage summary, risks, and action checklist to the team thread.';
}

function truncateForPrompt(text: string, maxChars = 1800): string {
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}...`;
}

function roleInstructions(role: Role): string {
  if (role === 'lead') return 'Classify severity, choose owner role, and list approval/escalation guidance in 4 concise bullets.';
  if (role === 'developer') return "Using the Lead's severity and ownership framing, identify likely root cause areas, a safe fix strategy, and rollback plan in 4 concise bullets.";
  if (role === 'tester') return "Based on the Developer's proposed fix strategy, propose focused regression tests, CI checks, and exit criteria in 4 concise bullets. Reference specific risks the Developer raised.";
  return 'Synthesize the Lead, Developer, and Tester outputs into a concise PR-comment-ready triage summary in 4 concise bullets. Highlight blockers, owner, fix approach, and verification plan.';
}

export function readAgentCharter(squadDir: string, agentName: string): string {
  const charterPath = join(squadDir, 'agents', agentName.toLowerCase(), 'charter.md');
  if (!existsSync(charterPath)) return 'No charter found.';
  return truncateForPrompt(readFileSync(charterPath, 'utf8'));
}

export function readAgentHistory(squadDir: string, agentName: string): string {
  const historyPath = join(squadDir, 'agents', agentName.toLowerCase(), 'history.md');
  if (!existsSync(historyPath)) return '';
  return readFileSync(historyPath, 'utf8');
}

function countHistoryEntries(squadDir: string, agentName: string): number {
  const content = readAgentHistory(squadDir, agentName);
  const matches = content.match(/^##\s+/gm);
  return matches ? matches.length : 0;
}

export function appendToAgentHistory(
  squadDir: string,
  agentName: string,
  intake: IntakePayload,
  role: Role,
  output: string,
): { skipped: boolean } {
  const historyPath = join(squadDir, 'agents', agentName.toLowerCase(), 'history.md');
  if (!existsSync(historyPath)) return { skipped: true };
  const intakeMarker = `${intake.kind.toUpperCase()} #${intake.id} — ${role} output`;
  const existing = readFileSync(historyPath, 'utf8');
  if (existing.includes(intakeMarker)) return { skipped: true };
  const timestamp = new Date().toISOString();
  const entry = `\n## ${intakeMarker} — ${timestamp}\n\n${output}\n`;
  writeFileSync(historyPath, existing + entry, 'utf8');
  return { skipped: false };
}

async function callCopilot(client: SquadClient, systemPrompt: string, userPrompt: string): Promise<string> {
  const session = await client.createSession({
    systemMessage: { mode: 'append', content: systemPrompt },
    onPermissionRequest: () => ({ kind: 'approved' }),
  });
  const anySession = session as unknown as {
    sendAndWait?: (msg: { prompt: string }, timeoutMs?: number) => Promise<unknown>;
    close?: () => Promise<void> | void;
  };
  try {
    if (!anySession.sendAndWait) throw new Error('Session does not support sendAndWait');
    const result = await anySession.sendAndWait({ prompt: userPrompt }, 120_000);
    const data = (result as Record<string, unknown> | undefined)?.['data'] as Record<string, unknown> | undefined;
    const content =
      (typeof data?.['content'] === 'string' ? (data['content'] as string) : '') ||
      (typeof result === 'string' ? result : '');
    const trimmed = content.trim();
    if (!trimmed) throw new Error('Copilot returned an empty response');
    return trimmed;
  } finally {
    if (typeof anySession.close === 'function') await anySession.close();
  }
}

async function generateAgentOutput(
  client: SquadClient,
  role: Role,
  payload: IntakePayload,
  severity: Severity,
  areas: string[],
  riskFlags: string[],
  actions: string[],
  team: CastMember[],
  squadDir: string,
  priorOutputs: Partial<Record<Role, string>>,
): Promise<string> {
  const agent = team.find((m) => m.role === role);
  const displayName = agent?.displayName ?? role;
  const charter = agent ? readAgentCharter(squadDir, agent.name) : 'No charter found.';

  const systemPrompt = [
    `You are ${displayName} with role ${role} in an engineering intake and PR triage workflow.`,
    'Keep output concise, actionable, and focused on software delivery risk management.',
    "Build on the prior teammates' outputs when provided. Do not contradict them without justification.",
    'Do not include markdown headings.',
  ].join(' ');

  const priorLines: string[] = [];
  const priorOrder: Role[] = ['lead', 'developer', 'tester', 'scribe'];
  for (const priorRole of priorOrder) {
    if (priorRole === role) break;
    const text = priorOutputs[priorRole];
    if (text) priorLines.push(`--- ${priorRole.toUpperCase()} output ---\n${truncateForPrompt(text, 1200)}`);
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

export async function castAndOnboard(
  demoRoot: string,
  squadDir: string,
  events?: TriageEvents,
): Promise<CastMember[]> {
  const engine = new CastingEngine();
  const requiredRoles: Role[] = ['lead', 'developer', 'tester', 'scribe'];
  const team = engine.castTeam({
    universe: 'usual-suspects',
    teamSize: requiredRoles.length,
    requiredRoles: [...requiredRoles],
  });
  events?.onTeamCast?.(team);

  for (const member of team) {
    const agentDir = join(squadDir, 'agents', member.name.toLowerCase());
    if (existsSync(agentDir)) continue;
    await onboardAgent({
      teamRoot: demoRoot,
      agentName: member.name.toLowerCase(),
      role: member.role,
      displayName: member.displayName,
      projectContext: 'PR Triage System showcasing Squad SDK casting, onboarding, and persistent identities.',
      userName: 'DemoUser',
    });
  }

  return team;
}

export async function runTriage(
  client: SquadClient,
  payload: IntakePayload,
  team: CastMember[],
  squadDir: string,
  events?: TriageEvents,
): Promise<TriageReport> {
  const severity = classifySeverity(payload);
  const areas = detectAreas(payload);
  const riskFlags = computeRiskFlags(payload, severity);
  const ownerRole = suggestedOwnerRole(severity, areas);
  const actions = nextActions(payload, severity, areas);

  events?.onHeuristics?.({ severity, areas, riskFlags, nextActions: actions, suggestedOwnerRole: ownerRole });

  const outputs: Partial<Record<Role, string>> = {};
  const order: Role[] = ['lead', 'developer', 'tester', 'scribe'];

  for (const role of order) {
    const agent = team.find((m) => m.role === role)!;
    const priorRoles = order.slice(0, order.indexOf(role)).filter((r) => outputs[r]);
    const historyEntries = countHistoryEntries(squadDir, agent.name);
    const charter = readAgentCharter(squadDir, agent.name);
    events?.onAgentStart?.(role, agent, { charter, priorRoles, historyEntries });

    const output = await generateAgentOutput(client, role, payload, severity, areas, riskFlags, actions, team, squadDir, outputs);
    outputs[role] = output;
    events?.onAgentComplete?.(role, output);

    const { skipped } = appendToAgentHistory(squadDir, agent.name, payload, role, output);
    events?.onHistoryWritten?.(role, agent.name, skipped);
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
      lead: outputs.lead!,
      developer: outputs.developer!,
      tester: outputs.tester!,
      scribe: outputs.scribe!,
    },
    llm: { provider: 'github-copilot' },
  };
}

export function toMarkdown(report: TriageReport): string {
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
  if (report.riskFlags.length === 0) lines.push('- None detected');
  else for (const risk of report.riskFlags) lines.push(`- ${risk}`);
  lines.push('');
  lines.push('## Next actions');
  for (const action of report.nextActions) lines.push(`- ${action}`);
  lines.push('');
  lines.push('## Agent outputs');
  lines.push(`- Lead: ${report.agentOutputs.lead}`);
  lines.push(`- Developer: ${report.agentOutputs.developer}`);
  lines.push(`- Tester: ${report.agentOutputs.tester}`);
  lines.push(`- Scribe: ${report.agentOutputs.scribe}`);
  lines.push('');
  return lines.join('\n');
}

export function loadDotEnv(sampleRoot: string): void {
  const envPath = join(sampleRoot, '.env');
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!key || process.env[key] !== undefined) continue;
    process.env[key] = value;
  }
}
