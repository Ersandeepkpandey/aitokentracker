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
      s.estimatedCost = calcCost(model, {
        input: s.totalInput, output: s.totalOutput,
        cacheRead: s.totalCacheRead, cacheWrite: s.totalCacheWrite,
      });
      this.sessions.set(id, s);
    }
    this.emit('update', this.getStats());
  }

  getStats(): AllStats {
    const sessions = Array.from(this.sessions.values())
      .sort((a, b) => b.lastUpdate - a.lastUpdate);
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

      existing.totalInput      += usage.input_tokens               || 0;
      existing.totalOutput     += usage.output_tokens              || 0;
      existing.totalCacheWrite += usage.cache_creation_input_tokens || 0;
      existing.totalCacheRead  += usage.cache_read_input_tokens    || 0;
      existing.turns           += 1;
      existing.lastUpdate       = Date.now();
      if (model) existing.model = model;
      existing.estimatedCost = calcCost(existing.model, {
        input: existing.totalInput, output: existing.totalOutput,
        cacheRead: existing.totalCacheRead, cacheWrite: existing.totalCacheWrite,
      });

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
