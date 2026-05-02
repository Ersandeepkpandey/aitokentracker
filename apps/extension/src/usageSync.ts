import * as vscode from 'vscode';
import * as os from 'os';
import { API_BASE, SYNC_INTERVAL_MS } from './constants';
import { AuthManager } from './authManager';
import { TokenTracker } from './tokenTracker';

export class UsageSync {
  private authManager: AuthManager;
  private tokenTracker: TokenTracker;
  private timer: NodeJS.Timeout | null = null;
  private pending = false;

  constructor(authManager: AuthManager, tokenTracker: TokenTracker) {
    this.authManager = authManager;
    this.tokenTracker = tokenTracker;
  }

  start() {
    this.timer = setInterval(() => this.sync(), SYNC_INTERVAL_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
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

    const extensionVersion = vscode.extensions.getExtension('YOUR_PUBLISHER_ID.ai-token-tracker')?.packageJSON?.version;
    const vsCodeVersion = vscode.version;
    const osType = os.platform();

    const payload = {
      sessions: stats.sessions.map(s => ({
        sessionId:        s.sessionId,
        model:            s.model,
        aiProvider:       s.aiProvider,
        projectName:      s.projectName,
        inputTokens:      s.totalInput,
        outputTokens:     s.totalOutput,
        cacheReadTokens:  s.totalCacheRead,
        cacheWriteTokens: s.totalCacheWrite,
        turns:            s.turns,
        vsCodeVersion,
        extensionVersion,
        osType,
        timestamp:        s.startTime,
      })),
    };

    try {
      const res = await fetch(`${API_BASE}/usage/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.token}`,
        },
        body: JSON.stringify(payload),
      });

      if (res.status === 401) {
        // Token expired — try refresh on next tick
        await this.authManager.isAuthenticated();
      }
    } catch {
      // Network error — will retry on next tick
    }
  }
}
