/**
 * dashboard.ts — Live web UI for camp-marketplace-squad.
 *
 * Serves a dashboard at http://localhost:5173 where you can watch the squad
 * design and ship SunnyDays in real time via Server-Sent Events.
 *
 * Routes:
 *   GET  /                          → dashboard UI
 *   GET  /public/*                  → static assets
 *   GET  /api/brief                 → product brief + camp count
 *   GET  /api/team                  → cast + onboard team (idempotent)
 *   GET  /api/agent/:name/history   → agent history.md content
 *   POST /api/build (SSE)           → run squad pipeline, stream events
 *
 * The shipped marketplace itself is served separately by `npm run serve` at
 * http://localhost:4200.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SquadClient } from '@bradygaster/squad-sdk/client';
import {
  loadDotEnv,
  castAndOnboard,
  runBuild,
  readAgentHistory,
  PRODUCT_BRIEF,
  ROLE_DISPLAY,
  type BuildEvents,
} from './core.js';
import { CAMPS } from './app-template.js';

const here = dirname(fileURLToPath(import.meta.url));
loadDotEnv(here);

const PORT = Number(process.env.DASHBOARD_PORT ?? 5173);
const demoRoot = join(here, '.squad-data');
const squadDir = join(demoRoot, '.squad');
const outputDir = join(here, 'output');
const publicDir = join(here, 'web', 'public');

mkdirSync(squadDir, { recursive: true });

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function send(res: ServerResponse, status: number, body: string | Buffer, type = 'text/plain; charset=utf-8'): void {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
  res.end(body);
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  send(res, status, JSON.stringify(data, null, 2), 'application/json; charset=utf-8');
}

function serveStatic(res: ServerResponse, filePath: string): void {
  if (!existsSync(filePath)) return send(res, 404, 'Not found');
  const type = MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
  send(res, 200, readFileSync(filePath), type);
}

function sse(res: ServerResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function handleBuild(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!process.env.GITHUB_TOKEN) {
    sendJson(res, 500, { error: 'Missing GITHUB_TOKEN env var' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const emit = (e: string, d: unknown): void => sse(res, e, d);

  try {
    emit('stage', { message: 'Casting Squad team…' });
    const team = await castAndOnboard(demoRoot, squadDir);
    emit('team', { team });

    emit('stage', { message: 'Connecting to GitHub Copilot…' });
    const client = new SquadClient({ githubToken: process.env.GITHUB_TOKEN });
    await client.connect();
    emit('connected', { ok: true });

    const events: BuildEvents = {
      onAgentStart: (role, agent, ctx) => emit('agent_start', { role, agent, context: ctx }),
      onAgentComplete: (role, output) => emit('agent_complete', { role, output }),
      onHistoryWritten: (role, agentName, skipped) => emit('history_written', { role, agentName, skipped }),
      onSpecParsed: (spec, source, warnings) => emit('spec_parsed', { spec, source, warnings }),
      onAppShipped: (paths) => emit('app_shipped', { paths }),
    };

    emit('stage', { message: 'Running pipeline…' });
    const result = await runBuild(client, team, squadDir, outputDir, events);

    emit('done', { ok: true, paths: result.paths });

    const closable = client as unknown as { disconnect?: () => Promise<void> | void };
    if (typeof closable.disconnect === 'function') await closable.disconnect();
  } catch (err) {
    emit('error', { message: err instanceof Error ? err.message : String(err) });
  } finally {
    res.end();
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const path = url.pathname;

  try {
    if (req.method === 'GET' && (path === '/' || path === '/index.html')) {
      serveStatic(res, join(publicDir, 'index.html'));
      return;
    }

    if (req.method === 'GET' && path.startsWith('/public/')) {
      serveStatic(res, join(publicDir, path.replace(/^\/public\//, '')));
      return;
    }

    if (req.method === 'GET' && path === '/api/brief') {
      sendJson(res, 200, {
        brief: PRODUCT_BRIEF,
        campCount: CAMPS.length,
        roleDisplay: ROLE_DISPLAY,
      });
      return;
    }

    if (req.method === 'GET' && path === '/api/team') {
      const team = await castAndOnboard(demoRoot, squadDir);
      sendJson(res, 200, { team });
      return;
    }

    if (req.method === 'GET' && path.startsWith('/api/agent/') && path.endsWith('/history')) {
      const name = decodeURIComponent(path.replace(/^\/api\/agent\//, '').replace(/\/history$/, ''));
      if (name.includes('..') || name.includes('/') || name.includes('\\')) {
        sendJson(res, 400, { error: 'Invalid agent name' });
        return;
      }
      const content = readAgentHistory(squadDir, name);
      sendJson(res, 200, { agent: name, content });
      return;
    }

    if (req.method === 'POST' && path === '/api/build') {
      await handleBuild(req, res);
      return;
    }

    send(res, 404, 'Not found');
  } catch (err) {
    sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
  }
});

server.listen(PORT, () => {
  console.log('\n🎬 camp-marketplace-squad — live dashboard');
  console.log(`   ▶ http://localhost:${PORT}\n`);
  console.log('   (Run `npm run serve` in another terminal to launch the marketplace itself at http://localhost:4200)\n');
});
