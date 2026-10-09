import { describe, expect, mock, test } from 'claude-code/testing'
import type { AgentSpawnInput } from 'claude-code'

import { FIRST_RUN_PROMPT, addUsage, costOf, priceFor, summaryLine, table } from '../hooks/router'

const spawnInput = (subagentType: string, model?: string): AgentSpawnInput => ({
  tool_use_id: 'tu-1',
  prompt: 'count lines',
  description: 'count',
  subagentType,
  model,
  provider: { plugin: 'engine', tier: 'core' },
  parentModel: 'claude-opus-5-5',
  background: false,
  fork: false,
})

const PRICES = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cache_write_multiplier: 1.25, cache_read_multiplier: 0.1 },
  'claude-opus-5-5': { input: 4, output: 20, cache_write_multiplier: 1.25, cache_read_multiplier: 0.1 },
}
const usage = (model: string, input: number, output: number, cacheRead = 0, cacheWrite = 0) => ({
  model,
  input_tokens: input,
  output_tokens: output,
  cache_read_input_tokens: cacheRead,
  cache_creation_input_tokens: cacheWrite,
})

describe('cost math', () => {
  test('prices by model prefix, cache tokens weighted', () => {
    const p = priceFor(PRICES, 'claude-haiku-5-5-20261001')
    expect(p).toEqual(PRICES['claude-haiku-5-5'])
    const usd = costOf(p, usage('claude-haiku-5-5', 1300, 600, 6000, 5000))
    expect(Math.abs(usd - 0.001115) < 1e-9).toBe(true)
  })

  test('unknown model costs 0 and marks the row unpriced', () => {
    const rows = addUsage({}, 'scout', usage('mystery-1', 100, 100), priceFor(PRICES, 'mystery-1'))
    const row = Object.values(rows)[0]!
    expect(row.usd).toBe(0)
    expect(row.priced).toBe(false)
    expect(table(Object.values(rows))).toContain('n/a')
  })

  test('rows accumulate per who and model', () => {
    let rows = addUsage({}, 'orchestrator', usage('claude-opus-5-5', 1000, 100), PRICES['claude-opus-5-5'])
    rows = addUsage(rows, 'orchestrator', usage('claude-opus-5-5', 1000, 100), PRICES['claude-opus-5-5'])
    rows = addUsage(rows, 'scout', usage('claude-haiku-5-5', 1000, 100), PRICES['claude-haiku-5-5'])
    const list = Object.values(rows)
    expect(list.length).toBe(2)
    expect(list.find(r => r.who === 'orchestrator')!.requests).toBe(2)
    expect(summaryLine(list)).toBe('router $0.012 · subagents $0.000 (1 tier)')
  })
})

describe('turn.step', () => {
  test('meters main-loop and subagent requests by tier', async ($, on) => {
    const lines: string[] = []
    on('ui.status', ($, e) => {
      lines.push(String((e as { text?: string }).text))
      return { value: undefined }
    })
    on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'ag-9' }))
    on('turn.step', async function* ($, e) {
      return {
        turnId: e.turnId,
        index: e.index,
        answer: '',
        toolUses: [],
        stopReason: 'end_turn',
        usage: e.agentId ? usage('claude-haiku-5-5', 1000, 100) : usage('claude-opus-5-5', 1000, 100),
      }
    })
    await $.agent.spawn(spawnInput('model-router:scout'))
    for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 1 })) void _
    for await (const _ of $.turn.step({ turnId: 't2', index: 0, model: 'claude-haiku-5-5', messageCount: 1, agentId: 'ag-9' })) void _
    // Prices are not loaded without session.start, so amounts are 0; the tier split is what matters.
    expect(lines).toEqual(['router $0.000 · subagents $0.000', 'router $0.000 · subagents $0.000 (1 tier)'])
  })
})

describe('first run', () => {
  test('queues the configuration prompt once, in interactive sessions only', async ($, on) => {
    const clock = mock.clock(on)
    mock.store(on)
    const submitted: string[] = []
    on('prompt.submit', ($, e) => {
      submitted.push(e.text)
      return { text: e.text }
    })
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    await $.session.start({ cwd: '/tmp/p', surface: null, isInteractive: false })
    await clock.advance(1000)
    expect(submitted.length).toBe(0)
    await $.session.start({ cwd: '/tmp/p', surface: 'terminal', isInteractive: true })
    await clock.advance(1000)
    await $.session.start({ cwd: '/tmp/p', surface: 'terminal', isInteractive: true })
    await clock.advance(1000)
    expect(submitted).toEqual([FIRST_RUN_PROMPT])
  })
})

describe('agent.spawn', () => {
  test('drops a model override on a pinned model-router tier', async ($, on) => {
    let seen: string | undefined = 'unset'
    on('agent.spawn', ($, e) => {
      seen = e.model
      return { model: 'claude-haiku-5-5', agentId: 'ag-1' }
    })
    await $.agent.spawn(spawnInput('model-router:scout', 'opus'))
    expect(seen).toBe(undefined)
  })

  test('leaves other agent types alone', async ($, on) => {
    let seen: string | undefined
    on('agent.spawn', ($, e) => {
      seen = e.model
      return { model: 'claude-opus-5-5', agentId: 'ag-2' }
    })
    await $.agent.spawn(spawnInput('general-purpose', 'opus'))
    expect(seen).toBe('opus')
  })
})

describe('/model-router', () => {
  test('forwards its arguments to /model-router:run', async ($, on) => {
    const clock = mock.clock(on)
    const ran: { command: string; args: string }[] = []
    on('command.run', ($, e) => {
      ran.push({ command: e.command, args: e.args })
      return {}
    })
    await $.command.run({ command: 'model-router', args: 'add tests for utils' })
    await clock.advance(10)
    expect(ran).toEqual([{ command: 'model-router:run', args: 'add tests for utils' }])
  })
})
