// Usage: node doctor.mjs --data <dir> [--repo <owner/repo>] [--mark-configured]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { DATA, ROOT, arg, bootstrap, knowledgeRepo, readJson, writeJson } from './lib.mjs';

const MODS_MIN = [2, 1, 287];

function exec(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 }).trim();
}

function run(cmd, args) {
  try {
    return { ok: true, out: exec(cmd, args) };
  } catch (err) {
    // npm installs the CLIs as .cmd shims on Windows, which only cmd.exe resolves.
    if (err.code === 'ENOENT' && process.platform === 'win32') {
      try {
        return { ok: true, out: exec('cmd.exe', ['/d', '/s', '/c', cmd, ...args]) };
      } catch (err2) {
        return { ok: false, out: `${err2.stderr || err2.message || ''}`.trim() };
      }
    }
    return { ok: false, out: `${err.stderr || err.message || ''}`.trim() };
  }
}

function versionAtLeast(v, min) {
  const parts = (v.match(/\d+\.\d+\.\d+/)?.[0] || '0.0.0').split('.').map(Number);
  for (let i = 0; i < 3; i++) if (parts[i] !== min[i]) return parts[i] > min[i];
  return true;
}

bootstrap();
const stateFile = path.join(DATA, 'state.json');
const state = readJson(stateFile, {});

if (process.argv.includes('--mark-configured')) {
  const repo = (arg('repo') || '').trim();
  if (repo) writeJson(path.join(DATA, 'config.json'), { ...readJson(path.join(DATA, 'config.json'), {}), knowledge_repo: repo });
  writeJson(stateFile, { ...state, configuredAt: new Date().toISOString() });
  console.log(`Configured. Knowledge repo: ${repo || knowledgeRepo() || 'none (local-only)'}.`);
  process.exit(0);
}

const claude = run('claude', ['--version']);
const gh = run('gh', ['--version']);
const ghAuth = gh.ok ? run('gh', ['auth', 'status']) : { ok: false };
const ghUser = ghAuth.ok ? run('gh', ['api', 'user', '--jq', '.login']) : { ok: false, out: '' };
const home = path.join(os.homedir(), '.claude');
const nodeMajor = Number(process.versions.node.split('.')[0]);

const report = {
  env: process.env.CLAUDE_CODE_REMOTE === 'true' ? 'cloud' : 'local',
  platform: process.platform,
  node: { version: process.versions.node, ok: nodeMajor >= 18 },
  claudeCode: claude.ok ? { version: claude.out.split(/\s/)[0], modsSupported: versionAtLeast(claude.out, MODS_MIN) } : { version: null, modsSupported: null },
  gh: { installed: gh.ok, authenticated: ghAuth.ok, user: ghUser.ok ? ghUser.out : null },
  pluginRoot: ROOT.replace(/\\/g, '/'),
  dataDir: DATA.replace(/\\/g, '/'),
  knowledgeRepo: knowledgeRepo() || null,
  configuredAt: state.configuredAt || null,
  watchedDirs: {
    userSkills: fs.existsSync(path.join(home, 'skills')),
    userAgents: fs.existsSync(path.join(home, 'agents')),
  },
};
console.log(JSON.stringify(report, null, 2));
