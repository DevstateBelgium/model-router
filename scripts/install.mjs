// Installs model-router as a skills-directory plugin, optionally live for the running session.
// Usage: node scripts/install.mjs [--scope user|project] [--project-dir <dir>] [--live] [--force]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SHIM_MARKER, SHIM_SKILL_DIR, TIERS, arg, removeShims } from './lib.mjs';

const SOURCE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['.git', 'node_modules', 'tsconfig.json']);
const scope = arg('scope') || 'user';
const live = process.argv.includes('--live');
const force = process.argv.includes('--force');
if (!['user', 'project'].includes(scope)) {
  console.log('--scope must be "user" or "project".');
  process.exit(1);
}

const home = os.homedir();
const projectDir = path.resolve(arg('project-dir') || process.cwd());
const claudeDir = scope === 'user' ? path.join(home, '.claude') : path.join(projectDir, '.claude');
const target = path.join(claudeDir, 'skills', 'model-router');
// The id Claude Code derives for "model-router@skills-dir"; the loaded plugin uses the same folder.
const dataDir = path.join(home, '.claude', 'plugins', 'data', 'model-router-skills-dir');
const fwd = (p) => p.replace(/\\/g, '/');
const out = [];

// Only directories that existed before this run are watched by the running session.
const watched = {
  [path.join(home, '.claude', 'skills')]: fs.existsSync(path.join(home, '.claude', 'skills')),
  [path.join(home, '.claude', 'agents')]: fs.existsSync(path.join(home, '.claude', 'agents')),
  [path.join(projectDir, '.claude', 'skills')]: fs.existsSync(path.join(projectDir, '.claude', 'skills')),
  [path.join(projectDir, '.claude', 'agents')]: fs.existsSync(path.join(projectDir, '.claude', 'agents')),
};

function copyTree(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      if (fwd(from).endsWith('.claude-plugin/types')) continue;
      copyTree(from, to);
    } else fs.copyFileSync(from, to);
  }
}

// 1. Plugin files
if (path.resolve(SOURCE) === path.resolve(target)) {
  out.push(`plugin: already in place at ${fwd(target)}`);
} else {
  if (fs.existsSync(target)) {
    if (!force) {
      const existing = JSON.parse(fs.readFileSync(path.join(target, '.claude-plugin', 'plugin.json'), 'utf8')).version;
      console.log(`${fwd(target)} already exists (version ${existing}). Re-run with --force to replace it; the old copy is moved to ${fwd(path.join(claudeDir, 'backups'))}/.`);
      process.exit(2);
    }
    // Outside skills/: a copy left there would load as a second plugin with the same name.
    const backup = path.join(claudeDir, 'backups', `model-router-${Date.now()}`);
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.renameSync(target, backup);
    out.push(`previous install moved to ${fwd(backup)}`);
  }
  copyTree(SOURCE, target);
  out.push(`plugin: installed to ${fwd(target)} (loads as model-router@skills-dir at the next session start or /reload-plugins)`);
}

// 2. Data folder, seeded the same way the plugin's SessionStart hook seeds it
let doctor = {};
try {
  doctor = JSON.parse(execFileSync(process.execPath, [path.join(target, 'scripts', 'doctor.mjs'), '--data', dataDir], { encoding: 'utf8' }));
  out.push(`data: ${fwd(dataDir)}`);
} catch (err) {
  out.push(`data: could not seed ${fwd(dataDir)}: ${err.message}`);
}

// 3. Live shims: plain skill and agents, which Claude Code hot-loads from watched directories
function pickDir(kind) {
  const preferred = path.join(claudeDir, kind);
  const other = path.join(scope === 'user' ? path.join(projectDir, '.claude') : path.join(home, '.claude'), kind);
  if (watched[preferred]) return { dir: preferred, isLive: true };
  if (watched[other]) return { dir: other, isLive: true };
  return { dir: preferred, isLive: false };
}

function withMarker(markdown) {
  return markdown.replace(/^---\r?\n/, `---\n# ${SHIM_MARKER} (removed automatically once the plugin loads)\n`);
}

function renderSkill() {
  const root = fwd(target);
  const data = fwd(dataDir);
  let text = fs.readFileSync(path.join(target, 'skills', 'run', 'SKILL.md'), 'utf8');
  text = text
    .replace(/^name: run$/m, `name: ${SHIM_SKILL_DIR}`)
    .replace(/^description: /m, 'description: (Live install, active until the model-router plugin loads.) ')
    .replaceAll('${CLAUDE_PLUGIN_DATA}', data)
    .replaceAll('${CLAUDE_PLUGIN_ROOT}', root)
    .replaceAll('${user_config.knowledge_repo}', '')
    .replace(/model-router:(scout|builder|engineer|senior|architect)/g, 'model-router-$1')
    .replace(/\/model-router:(pull|push|stats|setup)/g, 'the $1 command (see "Commands in live mode")')
    .replace(/`\/router`/g, 'the `/router` pane (available once the plugin loads)');
  text += `
## Commands in live mode

The plugin's hooks, mod and slash commands load at the next session start (or when the user runs \`/reload-plugins\`). Until then, run the scripts directly with the Bash or PowerShell tool:

- setup: \`node "${root}/scripts/doctor.mjs" --data "${data}"\`, then follow \`${root}/skills/setup/SKILL.md\` with CLAUDE_PLUGIN_ROOT=${root} and CLAUDE_PLUGIN_DATA=${data}
- stats: \`node "${root}/scripts/stats.mjs" --data "${data}"\` (empty until the hooks run)
- pull: \`node "${root}/scripts/sync.mjs" pull --data "${data}"\`
- push: \`node "${root}/scripts/sync.mjs" push --data "${data}"\`

Automatic telemetry is off in live mode, so the rows you log in \`pending-runs.md\` are the only record.
`;
  return withMarker(text);
}

function frontmatter(markdown, key) {
  return markdown.match(new RegExp(`^${key}: (.*)$`, 'm'))?.[1]?.trim() ?? '';
}

// A forked skill runs in a subagent on its own model and effort, so it stands in for an agent
// where only the skills folder is watched (cloud sessions start without ~/.claude/agents).
function tierSkill(tier) {
  const src = fs.readFileSync(path.join(target, 'agents', `${tier}.md`), 'utf8');
  const body = src.replace(/^---[\s\S]*?\n---\r?\n/, '').trim();
  return withMarker(`---
name: model-router-${tier}
description: ${frontmatter(src, 'description').replace('Use only through the model-router skill.', 'Runs as a forked subagent; invoke through the Skill tool with a self-contained brief as the argument. Live install only.')}
context: fork
agent: general-purpose
model: ${frontmatter(src, 'model')}
effort: ${frontmatter(src, 'effort')}
background: false
---

${body}

## Your brief

$ARGUMENTS
`);
}

const LIVE_NOTES = {
  agents: 'Tiers in this session are agents: spawn them with `subagent_type` `model-router-<tier>`.',
  skills:
    'Tiers in this session are forked skills, not agents: call the Skill tool with skill `model-router-<tier>` and the complete brief as its argument. Each runs in its own subagent on the pinned model and effort and returns its report. Read every "spawn"/"subagent_type" instruction below that way.',
  none: 'Tier agents are not available in this session: use `general-purpose` with the tier\'s model ID in `model` (effort stays the default) and log the effort as `default`.',
};

if (live) {
  removeShims([path.join(home, '.claude'), path.join(projectDir, '.claude')]);
  const skillDir = pickDir('skills');
  const agentDir = pickDir('agents');
  const tierMode = agentDir.isLive ? 'agents' : skillDir.isLive ? 'skills' : 'none';

  const skillFile = path.join(skillDir.dir, SHIM_SKILL_DIR, 'SKILL.md');
  fs.mkdirSync(path.dirname(skillFile), { recursive: true });
  fs.writeFileSync(skillFile, renderSkill().replace(/\n# Model Router\n/, `\n# Model Router\n\n> Live mode: ${LIVE_NOTES[tierMode]}\n`));
  out.push(
    skillDir.isLive
      ? `live skill: ${fwd(skillFile)} (hot-loaded as /${SHIM_SKILL_DIR} within seconds)`
      : `live skill: ${fwd(skillFile)} written, but its directory did not exist at session start, so it is NOT hot-loaded. Read that file and follow it for this session.`,
  );

  if (tierMode === 'agents') {
    for (const tier of TIERS) {
      const src = fs.readFileSync(path.join(target, 'agents', `${tier}.md`), 'utf8');
      fs.writeFileSync(path.join(agentDir.dir, `model-router-${tier}.md`), withMarker(src.replace(/^name: .*$/m, `name: model-router-${tier}`)));
    }
    out.push(`live tiers: agents model-router-scout, -builder, -engineer, -senior, -architect in ${fwd(agentDir.dir)} (hot-loaded; model and effort pinned)`);
  } else if (tierMode === 'skills') {
    for (const tier of TIERS) {
      const file = path.join(skillDir.dir, `model-router-${tier}`, 'SKILL.md');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, tierSkill(tier));
    }
    out.push(
      `live tiers: no agents folder was watched at session start, so the tiers are forked skills model-router-scout, -builder, -engineer, -senior, -architect in ${fwd(skillDir.dir)} (hot-loaded; each runs as a subagent with its model and effort pinned). Invoke them with the Skill tool.`,
    );
  } else {
    out.push(`live tiers: neither an agents nor a skills folder was watched at session start. ${LIVE_NOTES.none}`);
  }
}

console.log(out.join('\n'));
console.log(`\nNEXT: ${doctor.configuredAt ? 'already configured; nothing else to do.' : `run the first-run configuration now: \`node "${fwd(target)}/scripts/doctor.mjs" --data "${fwd(dataDir)}"\`, then follow ${fwd(target)}/skills/setup/SKILL.md (CLAUDE_PLUGIN_ROOT=${fwd(target)}, CLAUDE_PLUGIN_DATA=${fwd(dataDir)}).`}`);
if (doctor.env === 'cloud')
  console.log('CLOUD: this container is temporary. To have model-router in every new cloud session from the start, add this line to the environment\'s setup script:\n  git clone --depth 1 https://github.com/DevstateBelgium/model-router ~/.claude/skills/model-router || true');
