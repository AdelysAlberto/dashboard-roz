/* roz dashboard logic */
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const state = {
  docs: [],
  selected: null,   // doc meta
  filter: "all",
  search: "",
  config: null,
  ws: null,
  running: false,
  runId: null,
  theme: localStorage.getItem("roz-theme") || "dark",
  tab: "doc",
  monSessions: [],
  monDetail: null,
};

const DEFAULT_PROMPT = `Analiza este documento markdown del proyecto (ruta: {file}).
Lee el archivo completo con tus herramientas y también los artefactos o rutas que mencione
(plan/, artifacts/, código citado). Responde EXACTAMENTE con este formato:

VEREDICTO: DONE | PENDING | IMPROVE
RAZÓN: <2-3 frases en español explicando por qué>
EVIDENCIA: <archivos/comandos revisados>
SUGERENCIAS:
- <acción concreta 1>
- <acción concreta 2>

NO modifiques ningún archivo, NO muevas nada. Solo analiza y reporta.`;

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).detail || msg; } catch {}
    throw new Error(msg);
  }
  return res.json();
}

function toast(msg, err = false) {
  const t = document.createElement("div");
  t.className = "toast" + (err ? " err" : "");
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), err ? 5000 : 2500);
}

/* ── data loading ── */

async function loadConfig() {
  state.config = await api("GET", "/api/config");
  $("#stat-model").textContent = "model: " + state.config.model;
  const sel = $("#agent");
  sel.innerHTML = "";
  for (const a of state.config.agents) {
    const o = document.createElement("option");
    o.value = a; o.textContent = a === "none" ? "(default)" : a;
    sel.appendChild(o);
  }
  $("#prompt").value = DEFAULT_PROMPT;
  if (state.config.done_dir) $("#move-dest").value = state.config.done_dir;
}

async function loadDocs() {
  const { docs } = await api("GET", "/api/docs");
  state.docs = docs;
  renderList();
}

/* ── left rail ── */

function renderList() {
  const nav = $("#doclist");
  nav.innerHTML = "";
  const q = state.search.toLowerCase();
  let count = 0;

  const filtered = state.docs.filter((d) => {
    if (state.filter === "none" && d.status) return false;
    if (["active", "pending", "done", "rejected", "deprecated"].includes(state.filter) && d.status !== state.filter) return false;
    if (q && !(d.title + " " + d.name + " " + (d.description || "")).toLowerCase().includes(q)) return false;
    return true;
  });

  const groups = {};
  for (const d of filtered) (groups[d.root || "?"] ||= []).push(d);

  for (const [root, docs] of Object.entries(groups)) {
    const g = document.createElement("div");
    g.className = "doc-group";
    g.textContent = root.split("/").slice(-2).join("/");
    nav.appendChild(g);
    for (const d of docs) {
      count++;
      const b = document.createElement("button");
      b.className = "doc-item" + (state.selected?.path === d.path ? " active" : "");
      const meta = [d.module, d.date, d.priority].filter(Boolean).map(esc).join(" · ");
      b.innerHTML = `<span class="t">${esc(d.title)}</span><span class="m">${d.status ? `<span class="badge ${d.status}">${d.status}</span>` : ""}<span>${meta}</span></span>`;
      b.title = d.title + "\n" + d.path;
      b.onclick = () => selectDoc(d);
      nav.appendChild(b);
    }
  }
  $("#stat-count").textContent = `${count} docs`;
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ── selection & viewer ── */

async function selectDoc(d) {
  state.selected = d;
  renderList();
  $("#empty-state").hidden = true;
  $("#viewer").hidden = false;
  $("#analysis-pane").hidden = true;
  $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === "doc"));
  $("#actions").hidden = false;
  $("#actions-empty").hidden = true;
  $("#current-status").innerHTML = d.status ? `current: <span class="badge ${d.status}">${d.status}</span>` : "current: <i>no status field</i>";
  $("#src-path").value = d.path;
  $("#move-dest").placeholder = d.parent || "destination directory…";
  if (!$("#move-dest").value && state.config?.done_dir) $("#move-dest").value = state.config.done_dir;
  switchTab("doc");

  try {
    $("#viewer").hidden = false;
    $("#viewer").innerHTML = `<p class="viewer-loading">loading document…</p>`;
    const { content } = await api("GET", "/api/doc?path=" + encodeURIComponent(d.path));
    if (state.selected?.path !== d.path) return; // superseded by a newer selection
    renderViewer(d, content);
  } catch (e) {
    if (state.selected?.path !== d.path) return;
    $("#viewer").innerHTML = `<div class="viewer-error"><p>Could not open this document: ${esc(e.message)}</p><button class="ghost sm" id="btn-retry-load">⟳ retry</button></div>`;
    const retry = $("#btn-retry-load");
    if (retry) retry.onclick = () => selectDoc(d);
  }
}

function splitFrontmatter(text) {
  const m = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (m) return { fm: m[1], body: text.slice(m[0].length) };
  return { fm: null, body: text };
}

function renderViewer(d, content) {
  const { body } = splitFrontmatter(content);
  const head = document.createElement("div");
  head.className = "doc-header";
  const chip = (k, v) => v ? `<span><b>${k}:</b> ${k === "Status" ? `<span class="badge ${esc(v)}">${esc(v)}</span>` : esc(v)}</span>` : "";
  const fields = [
    chip("Module", d.module), chip("Date", d.date), chip("Status", d.status),
    chip("Priority", d.priority), chip("Scope", d.scope), chip("Source", d.source),
  ].join("");
  head.innerHTML = `
    <h1>${esc(d.title)}</h1>
    <div class="fields">${fields}</div>
    ${d.description ? `<div class="doc-desc">${esc(d.description)}</div>` : ""}
    <div class="filepath">${esc(d.path)}</div>`;
  const art = document.createElement("div");
  art.className = "md-body";
  art.innerHTML = renderMarkdown(body);
  $("#viewer").innerHTML = "";
  $("#viewer").append(head, art);
}

/* ── tabs ── */

$$(".tab").forEach((t) => t.onclick = () => switchTab(t.dataset.tab));

function switchTab(name) {
  state.tab = name;
  if (name === "monitor") showMonitorList();
  $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  $("#viewer").hidden = name !== "doc" || !state.selected;
  $("#empty-state").hidden = name !== "doc" || !!state.selected;
  $("#analysis-pane").hidden = name !== "analysis";
  $("#monitor-pane").hidden = !(name === "monitor" && !state.monDetail);
  $("#monitor-detail").hidden = name !== "monitor" || !state.monDetail;
  if (name === "doc") $("#analysis-dot").hidden = true;
}

/* ── monitor: subagent cards ── */

const MON_STATES = { active: "● working", stalled: "⚠ unresponsive", quiet: "◐ idle", ended: "○ ended" };
let monTimer = null;

async function refreshMonitor() {
  let data;
  try {
    data = await api("GET", "/api/monitor/sessions");
  } catch (e) { return; }
  state.monSessions = data.sessions;
  const live = data.sessions.filter((s) => s.state !== "ended").length;
  const stalled = data.sessions.filter((s) => s.state === "stalled").length;
  $("#mon-summary").textContent = `${live} live · ${stalled} stalled`;
  $("#monitor-dot").hidden = live === 0;
  $("#monitor-dot").style.color = stalled ? "var(--red)" : "var(--green, #2ecc71)";
  if (state.tab !== "monitor") return;
  if (state.monDetail) updateMonDetailHeader();
  else renderMonitorGrid();
}

function renderMonitorGrid() {
  const grid = $("#monitor-grid");
  const hideEnded = $("#mon-hide-ended").checked;
  const sessions = (state.monSessions || []).filter((s) => !hideEnded || s.state !== "ended");
  if (!sessions.length) {
    grid.innerHTML = `<div class="rail-note">no ${hideEnded ? "live" : "recorded"} sessions.<br>Subagents are launched via <code>subagent(...)</code>; primary sessions are <code>pi</code> terminals in tracked projects.</div>`;
    return;
  }
  grid.innerHTML = "";
  for (const s of sessions) {
    const card = document.createElement("button");
    card.className = "mon-card st-" + s.state;
    card.innerHTML = `
      <div class="mon-row1">
        <span class="mon-agent">${s.kind === "primary" ? "◉ " + esc(s.project || "session") : esc(s.agent)}</span>
        ${s.provider ? `<span class="badge" style="font-weight:600; color:${s.provider === 'opencode' ? '#38bdf8' : '#c084fc'}; border-color:${s.provider === 'opencode' ? '#0284c7' : '#9333ea'}">${esc(s.provider === 'opencode' ? 'OpenCode' : 'Pi')}</span>` : ""}
        <span class="state-pill st-${s.state}">${MON_STATES[s.state] || s.state}</span>
        ${s.task_tag ? `<span class="badge">${esc(s.task_tag)}</span>` : ""}
        ${s.kind === "primary" ? `<span class="badge">session</span>` : ""}
      </div>
      <div class="mon-task-line">${esc(s.task.slice(0, 140))}</div>
      <div class="mon-activity">${esc(s.last_activity.slice(0, 120))}</div>
      <div class="mon-meta">${s.messages} msgs · ${fmtTokens(s.tokens)} tok · hace ${fmtAge(s.idle_seconds)}</div>`;
    card.onclick = () => openMonDetail(s);
    grid.appendChild(card);
  }
}

function fmtTokens(n) { return n >= 1000 ? Math.round(n / 1000) + "k" : String(n); }
function fmtAge(sec) {
  if (sec < 60) return sec + "s";
  if (sec < 3600) return Math.floor(sec / 60) + "min";
  return Math.floor(sec / 3600) + "h" + String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
}

async function openMonDetail(s) {
  state.monDetail = s;
  state.tab = "monitor";
  $("#monitor-pane").hidden = true;
  $("#monitor-detail").hidden = false;
  updateMonDetailHeader();
  await pollMonLog(true);
}

function updateMonDetailHeader() {
  const s = state.monSessions?.find((x) => x.path === state.monDetail.path) || state.monDetail;
  state.monDetail = s;
  $("#mon-d-agent").textContent = s.kind === "primary"
    ? (s.project || "session") + (s.pid ? ` (pid ${s.pid})` : "")
    : s.agent + (s.pid ? ` (pid ${s.pid})` : "");
  $("#btn-mon-wake").hidden = s.kind === "primary";
  $("#mon-d-tag").textContent = s.task_tag || "";
  $("#mon-d-tag").hidden = !s.task_tag;
  $("#mon-d-state").textContent = MON_STATES[s.state] || s.state;
  $("#mon-d-state").className = "state-pill st-" + s.state;
  $("#mon-d-task").textContent = s.task;
  $("#btn-mon-wake").disabled = !s.pid;
}

let monLogSeq = 0;
async function pollMonLog(reset = false) {
  const s = state.monDetail;
  if (!s) return;
  let events;
  try {
    events = (await api("GET", "/api/monitor/log?path=" + encodeURIComponent(s.path) + "&lines=150")).events;
  } catch (e) { return; }
  const box = $("#mon-log");
  if (reset) { box.innerHTML = ""; monLogSeq = 0; }
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  if (events.length < monLogSeq && monLogSeq > 0) { box.innerHTML = ""; monLogSeq = 0; }
  for (const ev of events.slice(monLogSeq)) {
    const div = document.createElement("div");
    div.className = "ev mon-" + ev.kind;
    const head = ev.kind === "tool" ? `→ ${ev.tool}` : ev.kind === "result" ? `← ${ev.tool || "result"}` : ev.kind;
    div.innerHTML = `<div class="ev-h">${ev.ts} ${esc(head)}</div><div class="ev-b"></div>`;
    div.querySelector(".ev-b").textContent = ev.text;
    box.appendChild(div);
  }
  monLogSeq = events.length;
  if (nearBottom || reset) box.scrollTop = box.scrollHeight;
}

function showMonitorList() {
  state.monDetail = null;
}

$("#btn-mon-back").onclick = () => { state.monDetail = null; renderMonitorGrid(); $("#monitor-detail").hidden = true; $("#monitor-pane").hidden = false; };
$("#btn-mon-refresh").onclick = refreshMonitor;
$("#mon-hide-ended").onchange = renderMonitorGrid;
$("#btn-mon-wake").onclick = async () => {
  const s = state.monDetail;
  if (!s || !confirm(`SIGTERM to ${s.agent} (pid ${s.pid})?\nSubagents do not accept new prompts (stdin closed): abort is the only nudge. The parent session will see the failure and can re-launch.`)) return;
  try {
    const r = await api("POST", "/api/monitor/wake", { path: s.path });
    toast(`abort signal sent to pid ${r.pid}`);
    setTimeout(refreshMonitor, 1200);
  } catch (e) { toast(e.message, true); }
};

/* ── right rail actions ── */

$$(".sbtn").forEach((b) => b.onclick = async () => {
  if (!state.selected) return;
  try {
    const updated = await api("POST", "/api/status", { path: state.selected.path, status: b.dataset.status });
    toast(`status → ${b.dataset.status}`);
    Object.assign(state.selected, updated);
    await loadDocs();
    selectDoc(state.selected);
  } catch (e) { toast(e.message, true); }
});

/* generic confirm modal */
function confirmAction(title, text, yesLabel = "confirm") {
  return new Promise((resolve) => {
    $("#confirm-title").textContent = title;
    $("#confirm-text").textContent = text;
    const yes = $("#btn-confirm-yes");
    yes.textContent = yesLabel;
    $("#confirm-modal").hidden = false;
    const done = (v) => { $("#confirm-modal").hidden = true; yes.onclick = null; resolve(v); };
    yes.onclick = () => done(true);
    $("#btn-confirm-no").onclick = () => done(false);
  });
}

$("#btn-move").onclick = async () => {
  if (!state.selected) return;
  const dest = $("#move-dest").value.trim();
  if (!dest) return toast("set a destination dir first", true);
  const ok = await confirmAction("move file",
    `${state.selected.name}\n\nfrom:\n${state.selected.parent}\n\nto:\n${dest}`,
    "move");
  if (!ok) return;
  try {
    const moved = await api("POST", "/api/move", { path: state.selected.path, dest });
    toast(`moved → ${moved.path}`);
    state.selected = moved;
    await loadDocs();
    selectDoc(moved);
  } catch (e) { toast(e.message, true); }
};

$("#btn-delete").onclick = async () => {
  if (!state.selected) return;
  const ok = await confirmAction("delete file",
    `${state.selected.name}\n\n${state.selected.path}\n\nThis cannot be undone.`,
    "delete");
  if (!ok) return;
  try {
    await api("POST", "/api/delete", { path: state.selected.path });
    toast("deleted");
    state.selected = null;
    $("#actions").hidden = true;
    $("#actions-empty").hidden = false;
    $("#tabs").hidden = true;
    $("#viewer").hidden = true;
    $("#empty-state").hidden = false;
    await loadDocs();
  } catch (e) { toast(e.message, true); }
};

$("#btn-rescan").onclick = () => { loadDocs(); toast("rescanned"); };

$("#btn-validate").onclick = async () => {
  $("#validate-modal").hidden = false;
  $("#validate-summary").textContent = "running…";
  $("#validate-issues").innerHTML = "";
  try {
    const r = await api("GET", "/api/validate");
    const n = r.issues.length;
    $("#validate-summary").textContent = n === 0
      ? `✓ ${r.checked} docs checked — no drift`
      : `${r.checked} docs checked — ${n} issue(s): ` + Object.entries(r.counts).map(([k, v]) => `${k} ×${v}`).join(", ");
    $("#validate-issues").innerHTML = r.issues.map((it) =>
      `<div class="vrow"><span class="vtype ${it.type}">${it.type}</span><span class="vpath" title="${esc(it.path)}">${esc(it.path)}</span><span class="vdetail">${esc(it.detail)}</span></div>`
    ).join("");
  } catch (e) {
    $("#validate-summary").textContent = "error: " + e.message;
  }
};
$("#btn-close-validate").onclick = () => { $("#validate-modal").hidden = true; };

/* Esc closes any open modal (roots/validate first; confirm resolves as "no") */
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!$("#roots-modal").hidden) { $("#roots-modal").hidden = true; loadDocs(); return; }
  if (!$("#validate-modal").hidden) { $("#validate-modal").hidden = true; return; }
  if (!$("#confirm-modal").hidden) $("#btn-confirm-no").click();
});

$("#btn-theme").onclick = () => {
  state.theme = state.theme === "dark" ? "light" : "dark";
  applyTheme();
};
function applyTheme() {
  document.body.classList.toggle("light", state.theme === "light");
  $("#btn-theme").textContent = state.theme === "dark" ? "☀ light" : "☾ dark";
  localStorage.setItem("roz-theme", state.theme);
}
applyTheme();

$("#search").oninput = (e) => { state.search = e.target.value; renderList(); };
$$("#status-filters .fchip").forEach((b) => b.onclick = () => {
  $$("#status-filters .fchip").forEach((x) => x.classList.remove("active"));
  b.classList.add("active");
  state.filter = b.dataset.f;
  renderList();
});

/* ── roots modal ── */

$("#btn-roots").onclick = async () => {
  $("#roots-modal").hidden = false;
  const { roots } = await api("GET", "/api/roots");
  const ul = $("#roots-list");
  ul.innerHTML = "";
  for (const r of roots) {
    const li = document.createElement("li");
    li.innerHTML = `<span>${esc(r)}</span>`;
    const del = document.createElement("button");
    del.className = "ghost sm"; del.textContent = "×";
    del.onclick = async () => { await api("DELETE", "/api/roots", { path: r }); $("#btn-roots").click(); loadDocs(); };
    li.appendChild(del);
    ul.appendChild(li);
  }
};
$("#btn-close-roots").onclick = () => { $("#roots-modal").hidden = true; loadDocs(); };
$("#btn-add-root").onclick = async () => {
  const p = $("#new-root").value.trim();
  if (!p) return;
  try {
    await api("POST", "/api/roots", { path: p });
    $("#new-root").value = "";
    toast("path added");
    $("#btn-roots").click();
    await loadDocs();
  } catch (e) { toast(e.message, true); }
};

/* ── AI analysis ── */

$("#btn-analyze").onclick = async () => {
  if (!state.selected || state.running) return;
  const btn = $("#btn-analyze");
  btn.disabled = true;
  $("#analysis-log").innerHTML = "";
  eventIndex = 0;
  switchTab("analysis");
  $("#analysis-dot").hidden = false;
  try {
    const { run_id } = await api("POST", "/api/analyze", {
      path: state.selected.path,
      prompt: $("#prompt").value,
      agent: $("#agent").value,
    });
    $("#run-info").textContent = `${run_id} · model ${state.config.model} · agent ${$("#agent").value}`;
    connectWS(run_id);
  } catch (e) {
    toast(e.message, true);
    btn.disabled = false;
  }
};

let wsReconnectTimer = null;

function connectWS(runId) {
  state.running = true;
  state.runId = runId;
  if (state.ws) { try { state.ws.onclose = null; state.ws.close(); } catch {} }
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws/analyze/${runId}?since=${eventIndex}`);
  state.ws = ws;
  ws.onmessage = (e) => handleEvent(JSON.parse(e.data));
  ws.onclose = () => {
    // RPC session may still be alive; try one silent reconnect after 1s
    clearTimeout(wsReconnectTimer);
    wsReconnectTimer = setTimeout(async () => {
      try {
        const st = await api("GET", `/api/analyze/${runId}/state`);
        if (!st.exited && state.runId === runId) connectWS(runId);
        else finishRun();
      } catch { finishRun(); }
    }, 1000);
  };
  ws.onerror = () => {};
  updateChatbar();
}

function updateChatbar(idle = false) {
  const row = $("#chat-input-row");
  row.hidden = !state.runId || !state.running;
  $("#chat-input").placeholder = idle
    ? "session idle — write a follow-up and press ↩"
    : "send a message to the agent…";
}

async function sendFollowup() {
  const input = $("#chat-input");
  const msg = input.value.trim();
  if (!msg || !state.runId) return;
  try {
    await api("POST", "/api/analyze/prompt", { run_id: state.runId, message: msg });
    input.value = "";
    appendEv("user", "you", msg);
  } catch (e) { toast(e.message, true); }
}
$("#btn-send").onclick = sendFollowup;
$("#chat-input").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) sendFollowup(); });
$("#btn-abort").onclick = async () => {
  if (!state.runId) return;
  state.runId = null;
  state.running = false;
  if (state.ws) { try { state.ws.onclose = null; state.ws.close(); } catch {} }
  $("#chat-input-row").hidden = true;
  $("#analysis-dot").hidden = true;
  appendEv("sys", "closed", "analysis session closed from the UI");
};

function finishRun() {
  state.running = false;
  $("#btn-analyze").disabled = false;
  $("#chat-input-row").hidden = true;
  loadDocs(); // status may have changed on disk
}

let curText = null;
let curThink = null;
let eventIndex = 0;   // last seq received; used for resume on reconnect

function handleEvent(ev) {
  eventIndex++;
  const t = ev.type;
  if (t === "session") appendEv("sys", "session", "cwd: " + (ev.cwd || ""));
  else if (t === "agent_start") { appendEv("sys", "agent", "run started · model " + state.config.model); updateChatbar(false); }
  else if (t === "agent_settled") { updateChatbar(true); $("#btn-analyze").disabled = false; }
  else if (t === "message_start") { curText = null; curThink = null; }
  else if (t === "message_update") {
    if (ev.deltaType === "text_delta") streamText(ev.delta);
    else if (ev.deltaType === "thinking_delta") streamThinking(ev.delta);
  }
  else if (t === "message_end") {
    if (ev.role === "assistant" && Array.isArray(ev.content)) {
      for (const part of ev.content) {
        if (part.type === "toolCall" || part.type === "tool_use") {
          appendEv("toolu", "tool · " + (part.name ?? "?"), JSON.stringify(part.arguments ?? part.input ?? {}).slice(0, 800));
        }
      }
    }
    curText = null; curThink = null;
  }
  else if (t === "tool_execution_end") {
    appendEv("toolr", "result · " + (ev.toolName || "?"), (ev.content || "").slice(0, 1200));
  }
  else if (t === "extension_ui_request") {
    if (ev.method === "notify") appendEv("notify", "notify", ev.message || "");
    else if (["select", "confirm", "input", "editor"].includes(ev.method)) renderDialog(ev);
  }
  else if (t === "roz_end") {
    appendEv("sys", "done", "session ended: " + ev.status + (ev.exit_code != null ? ` (exit ${ev.exit_code})` : ""));
    $("#analysis-dot").hidden = true;
    finishRun();
  }
  else if (t === "roz_error") { appendEv("err", "error", ev.message); }
  else if (t === "roz_stderr") { if (!/Dynamic tool activation/.test(ev.message || "")) appendEv("err", "stderr", (ev.message || "").slice(0, 600)); }
}

/* interactive dialogs from pi (ask_user_question, confirmations…) */

function renderDialog(ev) {
  const div = document.createElement("div");
  div.className = "ev dialog";
  div.innerHTML = `<div class="ev-h">the agent asks</div>
    <div class="ev-b"></div><div class="dlg-opts"></div>`;
  div.querySelector(".ev-b").textContent = (ev.title || "") + (ev.message ? "\n" + ev.message : "");
  const opts = div.querySelector(".dlg-opts");

  const respond = async (payload, label) => {
    try {
      await api("POST", "/api/analyze/answer", { run_id: state.runId, request_id: ev.id, payload });
      opts.innerHTML = "";
      const done = document.createElement("div");
      done.className = "dlg-answered";
      done.textContent = "✓ answered: " + label;
      opts.appendChild(done);
      appendEv("user", "you", label);
    } catch (e) { toast(e.message, true); }
  };

  if (ev.method === "confirm") {
    addBtn(opts, "✓ Yes", () => respond({ confirmed: true }, "Yes"));
    addBtn(opts, "✗ No", () => respond({ confirmed: false }, "No"));
  } else if (ev.method === "select") {
    for (const o of (ev.options || [])) addBtn(opts, o, () => respond({ value: o }, o));
  } else {
    const inp = document.createElement(ev.method === "editor" ? "textarea" : "input");
    if (ev.method === "editor") inp.rows = 5;
    inp.placeholder = ev.message || "your answer…";
    opts.appendChild(inp);
    addBtn(opts, "↩ send", () => respond({ value: inp.value }, inp.value.slice(0, 80)));
  }
  addBtn(opts, "cancel", () => respond({ cancelled: true }, "(cancelled)"));

  $("#analysis-log").appendChild(div);
  scrollLog();
}

function addBtn(parent, label, onclick) {
  const b = document.createElement("button");
  b.className = "dlg-opt"; b.textContent = label; b.onclick = onclick;
  parent.appendChild(b);
}

function streamText(delta) {
  if (!curText) curText = appendEv("text", "assistant", "");
  curText.querySelector(".ev-b").textContent += delta;
  scrollLog();
}
function streamThinking(delta) {
  if (!curThink) curThink = appendEv("thinking", "thinking", "");
  curThink.querySelector(".ev-b").textContent += delta;
  if (curThink.querySelector(".ev-b").textContent.length > 4000) curThink = null;
  scrollLog();
}

function appendEv(cls, head, body) {
  const div = document.createElement("div");
  div.className = "ev " + cls;
  div.innerHTML = `<div class="ev-h">${esc(head)}</div><div class="ev-b"></div>`;
  div.querySelector(".ev-b").textContent = body;
  $("#analysis-log").appendChild(div);
  scrollLog();
  return div;
}

function scrollLog() {
  const p = $("#analysis-pane");
  p.scrollTop = p.scrollHeight;
}

/* ── init ── */

(async () => {
  switchTab("doc");
  setInterval(refreshMonitor, 4000);
  setInterval(() => { if (state.tab === "monitor" && state.monDetail) pollMonLog(); }, 2500);
  try {
    await loadConfig();
    await loadDocs();
  } catch (e) {
    toast("backend unreachable: " + e.message, true);
  }
})();
