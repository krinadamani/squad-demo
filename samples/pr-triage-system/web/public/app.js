/* Squad PR Triage — frontend logic */

const ROLES = ['lead', 'developer', 'tester', 'scribe'];

const els = {
  fixtureSelect: document.getElementById('fixture-select'),
  payloadEditor: document.getElementById('payload-editor'),
  runBtn: document.getElementById('run-btn'),
  pipeline: document.getElementById('pipeline'),
  statusBar: document.getElementById('status-bar'),
  heuristics: document.getElementById('heuristics'),
  report: document.getElementById('report'),
  historyAgentSelect: document.getElementById('history-agent-select'),
  historyViewer: document.getElementById('history-viewer'),
};

let currentTeam = [];

function setStatus(msg, active = false) {
  els.statusBar.textContent = msg;
  els.statusBar.classList.toggle('active', active);
}

function initials(name) {
  return (name || '?').slice(0, 2).toUpperCase();
}

function renderEmptyPipeline(team) {
  els.pipeline.innerHTML = '';
  for (const role of ROLES) {
    const member = team.find((m) => m.role === role) ?? { name: role, displayName: role, role };
    const card = document.createElement('div');
    card.className = 'agent-card pending';
    card.id = `agent-${role}`;
    card.innerHTML = `
      <div class="agent-header">
        <div class="agent-title">
          <div class="agent-avatar">${initials(member.name)}</div>
          <div>
            <div class="agent-name">${member.displayName ?? member.name}</div>
            <div class="agent-role">${role}</div>
          </div>
        </div>
        <div class="agent-status"><span class="dot dot-pending"></span><span class="status-label">Pending</span></div>
      </div>
      <div class="context-strip" data-context></div>
      <div class="agent-output empty" data-output>Waiting…</div>
      <div class="history-tag" data-history></div>
    `;
    els.pipeline.appendChild(card);
  }
}

function setAgentState(role, state, labelText) {
  const card = document.getElementById(`agent-${role}`);
  if (!card) return;
  card.classList.remove('pending', 'thinking', 'done');
  card.classList.add(state);
  const dot = card.querySelector('.agent-status .dot');
  dot.className = `dot dot-${state}`;
  card.querySelector('.status-label').textContent = labelText;
}

function setAgentContext(role, context) {
  const card = document.getElementById(`agent-${role}`);
  if (!card) return;
  const strip = card.querySelector('[data-context]');
  strip.innerHTML = '';
  if (context.priorRoles && context.priorRoles.length) {
    const chip = document.createElement('span');
    chip.className = 'chip prior';
    chip.textContent = `↩ reading: ${context.priorRoles.join(' → ')}`;
    strip.appendChild(chip);
  } else {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = '🌱 first in pipeline';
    strip.appendChild(chip);
  }
  if (typeof context.historyEntries === 'number') {
    const chip = document.createElement('span');
    chip.className = 'chip history';
    chip.textContent = `📜 history: ${context.historyEntries} prior entr${context.historyEntries === 1 ? 'y' : 'ies'}`;
    strip.appendChild(chip);
  }
}

function setAgentOutput(role, output) {
  const card = document.getElementById(`agent-${role}`);
  if (!card) return;
  const out = card.querySelector('[data-output]');
  out.classList.remove('empty');
  out.textContent = output;
}

function setHistoryTag(role, agentName, skipped) {
  const card = document.getElementById(`agent-${role}`);
  if (!card) return;
  const tag = card.querySelector('[data-history]');
  if (skipped) {
    tag.className = 'history-tag skipped';
    tag.textContent = `⏭ history.md already had this entry — skipped`;
  } else {
    tag.className = 'history-tag saved';
    tag.textContent = `💾 appended to ${agentName}/history.md`;
  }
}

function renderHeuristics(h) {
  els.heuristics.classList.remove('empty');
  els.heuristics.innerHTML = `
    <div class="row"><span class="label">Severity</span><span class="sev ${h.severity}">${h.severity}</span></div>
    <div class="row"><span class="label">Owner</span><strong>${h.suggestedOwnerRole}</strong></div>
    <div class="row"><span class="label">Areas</span>${h.areas.map((a) => `<span class="chip">${a}</span>`).join('')}</div>
    <div class="row"><span class="label">Risks</span></div>
    <ul class="risk-list">${(h.riskFlags.length ? h.riskFlags : ['(none)']).map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ul>
    <div class="row"><span class="label">Actions</span></div>
    <ul class="action-list">${h.nextActions.map((a) => `<li>${escapeHtml(a)}</li>`).join('')}</ul>
  `;
}

function renderReport(report, paths) {
  els.report.classList.remove('empty');
  els.report.innerHTML = `
    <div><strong>${escapeHtml(report.intake.title)}</strong></div>
    <div style="color: var(--text-dim); font-size: 12px; margin-top: 4px;">
      ${report.intake.kind.toUpperCase()} #${report.intake.id} · ${escapeHtml(report.intake.repo)}
    </div>
    <hr style="border: none; border-top: 1px solid var(--border); margin: 10px 0;" />
    <div style="font-size: 12px;">
      ✅ Saved <code>${escapeHtml(basename(paths.json))}</code> + <code>${escapeHtml(basename(paths.md))}</code> to <code>.demo-data/reports/</code>
    </div>
  `;
}

function basename(p) {
  return p.split(/[\\/]/).pop();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function loadFixtures() {
  const res = await fetch('/api/fixtures');
  const data = await res.json();
  els.fixtureSelect.innerHTML = '';
  for (const name of data.fixtures) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    els.fixtureSelect.appendChild(opt);
  }
  if (data.fixtures.length) await loadFixture(data.fixtures[0]);
}

async function loadFixture(name) {
  const res = await fetch(`/api/fixtures/${encodeURIComponent(name)}`);
  const json = await res.json();
  els.payloadEditor.value = JSON.stringify(json, null, 2);
}

async function loadTeam() {
  const res = await fetch('/api/team');
  const data = await res.json();
  currentTeam = data.team;
  renderEmptyPipeline(currentTeam);
  // Populate history dropdown
  els.historyAgentSelect.innerHTML = '<option value="">— select agent —</option>';
  for (const m of currentTeam) {
    const opt = document.createElement('option');
    opt.value = m.name.toLowerCase();
    opt.textContent = `${m.displayName} (${m.role})`;
    els.historyAgentSelect.appendChild(opt);
  }
}

async function loadAgentHistory(name) {
  if (!name) {
    els.historyViewer.textContent = 'Select an agent…';
    els.historyViewer.classList.add('empty');
    return;
  }
  const res = await fetch(`/api/agent/${encodeURIComponent(name)}/history`);
  const data = await res.json();
  els.historyViewer.classList.remove('empty');
  els.historyViewer.textContent = data.content || '(empty — no triages recorded yet)';
}

function runTriage() {
  let payload;
  try {
    payload = JSON.parse(els.payloadEditor.value);
  } catch (err) {
    alert(`Invalid JSON payload: ${err.message}`);
    return;
  }

  els.runBtn.disabled = true;
  els.heuristics.classList.add('empty');
  els.heuristics.textContent = 'Computing heuristics…';
  els.report.classList.add('empty');
  els.report.textContent = 'Awaiting agent outputs…';

  // Reset pipeline cards
  renderEmptyPipeline(currentTeam);

  // Use fetch + ReadableStream to consume SSE from POST
  fetch('/api/triage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload }),
  })
    .then(async (res) => {
      if (!res.ok || !res.body) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() ?? '';
        for (const block of blocks) handleSseBlock(block);
      }
    })
    .catch((err) => {
      setStatus(`❌ ${err.message}`);
      els.report.classList.remove('empty');
      els.report.innerHTML = `<span style="color: var(--danger);">Error: ${escapeHtml(err.message)}</span>`;
    })
    .finally(() => {
      els.runBtn.disabled = false;
    });
}

function handleSseBlock(block) {
  const lines = block.split('\n');
  let event = 'message';
  let dataRaw = '';
  for (const line of lines) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataRaw += line.slice(5).trim();
  }
  if (!dataRaw) return;
  let data;
  try { data = JSON.parse(dataRaw); } catch { return; }
  handleEvent(event, data);
}

function handleEvent(event, data) {
  switch (event) {
    case 'stage':
      setStatus(data.message, true);
      break;
    case 'team':
      currentTeam = data.team;
      renderEmptyPipeline(currentTeam);
      break;
    case 'connected':
      setStatus('Connected to Copilot. Starting pipeline…', true);
      break;
    case 'heuristics':
      renderHeuristics(data);
      break;
    case 'agent_start':
      setAgentState(data.role, 'thinking', 'Thinking');
      setAgentContext(data.role, data.context);
      setStatus(`${data.agent.displayName} (${data.role}) is reasoning…`, true);
      break;
    case 'agent_complete':
      setAgentState(data.role, 'done', 'Done');
      setAgentOutput(data.role, data.output);
      break;
    case 'history_written':
      setHistoryTag(data.role, data.agentName, data.skipped);
      // Refresh history viewer if this agent is selected
      if (els.historyAgentSelect.value === data.agentName.toLowerCase()) {
        loadAgentHistory(data.agentName.toLowerCase());
      }
      break;
    case 'report':
      renderReport(data.report, data.paths);
      setStatus('✅ Triage complete.', false);
      break;
    case 'done':
      setStatus('✅ Done.', false);
      break;
    case 'error':
      setStatus(`❌ ${data.message}`, false);
      els.report.classList.remove('empty');
      els.report.innerHTML = `<span style="color: var(--danger);">Error: ${escapeHtml(data.message)}</span>`;
      break;
  }
}

// Wire up
els.fixtureSelect.addEventListener('change', (e) => loadFixture(e.target.value));
els.runBtn.addEventListener('click', runTriage);
els.historyAgentSelect.addEventListener('change', (e) => loadAgentHistory(e.target.value));

// Init
(async () => {
  setStatus('Loading fixtures and team…');
  try {
    await Promise.all([loadFixtures(), loadTeam()]);
    setStatus('Ready. Pick a fixture and click Run Triage.');
  } catch (err) {
    setStatus(`❌ Init failed: ${err.message}`);
  }
})();
