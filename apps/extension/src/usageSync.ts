import * as vscode from 'vscode';
import * as os from 'os';
import { API_BASE, SYNC_INTERVAL_MS } from './constants';
import { AuthManager } from './authManager';
import { TokenTracker } from './tokenTracker';
import { SessionStats } from './types';

export class UsageSync {
  private authManager: AuthManager;
  private tokenTracker: TokenTracker;
  private timer: NodeJS.Timeout | null = null;
  private pending = false;
  // Track last-synced state per session to avoid re-sending unchanged data
  private lastSynced = new Map<string, { turns: number; input: number; output: number }>();

  constructor(authManager: AuthManager, tokenTracker: TokenTracker) {
    this.authManager = authManager;
    this.tokenTracker = tokenTracker;
  }

  start() {
    this.timer = setInterval(() => this.sync(), SYNC_INTERVAL_MS);
  }

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  async forceSync(): Promise<void> {
    await this.sync();
  }

  private async sync() {
    if (this.pending) return;
    this.pending = true;
    try {
      await this.doSync();
    } finally {
      this.pending = false;
    }
  }

  private async doSync() {
    const session = await this.authManager.getSession();
    if (!session) return;

    const syncEnabled = vscode.workspace.getConfiguration('aiTokenTracker').get<boolean>('syncEnabled', true);
    if (!syncEnabled) return;

    const stats = this.tokenTracker.getStats();
    if (stats.sessions.length === 0) return;

    // Only send sessions that changed since last sync
    const dirty = stats.sessions.filter(s => this.isDirty(s));
    if (dirty.length === 0) return;

    const extensionVersion = vscode.extensions.getExtension('sandeep.ai-token-tracker')?.packageJSON?.version ?? '1.0.0';

    const payload = {
      sessions: dirty.map(s => ({
        sessionId:        s.sessionId,
        model:            s.model,
        aiProvider:       s.aiProvider,
        projectName:      s.projectName,
        inputTokens:      s.totalInput,
        outputTokens:     s.totalOutput,
        cacheReadTokens:  s.totalCacheRead,
        cacheWriteTokens: s.totalCacheWrite,
        turns:            s.turns,
        vsCodeVersion:    vscode.version,
        extensionVersion,
        osType:           os.platform(),
        timestamp:        s.startTime,
      })),
    };

    try {
      const res = await fetch(`${API_BASE}/usage/sync`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session.token}`,
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        // Mark these sessions as clean
        for (const s of dirty) {
          this.lastSynced.set(s.sessionId, { turns: s.turns, input: s.totalInput, output: s.totalOutput });
        }
      } else if (res.status === 401) {
        // Force token refresh on next isAuthenticated call
        await this.authManager.isAuthenticated();
      }
    } catch {
      // Network error — will retry next tick
    }
  }

  private isDirty(s: SessionStats): boolean {
    const prev = this.lastSynced.get(s.sessionId);
    if (!prev) return true;
    return prev.turns !== s.turns || prev.input !== s.totalInput || prev.output !== s.totalOutput;
  }
}
