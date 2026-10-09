# models.md (mirror of knowledge/models.md)

Always write the full name in text and logs ("Claude Opus 5.5", not "opus"). Aliases are only for the Agent tool's `model` parameter and agent frontmatter.

| Full name | API ID | Agent alias | Price in/out per 1M tokens | Notes |
|---|---|---|---|---|
| Claude Haiku 5.5 | claude-haiku-5-5 | haiku | $0.10 / $0.50 (prompt up to 100K); $0.50 / $2.50 above | Default effort medium. Max effort is very verbose. |
| Claude Sonnet 5.5 | claude-sonnet-5-5 | sonnet | $2 / $10 | Default effort high. Max costs more per task than Claude Opus 5.5 at max. |
| Claude Opus 5.5 | claude-opus-5-5 | opus | $4 / $20 | Default effort medium. Best value for heavy code. |
| Claude Fable 5.1 | claude-fable-5-1 | fable | $10 / $50 | Default effort high in the API. Most expensive. Mainly worth it for long-horizon reasoning. |

## Seed evidence (priors, not verified in this codebase)

Third-party, October 2026, Artificial Analysis Intelligence Index unless noted:

| Full name | Effort | Score | Approx. cost per task |
|---|---|---|---|
| Claude Haiku 5.5 | medium | 34 | $0.05 |
| Claude Haiku 5.5 | xhigh | 41 | $0.12 |
| Claude Haiku 5.5 | max | 43 | $0.21 |
| Claude Sonnet 5.5 | high | 46.75 | $1.12 |
| Claude Opus 5.5 | high | 53.58 | $1.82 |
| Claude Opus 5.5 | xhigh | 55.99 | $3.46 |
| Claude Opus 5.5 | max | 57.62 | $5.98 |
| Claude Sonnet 5.5 | max | 56 | $7.60 |
| Claude Fable 5.1 | max | 53 | $7.63 |
| Claude Fable 5.1 | low | 47 | more than four times Claude Opus 5.5 at low (42) |

Code benchmarks (Anthropic's own numbers, different effort settings per row):
- CursorBench: Claude Opus 5.5 at medium 52.5% (about $3 per task). Claude Fable 5.1 at max 51.8% ($17.28 per task).
- Terminal-Bench 4.0: Claude Sonnet 5.5 at medium 28.8% ($0.83). Claude Opus 5.5 at medium 57.6% ($2.94). Claude Sonnet 5.5 at max 70.6%. Claude Haiku 5.5 39.2%.

Where a seed number conflicts with logged runs or telemetry in your own codebase, the logged runs win.
