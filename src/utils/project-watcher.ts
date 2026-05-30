/**
 * File Watcher for Real-time Blast Radius Analysis
 * 
 * Monitors project files and provides real-time feedback on changes
 */

import { watch, FSWatcher } from 'chokidar';
import { resolve } from 'path';
import * as fs from 'fs';

export interface WatchOptions {
  debounce?: number;
  ignored?: string[];
  ignoreInitial?: boolean;
  followSymlinks?: boolean;
  maxListeners?: number;
}

export interface FileChangeEvent {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';
  path: string;
  timestamp: number;
}

export type WatchCallback = (event: FileChangeEvent) => Promise<void>;

export class ProjectWatcher {
  private watcher: FSWatcher | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private debounceMs: number;
  private ignorePatterns: string[];
  private callbacks: WatchCallback[] = [];
  private isWatching: boolean = false;

  constructor(projectRoot: string, options?: WatchOptions) {
    this.debounceMs = options?.debounce ?? 500;
    this.ignorePatterns = options?.ignored ?? [
      'node_modules/**',
      '.git/**',
      '.cg/**',
      'dist/**',
      'build/**',
      '**/*.log',
      '.DS_Store',
      'Thumbs.db',
    ];
  }

  /**
   * Start watching project files
   */
  async start(projectRoot: string): Promise<void> {
    if (this.isWatching) {
      throw new Error('Watcher already running');
    }

    this.watcher = watch(projectRoot, {
      ignored: this.ignorePatterns,
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 100,
      },
    });

    // Bind event handlers
    this.watcher.on('all', (eventName, path) => {
      this.handleFileEvent(eventName as any, path);
    });

    this.watcher.on('error', (error) => {
      console.error('Watch error:', error);
    });

    this.isWatching = true;
  }

  /**
   * Stop watching
   */
  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    this.isWatching = false;
  }

  /**
   * Register a callback for file changes
   */
  onChange(callback: WatchCallback): void {
    this.callbacks.push(callback);
  }

  /**
   * Handle file system event with debouncing
   */
  private handleFileEvent(eventType: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir', filePath: string): void {
    // Debounce rapid file changes
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      const event: FileChangeEvent = {
        type: eventType,
        path: filePath,
        timestamp: Date.now(),
      };

      // Notify all callbacks
      for (const callback of this.callbacks) {
        callback(event).catch(err => {
          console.error('Callback error:', err);
        });
      }
    }, this.debounceMs);
  }

  /**
   * Check if watcher is active
   */
  isRunning(): boolean {
    return this.isWatching;
  }

  /**
   * Get list of watched files (if watcher is running)
   */
  getWatchedFiles(): string[] {
    if (!this.watcher) return [];

    try {
      return this.watcher.getWatched()
        ? Object.values(this.watcher.getWatched() as any)
            .flat()
            .filter(f => typeof f === 'string')
        : [];
    } catch {
      return [];
    }
  }
}

/**
 * Interactive watch mode UI
 */
export class WatchModeUI {
  private changeCount: number = 0;
  private lastAnalysisTime: number = 0;

  /**
   * Display watch mode banner
   */
  displayBanner(): void {
    console.clear();
    console.log('╔════════════════════════════════════════════╗');
    console.log('║     🔍  CXGRD Watch Mode (Press Q to quit) ║');
    console.log('╚════════════════════════════════════════════╝\n');
  }

  /**
   * Display file change notification
   */
  displayFileChange(filePath: string, eventType: string): void {
    const icons: Record<string, string> = {
      add: '✨',
      change: '📝',
      unlink: '🗑️ ',
      addDir: '📁',
      unlinkDir: '📂',
    };

    const icon = icons[eventType] || '•';
    const time = new Date().toLocaleTimeString();

    console.log(`${icon} [${time}] ${eventType}: ${filePath}`);
  }

  /**
   * Display analysis result
   */
  displayAnalysisResult(result: any): void {
    const analysisTime = ((Date.now() - this.lastAnalysisTime) / 1000).toFixed(2);
    console.log(
      `\n⚡ Analysis complete (${analysisTime}s) - Risk Level: ${result.riskLevel.toUpperCase()} (${result.totalRisk}/100)`
    );

    if (result.affectedFiles.length > 0) {
      console.log(`   → ${result.directlyAffected} direct impact(s), ${result.transitivelyAffected} transitive`);

      const topFiles = result.affectedFiles.slice(0, 3);
      for (const file of topFiles) {
        const severity = file.severity.toUpperCase();
        console.log(`      • [${severity}] ${file.path}`);
      }

      if (result.affectedFiles.length > 3) {
        console.log(`      ... and ${result.affectedFiles.length - 3} more`);
      }
    } else {
      console.log(`   → No other files affected`);
    }

    this.changeCount++;
    this.lastAnalysisTime = Date.now();
  }

  /**
   * Display error
   */
  displayError(error: string): void {
    console.log(`\n❌ Error: ${error}`);
  }

  /**
   * Display stats
   */
  displayStats(stats: {
    filesWatched?: number;
    filesChanged?: number;
    analysisCount?: number;
  }): void {
    console.log(`\n📊 Stats:`);
    if (stats.filesWatched) console.log(`   Files watched: ${stats.filesWatched}`);
    if (stats.filesChanged) console.log(`   Changes detected: ${stats.filesChanged}`);
    if (stats.analysisCount) console.log(`   Analyses run: ${stats.analysisCount}`);
  }

  /**
   * Setup keyboard input handler
   */
  setupKeyboardHandler(onQuit: () => void): void {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    process.stdin.on('data', (key: Buffer) => {
      const char = key.toString().toLowerCase();

      if (char === 'q') {
        onQuit();
      } else if (char === 'c' && process.stdin.isTTY) {
        // Allow Ctrl+C
        process.exit(0);
      }
    });
  }

  /**
   * Display shutdown message
   */
  displayShutdown(): void {
    console.log('\n\n👋 Watch mode stopped.');
    console.log(`   Analyzed ${this.changeCount} change(s).`);
  }
}
