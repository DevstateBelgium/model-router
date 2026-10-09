// Usage: node sync.mjs <pull|push|init|status> --data <dir> --repo <owner/repo> [--trailer "<line>"]...
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { DATA, bootstrap, knowledgeRepo, readJson, writeJson, tableRows } from './lib.mjs';

const MIRRORED = {
  'knowledge/models.md': 'mirror/models.md',
  'knowledge/runs.md': 'mirror/runs.md',
  'knowledge/boundaries.md': 'mirror/boundaries.md',
  'CHANGELOG.md': 'mirror/CHANGELOG.md',
};
const PROPOSABLE = ['knowledge/models.md', 'knowledge/boundaries.md'];
const TELEMETRY_REMOTE = 'knowledge/telemetry.jsonl';

const cmd = process.argv[2];
const repo = knowledgeRepo();
const stateFile = path.join(DATA, 'state.json');
const trailers = process.argv.flatMap((a, i, all) => (a === '--trailer' && all[i + 1] ? [all[i + 1]] : []));

function fail(msg, code = 1) {
  console.log(msg);
  process.exit(code);
}

// MODEL_ROUTER_GH points at a Node script that fakes gh, for offline tests.
function gh(args, input) {
  const fake = process.env.MODEL_ROUTER_GH;
  if (fake) return execFileSync(process.execPath, [fake, ...args], { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  return execFileSync('gh', args,{ input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 200 * 1024 * 1024 });
}

function ghError(err) {
  return `${err.stderr || ''}${err.stdout || ''}${err.message || ''}`;
}

function getFile(p) {
  let meta;
  try {
    meta = JSON.parse(gh(['api', `repos/${repo}/contents/${p}`]));
  } catch (err) {
    if (/404|Not Found/i.test(ghError(err))) return null;
    throw err;
  }
  let text = Buffer.from(meta.content || '', 'base64').toString('utf8');
  if (!meta.content && meta.size > 0) text = gh(['api', '-H', 'Accept: application/vnd.github.raw', `repos/${repo}/contents/${p}`]);
  return { sha: meta.sha, text };
}

function putFile(p, text, sha, message) {
  const body = { message: [message, '', ...trailers].join('\n').trim(), content: Buffer.from(text, 'utf8').toString('base64') };
  if (sha) body.sha = sha;
  const res = JSON.parse(gh(['api', '-X', 'PUT', `repos/${repo}/contents/${p}`, '--input', '-'], JSON.stringify(body)));
  return { sha: res.content.sha, url: res.commit.html_url };
}

function local(rel) {
  return path.join(DATA, rel);
}

function readLocal(rel) {
  try {
    return fs.readFileSync(local(rel), 'utf8');
  } catch {
    return '';
  }
}

const isProposal = (l) => /^\s*(-|\|)/.test(l) && /\(proposed\)/i.test(l);

function proposedLines(text) {
  return text.split(/\r?\n/).filter(isProposal);
}

function stripProposed(text) {
  return text
    .split(/\r?\n/)
    .map((l) => (isProposal(l) ? l.replace(/\s*\(proposed\)/gi, '') : l))
    .join('\n');
}

function ensureReady() {
  if (!repo) fail('No knowledge repo configured. Set it with /config (model-router > Knowledge repo) or in config.json in the data dir. Running local-only.');
  try {
    gh(['auth', 'status']);
  } catch {
    fail('gh is not installed or not authenticated. Run "gh auth login", or in a cloud session add the repo with push access, then retry.');
  }
}

function pull(state) {
  const shas = {};
  const fetched = Object.entries(MIRRORED).map(([remote, rel]) => [remote, rel, getFile(remote)]);
  const missing = fetched.filter(([, , f]) => !f).map(([remote]) => remote);
  if (missing.length)
    fail(`${repo} is not a complete knowledge repo (missing ${missing.join(', ')}). Nothing was changed locally. Run /model-router:setup ${repo} to seed it.`);
  for (const [remote, rel, f] of fetched) {
    let text = f.text;
    if (PROPOSABLE.includes(remote)) {
      const keep = proposedLines(readLocal(rel)).filter((l) => !text.includes(l));
      if (keep.length) text = text.replace(/\s*$/, '\n') + keep.join('\n') + '\n';
    }
    fs.mkdirSync(path.dirname(local(rel)), { recursive: true });
    fs.writeFileSync(local(rel), text);
    shas[remote] = f.sha;
  }
  Object.assign(state, { lastPull: new Date().toISOString(), shas });
  writeJson(stateFile, state);
  const runs = tableRows(local('mirror/runs.md')).length;
  const lastLog = readLocal('mirror/CHANGELOG.md').split(/\r?\n/).filter((l) => l.startsWith('- ')).pop() || 'none';
  const pending = tableRows(local('pending-runs.md')).length;
  console.log(`Pulled ${repo}: runs.md has ${runs} rows. Latest changelog: ${lastLog.slice(2, 80)}. Pending local rows: ${pending}.`);
}

function push(state) {
  const pendingRows = tableRows(local('pending-runs.md'));
  const telemetryLines = readLocal('telemetry.jsonl').split(/\r?\n/).filter(Boolean);
  const newTelemetry = telemetryLines.slice(state.telemetryPushed || 0);
  const proposals = PROPOSABLE.filter((r) => proposedLines(readLocal(MIRRORED[r])).length);
  if (!pendingRows.length && !newTelemetry.length && !proposals.length) fail('Nothing to push.', 0);

  if (!getFile('knowledge/runs.md')) fail(`${repo} is not set up as a knowledge repo. Run /model-router:setup ${repo} first.`);
  for (const remote of proposals) {
    const f = getFile(remote);
    if (f && f.sha !== state.shas?.[remote])
      fail(`Conflict: ${remote} changed in ${repo} since your last pull. Run pull (it keeps your proposed lines), then push again.`, 2);
  }

  const env = process.env.CLAUDE_CODE_REMOTE === 'true' ? 'cloud' : 'local';
  const summary = [`${pendingRows.length} runs`, `${newTelemetry.length} telemetry events`, proposals.length ? 'boundary/model changes' : '']
    .filter(Boolean)
    .join(', ');
  const message = `model-router: ${summary}`;
  const changed = [];
  let commitUrl = '';
  state.shas = state.shas || {};

  try {
    if (pendingRows.length) {
      const f = getFile('knowledge/runs.md') || { text: readLocal('mirror/runs.md'), sha: undefined };
      const ids = new Set(f.text.split(/\r?\n/).map((l) => l.split('|')[1]?.trim()));
      const add = pendingRows.filter((r) => !ids.has(r.split('|')[1]?.trim()));
      const text = f.text.replace(/\s*$/, '\n') + (add.length ? add.join('\n') + '\n' : '');
      const r = putFile('knowledge/runs.md', text, f.sha, message);
      fs.writeFileSync(local('mirror/runs.md'), text);
      state.shas['knowledge/runs.md'] = r.sha;
      commitUrl = r.url;
      changed.push(`knowledge/runs.md (+${add.length})`);
    }

    if (newTelemetry.length) {
      const f = getFile(TELEMETRY_REMOTE);
      const text = (f ? f.text.replace(/\s*$/, '\n').replace(/^\n$/, '') : '') + newTelemetry.join('\n') + '\n';
      const r = putFile(TELEMETRY_REMOTE, text, f?.sha, message);
      state.telemetryPushed = telemetryLines.length;
      commitUrl = r.url;
      changed.push(`${TELEMETRY_REMOTE} (+${newTelemetry.length})`);
    }

    for (const remote of proposals) {
      const f = getFile(remote);
      const text = stripProposed(readLocal(MIRRORED[remote]));
      const r = putFile(remote, text, f?.sha, message);
      fs.writeFileSync(local(MIRRORED[remote]), text);
      state.shas[remote] = r.sha;
      commitUrl = r.url;
      changed.push(remote);
    }

    const cl = getFile('CHANGELOG.md') || { text: '# CHANGELOG\n', sha: undefined };
    const line = `- ${new Date().toISOString().slice(0, 10)}: push from ${env}: ${summary}.`;
    const clText = cl.text.replace(/\s*$/, '\n') + line + '\n';
    const r = putFile('CHANGELOG.md', clText, cl.sha, message);
    fs.writeFileSync(local('mirror/CHANGELOG.md'), clText);
    state.shas['CHANGELOG.md'] = r.sha;
    commitUrl = r.url;
    changed.push('CHANGELOG.md');
  } catch (err) {
    writeJson(stateFile, state);
    const e = ghError(err);
    if (/409|conflict|does not match/i.test(e)) fail(`Conflict while pushing. Pushed so far: ${changed.join(', ') || 'nothing'}. Run pull, then push again.`, 2);
    fail(`Push failed after: ${changed.join(', ') || 'nothing'}.\n${e.slice(0, 500)}`);
  }

  if (pendingRows.length) {
    const kept = readLocal('pending-runs.md')
      .split(/\r?\n/)
      .filter((l) => !pendingRows.includes(l));
    fs.writeFileSync(local('pending-runs.md'), kept.join('\n').replace(/\s*$/, '\n'));
  }
  state.lastPush = new Date().toISOString();
  writeJson(stateFile, state);
  console.log(`Pushed to ${repo}: ${changed.join(', ')}. Last commit: ${commitUrl}`);
}

function init(state) {
  let exists = true;
  try {
    gh(['repo', 'view', repo, '--json', 'name']);
  } catch {
    exists = false;
  }
  if (!exists) {
    gh(['repo', 'create', repo, '--private', '--description', 'model-router shared routing knowledge']);
    console.log(`Created private repo ${repo}.`);
  }
  const seeded = [];
  for (const [remote, rel] of Object.entries(MIRRORED)) {
    if (getFile(remote)) continue;
    const text = stripProposed(readLocal(rel));
    putFile(remote, text, undefined, `model-router: seed ${remote}`);
    seeded.push(remote);
  }
  console.log(seeded.length ? `Seeded ${seeded.join(', ')}.` : 'Repo already has all knowledge files.');
  pull(state);
}

function status(state) {
  console.log(
    JSON.stringify(
      {
        data: DATA,
        repo: repo || null,
        lastPull: state.lastPull || null,
        lastPush: state.lastPush || null,
        pendingRows: tableRows(local('pending-runs.md')).length,
        unpushedTelemetry: readLocal('telemetry.jsonl').split(/\r?\n/).filter(Boolean).length - (state.telemetryPushed || 0),
      },
      null,
      2,
    ),
  );
}

bootstrap();
const state = readJson(stateFile, {});
if (cmd === 'status') status(state);
else {
  ensureReady();
  if (cmd === 'pull') pull(state);
  else if (cmd === 'push') push(state);
  else if (cmd === 'init') init(state);
  else fail('Usage: node sync.mjs <pull|push|init|status> --data <dir> --repo <owner/repo>');
}
