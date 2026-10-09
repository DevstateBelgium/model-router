export type RouterRow = {
  who: string;
  model: string;
  requests: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  usd: number;
  priced: boolean;
};

export type RouterSession = {
  endedAt: string;
  rows: RouterRow[];
};

declare module 'claude-code' {
  interface PluginState {
    'model-router': {
      totals: Record<string, RouterRow>;
      agents: Record<string, string>;
      overrides: number;
    };
  }
}
