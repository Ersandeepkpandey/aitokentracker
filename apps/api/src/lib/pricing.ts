interface PricingTier {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

const PRICING: Record<string, PricingTier> = {
  'claude-opus-4':      { input: 15.00, output: 75.00, cacheRead: 1.50,  cacheWrite: 18.75 },
  'claude-opus-4-5':    { input: 15.00, output: 75.00, cacheRead: 1.50,  cacheWrite: 18.75 },
  'claude-sonnet-4':    { input:  3.00, output: 15.00, cacheRead: 0.30,  cacheWrite:  3.75 },
  'claude-sonnet-4-5':  { input:  3.00, output: 15.00, cacheRead: 0.30,  cacheWrite:  3.75 },
  'claude-haiku-3-5':   { input:  0.80, output:  4.00, cacheRead: 0.08,  cacheWrite:  1.00 },
  'gpt-4o':             { input:  2.50, output: 10.00, cacheRead: 1.25,  cacheWrite:  0    },
  'gpt-4o-mini':        { input:  0.15, output:  0.60, cacheRead: 0.075, cacheWrite:  0    },
  'gemini-1.5-pro':     { input:  1.25, output:  5.00, cacheRead: 0.3125,cacheWrite:  0    },
};

const DEFAULT_TIER: PricingTier = { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 };

export function calcCost(params: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}) {
  const tier = PRICING[params.model] || DEFAULT_TIER;
  const M = 1_000_000;
  const input      = (params.inputTokens      / M) * tier.input;
  const output     = (params.outputTokens     / M) * tier.output;
  const cacheRead  = (params.cacheReadTokens  / M) * tier.cacheRead;
  const cacheWrite = (params.cacheWriteTokens / M) * tier.cacheWrite;
  return { input, output, cacheRead, cacheWrite, total: input + output + cacheRead + cacheWrite };
}
