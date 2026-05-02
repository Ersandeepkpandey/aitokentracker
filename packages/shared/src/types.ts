// Shared types used by backend, extension, and website

export type Plan = 'free' | 'pro' | 'team' | 'enterprise';

export interface UsageSession {
  sessionId: string;
  model: string;
  aiProvider: string;
  projectName: string;
  workspacePath?: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  inputCostUsd: number;
  outputCostUsd: number;
  cacheReadCostUsd: number;
  cacheWriteCostUsd: number;
  totalCostUsd: number;
  turnCount: number;
  sessionStartedAt: string;
  lastUpdatedAt: string;
}

export interface SyncPayload {
  sessions: Array<{
    sessionId: string;
    model: string;
    aiProvider?: string;
    projectName: string;
    workspacePath?: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    turns: number;
    vsCodeVersion?: string;
    extensionVersion?: string;
    osType?: string;
    timestamp: number;
  }>;
}

export interface UserAuth {
  userId: string;
  email: string;
  name: string;
  plan: Plan;
  token: string;
  refreshToken: string;
  expiresAt: number;
  avatarUrl?: string;
}

export interface DailyStat {
  id: string;
  userId: string;
  date: string;
  projectName: string;
  model: string;
  aiProvider: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalCostUsd: number;
  sessionCount: number;
  turnCount: number;
}

export interface UsageSummary {
  totalCostUsd: number;
  totalTokens: number;
  sessionCount: number;
  todayCostUsd: number;
  monthCostUsd: number;
  plan: string;
  historyDays: number;
}
