/**
 * core.ts — Shared squad pipeline for camp-marketplace-squad.
 *
 * Used by both:
 *   • index.ts    (CLI mode, prints to terminal)
 *   • dashboard.ts (web server, streams events via SSE)
 *
 * Roles map onto SDK roles:
 *   lead       → Product Manager
 *   developer  → Builder
 *   tester     → QA Lead
 *   scribe     → Launch Lead
 */

import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CastingEngine, onboardAgent } from '@bradygaster/squad-sdk';
import type { CastMember } from '@bradygaster/squad-sdk';
import { SquadClient } from '@bradygaster/squad-sdk/client';
import { buildAppHtml, CAMPS } from './app-template.js';

export type Role = 'lead' | 'developer' | 'tester' | 'scribe';

export const ROLE_DISPLAY: Record<Role, string> = {
  lead: 'Product Manager',
  developer: 'Builder',
  tester: 'QA Lead',
  scribe: 'Launch Lead',
};

export interface ProductBrief {
  productName: string;
  audience: string;
  problem: string;
  mustHaves: string[];
}

export const PRODUCT_BRIEF: ProductBrief = {
  productName: 'SunnyDays — Kids Summer Camps Marketplace',
  audience: 'Parents of children ages 5–13 shopping for summer camp programs.',
  problem:
    'Parents struggle to compare, select, and book multiple summer camps across categories (sports, STEM, arts, outdoors). They want a single cart-and-checkout experience.',
  mustHaves: [
    'Browse camps as cards (photo/emoji, age range, dates, price, description, category)',
    'Filter by category',
    'Add to cart with quantity controls and remove',
    'Cart subtotal and total',
    'Checkout form (parent name, email, mock card) producing an order ID',
    'In-memory storage (no backend persistence in v1)',
  ],
};

export interface BuildEvents {
  onTeamCast?: (team: CastMember[]) => void;
  onConnected?: () => void;
  onAgentStart?: (role: Role, agent: CastMember, context: { priorRoles: Role[]; historyEntries: number; charter: string }) => void;
  onAgentComplete?: (role: Role, output: string) => void;
  onHistoryWritten?: (role: Role, agentName: string, skipped: boolean) => void;
  onAppShipped?: (paths: { app: string; brief: string }) => void;
}

export interface BuildResult {
  team: CastMember[];
  outputs: Record<Role, string>;
  paths: { app: string; brief: string };
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

function truncate(text: string, max = 1500): string {
  return text.length <= max ? text : `${text.slice(0, max)}...`;
}

export function readAgentCharter(squadDir: string, agentName: string): string {
  const p = join(squadDir, 'agents', agentName.toLowerCase(), 'charter.md');
  return existsSync(p) ? truncate(readFileSync(p, 'utf8')) : 'No charter found.';
}

export function readAgentHistory(squadDir: string, agentName: string): string {
  const p = join(squadDir, 'agents', agentName.toLowerCase(), 'history.md');
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
}

function countHistoryEntries(squadDir: string, agentName: string): number {
  const content = readAgentHistory(squadDir, agentName);
  const matches = content.match(/^##\s+/gm);
  return matches ? matches.length : 0;
}

function appendAgentHistory(squadDir: string, agentName: string, productName: string, role: Role, output: string): boolean {
  const p = join(squadDir, 'agents', agentName.toLowerCase(), 'history.md');
  if (!existsSync(p)) return true; // treated as skipped
  const marker = `${productName} — ${role} output`;
  const existing = readFileSync(p, 'utf8');
  if (existing.includes(marker)) return true;
  const entry = `\n## ${marker} — ${new Date().toISOString()}\n\n${output}\n`;
  writeFileSync(p, existing + entry, 'utf8');
  return false;
}

function roleInstruction(role: Role): string {
  if (role === 'lead') return 'Write a crisp product brief in 6 bullets: (1) one-line vision, (2) top 3 user stories, (3) primary success metric, (4) MVP scope guardrails, (5) explicit non-goals for v1, (6) launch readiness signal.';
  if (role === 'developer') return "Building on the Product Manager's brief, define the v1 implementation plan in 6 bullets: (1) chosen stack (HTML/CSS/JS, no framework, in-memory state), (2) component breakdown, (3) data model for camps and cart, (4) routing/state strategy, (5) accessibility considerations, (6) the single deliverable file path (./output/index.html). Be concrete and concise.";
  if (role === 'tester') return "Building on the Builder's plan, produce 6 bullets covering acceptance criteria and risks: (1) browse view AC, (2) cart AC (add/remove/qty), (3) checkout AC, (4) edge cases (empty cart, duplicate add, large qty), (5) accessibility/keyboard checks, (6) data-loss-on-reload note (in-memory tradeoff).";
  return 'Synthesize the team into a launch-ready summary in 6 bullets: (1) what shipped, (2) how to run it (npm run serve → URL), (3) known limitations, (4) recommended next iteration, (5) demo script (3 steps a stakeholder follows), (6) credit the team by role.';
}

function fallbackOutput(role: Role): string {
  if (role === 'lead') return `Ship SunnyDays v1 as a single-page marketplace for ${CAMPS.length} camps with browse, cart, and mock checkout. Success metric: completed mock checkouts per session.`;
  if (role === 'developer') return 'Vanilla HTML/CSS/JS, single index.html, in-memory cart state, category filter, accessible buttons. Deliverable: ./output/index.html.';
  if (role === 'tester') return 'Acceptance: cards render, filter narrows list, add/remove updates badge, checkout requires fields and produces order ID. Risk: cart lost on reload.';
  return 'Run `npm run serve`. Browse → add 2 camps → checkout. Limitation: no persistence. Next: backend + payments.';
}

async function callCopilot(client: SquadClient, system: string, user: string): Promise<string> {
  const session = await client.createSession({
    systemMessage: { mode: 'append', content: system },
    onPermissionRequest: () => ({ kind: 'approved' }),
  });
  const any = session as unknown as {
    sendAndWait?: (m: { prompt: string }, t?: number) => Promise<unknown>;
    close?: () => Promise<void> | void;
  };
  try {
    if (!any.sendAndWait) throw new Error('Session does not support sendAndWait');
    const result = await any.sendAndWait({ prompt: user }, 120_000);
    const data = (result as Record<string, unknown> | undefined)?.['data'] as Record<string, unknown> | undefined;
    const content =
      (typeof data?.['content'] === 'string' ? (data['content'] as string) : '') ||
      (typeof result === 'string' ? result : '');
    const trimmed = content.trim();
    if (!trimmed) throw new Error('Copilot returned an empty response');
    return trimmed;
  } finally {
    if (typeof any.close === 'function') await any.close();
  }
}

async function generateAgentOutput(
  client: SquadClient,
  role: Role,
  team: CastMember[],
  squadDir: string,
  prior: Partial<Record<Role, string>>,
): Promise<string> {
  const agent = team.find((m) => m.role === role)!;
  const charter = readAgentCharter(squadDir, agent.name);

  const system = [
    `You are ${agent.displayName}, playing the role of ${ROLE_DISPLAY[role]} on a small product team.`,
    'Keep output tight: bullets only, no headings, no preamble.',
    "Build on prior teammates' outputs. Reference their concrete decisions.",
  ].join(' ');

  const priorBlocks: string[] = [];
  const order: Role[] = ['lead', 'developer', 'tester', 'scribe'];
  for (const r of order) {
    if (r === role) break;
    if (prior[r]) priorBlocks.push(`--- ${ROLE_DISPLAY[r]} output ---\n${truncate(prior[r] as string, 900)}`);
  }

  const user = [
    `Product: ${PRODUCT_BRIEF.productName}`,
    `Audience: ${PRODUCT_BRIEF.audience}`,
    `Problem: ${PRODUCT_BRIEF.problem}`,
    `Must-haves: ${PRODUCT_BRIEF.mustHaves.join(' | ')}`,
    `Camp count seeded: ${CAMPS.length}`,
    `Agent charter excerpt: ${charter}`,
    priorBlocks.length ? `Prior teammate outputs:\n${priorBlocks.join('\n\n')}` : 'You are first; no prior outputs.',
    `Task: ${roleInstruction(role)}`,
  ].join('\n');

  try {
    return await callCopilot(client, system, user);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return `${fallbackOutput(role)} [fallback used: ${reason}]`;
  }
}

export async function castAndOnboard(demoRoot: string, squadDir: string): Promise<CastMember[]> {
  const engine = new CastingEngine();
  const requiredRoles: Role[] = ['lead', 'developer', 'tester', 'scribe'];
  const team = engine.castTeam({
    universe: 'usual-suspects',
    teamSize: requiredRoles.length,
    requiredRoles: [...requiredRoles],
  });
  for (const m of team) {
    const dir = join(squadDir, 'agents', m.name.toLowerCase());
    if (existsSync(dir)) continue;
    await onboardAgent({
      teamRoot: demoRoot,
      agentName: m.name.toLowerCase(),
      role: m.role,
      displayName: m.displayName,
      projectContext: 'SunnyDays — a kids summer camp marketplace with browse, cart, and mock checkout.',
      userName: 'DemoUser',
    });
  }
  return team;
}

export async function runBuild(
  client: SquadClient,
  team: CastMember[],
  squadDir: string,
  outputDir: string,
  events?: BuildEvents,
): Promise<BuildResult> {
  const outputs: Partial<Record<Role, string>> = {};
  const order: Role[] = ['lead', 'developer', 'tester', 'scribe'];

  for (const role of order) {
    const agent = team.find((m) => m.role === role)!;
    const priorRoles = order.slice(0, order.indexOf(role)).filter((r) => outputs[r]);
    const historyEntries = countHistoryEntries(squadDir, agent.name);
    const charter = readAgentCharter(squadDir, agent.name);
    events?.onAgentStart?.(role, agent, { priorRoles, historyEntries, charter });

    const out = await generateAgentOutput(client, role, team, squadDir, outputs);
    outputs[role] = out;
    events?.onAgentComplete?.(role, out);

    const skipped = appendAgentHistory(squadDir, agent.name, PRODUCT_BRIEF.productName, role, out);
    events?.onHistoryWritten?.(role, agent.name, skipped);
  }

  // Builder ships the actual app
  mkdirSync(outputDir, { recursive: true });
  const appPath = join(outputDir, 'index.html');
  writeFileSync(appPath, buildAppHtml(), 'utf8');

  const briefPath = join(outputDir, 'team-brief.md');
  const lines: string[] = [];
  lines.push(`# ${PRODUCT_BRIEF.productName} — Team Delivery`);
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  for (const role of order) {
    const agent = team.find((m) => m.role === role)!;
    lines.push(`## ${ROLE_DISPLAY[role]} — ${agent.displayName}`);
    lines.push('');
    lines.push(outputs[role] ?? '(no output)');
    lines.push('');
  }
  writeFileSync(briefPath, lines.join('\n'), 'utf8');

  const paths = { app: appPath, brief: briefPath };
  events?.onAppShipped?.(paths);

  return {
    team,
    outputs: {
      lead: outputs.lead!,
      developer: outputs.developer!,
      tester: outputs.tester!,
      scribe: outputs.scribe!,
    },
    paths,
  };
}
