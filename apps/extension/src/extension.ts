import * as vscode from 'vscode';
import { TokenTracker } from './tokenTracker';
import { AuthManager } from './authManager';
import { UsageSync } from './usageSync';
import { OnboardingPanel } from './onboardingPanel';
import { AllStats } from './types';
import { APP_BASE } from './constants';

let tokenTracker: TokenTracker;
let authManager: AuthManager;
let usageSync: UsageSync;
let statusBarItem: vscode.StatusBarItem;

export async function activate(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration('aiTokenTracker');
  const model = config.get<string>('model', 'claude-sonnet-4');
  const claudeLogPath = config.get<string>('claudeLogPath', '');

  // Core services
  authManager = new AuthManager(context);
  tokenTracker = new TokenTracker(claudeLogPath, model);
  usageSync = new UsageSync(authManager, tokenTracker);

  // Status bar
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'aiTokenTracker.showDashboard';
  statusBarItem.text = '$(pulse) Tokens: 0 | $0.0000';
  statusBarItem.tooltip = 'AI Token Tracker — click to open dashboard';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Update status bar on tracker events
  tokenTracker.on('update', (stats: AllStats) => {
    updateStatusBar(stats);
  });

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('aiTokenTracker.showDashboard', () => {
      showDashboardPanel(context);
    }),

    vscode.commands.registerCommand('aiTokenTracker.signIn', async () => {
      vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'AI Token Tracker: Opening sign-in...' },
        async () => {
          const session = await authManager.signIn();
          if (session) {
            vscode.window.showInformationMessage(`AI Token Tracker: Signed in as ${session.email} (${session.plan} plan)`);
          } else {
            vscode.window.showErrorMessage('AI Token Tracker: Sign-in failed or timed out. Please try again.');
          }
        }
      );
    }),

    vscode.commands.registerCommand('aiTokenTracker.signOut', async () => {
      await authManager.signOut();
      vscode.window.showInformationMessage('AI Token Tracker: Signed out.');
    }),

    vscode.commands.registerCommand('aiTokenTracker.resetSession', () => {
      tokenTracker.resetCurrentSession();
      vscode.window.showInformationMessage('AI Token Tracker: Current session reset.');
    }),

    vscode.commands.registerCommand('aiTokenTracker.setModel', async () => {
      const models = ['claude-opus-4', 'claude-sonnet-4', 'claude-haiku-3-5', 'gpt-4o', 'gpt-4o-mini'];
      const picked = await vscode.window.showQuickPick(models, { placeHolder: 'Select default AI model for cost calculation' });
      if (picked) {
        await vscode.workspace.getConfiguration('aiTokenTracker').update('model', picked, vscode.ConfigurationTarget.Global);
        tokenTracker.setModel(picked);
        vscode.window.showInformationMessage(`AI Token Tracker: Model set to ${picked}`);
      }
    }),

    vscode.commands.registerCommand('aiTokenTracker.viewPlans', () => {
      vscode.env.openExternal(vscode.Uri.parse(`${APP_BASE}/pricing`));
    })
  );

  // Watch config changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('aiTokenTracker.model')) {
        const newModel = vscode.workspace.getConfiguration('aiTokenTracker').get<string>('model', 'claude-sonnet-4');
        tokenTracker.setModel(newModel);
      }
    })
  );

  // Start tracking and syncing
  tokenTracker.start();
  usageSync.start();

  // Show onboarding for new users
  const hasSeenOnboarding = context.globalState.get<boolean>('onboardingShown', false);
  if (!hasSeenOnboarding) {
    context.globalState.update('onboardingShown', true);
    OnboardingPanel.show(context);
  }
}

export async function deactivate() {
  tokenTracker?.stop();
  usageSync?.stop();
  await usageSync?.forceSync();
}

function updateStatusBar(stats: AllStats) {
  const show = vscode.workspace.getConfiguration('aiTokenTracker').get<boolean>('showStatusBar', true);
  if (!show) {
    statusBarItem.hide();
    return;
  }

  const tokens = stats.allTimeTotalInput + stats.allTimeTotalOutput;
  const cost = stats.allTimeTotalCost;
  statusBarItem.text = `$(pulse) ${fmtTokens(tokens)} | $${cost.toFixed(4)}`;

  if (stats.currentSession) {
    const s = stats.currentSession;
    statusBarItem.tooltip = [
      `AI Token Tracker`,
      `Model: ${s.model}`,
      `Session: ${fmtTokens(s.totalInput + s.totalOutput)} tokens | $${s.estimatedCost.toFixed(4)}`,
      `Turns: ${s.turns}`,
      `Click to open dashboard`,
    ].join('\n');
  }

  statusBarItem.show();
}

function showDashboardPanel(context: vscode.ExtensionContext) {
  const panel = vscode.window.createWebviewPanel(
    'aiTokenTrackerDashboard',
    'AI Token Tracker',
    vscode.ViewColumn.Beside,
    { enableScripts: true }
  );

  const stats = tokenTracker.getStats();
  panel.webview.html = getDashboardHtml(stats);

  // Refresh when stats update
  const handler = (newStats: AllStats) => {
    panel.webview.html = getDashboardHtml(newStats);
  };
  tokenTracker.on('update', handler);
  panel.onDidDispose(() => tokenTracker.off('update', handler));
}

function getDashboardHtml(stats: AllStats): string {
  const rows = stats.sessions
    .slice(0, 10)
    .map(s => `
      <tr>
        <td>${s.model}</td>
        <td>${fmtTokens(s.totalInput)}</td>
        <td>${fmtTokens(s.totalOutput)}</td>
        <td>$${s.estimatedCost.toFixed(4)}</td>
        <td>${s.turns}</td>
      </tr>
    `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 16px; }
    h2 { font-size: 18px; font-weight: 600; margin-bottom: 16px; }
    .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px; }
    .card { background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-widget-border); border-radius: 8px; padding: 12px 16px; }
    .card label { font-size: 11px; color: var(--vscode-descriptionForeground); display: block; margin-bottom: 4px; }
    .card value { font-size: 20px; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--vscode-widget-border); color: var(--vscode-descriptionForeground); }
    td { padding: 6px 8px; border-bottom: 1px solid var(--vscode-editorWidget-background); }
  </style>
</head>
<body>
  <h2>◈ AI Token Tracker</h2>
  <div class="cards">
    <div class="card"><label>Total Input</label><value>${fmtTokens(stats.allTimeTotalInput)}</value></div>
    <div class="card"><label>Total Output</label><value>${fmtTokens(stats.allTimeTotalOutput)}</value></div>
    <div class="card"><label>Estimated Cost</label><value>$${stats.allTimeTotalCost.toFixed(4)}</value></div>
  </div>
  <table>
    <thead><tr><th>Model</th><th>Input</th><th>Output</th><th>Cost</th><th>Turns</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--vscode-descriptionForeground)">No sessions yet — start using Claude Code to see data here.</td></tr>'}</tbody>
  </table>
</body>
</html>`;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}
