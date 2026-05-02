import * as vscode from 'vscode';
import { AuthManager } from './authManager';

export class OnboardingPanel {
  private static currentPanel: OnboardingPanel | undefined;
  private panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  static show(context: vscode.ExtensionContext, authManager: AuthManager, onSignedIn: () => void) {
    if (OnboardingPanel.currentPanel) {
      OnboardingPanel.currentPanel.panel.reveal();
      return;
    }
    new OnboardingPanel(context, authManager, onSignedIn);
  }

  private constructor(context: vscode.ExtensionContext, authManager: AuthManager, onSignedIn: () => void) {
    this.panel = vscode.window.createWebviewPanel(
      'aiTokenTrackerOnboarding',
      'AI Token Tracker — Sign In',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    this.panel.webview.html = this.getHtml();

    this.panel.webview.onDidReceiveMessage(
      async (message) => {
        if (message.command === 'signIn') {
          this.panel.webview.postMessage({ command: 'setLoading', loading: true });
          const session = await authManager.signIn();
          if (session) {
            this.panel.dispose();
            vscode.window.showInformationMessage(`Signed in as ${session.email} — tracking started!`);
            onSignedIn();
          } else {
            this.panel.webview.postMessage({ command: 'setLoading', loading: false });
            vscode.window.showErrorMessage('Sign-in failed or timed out. Please try again.');
          }
        }
      },
      null,
      this.disposables
    );

    this.panel.onDidDispose(() => {
      OnboardingPanel.currentPanel = undefined;
      this.disposables.forEach(d => d.dispose());
    }, null, this.disposables);

    OnboardingPanel.currentPanel = this;
  }

  private getHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Token Tracker — Sign In</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 24px;
    }
    .card {
      max-width: 440px;
      width: 100%;
      text-align: center;
    }
    .logo { font-size: 52px; margin-bottom: 20px; }
    h1 { font-size: 22px; font-weight: 700; margin-bottom: 10px; }
    .subtitle {
      color: var(--vscode-descriptionForeground);
      font-size: 13px;
      line-height: 1.6;
      margin-bottom: 28px;
    }
    .features {
      text-align: left;
      background: var(--vscode-editorWidget-background);
      border: 1px solid var(--vscode-widget-border);
      border-radius: 10px;
      padding: 18px 20px;
      margin-bottom: 24px;
    }
    .feature {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      margin-bottom: 12px;
      font-size: 13px;
      line-height: 1.5;
    }
    .feature:last-child { margin-bottom: 0; }
    .feature-icon { font-size: 16px; flex-shrink: 0; margin-top: 1px; }
    .btn {
      width: 100%;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      padding: 12px 24px;
      border-radius: 7px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: opacity 0.15s;
    }
    .btn:hover { opacity: 0.9; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .spinner {
      width: 16px; height: 16px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
      display: none;
    }
    .btn.loading .spinner { display: block; }
    .btn.loading .btn-label { display: none; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .note {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">◈</div>
    <h1>AI Token Tracker</h1>
    <p class="subtitle">Sign in to track your real-time AI token usage and costs across all sessions.</p>

    <div class="features">
      <div class="feature">
        <span class="feature-icon">📊</span>
        <span><strong>Live status bar</strong> — see token count and cost update as you work</span>
      </div>
      <div class="feature">
        <span class="feature-icon">📈</span>
        <span><strong>Usage history</strong> — 30-day dashboard with daily and per-model breakdowns</span>
      </div>
      <div class="feature">
        <span class="feature-icon">🔔</span>
        <span><strong>Budget alerts</strong> — get notified before you overspend</span>
      </div>
      <div class="feature">
        <span class="feature-icon">🔒</span>
        <span><strong>Privacy first</strong> — only token counts leave your machine, never your prompts</span>
      </div>
    </div>

    <button class="btn" id="signInBtn" onclick="handleSignIn()">
      <div class="spinner"></div>
      <span class="btn-label">Sign In / Create Free Account</span>
    </button>

    <p class="note">A browser tab will open for sign-in. Return to VS Code once complete.</p>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    function handleSignIn() {
      const btn = document.getElementById('signInBtn');
      btn.disabled = true;
      btn.classList.add('loading');
      vscode.postMessage({ command: 'signIn' });
    }

    window.addEventListener('message', (e) => {
      if (e.data.command === 'setLoading' && !e.data.loading) {
        const btn = document.getElementById('signInBtn');
        btn.disabled = false;
        btn.classList.remove('loading');
      }
    });
  </script>
</body>
</html>`;
  }
}
