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
import { appendToHistory } from '@bradygaster/squad-sdk/agents';
import { SquadClient } from '@bradygaster/squad-sdk/client';
import { buildAppHtml, CAMPS, DEFAULT_SPEC } from './app-template.js';
import type { BuildSpec } from './app-template.js';

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
  onSpecParsed?: (spec: BuildSpec, source: 'builder' | 'default', warnings: string[]) => void;
  onAppShipped?: (paths: { app: string; brief: string }) => void;
}

export interface BuildResult {
  team: CastMember[];
  outputs: Record<Role, string>;
  spec: BuildSpec;
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

/**
 * Append a per-turn entry to the agent's history.md using the SDK's
 * concurrency-safe appendToHistory(). Returns true when the entry was
 * skipped because a marker for this product+role was already present.
 */
async function appendAgentHistory(
  teamRoot: string,
  agentName: string,
  productName: string,
  role: Role,
  output: string,
): Promise<boolean> {
  const squadDir = join(teamRoot, '.squad');
  const marker = `${productName} — ${role} output`;
  const existing = readAgentHistory(squadDir, agentName);
  if (!existing) return true; // history shadow not yet created — treat as skipped
  if (existing.includes(marker)) return true;
  // Section: 'Learnings' — the SDK groups by date under this section.
  // Marker line lets us dedup on re-runs.
  const content = `**${marker}**\n\n${output}`;
  await appendToHistory(teamRoot, agentName.toLowerCase(), 'Learnings', content);
  return false;
}

function roleInstruction(role: Role): string {
  if (role === 'lead') return 'Write a crisp product brief in 6 bullets: (1) one-line vision, (2) top 3 user stories, (3) primary success metric, (4) MVP scope guardrails, (5) explicit non-goals for v1, (6) launch readiness signal.';
  if (role === 'developer') return "Building on the Product Manager's brief, define the v1 implementation plan. First, write 6 bullets covering: (1) chosen stack (HTML/CSS/JS, no framework, in-memory state), (2) component breakdown, (3) data model for camps and cart, (4) routing/state strategy, (5) accessibility considerations, (6) the single deliverable file path (./output/index.html). THEN, on a new line, emit a JSON code block (```json ... ```) with your chosen BuildSpec for the shipped HTML. Allowed keys (all optional): brandColor (hex), brandColorDark (hex, darker shade), heroTitle (string with optional emoji prefix), heroTagline (one short sentence), ctaLabel (button text, e.g. 'Add to cart' or 'Reserve spot'), featuredCategory (one of the category names that appears in the seeded camps, or 'All'). Pick values that match the audience and brief. The shipping pipeline will parse this JSON and use it verbatim.";
  if (role === 'tester') return "Building on the Builder's plan, produce 6 bullets covering acceptance criteria and risks: (1) browse view AC, (2) cart AC (add/remove/qty), (3) checkout AC, (4) edge cases (empty cart, duplicate add, large qty), (5) accessibility/keyboard checks, (6) data-loss-on-reload note (in-memory tradeoff).";
  return 'Synthesize the team into a launch-ready summary in 6 bullets: (1) what shipped, (2) how to run it (npm run serve → URL), (3) known limitations, (4) recommended next iteration, (5) demo script (3 steps a stakeholder follows), (6) credit the team by role.';
}

function fallbackOutput(role: Role): string {
  if (role === 'lead') return `Ship SunnyDays v1 as a single-page marketplace for ${CAMPS.length} camps with browse, cart, and mock checkout. Success metric: completed mock checkouts per session.`;
  if (role === 'developer') return 'Vanilla HTML/CSS/JS, single index.html, in-memory cart state, category filter, accessible buttons. Deliverable: ./output/index.html.\n\n```json\n{\n  "brandColor": "#ff7a45",\n  "brandColorDark": "#e85d2a",\n  "heroTitle": "☀️ SunnyDays Camps",\n  "ctaLabel": "Add to cart",\n  "featuredCategory": "All"\n}\n```';
  if (role === 'tester') return 'Acceptance: cards render, filter narrows list, add/remove updates badge, checkout requires fields and produces order ID. Risk: cart lost on reload.';
  return 'Run `npm run serve`. Browse → add 2 camps → checkout. Limitation: no persistence. Next: backend + payments.';
}

/**
 * parseBuildSpec — extract a JSON code block from the Builder's output and validate it.
 * The Builder is instructed to emit one ```json``` fence containing a BuildSpec object.
 * Any unknown keys are dropped; invalid values are rejected; missing keys fall back to defaults.
 */
export function parseBuildSpec(builderOutput: string): { spec: BuildSpec; source: 'builder' | 'default'; warnings: string[] } {
  const warnings: string[] = [];
  const fenceMatch = builderOutput.match(/```json\s*([\s\S]*?)```/i);
  if (!fenceMatch) {
    warnings.push('No ```json``` block found in Builder output; using default spec.');
    return { spec: {}, source: 'default', warnings };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(fenceMatch[1].trim());
  } catch (err) {
    warnings.push(`Builder JSON did not parse (${err instanceof Error ? err.message : String(err)}); using default spec.`);
    return { spec: {}, source: 'default', warnings };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    warnings.push('Builder JSON was not an object; using default spec.');
    return { spec: {}, source: 'default', warnings };
  }
  const obj = raw as Record<string, unknown>;
  const spec: BuildSpec = {};
  const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v);
  const isShortString = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
  if ('brandColor' in obj) {
    if (isHex(obj.brandColor)) spec.brandColor = obj.brandColor;
    else warnings.push('brandColor was not a valid hex color; ignored.');
  }
  if ('brandColorDark' in obj) {
    if (isHex(obj.brandColorDark)) spec.brandColorDark = obj.brandColorDark;
    else warnings.push('brandColorDark was not a valid hex color; ignored.');
  }
  if ('heroTitle' in obj) {
    if (isShortString(obj.heroTitle, 80)) spec.heroTitle = obj.heroTitle;
    else warnings.push('heroTitle was missing or too long; ignored.');
  }
  if ('heroTagline' in obj) {
    if (isShortString(obj.heroTagline, 200)) spec.heroTagline = obj.heroTagline;
    else warnings.push('heroTagline was missing or too long; ignored.');
  }
  if ('ctaLabel' in obj) {
    if (isShortString(obj.ctaLabel, 32)) spec.ctaLabel = obj.ctaLabel;
    else warnings.push('ctaLabel was missing or too long; ignored.');
  }
  if ('featuredCategory' in obj) {
    const categories = new Set<string>(['All', ...CAMPS.map((c) => c.category)]);
    if (typeof obj.featuredCategory === 'string' && categories.has(obj.featuredCategory)) {
      spec.featuredCategory = obj.featuredCategory;
    } else {
      warnings.push(`featuredCategory must be one of: ${[...categories].join(', ')}; ignored.`);
    }
  }
  return { spec, source: 'builder', warnings };
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

interface ShippedContext {
  path: string;
  bytes: number;
  spec: BuildSpec;
  specSource: 'builder' | 'default';
  warnings: string[];
}

async function generateAgentOutput(
  client: SquadClient,
  role: Role,
  team: CastMember[],
  squadDir: string,
  prior: Partial<Record<Role, string>>,
  shipped?: ShippedContext,
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

  const shippedBlock = shipped
    ? [
        'Shipped artifact (already on disk):',
        `  path: ${shipped.path}`,
        `  size: ${shipped.bytes} bytes`,
        `  applied BuildSpec (source: ${shipped.specSource}): ${JSON.stringify({ ...DEFAULT_SPEC, ...shipped.spec })}`,
        shipped.warnings.length ? `  spec warnings: ${shipped.warnings.join(' | ')}` : '',
      ].filter(Boolean).join('\n')
    : '';

  const user = [
    `Product: ${PRODUCT_BRIEF.productName}`,
    `Audience: ${PRODUCT_BRIEF.audience}`,
    `Problem: ${PRODUCT_BRIEF.problem}`,
    `Must-haves: ${PRODUCT_BRIEF.mustHaves.join(' | ')}`,
    `Camp count seeded: ${CAMPS.length}`,
    `Agent charter excerpt: ${charter}`,
    priorBlocks.length ? `Prior teammate outputs:\n${priorBlocks.join('\n\n')}` : 'You are first; no prior outputs.',
    shippedBlock,
    `Task: ${roleInstruction(role)}`,
  ].filter(Boolean).join('\n');

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
  teamRoot: string,
  outputDir: string,
  events?: BuildEvents,
): Promise<BuildResult> {
  const squadDir = join(teamRoot, '.squad');
  const outputs: Partial<Record<Role, string>> = {};
  const order: Role[] = ['lead', 'developer', 'tester', 'scribe'];
  const appPath = join(outputDir, 'index.html');
  let shipped: ShippedContext | undefined;
  let finalSpec: BuildSpec = {};
  let finalSpecSource: 'builder' | 'default' = 'default';
  let finalSpecWarnings: string[] = [];

  for (const role of order) {
    const agent = team.find((m) => m.role === role)!;
    const priorRoles = order.slice(0, order.indexOf(role)).filter((r) => outputs[r]);
    const historyEntries = countHistoryEntries(squadDir, agent.name);
    const charter = readAgentCharter(squadDir, agent.name);
    events?.onAgentStart?.(role, agent, { priorRoles, historyEntries, charter });

    const out = await generateAgentOutput(client, role, team, squadDir, outputs, shipped);
    outputs[role] = out;
    events?.onAgentComplete?.(role, out);

    // The Builder ships the app as part of its own turn — so QA Lead and
    // Launch Lead see a real on-disk artifact when they run.
    if (role === 'developer') {
      const parsed = parseBuildSpec(out);
      finalSpec = parsed.spec;
      finalSpecSource = parsed.source;
      finalSpecWarnings = parsed.warnings;
      events?.onSpecParsed?.(parsed.spec, parsed.source, parsed.warnings);

      mkdirSync(outputDir, { recursive: true });
      const html = buildAppHtml(parsed.spec);
      writeFileSync(appPath, html, 'utf8');
      shipped = {
        path: appPath,
        bytes: Buffer.byteLength(html, 'utf8'),
        spec: parsed.spec,
        specSource: parsed.source,
        warnings: parsed.warnings,
      };
      events?.onAppShipped?.({ app: appPath, brief: '(pending — written after Launch Lead)' });
    }

    const skipped = await appendAgentHistory(teamRoot, agent.name, PRODUCT_BRIEF.productName, role, out);
    events?.onHistoryWritten?.(role, agent.name, skipped);
  }

  // Team brief is written last — it needs every role's output.
  const briefPath = join(outputDir, 'team-brief.md');
  const lines: string[] = [];
  lines.push(`# ${PRODUCT_BRIEF.productName} — Team Delivery`);
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push(`## BuildSpec (source: ${finalSpecSource})`);
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify({ ...DEFAULT_SPEC, ...finalSpec }, null, 2));
  lines.push('```');
  if (finalSpecWarnings.length) {
    lines.push('');
    lines.push('Warnings:');
    for (const w of finalSpecWarnings) lines.push(`- ${w}`);
  }
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

  return {
    team,
    outputs: {
      lead: outputs.lead!,
      developer: outputs.developer!,
      tester: outputs.tester!,
      scribe: outputs.scribe!,
    },
    spec: finalSpec,
    paths,
  };
}
