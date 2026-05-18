/* SunnyDays Squad — live dashboard frontend */

const ROLES = ['lead', 'developer', 'tester', 'scribe'];

const els = {
  briefCard: document.getElementById('brief-card'),
  runBtn: document.getElementById('run-btn'),
  pipeline: document.getElementById('pipeline'),
  statusBar: document.getElementById('status-bar'),
  shipCard: document.getElementById('ship-card'),
  historyAgentSelect: document.getElementById('history-agent-select'),
  historyViewer: document.getElementById('history-viewer'),
  launchLink: document.getElementById('launch-link'),
};

let currentTeam = [];
let roleDisplay = { lead: 'Lead', developer: 'Developer', tester: 'Tester', scribe: 'Scribe' };

function setStatus(msg, active = false) {
  els.statusBar.textContent = msg;
  els.statusBar.classList.toggle('active', active);
}

function initials(name) {
  return (name || '?').slice(0, 2).toUpperCase();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function basename(p) {
  return p.split(/[\\/]/).pop();
}

function renderBrief(brief, campCount) {
  els.briefCard.innerHTML = `
    <h4>${escapeHtml(brief.productName)}</h4>
    <div class="meta-row"><strong>Audience:</strong> ${escapeHtml(brief.audience)}</div>
    <div class="meta-row"><strong>Problem:</strong> ${escapeHtml(brief.problem)}</div>
    <div><strong>Must-haves:</strong></div>
    <ul>${brief.mustHaves.map((m) => `<li>${escapeHtml(m)}</li>`).join('')}</ul>
    <div class="meta-row" style="margin-top: 0.5rem;"><strong>Seeded camps:</strong> ${campCount}</div>
  `;
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
            <div class="agent-name">${escapeHtml(member.displayName ?? member.name)}</div>
            <div class="agent-role-display">${escapeHtml(roleDisplay[role] || role)} <span class="agent-role">· ${role}</span></div>
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
  card.querySelector('.agent-status .dot').className = `dot dot-${state}`;
  card.querySelector('.status-label').textContent = labelText;
}

function setAgentContext(role, context) {
  const card = document.getElementById(`agent-${role}`);
  if (!card) return;
  const strip = card.querySelector('[data-context]');
  strip.innerHTML = '';
  if (context.priorRoles && context.priorRoles.length) {
    const labels = context.priorRoles.map((r) => roleDisplay[r] || r).join(' → ');
    const chip = document.createElement('span');
    chip.className = 'chip prior';
    chip.textContent = `↩ reading: ${labels}`;
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
  tag.className = `history-tag ${skipped ? 'skipped' : 'saved'}`;
  tag.textContent = skipped
    ? `⏭ history.md already had this entry — skipped`
    : `💾 appended to ${agentName}/history.md`;
}

function renderShipped(paths) {
  els.shipCard.classList.remove('empty');
  els.shipCard.innerHTML = `
    <div><strong>🎉 SunnyDays shipped!</strong></div>
    <div style="margin-top: 0.4rem; font-size: 0.8rem; color: var(--text-dim);">
      App: <code>${escapeHtml(basename(paths.app))}</code><br/>
      Brief: <code>${escapeHtml(basename(paths.brief))}</code>
    </div>
    <div class="launch-row">
      <a href="http://localhost:4200" target="_blank" rel="noopener">Launch marketplace ↗</a>
    </div>
    <div style="margin-top: 0.5rem; font-size: 0.75rem; color: var(--text-dim);">
      ⚠️ Open a second terminal and run <code>npm run serve</code> to start the marketplace.
    </div>
  `;
  els.launchLink.classList.remove('disabled');
}

async function loadBrief() {
  const res = await fetch('/api/brief');
  const data = await res.json();
  roleDisplay = data.roleDisplay || roleDisplay;
  renderBrief(data.brief, data.campCount);
}

async function loadTeam() {
  const res = await fetch('/api/team');
  const data = await res.json();
  currentTeam = data.team;
  renderEmptyPipeline(currentTeam);
  els.historyAgentSelect.innerHTML = '<option value="">— select agent —</option>';
  for (const m of currentTeam) {
    const opt = document.createElement('option');
    opt.value = m.name.toLowerCase();
    opt.textContent = `${m.displayName} (${roleDisplay[m.role] || m.role})`;
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
  els.historyViewer.textContent = data.content || '(empty — no runs yet)';
}

function runBuild() {
  els.runBtn.disabled = true;
  els.shipCard.classList.add('empty');
  els.shipCard.textContent = 'Squad is working…';
  renderEmptyPipeline(currentTeam);

  fetch('/api/build', { method: 'POST' })
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
      els.shipCard.classList.remove('empty');
      els.shipCard.innerHTML = `<span style="color: var(--danger);">Error: ${escapeHtml(err.message)}</span>`;
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
    case 'agent_start':
      setAgentState(data.role, 'thinking', 'Thinking');
      setAgentContext(data.role, data.context);
      setStatus(`${data.agent.displayName} (${roleDisplay[data.role] || data.role}) is reasoning…`, true);
      break;
    case 'agent_complete':
      setAgentState(data.role, 'done', 'Done');
      setAgentOutput(data.role, data.output);
      break;
    case 'history_written':
      setHistoryTag(data.role, data.agentName, data.skipped);
      if (els.historyAgentSelect.value === data.agentName.toLowerCase()) {
        loadAgentHistory(data.agentName.toLowerCase());
      }
      break;
    case 'app_shipped':
      renderShipped(data.paths);
      setStatus('✅ App shipped to output/index.html', false);
      break;
    case 'done':
      setStatus('✅ Done.', false);
      break;
    case 'error':
      setStatus(`❌ ${data.message}`, false);
      els.shipCard.classList.remove('empty');
      els.shipCard.innerHTML = `<span style="color: var(--danger);">Error: ${escapeHtml(data.message)}</span>`;
      break;
  }
}

els.runBtn.addEventListener('click', runBuild);
els.historyAgentSelect.addEventListener('change', (e) => loadAgentHistory(e.target.value));

(async () => {
  setStatus('Loading brief & team…');
  try {
    await Promise.all([loadBrief(), loadTeam()]);
    setStatus('Ready. Click "Run the squad" to begin.');
  } catch (err) {
    setStatus(`❌ Init failed: ${err.message}`);
  }
})();
