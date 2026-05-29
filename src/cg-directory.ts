import { mkdir, writeFile, readFile } from 'fs/promises';
import { join } from 'path';

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

  async readPatterns(): Promise<any> {
    try {
      const patternsPath = join(this.cgPath, 'patterns.json');
      const data = await readFile(patternsPath, 'utf-8');
      return JSON.parse(data);
    } catch (err) {
      return {};
    }
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
