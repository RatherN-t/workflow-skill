// One dashboard for every Claude Code workflow of a session, on one port: shows the workflows that are running or finished in the last
// few hours, newest first. Usage: node wf-hub.mjs <session dir> [port=8780] [hours=6]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const SESSION = process.argv[2];
const PORT = Number(process.argv[3] || 8780);
const HOURS = Number(process.argv[4] || 6);
const WF_DIR = path.join(SESSION, "subagents", "workflows");
const META_DIR = path.join(SESSION, "workflows");

const readJsonl = (f) => { try { return fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { return []; } };
const mtime = (f) => { try { return fs.statSync(f).mtimeMs; } catch { return 0; } };

function activity(dir, agentId) {
  let tools = 0, last = "";
  for (const r of readJsonl(path.join(dir, `agent-${agentId}.jsonl`))) {
    const c = r?.message?.content;
    if (!Array.isArray(c)) continue;
    for (const b of c) if (b.type === "tool_use") {
      tools++;
      const i = b.input || {};
      last = `${b.name}: ${String(i.description || i.file_path || i.pattern || i.command || i.url || "").replace(/\s+/g, " ").slice(0, 110)}`;
    }
  }
  return { tools, last };
}

function workflow(id) {
  const dir = path.join(WF_DIR, id);
  const journalFile = path.join(dir, "journal.jsonl");
  const journal = readJsonl(journalFile);
  const agents = new Map();
  for (const e of journal) {
    if (!e.agentId && !e.key) continue;
    const k = e.key || e.agentId;
    const a = agents.get(k) || { label: e.label, phase: e.phase, status: "running" };
    if (e.agentId) a.agentId = e.agentId;
    if (e.label) a.label = e.label;
    if (e.phase) a.phase = e.phase;
    if (e.type === "started") a.status = "running";
    else if (e.type === "result" && e.agentId) a.status = "done";
    else if (/error|fail|died|skip/i.test(e.type)) a.status = "failed";
    agents.set(k, a);
  }
  let meta = null;
  try { meta = JSON.parse(fs.readFileSync(path.join(META_DIR, `${id}.json`), "utf8")); } catch {}
  // A running workflow has no metadata file yet; its persisted script is named "<name>-<id>.js".
  let scriptName = null;
  try { scriptName = fs.readdirSync(path.join(META_DIR, "scripts")).find((f) => f.endsWith(`-${id}.js`))?.slice(0, -(id.length + 4)); } catch {}
  let names = {};
  try { names = JSON.parse(fs.readFileSync(new URL("./wf-names.json", import.meta.url), "utf8")); } catch {}
  const name = names[id] || meta?.workflowName || (meta?.script && /name:\s*'([^']+)'/.exec(meta.script)?.[1]) || scriptName || [...agents.values()][0]?.label?.split(" ")[0] || id;
  const lastWrite = mtime(journalFile);
  // An agent left "started" by a stopped run is not running: nothing in its workflow has been written for 45 minutes.
  const stale = Date.now() - Math.max(lastWrite, ...[...agents.values()].map((a) => (a.agentId ? mtime(path.join(dir, `agent-${a.agentId}.jsonl`)) : 0))) > 45 * 60000;
  const list = [...agents.values()].map((a) => ({ ...a, ...(stale && a.status === "running" ? { status: "failed" } : {}), ...(a.agentId ? activity(dir, a.agentId) : {}) }));
  const phases = [...new Set(list.map((a) => a.phase).filter(Boolean))];
  const running = list.some((a) => a.status === "running");
  const finished = !!meta || (!running && Date.now() - lastWrite > 180000);
  return { id, name, phases, agents: list, running, finished, lastWrite, logs: journal.filter((e) => e.type === "log").map((e) => e.message).slice(-6) };
}

function state() {
  let ids = [];
  try { ids = fs.readdirSync(WF_DIR).filter((d) => d.startsWith("wf_")); } catch {}
  const cutoff = Date.now() - HOURS * 3600000;
  return ids.map(workflow).filter((w) => w.running || w.lastWrite > cutoff).sort((a, b) => (b.running - a.running) || (b.lastWrite - a.lastWrite));
}

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Workflows</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{--bg:#f1f0ee;--card:#fff;--ink:#141414;--mute:#6b6a67;--line:#e2e0dc;--run:#1f6feb;--ok:#1a7f37;--bad:#cf222e}
@media (prefers-color-scheme:dark){:root{--bg:#141414;--card:#1e1e1e;--ink:#ededed;--mute:#9a9893;--line:#2c2c2c}}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 "Segoe UI Variable","Segoe UI",system-ui,sans-serif}
main{max-width:980px;margin:0 auto;padding:24px 16px} h1{font-size:20px;margin:0 0 4px} h2{font-size:16px;margin:28px 0 6px}
.sub{color:var(--mute);margin:0 0 10px} .phases{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}
.ph{padding:4px 9px;border-radius:999px;border:1px solid var(--line);background:var(--card);color:var(--mute);font-size:12px}
.ph.active{border-color:var(--run);color:var(--run);font-weight:600} .ph.done{color:var(--ok)}
.grid{display:grid;gap:6px}
.ag{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:8px 11px;display:grid;grid-template-columns:auto 1fr auto;gap:2px 10px;align-items:center}
.dot{width:9px;height:9px;border-radius:50%;background:var(--mute)} .running .dot{background:var(--run);animation:p 1.2s infinite} .done .dot{background:var(--ok)} .failed .dot{background:var(--bad)}
@keyframes p{50%{opacity:.35}} @media (prefers-reduced-motion:reduce){.running .dot{animation:none}}
.lbl{font-weight:600} .meta{color:var(--mute);font-size:12px} .last{grid-column:2/4;color:var(--mute);font:12px ui-monospace,Consolas,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
details.doneagents summary{cursor:pointer;color:var(--mute);margin:6px 0}
.logs{color:var(--mute);font:12px ui-monospace,Consolas,monospace;white-space:pre-wrap;margin-top:6px}
</style></head><body><main><h1>Workflows</h1><p class="sub" id="sub">loading…</p><div id="wfs"></div></main>
<script>
function esc(t){return String(t??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
const card=a=>'<div class="ag '+a.status+'"><span class="dot"></span><span class="lbl">'+esc(a.label)+'</span><span class="meta">'+esc(a.phase)+' · '+(a.tools||0)+' tool calls</span><span class="last">'+esc(a.last)+'</span></div>';
async function tick(){
  const ws = await (await fetch('/state')).json();
  document.getElementById('sub').textContent = ws.filter(w=>w.running).length+' running · '+ws.length+' shown (last ${HOURS} h) · refreshes every 3 s';
  document.getElementById('wfs').innerHTML = ws.map(w=>{
    const run = new Set(w.agents.filter(a=>a.status==='running').map(a=>a.phase));
    const live = w.agents.filter(a=>a.status!=='done').reverse(), done = w.agents.filter(a=>a.status==='done').reverse();
    return '<h2>'+esc(w.name)+' <span class="meta">'+(w.finished?'finished':'live')+' · '+done.length+'/'+w.agents.length+' done</span></h2>'
      +'<div class="phases">'+w.phases.map(p=>'<span class="ph '+(run.has(p)?'active':'done')+'">'+esc(p)+'</span>').join('')+'</div>'
      +'<div class="grid">'+live.map(card).join('')+'</div>'
      +(done.length?'<details class="doneagents"><summary>'+done.length+' finished agents</summary><div class="grid">'+done.map(card).join('')+'</div></details>':'')
      +(w.logs.length?'<div class="logs">'+esc(w.logs.join('\\n'))+'</div>':'');
  }).join('');
}
tick(); setInterval(tick,3000);
</script></body></html>`;

http.createServer((req, res) => {
  if (req.url === "/state") { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(state())); return; }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(PAGE);
}).listen(PORT, "127.0.0.1", () => console.log(`workflows hub http://127.0.0.1:${PORT}/`));
