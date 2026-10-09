import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { RouterRow, RouterSession } from '../types'

type Price = { input: number; output: number; cache_write_multiplier: number; cache_read_multiplier: number }
type Usage = { model: string; input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }

const PANE = 'model-router'
const HISTORY_KEY = 'history'
const HISTORY_MAX = 200
const SETUP_KEY = 'setupStartedAt'
export const FIRST_RUN_PROMPT =
  'model-router was just installed. Run its first-run configuration now by invoking the model-router:setup skill, then tell me in one line what was set up.'
const totals = atom({ plugin: 'model-router', key: 'totals' } as const, {})
const agents = atom({ plugin: 'model-router', key: 'agents' } as const, {})
const overrides = atom({ plugin: 'model-router', key: 'overrides' } as const, 0)

let prices: Record<string, Price> = {}

export function priceFor(table: Record<string, Price>, model: string): Price | undefined {
  const key = Object.keys(table).find(k => model.startsWith(k))
  return key ? table[key] : undefined
}

export function costOf(p: Price | undefined, u: Usage): number {
  if (!p) return 0
  return (
    (u.input_tokens * p.input +
      u.cache_creation_input_tokens * p.input * p.cache_write_multiplier +
      u.cache_read_input_tokens * p.input * p.cache_read_multiplier +
      u.output_tokens * p.output) /
    1_000_000
  )
}

export function addUsage(rows: Record<string, RouterRow>, who: string, u: Usage, p: Price | undefined) {
  const key = `${who}|${u.model}`
  const row: RouterRow = rows[key] ?? { who, model: u.model, requests: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, usd: 0, priced: true }
  return {
    ...rows,
    [key]: {
      ...row,
      requests: row.requests + 1,
      input: row.input + u.input_tokens,
      output: row.output + u.output_tokens,
      cacheRead: row.cacheRead + u.cache_read_input_tokens,
      cacheWrite: row.cacheWrite + u.cache_creation_input_tokens,
      usd: row.usd + costOf(p, u),
      priced: row.priced && p !== undefined,
    },
  }
}

const tierName = (type: string) => type.replace(/^model-router:/, '')
const money = (n: number) => `$${n < 10 ? n.toFixed(3) : n.toFixed(2)}`
const kTok = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))

export function summaryLine(rows: RouterRow[]): string {
  const total = rows.reduce((s, r) => s + r.usd, 0)
  const sub = rows.filter(r => r.who !== 'orchestrator').reduce((s, r) => s + r.usd, 0)
  const spawned = new Set(rows.filter(r => r.who !== 'orchestrator').map(r => r.who)).size
  return `router ${money(total)} · subagents ${money(sub)}${spawned ? ` (${spawned} tier${spawned > 1 ? 's' : ''})` : ''}`
}

export function table(rows: RouterRow[]): string {
  if (!rows.length) return 'No model requests recorded in this session yet.'
  const lines = ['| who | model | requests | input tok | output tok | est. $ |', '|---|---|---|---|---|---|']
  for (const r of [...rows].sort((a, b) => b.usd - a.usd)) {
    const input = r.input + r.cacheRead + r.cacheWrite
    lines.push(`| ${r.who} | ${r.model} | ${r.requests} | ${kTok(input)} | ${kTok(r.output)} | ${r.priced ? money(r.usd) : 'n/a'} |`)
  }
  lines.push('', `${summaryLine(rows)}. List prices; cache reads and writes included.`)
  return lines.join('\n')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    try {
      prices = JSON.parse(await $.fs.read(`${$.plugin.root}/seed/prices.json`)).models ?? {}
    } catch {
      prices = {}
    }
    try {
      await $.command.register({ name: 'router', description: 'model-router: live cost per tier for this session and the last 7 days' })
      await $.command.register({ name: 'model-router', description: 'model-router: route a task across the tiers (same as /model-router:run)', argumentHint: '<task>' })
    } catch {}
    // First load in an interactive session (install, enable, or first start): run the configuration once.
    if (e.isInteractive && !(await $.store.get(SETUP_KEY))) {
      await $.store.set(SETUP_KEY, new Date(await $.clock.now()).toISOString())
      // session.start is awaited before the first prompt, so the prompt is queued from a timer.
      $.clock.after(500, () => {
        void $.prompt.submit({ text: FIRST_RUN_PROMPT })
      })
    }
    return next(e)
  })

  // A model override would silently replace the tier's pinned model and evidence.
  on('agent.spawn', async ($, e, next) => {
    const pinned = e.subagentType.startsWith('model-router:') && e.model !== undefined
    if (pinned) {
      await update($, overrides, n => (n ?? 0) + 1)
      $.ui.toast(`model-router: ignored model "${e.model}" for ${e.subagentType}; the tier's pinned model runs`)
    }
    const res = await next(pinned ? { ...e, model: undefined } : e)
    if (res.agentId) {
      const id = res.agentId
      await update($, agents, m => ({ ...(m ?? {}), [id]: tierName(e.subagentType) }))
    }
    return res
  })

  on('turn.step', async function* ($, e, next) {
    const res = yield* next(e)
    if (res.usage) {
      let who = 'orchestrator'
      if (e.agentId) {
        const known = (await read($, agents))[e.agentId]
        who = known ?? tierName((await $.agent.list()).find(a => a.id === e.agentId)?.type ?? 'subagent')
      }
      const usage = res.usage
      const rows = await update($, totals, t => addUsage(t ?? {}, who, usage, priceFor(prices, usage.model)))
      $.ui.status(summaryLine(Object.values(rows)))
    }
    return res
  })

  on('session.end', async ($, e, next) => {
    const rows = Object.values(await read($, totals))
    if (rows.length) {
      const history = ((await $.store.get(HISTORY_KEY)) as RouterSession[] | undefined) ?? []
      await $.store.set(HISTORY_KEY, [...history, { endedAt: new Date(await $.clock.now()).toISOString(), rows }].slice(-HISTORY_MAX))
    }
    return next(e)
  })

  on('command.run', { command: 'router' }, async $ => {
    const rows = Object.values(await read($, totals))
    await $.ui.open({ id: PANE, title: 'model-router' })
    return { text: table(rows) }
  })

  // Plugin skills are always namespaced, so the short name forwards to the skill.
  // $.command.run rejects inside the hook this command waits on, so it is queued from a timer.
  on('command.run', { command: 'model-router' }, async ($, e) => {
    $.clock.after(0, () => {
      void $.command.run({ command: 'model-router:run', args: e.args }).catch(() => {})
    })
    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const rows = Object.values(await read($, totals)).sort((a, b) => b.usd - a.usd)
    const skipped = await read($, overrides)
    const history = ((await $.store.get(HISTORY_KEY)) as RouterSession[] | undefined) ?? []
    const weekAgo = (await $.clock.now()) - 7 * 86_400_000
    const week = new Map<string, number>()
    for (const s of history.filter(s => Date.parse(s.endedAt) >= weekAgo))
      for (const r of s.rows) week.set(r.who, (week.get(r.who) ?? 0) + r.usd)
    const weekRows = [...week].sort((a, b) => b[1] - a[1])
    const width = Math.max(30, e.props.bodyColumns ?? 60)
    const cell = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n))
    const modelCol = Math.max(10, width - 12 - 5 - 8 - 10 - 4)

    return (
      <Box flexDirection="column">
        <Text bold>This session</Text>
        {rows.length === 0 && <Text dimColor>No model requests yet.</Text>}
        {rows.length > 0 && <Text dimColor>{cell('who', 12)} {cell('model', modelCol)} {cell('req', 5)} {cell('out', 8)} est. $</Text>}
        {rows.map(r => (
          <Text>
            {cell(r.who, 12)} {cell(r.model, modelCol)} {cell(String(r.requests), 5)} {cell(kTok(r.output), 8)} {r.priced ? money(r.usd) : 'n/a'}
          </Text>
        ))}
        {rows.length > 0 && <Text color="cyan">{summaryLine(rows)}</Text>}
        {skipped > 0 && <Text color="yellow">Model overrides ignored on pinned tiers: {skipped}</Text>}
        <Text> </Text>
        <Text bold>Last 7 days (ended sessions)</Text>
        {weekRows.length === 0 && <Text dimColor>Nothing recorded yet.</Text>}
        {weekRows.map(([who, usd]) => (
          <Text>
            {cell(who, 12)} {money(usd)}
          </Text>
        ))}
      </Box>
    )
  })
}
