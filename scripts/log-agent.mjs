import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DATA, ROOT, bootstrap, readJson, readStdinJson } from './lib.mjs';

function parseResponse(r) {
  if (typeof r !== 'string') return r || {};
  try {
    return JSON.parse(r);
  } catch {
    return {};
  }
}

function priceFor(prices, model) {
  if (!model) return null;
  const key = Object.keys(prices).find((k) => model.startsWith(k));
  return key ? prices[key] : null;
}

function costOf(price, u) {
  if (!price || !u) return 0;
  return (
    ((u.input_tokens || 0) * price.input +
      (u.cache_creation_input_tokens || 0) * price.input * price.cache_write_multiplier +
      (u.cache_read_input_tokens || 0) * price.input * price.cache_read_multiplier +
      (u.output_tokens || 0) * price.output) /
    1_000_000
  );
}

function expandHome(p) {
  return p && p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p;
}

// Sums usage over every API request in the subagent transcript; one message id can span several lines.
function sumTranscript(file, prices) {
  const byId = new Map();
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line) continue;
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    const m = e.message;
    if (e.type !== 'assistant' || !m || !m.usage) continue;
    byId.set(m.id || `${byId.size}`, { model: m.model, usage: m.usage });
  }
  const total = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
  const models = new Set();
  let usd = 0;
  let priced = true;
  for (const { model, usage } of byId.values()) {
    if (model) models.add(model);
    for (const k of Object.keys(total)) total[k] += usage[k] || 0;
    const price = priceFor(prices, model);
    if (!price) priced = false;
    usd += costOf(price, usage);
  }
  return { api_calls: byId.size, models: [...models], usage: total, est_usd: priced ? Math.round(usd * 10000) / 10000 : null };
}

try {
  const input = await readStdinJson();
  const event = input.hook_event_name;
  bootstrap();
  const prices = (readJson(path.join(DATA, 'prices.json'), null) || readJson(path.join(ROOT, 'seed', 'prices.json'), {})).models || {};
  const base = {
    ts: new Date().toISOString(),
    env: process.env.CLAUDE_CODE_REMOTE === 'true' ? 'cloud' : 'local',
    session_id: input.session_id || null,
  };
  let row = null;

  if (event === 'PostToolUse' && (input.tool_name === 'Agent' || input.tool_name === 'Task')) {
    const ti = input.tool_input || {};
    const tr = parseResponse(input.tool_response ?? input.tool_output);
    row = {
      ...base,
      event: 'call',
      agent_id: tr.agentId || null,
      subagent_type: ti.subagent_type || 'general-purpose',
      requested_model: ti.model || null,
      resolved_model: tr.resolvedModel || null,
      status: tr.status || null,
      duration_ms: tr.totalDurationMs ?? null,
      tool_uses: tr.totalToolUseCount ?? null,
      description: (ti.description || '').slice(0, 120),
    };
  } else if (event === 'SubagentStop') {
    const file = expandHome(input.agent_transcript_path);
    const sums = file && fs.existsSync(file) ? sumTranscript(file, prices) : null;
    row = { ...base, event: 'usage', agent_id: input.agent_id || null, subagent_type: input.agent_type || null, ...(sums || {}) };
  }

  if (row) {
    fs.mkdirSync(DATA, { recursive: true });
    fs.appendFileSync(path.join(DATA, 'telemetry.jsonl'), JSON.stringify(row) + '\n');
  }
} catch (err) {
  process.stderr.write(`model-router log-agent: ${err.message}\n`);
}
process.exit(0);
