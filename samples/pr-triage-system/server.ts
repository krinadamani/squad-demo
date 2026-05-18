/**
 * server.ts — Web UI server for pr-triage-system
 *
 * Serves a dashboard at http://localhost:5173 that streams the live Squad
 * triage pipeline via Server-Sent Events.
 *
 * Routes:
 *   GET  /                       → index.html
 *   GET  /public/*               → static assets
 *   GET  /api/fixtures           → list of fixture file names
 *   GET  /api/fixtures/:name     → fixture JSON
 *   GET  /api/team               → cast team + agent metadata
 *   GET  /api/agent/:name/history → agent history.md
 *   POST /api/triage (SSE)       → run triage, stream events
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SquadClient } from '@bradygaster/squad-sdk/client';
import {
  loadDotEnv,
  castAndOnboard,
  runTriage,
  toMarkdown,
  readAgentHistory,
  type IntakePayload,
  type TriageEvents,
} from './core.js';

const here = dirname(fileURLToPath(import.meta.url));
loadDotEnv(here);

const PORT = Number(process.env.PORT ?? 5173);
const demoRoot = join(here, '.demo-data');
const squadDir = join(demoRoot, '.squad');
const fixturesDir = join(here, 'fixtures');
const publicDir = join(here, 'web', 'public');

if (!existsSync(squadDir)) mkdirSync(squadDir, { recursive: true });

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function send(res: ServerResponse, status: number, body: string | Buffer, contentType = 'text/plain; charset=utf-8'): void {
  res.writeHead(status, { 'Content-Type': contentType, 'Cache-Control': 'no-cache' });
  res.end(body);
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  send(res, status, JSON.stringify(data, null, 2), 'application/json; charset=utf-8');
}

function serveStatic(res: ServerResponse, filePath: string): void {
  if (!existsSync(filePath)) {
    send(res, 404, 'Not found');
    return;
  }
  const ext = extname(filePath).toLowerCase();
  const type = MIME[ext] ?? 'application/octet-stream';
  send(res, 200, readFileSync(filePath), type);
}

async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : ({} as T));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sse(res: ServerResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function handleTriage(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body: { payload?: IntakePayload } = {};
  try {
    body = await readJsonBody(req);
  } catch (err) {
    sendJson(res, 400, { error: 'Invalid JSON body', detail: String(err) });
    return;
  }

  const payload = body.payload;
  if (!payload || !payload.kind || !payload.id || !payload.title) {
    sendJson(res, 400, { error: 'Missing payload fields (kind, id, title required)' });
    return;
  }

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

  const emit = (event: string, data: unknown): void => sse(res, event, data);

  try {
    emit('stage', { stage: 'cast', message: 'Casting Squad team…' });
    const team = await castAndOnboard(demoRoot, squadDir);
    emit('team', { team });

    emit('stage', { stage: 'connect', message: 'Connecting to GitHub Copilot…' });
    const client = new SquadClient({ githubToken: process.env.GITHUB_TOKEN });
    await client.connect();
    emit('connected', { ok: true });

    const events: TriageEvents = {
      onHeuristics: (data) => emit('heuristics', data),
      onAgentStart: (role, agent, context) => emit('agent_start', { role, agent, context }),
      onAgentComplete: (role, output) => emit('agent_complete', { role, output }),
      onHistoryWritten: (role, agentName, skipped) => emit('history_written', { role, agentName, skipped }),
    };

    emit('stage', { stage: 'triage', message: 'Running triage pipeline…' });
    const report = await runTriage(client, payload, team, squadDir, events);

    // Persist reports
    const reportsDir = join(demoRoot, 'reports');
    mkdirSync(reportsDir, { recursive: true });
    const baseName = `${payload.kind}-${payload.id}`;
    const jsonPath = join(reportsDir, `${baseName}.json`);
    const mdPath = join(reportsDir, `${baseName}.md`);
    writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
    writeFileSync(mdPath, toMarkdown(report), 'utf8');

    emit('report', { report, paths: { json: jsonPath, md: mdPath } });

    const closable = client as unknown as { disconnect?: () => Promise<void> | void };
    if (typeof closable.disconnect === 'function') await closable.disconnect();

    emit('done', { ok: true });
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

    if (req.method === 'GET' && path === '/api/fixtures') {
      const files = existsSync(fixturesDir)
        ? readdirSync(fixturesDir).filter((f) => f.endsWith('.json'))
        : [];
      sendJson(res, 200, { fixtures: files });
      return;
    }

    if (req.method === 'GET' && path.startsWith('/api/fixtures/')) {
      const name = decodeURIComponent(path.replace(/^\/api\/fixtures\//, ''));
      if (name.includes('..') || name.includes('/') || name.includes('\\')) {
        sendJson(res, 400, { error: 'Invalid fixture name' });
        return;
      }
      const fp = join(fixturesDir, name);
      if (!existsSync(fp)) {
        sendJson(res, 404, { error: 'Fixture not found' });
        return;
      }
      send(res, 200, readFileSync(fp), 'application/json; charset=utf-8');
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

    if (req.method === 'POST' && path === '/api/triage') {
      await handleTriage(req, res);
      return;
    }

    send(res, 404, 'Not found');
  } catch (err) {
    sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
  }
});

server.listen(PORT, () => {
  console.log(`\n🎬 pr-triage-system web UI ready at http://localhost:${PORT}\n`);
});
