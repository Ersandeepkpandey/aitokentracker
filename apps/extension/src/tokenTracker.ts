import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EventEmitter } from 'events';
import chokidar from 'chokidar';
import { calcCost } from './pricing';
import { SessionStats, AllStats } from './types';

export class TokenTracker extends EventEmitter {
  private logBasePath: string;
  private configModel: string;
  private sessions = new Map<string, SessionStats>();
  private fileOffsets = new Map<string, number>();
  private watcher: ReturnType<typeof chokidar.watch> | null = null;
  private emitDebounce: ReturnType<typeof setTimeout> | null = null;

  constructor(customLogPath: string, model: string) {
    super();
    this.configModel = model;
    this.logBasePath = customLogPath || path.join(os.homedir(), '.claude');
  }

  start() {
    if (!fs.existsSync(this.logBasePath)) {
      // Claude not yet installed — poll until the dir appears
      const poll = setInterval(() => {
        if (fs.existsSync(this.logBasePath)) {
          clearInterval(poll);
          this.startWatcher();
        }
      }, 5000);
      return;
    }
    this.startWatcher();
  }

  stop() {
    this.watcher?.close();
    this.watcher = null;
    if (this.emitDebounce) clearTimeout(this.emitDebounce);
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
    this.scheduleEmit();
  }

  getStats(): AllStats {
    const sessions = Array.from(this.sessions.values())
      .sort((a, b) => b.lastUpdate - a.lastUpdate);
    // Current session = most-recently-updated session in the last 2 hours
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    const currentSession = sessions.find(s => s.lastUpdate >= twoHoursAgo) || null;
    return {
      currentSession,
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
      this.scheduleEmit();
    }
  }

  private startWatcher() {
    const globPattern = path.join(this.logBasePath, '**', '*.jsonl').replace(/\\/g, '/');

    this.watcher = chokidar.watch(globPattern, {
      ignoreInitial: false,
      persistent: true,
      usePolling: false,
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
    });

    this.watcher
      .on('add',    (filePath) => this.readFrom(filePath, 0))
      .on('change', (filePath) => this.readFrom(filePath, this.fileOffsets.get(filePath) || 0));
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
      let changed = false;
      for (const line of buf.toString('utf8').split('\n')) {
        if (line.trim()) { changed = this.parseLine(filePath, line) || changed; }
      }
      if (changed) { this.scheduleEmit(); }
    } catch {}
  }

  private parseLine(filePath: string, line: string): boolean {
    try {
      const obj = JSON.parse(line);
      const usage = obj.usage ?? obj.message?.usage;
      if (!usage) return false;

      const inputTokens  = (usage.input_tokens               || 0) as number;
      const outputTokens = (usage.output_tokens              || 0) as number;
      const cacheWrite   = (usage.cache_creation_input_tokens || 0) as number;
      const cacheRead    = (usage.cache_read_input_tokens    || 0) as number;
      if (inputTokens === 0 && outputTokens === 0) return false;

      const model     = (obj.message?.model || obj.model || this.configModel) as string;
      const sessionId = path.basename(filePath, '.jsonl');
      const existing  = this.sessions.get(sessionId) || this.createSession(sessionId, filePath, model);

      existing.totalInput      += inputTokens;
      existing.totalOutput     += outputTokens;
      existing.totalCacheWrite += cacheWrite;
      existing.totalCacheRead  += cacheRead;
      existing.turns           += 1;
      existing.lastUpdate       = Date.now();
      if (model) { existing.model = model; }
      existing.estimatedCost = calcCost(existing.model, {
        input: existing.totalInput, output: existing.totalOutput,
        cacheRead: existing.totalCacheRead, cacheWrite: existing.totalCacheWrite,
      });
      this.sessions.set(sessionId, existing);
      return true;
    } catch {
      return false;
    }
  }

  private createSession(sessionId: string, filePath: string, model: string): SessionStats {
    let startTime = Date.now();
    try { startTime = fs.statSync(filePath).birthtimeMs; } catch {}
    return {
      sessionId,
      filePath,
      model: model || this.configModel,
      aiProvider: 'claude',
      projectName: this.extractProjectName(filePath),
      totalInput: 0, totalOutput: 0, totalCacheRead: 0, totalCacheWrite: 0,
      turns: 0, startTime, lastUpdate: Date.now(), estimatedCost: 0,
    };
  }

  // Claude stores sessions at: ~/.claude/projects/<encoded-path>/<session-id>.jsonl
  // The directory name is the project path with `/` replaced by `-`
  private extractProjectName(filePath: string): string {
    try {
      const projectDir = path.basename(path.dirname(filePath));
      // Decode: leading `-` from root `/`, then split on `-`
      const decoded = projectDir.replace(/^-/, '/').replace(/-/g, '/');
      const parts = decoded.split('/').filter(Boolean);
      // Return last two path segments as "parent/project"
      if (parts.length >= 2) { return parts.slice(-2).join('/'); }
      if (parts.length === 1) { return parts[0]; }
    } catch {}
    return 'Unknown';
  }

  // Debounce emit so rapid file changes produce one update event
  private scheduleEmit() {
    if (this.emitDebounce) { clearTimeout(this.emitDebounce); }
    this.emitDebounce = setTimeout(() => {
      this.emit('update', this.getStats());
    }, 150);
  }
}
