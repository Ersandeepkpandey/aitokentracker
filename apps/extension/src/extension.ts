import * as vscode from 'vscode';
import { TokenTracker } from './tokenTracker';
import { AuthManager } from './authManager';
import { UsageSync } from './usageSync';
import { OnboardingPanel } from './onboardingPanel';
import { BudgetManager } from './budgetManager';
import { AllStats } from './types';
import { APP_BASE, API_BASE } from './constants';

let tokenTracker: TokenTracker;
let authManager: AuthManager;
let usageSync: UsageSync;
let budgetManager: BudgetManager;
let statusBarItem: vscode.StatusBarItem;
let currentPlan: 'free' | 'pro' | 'team' | 'enterprise' = 'free';

const isPaid = () => currentPlan !== 'free';

export async function activate(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration('aiTokenTracker');
  const model = config.get<string>('model', 'claude-sonnet-4');
  const claudeLogPath = config.get<string>('claudeLogPath', '');

  authManager = new AuthManager(context);
  tokenTracker = new TokenTracker(claudeLogPath, model);
  usageSync = new UsageSync(authManager, tokenTracker);
  budgetManager = new BudgetManager(authManager);

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  context.subscriptions.push(
    vscode.commands.registerCommand('aiTokenTracker.showDashboard', async () => {
      const isAuth = await authManager.isAuthenticated();
      if (!isAuth) {
        OnboardingPanel.show(context, authManager, onSignedIn);
        return;
      }
      showDashboardPanel(context);
    }),

    vscode.commands.registerCommand('aiTokenTracker.signIn', async () => {
      await doSignIn(context);
    }),

    vscode.commands.registerCommand('aiTokenTracker.signOut', async () => {
      await authManager.signOut();
      usageSync.stop();
      tokenTracker.off('update', onStatsUpdate);
      currentPlan = 'free';
      setStatusBarSignedOut();
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
    }),

    vscode.commands.registerCommand('aiTokenTracker.setBudget', async () => {
      if (!isPaid()) {
        const choice = await vscode.window.showInformationMessage(
          'Budget alerts are a Pro feature. Upgrade to set spending limits.',
          'Upgrade to Pro'
        );
        if (choice) vscode.env.openExternal(vscode.Uri.parse(`${APP_BASE}/pricing`));
        return;
      }
      await budgetManager.setBudget(context);
    }),

    vscode.commands.registerCommand('aiTokenTracker.compareModels', async () => {
      if (!isPaid()) {
        const choice = await vscode.window.showInformationMessage(
          'Model comparison is a Pro feature. Upgrade to see cost savings.',
          'Upgrade to Pro'
        );
        if (choice) vscode.env.openExternal(vscode.Uri.parse(`${APP_BASE}/pricing`));
        return;
      }
      showModelComparisonPanel(context);
    }),

    vscode.commands.registerCommand('aiTokenTracker.exportData', async () => {
      if (!isPaid()) {
        const choice = await vscode.window.showInformationMessage(
          'CSV export is a Pro feature.',
          'Upgrade to Pro'
        );
        if (choice) vscode.env.openExternal(vscode.Uri.parse(`${APP_BASE}/pricing`));
        return;
      }
      const token = await authManager.getToken();
      if (!token) return;
      vscode.env.openExternal(vscode.Uri.parse(`${API_BASE}/usage/export`));
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('aiTokenTracker.model')) {
        const newModel = vscode.workspace.getConfiguration('aiTokenTracker').get<string>('model', 'claude-sonnet-4');
        tokenTracker.setModel(newModel);
      }
    })
  );

  const isAuth = await authManager.isAuthenticated();
  if (!isAuth) {
    setStatusBarSignedOut();
    OnboardingPanel.show(context, authManager, onSignedIn);
  } else {
    const session = await authManager.getSession();
    if (session) { currentPlan = session.plan; }
    startTracking();
  }
}

function onSignedIn() {
  authManager.getSession().then(session => {
    if (session) { currentPlan = session.plan; }
    startTracking();
  });
}

function startTracking() {
  tokenTracker.on('update', onStatsUpdate);
  tokenTracker.start();
  usageSync.start();
  updateStatusBar(tokenTracker.getStats());
}

function onStatsUpdate(stats: AllStats) {
  updateStatusBar(stats);
}

export async function deactivate() {
  tokenTracker?.stop();
  usageSync?.stop();
  await usageSync?.forceSync();
}

async function doSignIn(context: vscode.ExtensionContext) {
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'AI Token Tracker: Opening sign-in...' },
    async () => {
      const session = await authManager.signIn();
      if (session) {
        currentPlan = session.plan;
        vscode.window.showInformationMessage(`Signed in as ${session.email} — tracking started!`);
        onSignedIn();
      } else {
        vscode.window.showErrorMessage('AI Token Tracker: Sign-in failed or timed out. Please try again.');
      }
    }
  );
}

function setStatusBarSignedOut() {
  statusBarItem.text = '$(lock) AI Token Tracker';
  statusBarItem.tooltip = 'Click to sign in and start tracking your AI token usage';
  statusBarItem.command = 'aiTokenTracker.signIn';
}

function updateStatusBar(stats: AllStats) {
  const show = vscode.workspace.getConfiguration('aiTokenTracker').get<boolean>('showStatusBar', true);
  if (!show) { statusBarItem.hide(); return; }

  const s = stats.currentSession;
  const sessionTokens = s ? s.totalInput + s.totalOutput : 0;

  const modelShort = (m: string) => m.replace('claude-', '').replace('gpt-', 'gpt/');

  if (isPaid() && s) {
    statusBarItem.text = `$(pulse) ${modelShort(s.model)} ${fmtTokens(sessionTokens)} $${s.estimatedCost.toFixed(4)}`;
    statusBarItem.tooltip = new vscode.MarkdownString(
      `**Current session**\n\nModel: \`${s.model}\`\n` +
      `Input: ${fmtTokens(s.totalInput)}  Output: ${fmtTokens(s.totalOutput)}\n` +
      `Cost: $${s.estimatedCost.toFixed(4)}  Turns: ${s.turns}\n\n` +
      `*Click to open dashboard*`
    );
  } else if (s) {
    statusBarItem.text = `$(pulse) ${modelShort(s.model)} ${fmtTokens(sessionTokens)}`;
    statusBarItem.tooltip = new vscode.MarkdownString(
      `**Current session**\n\nModel: \`${s.model}\`\n` +
      `Input: ${fmtTokens(s.totalInput)}  Output: ${fmtTokens(s.totalOutput)}\n` +
      `Turns: ${s.turns}\n\n` +
      `Cost: 🔒 *Pro feature*\n\n` +
      `[Upgrade — $9/mo](${APP_BASE}/pricing)\n\n` +
      `*Click to open dashboard*`
    );
    (statusBarItem.tooltip as vscode.MarkdownString).isTrusted = true;
  } else {
    statusBarItem.text = `$(pulse) AI Token Tracker`;
    statusBarItem.tooltip = 'AI Token Tracker — no active session\nClick to open dashboard';
  }

  statusBarItem.command = 'aiTokenTracker.showDashboard';
  statusBarItem.show();
}

function showDashboardPanel(context: vscode.ExtensionContext) {
  const panel = vscode.window.createWebviewPanel(
    'aiTokenTrackerDashboard',
    'AI Token Tracker',
    vscode.ViewColumn.Beside,
    { enableScripts: true }
  );

  panel.webview.html = getDashboardHtml(tokenTracker.getStats());

  panel.webview.onDidReceiveMessage(msg => {
    if (msg.command === 'upgrade') {
      vscode.env.openExternal(vscode.Uri.parse(`${APP_BASE}/pricing`));
    }
    if (msg.command === 'compareModels') {
      showModelComparisonPanel(context);
    }
    if (msg.command === 'setBudget') {
      vscode.commands.executeCommand('aiTokenTracker.setBudget');
    }
    if (msg.command === 'signOut') {
      vscode.commands.executeCommand('aiTokenTracker.signOut');
      panel.dispose();
    }
  });

  const handler = (newStats: AllStats) => {
    panel.webview.html = getDashboardHtml(newStats);
  };
  tokenTracker.on('update', handler);
  panel.onDidDispose(() => tokenTracker.off('update', handler));
}

async function showModelComparisonPanel(context: vscode.ExtensionContext) {
  const stats = tokenTracker.getStats();
  const s = stats.currentSession;
  if (!s) {
    vscode.window.showInformationMessage('No active session to compare.');
    return;
  }

  const token = await authManager.getToken();
  if (!token) return;

  const panel = vscode.window.createWebviewPanel(
    'modelComparison',
    'Model Cost Comparison',
    vscode.ViewColumn.Beside,
    { enableScripts: true }
  );

  panel.webview.html = getLoadingHtml('Loading model comparison...');

  try {
    const res = await fetch(`${API_BASE}/usage/model-comparison/${s.sessionId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to load comparison');
    const data = await res.json() as {
      actualModel: string; actualCost: number;
      inputTokens: number; outputTokens: number;
      comparisons: Array<{ model: string; totalCost: number; savingPct: number }>;
    };
    panel.webview.html = getModelComparisonHtml(data);
  } catch {
    panel.webview.html = getLoadingHtml('Failed to load comparison. Please try again.');
  }
}

function getLoadingHtml(msg: string): string {
  return `<!DOCTYPE html><html><body style="font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);padding:20px;">${msg}</body></html>`;
}

function getModelComparisonHtml(data: {
  actualModel: string; actualCost: number;
  inputTokens: number; outputTokens: number;
  comparisons: Array<{ model: string; totalCost: number; savingPct: number }>;
}): string {
  const rows = data.comparisons.map(c => {
    const isActual = c.model === data.actualModel;
    const savingLabel = c.savingPct > 0
      ? `<span style="color:#3fb950">save ${c.savingPct}%</span>`
      : c.savingPct < 0
        ? `<span style="color:#f85149">${Math.abs(c.savingPct)}% more</span>`
        : '<span>same</span>';
    return `<tr ${isActual ? 'style="font-weight:700"' : ''}>
      <td>${c.model}${isActual ? ' <span style="opacity:0.6">(current)</span>' : ''}</td>
      <td style="text-align:right">$${c.totalCost.toFixed(6)}</td>
      <td style="text-align:right">${savingLabel}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 20px; font-size: 13px; }
    h2 { font-size: 16px; font-weight: 700; margin-bottom: 16px; }
    .meta { color: var(--vscode-descriptionForeground); font-size: 12px; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; padding: 6px 10px; border-bottom: 1px solid var(--vscode-widget-border); font-size: 11px; color: var(--vscode-descriptionForeground); }
    th:not(:first-child) { text-align: right; }
    td { padding: 8px 10px; border-bottom: 1px solid var(--vscode-editorWidget-background); }
    tr:hover td { background: var(--vscode-list-hoverBackground); }
  </style>
</head>
<body>
  <h2>Model Cost Comparison</h2>
  <p class="meta">Based on: ${fmtTokens(data.inputTokens)} input + ${fmtTokens(data.outputTokens)} output tokens &nbsp;·&nbsp; Actual: ${data.actualModel}</p>
  <table>
    <thead><tr><th>Model</th><th>Cost</th><th>vs. Current</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
}

function getDashboardHtml(stats: AllStats): string {
  const paid = isPaid();

  // Group sessions by date
  const byDate = new Map<string, { input: number; output: number; cost: number; turns: number; sessions: number }>();
  for (const s of stats.sessions) {
    const date = new Date(s.startTime).toLocaleDateString('en-CA');
    const ex = byDate.get(date) ?? { input: 0, output: 0, cost: 0, turns: 0, sessions: 0 };
    byDate.set(date, {
      input: ex.input + s.totalInput,
      output: ex.output + s.totalOutput,
      cost: ex.cost + s.estimatedCost,
      turns: ex.turns + s.turns,
      sessions: ex.sessions + 1,
    });
  }

  const dailyRows = Array.from(byDate.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, d]) => {
      const label = formatDateLabel(date);
      const costCell = paid
        ? `<td class="cost">$${d.cost.toFixed(4)}</td>`
        : '';
      return `<tr>
        <td><strong>${label}</strong><span class="date-sub">${date}</span></td>
        <td>${fmtTokens(d.input)}</td>
        <td>${fmtTokens(d.output)}</td>
        ${costCell}
        <td>${d.turns}</td>
        <td>${d.sessions}</td>
      </tr>`;
    }).join('');

  const chartDays = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-14);
  const maxVal = Math.max(...chartDays.map(([, d]) => paid ? d.cost : d.input + d.output), 0.0001);
  const bars = chartDays.map(([date, d]) => {
    const val = paid ? d.cost : d.input + d.output;
    const height = Math.max(2, Math.round((val / maxVal) * 80));
    const dateObj = new Date(date + 'T12:00:00');
    const dayLabel = dateObj.getDate().toString();
    const titleVal = paid ? `$${d.cost.toFixed(4)}` : `${fmtTokens(d.input + d.output)} tokens`;
    const fullLabel = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `<div class="bar-wrap" title="${fullLabel}: ${titleVal}">
      <div class="bar" style="height:${height}px"></div>
      <div class="bar-label">${dayLabel}</div>
    </div>`;
  }).join('');

  const dailyCols = paid
    ? `<th>Date</th><th>Input</th><th>Output</th><th>Cost</th><th>Turns</th><th>Sessions</th>`
    : `<th>Date</th><th>Input</th><th>Output</th><th>Turns</th><th>Sessions</th>`;

  const sessionCols = paid
    ? `<th>Time</th><th>Model</th><th>Input</th><th>Output</th><th>Cost</th><th>Turns</th>`
    : `<th>Time</th><th>Model</th><th>Input</th><th>Output</th><th>Turns</th>`;

  const colSpanDaily   = paid ? 6 : 5;
  const colSpanSession = paid ? 6 : 5;

  const sessionRows = stats.sessions
    .slice(0, 20)
    .map(s => {
      const time = new Date(s.startTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const costCell = paid ? `<td class="cost">$${s.estimatedCost.toFixed(4)}</td>` : '';
      return `<tr>
        <td class="dim">${time}</td>
        <td>${s.model}</td>
        <td>${fmtTokens(s.totalInput)}</td>
        <td>${fmtTokens(s.totalOutput)}</td>
        ${costCell}
        <td>${s.turns}</td>
      </tr>`;
    }).join('');

  const costCard = paid
    ? `<div class="card"><label>Estimated Cost</label><value>$${stats.allTimeTotalCost.toFixed(4)}</value></div>`
    : `<div class="card upgrade-card"><label>Estimated Cost</label><value class="locked">Upgrade</value><a href="#" onclick="upgrade()" class="upgrade-link">See costs →</a></div>`;

  const chartLabel = paid ? 'Daily Cost (last 14 days)' : 'Daily Tokens (last 14 days)';

  // Blurred lock overlay for free users
  const lockedOverlay = !paid ? `
    <div class="lock-overlay">
      <div class="lock-box">
        <div class="lock-icon">🔒</div>
        <h3>Unlock your dashboard</h3>
        <p>Cost breakdown, daily trends, and project attribution are Pro features.</p>
        <button onclick="upgrade()" class="upgrade-btn">Upgrade to Pro — $9/mo</button>
      </div>
    </div>` : '';

  const proActions = paid ? `
    <div class="pro-actions">
      <button onclick="compareModels()" class="action-btn">⚡ Compare Models</button>
      <button onclick="setBudget()" class="action-btn">💰 Set Budget</button>
    </div>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 20px; font-size: 13px; }
    h2 { font-size: 16px; font-weight: 700; margin-bottom: 16px; }
    h3 { font-size: 12px; font-weight: 600; color: var(--vscode-descriptionForeground); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 10px; }
    .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 20px; }
    .card { background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-widget-border); border-radius: 8px; padding: 12px 14px; position: relative; }
    .card label { font-size: 11px; color: var(--vscode-descriptionForeground); display: block; margin-bottom: 6px; }
    .card value { font-size: 22px; font-weight: 700; }
    .card value.locked { font-size: 14px; color: var(--vscode-descriptionForeground); }
    .upgrade-card { border-color: var(--vscode-focusBorder); }
    .upgrade-link { font-size: 11px; color: var(--vscode-textLink-foreground); display: block; margin-top: 4px; cursor: pointer; text-decoration: none; }
    .pro-actions { display: flex; gap: 8px; margin-bottom: 20px; }
    .action-btn { background: var(--vscode-editorWidget-background); color: var(--vscode-foreground); border: 1px solid var(--vscode-widget-border); border-radius: 6px; padding: 6px 12px; cursor: pointer; font-size: 12px; }
    .action-btn:hover { background: var(--vscode-list-hoverBackground); }
    .section { margin-bottom: 24px; position: relative; }
    .chart { display: flex; align-items: flex-end; gap: 4px; height: 100px; padding: 8px 0 4px; border-bottom: 1px solid var(--vscode-widget-border); margin-bottom: 4px; }
    .bar-wrap { display: flex; flex-direction: column; align-items: center; gap: 4px; flex: 1; cursor: default; }
    .bar { width: 100%; background: var(--vscode-button-background); border-radius: 3px 3px 0 0; opacity: 0.85; min-width: 6px; }
    .bar:hover { opacity: 1; }
    .bar-label { font-size: 9px; color: var(--vscode-descriptionForeground); }
    .chart-empty { height: 100px; display: flex; align-items: center; justify-content: center; color: var(--vscode-descriptionForeground); font-size: 12px; }
    .tabs { display: flex; gap: 2px; margin-bottom: 12px; }
    .tab { padding: 5px 14px; font-size: 12px; border-radius: 5px; cursor: pointer; border: 1px solid transparent; color: var(--vscode-descriptionForeground); background: transparent; }
    .tab.active { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    .tab-content { display: none; }
    .tab-content.active { display: block; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--vscode-widget-border); color: var(--vscode-descriptionForeground); font-weight: 600; font-size: 11px; white-space: nowrap; }
    td { padding: 7px 8px; border-bottom: 1px solid var(--vscode-editorWidget-background); vertical-align: top; }
    tr:hover td { background: var(--vscode-list-hoverBackground); }
    .cost { font-variant-numeric: tabular-nums; }
    .dim { color: var(--vscode-descriptionForeground); }
    .date-sub { display: block; font-size: 10px; color: var(--vscode-descriptionForeground); font-weight: 400; }
    .empty { text-align: center; padding: 32px; color: var(--vscode-descriptionForeground); }
    /* Locked overlay */
    .lock-overlay { position: absolute; inset: 0; backdrop-filter: blur(6px); background: rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; border-radius: 8px; z-index: 10; }
    .lock-box { background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-focusBorder); border-radius: 12px; padding: 24px 28px; text-align: center; max-width: 280px; }
    .lock-icon { font-size: 28px; margin-bottom: 10px; }
    .lock-box h3 { font-size: 14px; font-weight: 700; margin-bottom: 8px; color: var(--vscode-foreground); text-transform: none; letter-spacing: 0; }
    .lock-box p { font-size: 12px; color: var(--vscode-descriptionForeground); margin-bottom: 16px; line-height: 1.5; }
    .upgrade-btn { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 6px; padding: 8px 16px; cursor: pointer; font-size: 13px; font-weight: 600; width: 100%; }
    .upgrade-btn:hover { opacity: 0.9; }
    .blurred { filter: blur(4px); pointer-events: none; user-select: none; }
    .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
    .signout-btn { font-size: 11px; color: var(--vscode-descriptionForeground); background: transparent; border: 1px solid var(--vscode-widget-border); border-radius: 4px; padding: 3px 8px; cursor: pointer; }
    .signout-btn:hover { color: var(--vscode-foreground); }
  </style>
</head>
<body>
  <div class="header">
    <h2>◈ AI Token Tracker</h2>
    <button class="signout-btn" onclick="signOut()">Sign out</button>
  </div>

  ${proActions}

  <div class="cards">
    <div class="card"><label>Total Input</label><value>${fmtTokens(stats.allTimeTotalInput)}</value></div>
    <div class="card"><label>Total Output</label><value>${fmtTokens(stats.allTimeTotalOutput)}</value></div>
    ${costCard}
  </div>

  <div class="section" style="position:relative">
    <h3 ${!paid ? 'class="blurred"' : ''}>${chartLabel}</h3>
    ${bars ? `<div class="chart ${!paid ? 'blurred' : ''}">${bars}</div>` : '<div class="chart-empty">No data yet</div>'}
    ${lockedOverlay}
  </div>

  <div class="tabs">
    <button class="tab active" onclick="switchTab('daily', this)">By Day</button>
    <button class="tab" onclick="switchTab('sessions', this)">Sessions</button>
  </div>

  <div id="daily" class="tab-content active" style="position:relative">
    <table class="${!paid ? 'blurred' : ''}">
      <thead><tr>${dailyCols}</tr></thead>
      <tbody>${dailyRows || `<tr><td colspan="${colSpanDaily}" class="empty">No data yet — start using Claude Code.</td></tr>`}</tbody>
    </table>
    ${!paid ? lockedOverlay : ''}
  </div>

  <div id="sessions" class="tab-content" style="position:relative">
    <table class="${!paid ? 'blurred' : ''}">
      <thead><tr>${sessionCols}</tr></thead>
      <tbody>${sessionRows || `<tr><td colspan="${colSpanSession}" class="empty">No sessions yet.</td></tr>`}</tbody>
    </table>
    ${!paid ? lockedOverlay : ''}
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    function switchTab(name, btn) {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      document.getElementById(name).classList.add('active');
      btn.classList.add('active');
    }
    function upgrade() { vscode.postMessage({ command: 'upgrade' }); }
    function compareModels() { vscode.postMessage({ command: 'compareModels' }); }
    function setBudget() { vscode.postMessage({ command: 'setBudget' }); }
    function signOut() { vscode.postMessage({ command: 'signOut' }); }
  </script>
</body>
</html>`;
}

function formatDateLabel(dateStr: string): string {
  const today = new Date().toLocaleDateString('en-CA');
  const yesterday = new Date(Date.now() - 86_400_000).toLocaleDateString('en-CA');
  if (dateStr === today) return 'Today';
  if (dateStr === yesterday) return 'Yesterday';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}
