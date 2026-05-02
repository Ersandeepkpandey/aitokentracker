const PRICING: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  'claude-opus-4':      { input: 15.00, output: 75.00, cacheRead: 1.50,  cacheWrite: 18.75 },
  'claude-opus-4-5':    { input: 15.00, output: 75.00, cacheRead: 1.50,  cacheWrite: 18.75 },
  'claude-sonnet-4':    { input:  3.00, output: 15.00, cacheRead: 0.30,  cacheWrite:  3.75 },
  'claude-sonnet-4-5':  { input:  3.00, output: 15.00, cacheRead: 0.30,  cacheWrite:  3.75 },
  'claude-haiku-3-5':   { input:  0.80, output:  4.00, cacheRead: 0.08,  cacheWrite:  1.00 },
  'gpt-4o':             { input:  2.50, output: 10.00, cacheRead: 1.25,  cacheWrite:  0    },
  'gpt-4o-mini':        { input:  0.15, output:  0.60, cacheRead: 0.075, cacheWrite:  0    },
};

const DEFAULT = { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 };

export function calcCost(
  model: string,
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number }
): number {
  const p = PRICING[model] || DEFAULT;
  const M = 1_000_000;
  return (tokens.input / M * p.input)
       + (tokens.output / M * p.output)
       + (tokens.cacheRead / M * p.cacheRead)
       + (tokens.cacheWrite / M * p.cacheWrite);
}
