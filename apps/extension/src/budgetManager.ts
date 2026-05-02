import * as vscode from 'vscode';
import { AuthManager } from './authManager';
import { API_BASE } from './constants';

export class BudgetManager {
  constructor(private authManager: AuthManager) {}

  async setBudget(context: vscode.ExtensionContext) {
    const type = await vscode.window.showQuickPick(
      ['daily', 'weekly', 'monthly'],
      { placeHolder: 'Select budget period' }
    );
    if (!type) return;

    const input = await vscode.window.showInputBox({
      prompt: `Set ${type} spending limit in USD (e.g. 5.00)`,
      validateInput: v => isNaN(parseFloat(v)) || parseFloat(v) <= 0 ? 'Enter a positive number' : null,
    });
    if (!input) return;

    const limitUsd = parseFloat(input);
    const token = await this.authManager.getToken();
    if (!token) { vscode.window.showErrorMessage('Not signed in'); return; }

    try {
      const res = await fetch(`${API_BASE}/user/budget`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, limitUsd }),
      });
      if (!res.ok) throw new Error(await res.text());
      vscode.window.showInformationMessage(`Budget set: $${limitUsd.toFixed(2)}/${type}`);
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to set budget: ${err}`);
    }
  }

  async getBudgets(): Promise<Array<{ type: string; limitUsd: number; alertAt: number }>> {
    const token = await this.authManager.getToken();
    if (!token) return [];
    try {
      const res = await fetch(`${API_BASE}/user/budget`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      return res.ok ? await res.json() : [];
    } catch {
      return [];
    }
  }
}
