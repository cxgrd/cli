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
    } catch (err) {
      // Directory might already exist
    }
  }

  async writeGraph(graphData: any): Promise<void> {
    await this.initialize();
    const graphPath = join(this.cgPath, 'graph.json');
    await writeFile(graphPath, JSON.stringify(graphData, null, 2));
  }

  async writeSymbols(symbolsData: any): Promise<void> {
    await this.initialize();
    const symbolsPath = join(this.cgPath, 'symbols.json');
    await writeFile(symbolsPath, JSON.stringify(symbolsData, null, 2));
  }

  async writeArch(archData: any): Promise<void> {
    await this.initialize();
    const archPath = join(this.cgPath, 'arch.json');
    await writeFile(archPath, JSON.stringify(archData, null, 2));
  }

  async writeHistory(historyData: any[]): Promise<void> {
    await this.initialize();
    const historyPath = join(this.cgPath, 'history.json');
    await writeFile(historyPath, JSON.stringify(historyData, null, 2));
  }

  async writePatterns(patternsData: any): Promise<void> {
    await this.initialize();
    const patternsPath = join(this.cgPath, 'patterns.json');
    await writeFile(patternsPath, JSON.stringify(patternsData, null, 2));
  }

  async writeMeta(meta: CgMeta): Promise<void> {
    await this.initialize();
    const metaPath = join(this.cgPath, 'meta.json');
    await writeFile(metaPath, JSON.stringify(meta, null, 2));
  }

  async readGraph(): Promise<any> {
    try {
      const graphPath = join(this.cgPath, 'graph.json');
      const data = await readFile(graphPath, 'utf-8');
      return JSON.parse(data);
    } catch (err) {
      return null;
    }
  }

  async readHistory(): Promise<any[]> {
    try {
      const historyPath = join(this.cgPath, 'history.json');
      const data = await readFile(historyPath, 'utf-8');
      return JSON.parse(data);
    } catch (err) {
      return [];
    }
  }

  async readArch(): Promise<any> {
    try {
      const archPath = join(this.cgPath, 'arch.json');
      const data = await readFile(archPath, 'utf-8');
      return JSON.parse(data);
    } catch (err) {
      return null;
    }
  }

  async readPatterns(): Promise<CgPatternsFile | null> {
    try {
      const patternsPath = join(this.cgPath, 'patterns.json');
      const data = await readFile(patternsPath, 'utf-8');
      return JSON.parse(data) as CgPatternsFile;
    } catch (err) {
      return null;
    }
  }

  async readSymbols(): Promise<Record<string, string[]>> {
    try {
      const symbolsPath = join(this.cgPath, 'symbols.json');
      const data = await readFile(symbolsPath, 'utf-8');
      return JSON.parse(data);
    } catch (err) {
      return {};
    }
  }

  async readMemory(): Promise<CgMemoryFile | null> {
    try {
      const memoryPath = join(this.cgPath, 'memory.json');
      const data = await readFile(memoryPath, 'utf-8');
      return JSON.parse(data) as CgMemoryFile;
    } catch (err) {
      return null;
    }
  }

  async writeMemory(memory: CgMemoryFile): Promise<void> {
    await this.initialize();
    const memoryPath = join(this.cgPath, 'memory.json');
    await writeFile(memoryPath, JSON.stringify(memory, null, 2));
  }

  async writeCheckResult(result: unknown): Promise<void> {
    await this.initialize();
    const checkPath = join(this.cgPath, 'check-latest.json');
    await writeFile(checkPath, JSON.stringify(result, null, 2));
  }

  async readMeta(): Promise<CgMeta | null> {
    try {
      const metaPath = join(this.cgPath, 'meta.json');
      const data = await readFile(metaPath, 'utf-8');
      return JSON.parse(data);
    } catch (err) {
      return null;
    }
  }

  getPath(): string {
    return this.cgPath;
  }
}
