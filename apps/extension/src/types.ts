export interface UserSession {
  userId: string;
  email: string;
  name: string;
  plan: 'free' | 'pro' | 'team' | 'enterprise';
  token: string;
  refreshToken: string;
  expiresAt: number;
  avatarUrl?: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface SessionStats {
  sessionId: string;
  filePath: string;
  model: string;
  aiProvider: string;
  projectName: string;
  totalInput: number;
  totalOutput: number;
  totalCacheRead: number;
  totalCacheWrite: number;
  turns: number;
  startTime: number;
  lastUpdate: number;
  estimatedCost: number;
}

export interface AllStats {
  currentSession: SessionStats | null;
  sessions: SessionStats[];
  allTimeTotalInput: number;
  allTimeTotalOutput: number;
  allTimeTotalCost: number;
}

export const PLAN_FEATURES = {
  free:       { historyDays: 30,   modelComparison: false, costPrediction: false, export: false, budgetAlerts: false },
  pro:        { historyDays: 365,  modelComparison: true,  costPrediction: true,  export: true,  budgetAlerts: true  },
  team:       { historyDays: 365,  modelComparison: true,  costPrediction: true,  export: true,  budgetAlerts: true  },
  enterprise: { historyDays: 9999, modelComparison: true,  costPrediction: true,  export: true,  budgetAlerts: true  },
};
