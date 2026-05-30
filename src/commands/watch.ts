/**
 * Watch Command
 * 
 * Real-time monitoring and analysis of file changes
 */

import { resolve } from 'path';
import { CgDirectory } from '../cg-directory';
import { ProjectWatcher, WatchModeUI } from '../utils/project-watcher';
import { BlastRadiusAnalyzer } from '../utils/blast-radius-analyzer';
import { RichOutput } from '../utils/cli-formatter';

export interface WatchOptions {
  debounce?: number;
  shallow?: boolean;
}

export async function watchCommand(projectPath?: string, options?: WatchOptions): Promise<void> {
  const rootPath = resolve(projectPath || process.cwd());

  RichOutput.header('Watch Mode');

  try {
    const cgDir = new CgDirectory(rootPath);
    const graph = await cgDir.readGraph();

    if (!graph) {
      RichOutput.error('No dependency graph found. Run "cxgrd scan" first.');
      process.exit(1);
    }

    RichOutput.info('Starting file watcher...');
    RichOutput.info('Press Q to quit\n');

    const watcher = new ProjectWatcher(rootPath, { debounce: options?.debounce || 500 });
    const ui = new WatchModeUI();
    const analyzer = new BlastRadiusAnalyzer(graph);

    let lastAnalyzedFiles = new Set<string>();
    let isAnalyzing = false;

    // Setup change handler
    watcher.onChange(async (event) => {
      if (isAnalyzing) return; // Skip if already analyzing

      ui.displayFileChange(event.path, event.type);

      // Trigger analysis for the changed file
      if (event.type === 'change' || event.type === 'add') {
        isAnalyzing = true;

        try {
          const result = analyzer.analyze([event.path]);

          if (result.riskLevel !== 'low' || result.affectedFiles.length > 0) {
            ui.displayAnalysisResult(result);
          }

          lastAnalyzedFiles.add(event.path);
        } catch (err: any) {
          ui.displayError(err.message);
        } finally {
          isAnalyzing = false;
        }
      }
    });

    // Setup keyboard handler
    ui.setupKeyboardHandler(async () => {
      console.log('\n\n🛑 Stopping watch mode...');
      await watcher.stop();
      ui.displayShutdown();
      process.exit(0);
    });

    // Display UI
    ui.displayBanner();

    // Start watcher
    await watcher.start(rootPath);

    RichOutput.success('Watch mode active');
    console.log(`   Monitoring: ${rootPath}`);
    console.log(`   Graph files: ${Object.keys(graph.files || {}).length}`);
    console.log(`   Debounce: ${options?.debounce || 500}ms\n`);

    // Keep process alive
    await new Promise(() => { });
  } catch (err: any) {
    RichOutput.error(err.message);
    process.exit(1);
  }
}
