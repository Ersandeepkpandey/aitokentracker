import * as vscode from 'vscode';
import * as http from 'http';
import * as crypto from 'crypto';
import { API_BASE, APP_BASE, LOGIN_TIMEOUT_MS } from './constants';
import { UserSession } from './types';

const SECRET_KEY = 'aiTokenTracker.session';

export class AuthManager {
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  async getSession(): Promise<UserSession | null> {
    const raw = await this.context.secrets.get(SECRET_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as UserSession;
    } catch {
      return null;
    }
  }

  async isAuthenticated(): Promise<boolean> {
    const session = await this.getSession();
    if (!session) return false;
    if (session.expiresAt < Date.now()) {
      return this.tryRefresh(session);
    }
    return true;
  }

  async signIn(): Promise<UserSession | null> {
    const state = crypto.randomBytes(16).toString('hex');
    const port = await this.getFreePort();
    const callbackUrl = `http://127.0.0.1:${port}/callback`;
    const authUrl = `${APP_BASE}/auth/vscode?state=${state}&callback=${encodeURIComponent(callbackUrl)}`;

    await vscode.env.openExternal(vscode.Uri.parse(authUrl));

    return new Promise((resolve) => {
      const server = http.createServer(async (req, res) => {
        const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);
        if (url.pathname !== '/callback') {
          res.writeHead(404);
          res.end();
          return;
        }

        const code = url.searchParams.get('token');
        const returnedState = url.searchParams.get('state');

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html><body style="font-family:sans-serif;text-align:center;padding:60px">
            <h2>Connected to VS Code!</h2>
            <p>You can close this tab and return to VS Code.</p>
          </body></html>
        `);
        server.close();
        clearTimeout(timeout);

        if (!code || returnedState !== state) {
          resolve(null);
          return;
        }

        const session = await this.exchangeCode(code);
        resolve(session);
      });

      server.listen(port);

      const timeout = setTimeout(() => {
        server.close();
        resolve(null);
      }, LOGIN_TIMEOUT_MS);
    });
  }

  async signOut(): Promise<void> {
    await this.context.secrets.delete(SECRET_KEY);
  }

  async saveSession(session: UserSession): Promise<void> {
    await this.context.secrets.store(SECRET_KEY, JSON.stringify(session));
  }

  private async exchangeCode(code: string): Promise<UserSession | null> {
    try {
      const res = await fetch(`${API_BASE}/auth/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) return null;
      const session = (await res.json()) as UserSession;
      await this.saveSession(session);
      return session;
    } catch {
      return null;
    }
  }

  private async tryRefresh(session: UserSession): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      });
      if (!res.ok) return false;
      const refreshed = (await res.json()) as UserSession;
      await this.saveSession(refreshed);
      return true;
    } catch {
      return false;
    }
  }

  private getFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const srv = http.createServer();
      srv.listen(0, '127.0.0.1', () => {
        const addr = srv.address() as { port: number };
        srv.close(() => resolve(addr.port));
      });
      srv.on('error', reject);
    });
  }
}
