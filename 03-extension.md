# VS Code Extension — Build Guide

> Complete build guide for the AI Token Tracker VS Code extension. All source files, build setup, and publishing instructions.

---

## Project Setup

```bash
cd apps/extension

# Install dependencies
pnpm add -D @types/vscode @types/node typescript esbuild @vscode/vsce
pnpm add chokidar   # reliable cross-platform file watching
```

`package.json` — full manifest:
```json
{
  "name": "ai-token-tracker",
  "displayName": "AI Token Tracker",
  "description": "Real-time token usage and cost tracking for Claude, OpenAI, and all AI APIs",
  "version": "1.0.0",
  "publisher": "YOUR_PUBLISHER_ID",
  "engines": { "vscode": "^1.85.0" },
  "categories": ["Other", "Visualization"],
  "keywords": ["claude", "openai", "tokens", "cost", "ai", "tracker"],
  "activationEvents": ["onStartupFinished"],
  "main": "./dist/extension.js",
  "contributes": {
    "commands": [
      { "command": "aiTokenTracker.showDashboard",  "title": "AI Token Tracker: Show Dashboard" },
      { "command": "aiTokenTracker.signIn",          "title": "AI Token Tracker: Sign In" },
      { "command": "aiTokenTracker.signOut",         "title": "AI Token Tracker: Sign Out" },
      { "command": "aiTokenTracker.resetSession",    "title": "AI Token Tracker: Reset Current Session" },
      { "command": "aiTokenTracker.setModel",        "title": "AI Token Tracker: Set Model" },
      { "command": "aiTokenTracker.viewPlans",       "title": "AI Token Tracker: View Plans" }
    ],
    "configuration": {
      "title": "AI Token Tracker",
      "properties": {
        "aiTokenTracker.model": {
          "type": "string",
          "default": "claude-sonnet-4",
          "enum": ["claude-opus-4", "claude-sonnet-4", "claude-haiku-3-5", "gpt-4o", "gpt-4o-mini"],
          "description": "Default model for cost calculation"
        },
        "aiTokenTracker.claudeLogPath": {
          "type": "string",
          "default": "",
          "description": "Custom path to Claude Code logs (auto-detected if empty: ~/.claude)"
        },
        "aiTokenTracker.showStatusBar": {
          "type": "boolean",
          "default": true
        },
        "aiTokenTracker.syncEnabled": {
          "type": "boolean",
          "default": true,
          "description": "Sync usage data to your account (requires sign-in)"
        }
      }
    }
  },
  "scripts": {
    "compile":          "node esbuild.js",
    "watch":            "node esbuild.js --watch",
    "vscode:prepublish":"node esbuild.js --production",
    "package":          "vsce package --no-yarn",
    "publish":          "vsce publish --no-yarn"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/vscode": "^1.85.0",
    "@vscode/vsce": "^2.24.0",
    "esbuild": "^0.20.0",
    "typescript": "^5.3.0"
  },
  "dependencies": {
    "chokidar": "^3.6.0"
  }
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2020",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "exclude": ["node_modules", "dist"]
}
```

`esbuild.js`:
```javascript
const esbuild = require('esbuild');
const isProduction = process.argv.includes('--production');
const isWatch = process.argv.includes('--watch');

const ctx = await esbuild.context({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],   // vscode module provided by VS Code runtime
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  minify: isProduction,
  sourcemap: !isProduction,
  define: {
    'process.env.API_BASE': JSON.stringify(isProduction ? 'https://api.aitokentracker.com' : 'http://localhost:3001'),
    'process.env.APP_BASE': JSON.stringify(isProduction ? 'https://aitokentracker.com' : 'http://localhost:3000'),
  },
});

if (isWatch) {
  await ctx.watch();
  console.log('Watching...');
} else {
  await ctx.rebuild();
  await ctx.dispose();
  console.log('Build complete.');
}
```

---

## Source Files

### `src/constants.ts`
```typescript
export const API_BASE = process.env.API_BASE || 'http://localhost:3001';
export const APP_BASE = process.env.APP_BASE || 'http://localhost:3000';
export const SYNC_INTERVAL_MS = 10_000;
export const SESSION_DISCOVERY_INTERVAL_MS = 2_000;
export const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
```

### `src/types.ts`
```typescript
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
  free:       { historyDays: 30,  modelComparison: false, costPrediction: false, export: false, budgetAlerts: false },
  pro:        { historyDays: 365, modelComparison: true,  costPrediction: true,  export: true,  budgetAlerts: true },
  team:       { historyDays: 365, modelComparison: true,  costPrediction: true,  export: true,  budgetAlerts: true },
  enterprise: { historyDays: 9999,modelComparison: true,  costPrediction: true,  export: true,  budgetAlerts: true },
};
```

### `src/pricing.ts`
```typescript
const PRICING: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  'claude-opus-4':      { input: 15.00, output: 75.00, cacheRead: 1.50,  cacheWrite: 18.75 },
  'claude-sonnet-4':    { input:  3.00, output: 15.00, cacheRead: 0.30,  cacheWrite:  3.75 },
  'claude-haiku-3-5':   { input:  0.80, output:  4.00, cacheRead: 0.08,  cacheWrite:  1.00 },
  'gpt-4o':             { input:  2.50, output: 10.00, cacheRead: 1.25,  cacheWrite:  0    },
  'gpt-4o-mini':        { input:  0.15, output:  0.60, cacheRead: 0.075, cacheWrite:  0    },
};

const DEFAULT = { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 };

export function calcCost(model: string, tokens: { input: number; output: number; cacheRead: number; cacheWrite: number }): number {
  const p = PRICING[model] || DEFAULT;
  const M = 1_000_000;
  return (tokens.input / M * p.input) + (tokens.output / M * p.output)
       + (tokens.cacheRead / M * p.cacheRead) + (tokens.cacheWrite / M * p.cacheWrite);
}
```

### `src/tokenTracker.ts`
```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EventEmitter } from 'events';
import { calcCost } from './pricing';
import { SessionStats, AllStats } from './types';

export class TokenTracker extends EventEmitter {
  private logBasePath: string;
  private configModel: string;
  private sessions = new Map<string, SessionStats>();
  private fileOffsets = new Map<string, number>();
  private fileWatchers = new Map<string, fs.FSWatcher>();
  private pollTimer: NodeJS.Timeout | null = null;

  constructor(customLogPath: string, model: string) {
    super();
    this.configModel = model;
    this.logBasePath = customLogPath || path.join(os.homedir(), '.claude');
  }

  start() {
    this.discoverAndWatch();
    this.pollTimer = setInterval(() => this.discoverAndWatch(), 2000);
  }

  stop() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    for (const w of this.fileWatchers.values()) w.close();
    this.fileWatchers.clear();
  }

  setModel(model: string) {
    this.configModel = model;
    for (const [id, s] of this.sessions) {
      s.estimatedCost = calcCost(model, { input: s.totalInput, output: s.totalOutput, cacheRead: s.totalCacheRead, cacheWrite: s.totalCacheWrite });
      this.sessions.set(id, s);
    }
    this.emit('update', this.getStats());
  }

  getStats(): AllStats {
    const sessions = Array.from(this.sessions.values()).sort((a, b) => b.lastUpdate - a.lastUpdate);
    return {
      currentSession: sessions[0] || null,
      sessions,
      allTimeTotalInput:  sessions.reduce((a, s) => a + s.totalInput,  0),
      allTimeTotalOutput: sessions.reduce((a, s) => a + s.totalOutput, 0),
      allTimeTotalCost:   sessions.reduce((a, s) => a + s.estimatedCost, 0),
    };
  }

  resetCurrentSession() {
    const current = this.getStats().currentSession;
    if (current) {
      this.sessions.delete(current.sessionId);
      this.fileOffsets.delete(current.filePath);
      this.emit('update', this.getStats());
    }
  }

  private discoverAndWatch() {
    if (!fs.existsSync(this.logBasePath)) return;
    for (const f of this.findJsonlFiles(this.logBasePath)) {
      if (!this.fileOffsets.has(f)) {
        this.fileOffsets.set(f, 0);
        this.readFrom(f, 0);
        this.watchFile(f);
      }
    }
  }

  private findJsonlFiles(dir: string, depth = 0): string[] {
    if (depth > 6) return [];
    const results: string[] = [];
    try {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) results.push(...this.findJsonlFiles(p, depth + 1));
        else if (e.isFile() && e.name.endsWith('.jsonl')) results.push(p);
      }
    } catch {}
    return results;
  }

  private watchFile(filePath: string) {
    try {
      const w = fs.watch(filePath, { persistent: false }, () => {
        this.readFrom(filePath, this.fileOffsets.get(filePath) || 0);
      });
      this.fileWatchers.set(filePath, w);
    } catch {}
  }

  private readFrom(filePath: string, offset: number) {
    try {
      const stat = fs.statSync(filePath);
      if (stat.size <= offset) return;
      const fd = fs.openSync(filePath, 'r');
      const buf = Buffer.alloc(stat.size - offset);
      fs.readSync(fd, buf, 0, buf.length, offset);
      fs.closeSync(fd);
      this.fileOffsets.set(filePath, stat.size);
      for (const line of buf.toString('utf8').split('\n').filter(Boolean)) {
        this.parseLine(filePath, line);
      }
      this.emit('update', this.getStats());
    } catch {}
  }

  private parseLine(filePath: string, line: string) {
    try {
      const obj = JSON.parse(line);
      const usage = obj.usage || obj.message?.usage;
      if (!usage) return;

      const model = obj.message?.model || obj.model || this.configModel;
      const sessionId = path.basename(filePath, '.jsonl');
      const existing = this.sessions.get(sessionId) || this.createSession(sessionId, filePath, model);

      existing.totalInput      += usage.input_tokens              || 0;
      existing.totalOutput     += usage.output_tokens             || 0;
      existing.totalCacheWrite += usage.cache_creation_input_tokens || 0;
      existing.totalCacheRead  += usage.cache_read_input_tokens   || 0;
      existing.turns           += 1;
      existing.lastUpdate       = Date.now();
      if (model) existing.model = model;
      existing.estimatedCost    = calcCost(existing.model, { input: existing.totalInput, output: existing.totalOutput, cacheRead: existing.totalCacheRead, cacheWrite: existing.totalCacheWrite });

      this.sessions.set(sessionId, existing);
    } catch {}
  }

  private createSession(sessionId: string, filePath: string, model: string): SessionStats {
    let startTime = Date.now();
    try { startTime = fs.statSync(filePath).birthtimeMs; } catch {}
    return {
      sessionId, filePath, model: model || this.configModel,
      aiProvider: 'claude', projectName: 'Unknown',
      totalInput: 0, totalOutput: 0, totalCacheRead: 0, totalCacheWrite: 0,
      turns: 0, startTime, lastUpdate: Date.now(), estimatedCost: 0,
    };
  }
}
```

### `src/authManager.ts`
*(Full implementation in the previous output — copy from there)*

### `src/usageSync.ts`
*(Full implementation in the previous output — copy from there)*

### `src/onboardingPanel.ts`
*(Full implementation in the previous output — copy from there)*

---

## Building & Packaging

```bash
# Development (with watch + source maps)
pnpm watch

# Package as .vsix
pnpm package
# → ai-token-tracker-1.0.0.vsix

# Install locally for testing
code --install-extension ai-token-tracker-1.0.0.vsix

# Publish to VS Code Marketplace
# 1. Create publisher at https://marketplace.visualstudio.com/manage
# 2. Generate PAT in Azure DevOps with Marketplace (publish) scope
vsce login YOUR_PUBLISHER_ID
pnpm publish
```

---

## Testing the Auth Flow Locally

```bash
# 1. Start backend on port 3001
cd apps/api && pnpm dev

# 2. Start website on port 3000
cd apps/web && pnpm dev

# 3. Press F5 in VS Code with extension folder open
# → opens Extension Development Host

# 4. In the Dev Host: Ctrl+Shift+P → "AI Token Tracker: Sign In"
# → browser opens http://localhost:3000/auth/vscode?state=...&callback=http://localhost:PORT/callback
# → complete signup in browser
# → extension receives callback, exchanges code, stores session
# → status bar updates with user info
```

---

## Key Implementation Notes

**SecretStorage vs globalState:**
Never store the auth token in `context.globalState` — it's stored in plain JSON. Always use `context.secrets.store()` which uses the OS keychain (Keychain on macOS, Credential Manager on Windows, libsecret on Linux). It's encrypted automatically.

**Incremental file reading:**
The token tracker never reads the entire file on each update. It tracks the byte offset of the last read and only reads new bytes. On a busy session with frequent syncs, this is critical for performance.

**Debounced sync:**
`usageSync.ts` batches updates and sends them at most once every 10 seconds. When VS Code closes, `deactivate()` calls `usageSync.forceSync()` to flush any pending data before the process exits.

**Plan enforcement in extension:**
The extension checks `session.plan` before showing Pro features. However, this is only UX — the real enforcement happens server-side. Don't gate anything security-critical on the client-side plan check.

**VSIX size:**
With esbuild bundling and `chokidar` as the only runtime dependency, the final `.vsix` should be under 500KB. Keep it that way — large extensions load slowly.

---

## .vscodeignore

```
.vscode/**
src/**
node_modules/**
*.ts
tsconfig.json
esbuild.js
.env
*.map
```

---

## Publishing Checklist

- [ ] Update `version` in `package.json`
- [ ] Update `CHANGELOG.md`
- [ ] Set production `API_BASE` and `APP_BASE` in `esbuild.js`
- [ ] Run `pnpm vscode:prepublish` (builds minified bundle)
- [ ] Test `.vsix` with `code --install-extension`
- [ ] Test full auth flow against production backend
- [ ] `vsce publish` — or drag `.vsix` to Marketplace web UI
