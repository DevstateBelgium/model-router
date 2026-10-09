import fs from 'node:fs';
import path from 'node:path';
import { DATA, arg, bootstrap, tableRows } from './lib.mjs';

bootstrap();
let events = [];
try {
  events = fs
    .readFileSync(path.join(DATA, 'telemetry.jsonl'), 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
} catch {}

const days = Number(arg('days')) || 0;
if (days > 0) {
  const cutoff = Date.now() - days * 86_400_000;
  events = events.filter((e) => Date.parse(e.ts) >= cutoff);
}

const runs = new Map();
for (const e of events) {
  const id = e.agent_id || `${e.ts}-${e.event}`;
  const r = runs.get(id) || {};
  if (e.event === 'call')
    Object.assign(r, { type: e.subagent_type, model: e.resolved_model, ms: e.duration_ms ?? r.ms, status: e.status, start: Date.parse(e.ts) });
  if (e.event === 'usage') {
    Object.assign(r, { type: r.type || e.subagent_type, usageModel: e.models?.[0], usage: e.usage, usd: e.est_usd, calls: e.api_calls });
    // Background agents report no duration; approximate it from launch to stop.
    if (r.ms == null && r.start) r.ms = Date.parse(e.ts) - r.start;
  }
  runs.set(id, r);
}

const done = [...runs.values()].filter((r) => r.usage || r.status === 'completed');
const pending = tableRows(path.join(DATA, 'pending-runs.md')).length;
console.log(`Telemetry: ${done.length} subagent runs${days ? ` in the last ${days} days` : ''}. Pending log rows: ${pending}.`);
if (!done.length) process.exit(0);

const groups = new Map();
for (const r of done) {
  const key = `${r.type || 'unknown'}\t${r.model || r.usageModel || 'unknown'}`;
  const g = groups.get(key) || { n: 0, inTok: 0, outTok: 0, ms: 0, msN: 0, usd: 0, usdN: 0 };
  g.n += 1;
  if (r.usage) {
    g.inTok += (r.usage.input_tokens || 0) + (r.usage.cache_creation_input_tokens || 0) + (r.usage.cache_read_input_tokens || 0);
    g.outTok += r.usage.output_tokens || 0;
  }
  if (typeof r.ms === 'number') {
    g.ms += r.ms;
    g.msN += 1;
  }
  if (typeof r.usd === 'number') {
    g.usd += r.usd;
    g.usdN += 1;
  }
  groups.set(key, g);
}

console.log('\n| subagent | model | runs | avg in tok | avg out tok | avg sec | est. avg $ | est. total $ |');
console.log('|---|---|---|---|---|---|---|---|');
let total = 0;
for (const [key, g] of [...groups].sort((a, b) => b[1].usd - a[1].usd)) {
  const [type, model] = key.split('\t');
  total += g.usd;
  console.log(
    `| ${type} | ${model} | ${g.n} | ${Math.round(g.inTok / g.n)} | ${Math.round(g.outTok / g.n)} | ${g.msN ? (g.ms / g.msN / 1000).toFixed(1) : 'n/a'} | ${g.usdN ? (g.usd / g.usdN).toFixed(4) : 'n/a'} | ${g.usd.toFixed(4)} |`,
  );
}
console.log(`\nEstimated subagent spend: $${total.toFixed(4)} at list prices from prices.json. Excludes the orchestrator's own tokens.`);
