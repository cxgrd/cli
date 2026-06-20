import { mkdir, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import type { CgMemoryFile, CgPatternsFile } from './memory/types';

export interface CgMeta {
  lastScan: number;
  projectPath: string;
  languages: string[];
  entryPoints: string[];
}

export interface CgData {
  graph: any;
  symbols: any;
  arch: any;
  history: any[];
  patterns: any;
  meta: CgMeta;
}

export class CgDirectory {
  private cgPath: string;

  constructor(projectPath: string) {
    this.cgPath = join(projectPath, '.cg');
  }

  async initialize(): Promise<void> {
    try {
      await mkdir(this.cgPath, { recursive: true });
    } catch {
      // already exists
    }
  }

  async writeGraph(graphData: any): Promise<void> {
    await this.initialize();
    await writeFile(join(this.cgPath, 'graph.json'), JSON.stringify(graphData, null, 2));
  }

  async writeSymbols(symbolsData: any): Promise<void> {
    await this.initialize();
    await writeFile(join(this.cgPath, 'symbols.json'), JSON.stringify(symbolsData, null, 2));
  }

  async writeArch(archData: any): Promise<void> {
    await this.initialize();
    await writeFile(join(this.cgPath, 'arch.json'), JSON.stringify(archData, null, 2));
  }

  async writeHistory(historyData: any[]): Promise<void> {
    await this.initialize();
    await writeFile(join(this.cgPath, 'history.json'), JSON.stringify(historyData, null, 2));
  }

  async writePatterns(patternsData: any): Promise<void> {
    await this.initialize();
    await writeFile(join(this.cgPath, 'patterns.json'), JSON.stringify(patternsData, null, 2));
  }

  async writeMeta(meta: CgMeta): Promise<void> {
    await this.initialize();
    await writeFile(join(this.cgPath, 'meta.json'), JSON.stringify(meta, null, 2));
  }

  async writeCheckResult(result: unknown): Promise<void> {
    await this.initialize();
    await writeFile(join(this.cgPath, 'check-latest.json'), JSON.stringify(result, null, 2));
  }

  // Persists the last blast radius result so `cxgrd prompt` can reuse
  // already-resolved files instead of re-running broad graph matching
  async writeLastBlast(result: unknown): Promise<void> {
    await this.initialize();
    await writeFile(join(this.cgPath, 'last-blast.json'), JSON.stringify(result, null, 2));
  }

  async readGraph(): Promise<any> {
    try {
      return JSON.parse(await readFile(join(this.cgPath, 'graph.json'), 'utf-8'));
    } catch { return null; }
  }

  async readHistory(): Promise<any[]> {
    try {
      return JSON.parse(await readFile(join(this.cgPath, 'history.json'), 'utf-8'));
    } catch { return []; }
  }

  async readArch(): Promise<any> {
    try {
      return JSON.parse(await readFile(join(this.cgPath, 'arch.json'), 'utf-8'));
    } catch { return null; }
  }

  async readPatterns(): Promise<CgPatternsFile | null> {
    try {
      return JSON.parse(await readFile(join(this.cgPath, 'patterns.json'), 'utf-8')) as CgPatternsFile;
    } catch { return null; }
  }

  async readSymbols(): Promise<Record<string, string[]>> {
    try {
      return JSON.parse(await readFile(join(this.cgPath, 'symbols.json'), 'utf-8'));
    } catch { return {}; }
  }

  async readMemory(): Promise<CgMemoryFile | null> {
    try {
      return JSON.parse(await readFile(join(this.cgPath, 'memory.json'), 'utf-8')) as CgMemoryFile;
    } catch { return null; }
  }

  async writeMemory(memory: CgMemoryFile): Promise<void> {
    await this.initialize();
    await writeFile(join(this.cgPath, 'memory.json'), JSON.stringify(memory, null, 2));
  }

  async readCheckResult(): Promise<any> {
    try {
      return JSON.parse(await readFile(join(this.cgPath, 'check-latest.json'), 'utf-8'));
    } catch { return null; }
  }

  async readLastBlast(): Promise<any> {
    try {
      return JSON.parse(await readFile(join(this.cgPath, 'last-blast.json'), 'utf-8'));
    } catch { return null; }
  }

  async readMeta(): Promise<CgMeta | null> {
    try {
      return JSON.parse(await readFile(join(this.cgPath, 'meta.json'), 'utf-8')) as CgMeta;
    } catch { return null; }
  }

  getPath(): string {
    return this.cgPath;
  }
}
