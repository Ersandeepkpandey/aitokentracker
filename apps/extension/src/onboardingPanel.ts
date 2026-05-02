import * as vscode from 'vscode';
import { APP_BASE } from './constants';

export class OnboardingPanel {
  private static currentPanel: OnboardingPanel | undefined;
  private panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  static show(context: vscode.ExtensionContext) {
    if (OnboardingPanel.currentPanel) {
      OnboardingPanel.currentPanel.panel.reveal();
      return;
    }
    new OnboardingPanel(context);
  }

  private constructor(context: vscode.ExtensionContext) {
    this.panel = vscode.window.createWebviewPanel(
      'aiTokenTrackerOnboarding',
      'AI Token Tracker — Welcome',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    this.panel.webview.html = this.getHtml();
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
  <title>AI Token Tracker</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 24px;
      box-sizing: border-box;
    }
    .card {
      max-width: 480px;
      width: 100%;
      text-align: center;
    }
    .logo { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 24px; font-weight: 600; margin-bottom: 8px; }
    p { color: var(--vscode-descriptionForeground); margin-bottom: 24px; line-height: 1.6; }
    .steps {
      text-align: left;
      background: var(--vscode-editorWidget-background);
      border: 1px solid var(--vscode-widget-border);
      border-radius: 8px;
      padding: 20px 24px;
      margin-bottom: 24px;
    }
    .step { display: flex; gap: 12px; margin-bottom: 16px; }
    .step:last-child { margin-bottom: 0; }
    .step-num {
      width: 24px; height: 24px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 600; flex-shrink: 0;
    }
    .step-text { font-size: 13px; line-height: 1.5; }
    .cta {
      display: inline-block;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      padding: 10px 24px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      border: none;
      text-decoration: none;
    }
    .cta:hover { background: var(--vscode-button-hoverBackground); }
    .note { font-size: 12px; margin-top: 12px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">◈</div>
    <h1>Welcome to AI Token Tracker</h1>
    <p>Track real-time token usage and cost for Claude, OpenAI, and all AI APIs — right in your status bar.</p>
    <div class="steps">
      <div class="step">
        <div class="step-num">1</div>
        <div class="step-text"><strong>Open Claude Code</strong> — the extension auto-detects usage from <code>~/.claude</code> logs.</div>
      </div>
      <div class="step">
        <div class="step-num">2</div>
        <div class="step-text"><strong>Watch your status bar</strong> — token count and cost update live as you work.</div>
      </div>
      <div class="step">
        <div class="step-num">3</div>
        <div class="step-text"><strong>Sign in (optional)</strong> — get 30-day history, usage dashboard, and sync across devices.</div>
      </div>
    </div>
    <button class="cta" onclick="vscode.postMessage({command:'signIn'})">
      Sign In / Create Free Account
    </button>
    <p class="note">Privacy first: only token counts and cost estimates leave your machine. Never prompts or responses.</p>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
  </script>
</body>
</html>`;
  }
}
