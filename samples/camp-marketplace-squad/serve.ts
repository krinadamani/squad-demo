/**
 * serve.ts — Serves the squad's deliverable (output/index.html) on http://localhost:4200
 *
 * If output/index.html doesn't exist yet, instructs the user to run `npm start` first.
 */

import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 4200);
const appPath = join(here, 'output', 'index.html');

if (!existsSync(appPath)) {
  console.error(`❌ No app found at ${appPath}`);
  console.error('   Run `npm start` first so the squad builds the app.');
  process.exit(1);
}

const html = readFileSync(appPath, 'utf8');

const server = createServer((req, res) => {
  if (!req.url || req.url === '/' || req.url.startsWith('/?')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(html);
    return;
  }
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, app: 'SunnyDays' }));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log('☀️  SunnyDays — Kids Summer Camps');
  console.log('');
  console.log(`   ▶ Open in browser: http://localhost:${PORT}`);
  console.log('');
  console.log('   Press Ctrl+C to stop.');
});
