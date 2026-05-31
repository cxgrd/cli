import { resolve } from 'path';
import { FileScanner } from '../scanner';
import { DependencyGraphBuilder } from '../graph';
import { CgDirectory } from '../cg-directory';
import chalk from 'chalk';
import { diffGraphs, analyzePatterns } from '../memory/pattern-analyzer';
import type { CgPatternsFile } from '../memory/types';
import { appendMemorySession } from '../memory/repo-memory';

export async function scanCommand(projectPath?: string): Promise<void> {
  const rootPath = resolve(projectPath || process.cwd());

  console.log(chalk.blue('🔍 Scanning project...'));
  console.log(chalk.gray(`   Path: ${rootPath}`));

  try {
    const cgDir = new CgDirectory(rootPath);
    const previousGraph = await cgDir.readGraph();
    const previousPatterns = await cgDir.readPatterns();

    const scanner = new FileScanner();
    const files = await scanner.scanDirectory(rootPath);

    console.log(chalk.green(`✓ Found ${files.length} source files`));

    const builder = new DependencyGraphBuilder();
    const graph = builder.buildGraph(files);

    console.log(chalk.blue('📊 Building dependency graph...'));
    console.log(
      chalk.gray(
        `   Total dependencies: ${graph.stats.totalDependencies}`,
      ),
    );
    console.log(
      chalk.gray(
        `   Languages: ${Object.entries(graph.stats.languages)
          .map(([lang, count]) => `${lang}(${count})`)
          .join(', ')}`,
      ),
    );

    const graphDiff = diffGraphs(previousGraph, graph);
    const archData = inferArchitecture(graph);
    const patterns: CgPatternsFile = analyzePatterns(graph, previousPatterns, graphDiff);
    patterns.layerCounts = Object.fromEntries(
      Object.entries(archData.layers).map(([layer, files]) => [layer, (files as string[]).length]),
    );

    const symbolsData: Record<string, string[]> = {};
    for (const [filePath, node] of Object.entries(graph.files)) {
      const fileNode = node as { symbols?: string[] };
      symbolsData[filePath] = fileNode.symbols || [];
    }

    await cgDir.writeGraph(graph);
    await cgDir.writeSymbols(symbolsData);
    await cgDir.writeArch(archData);
    await cgDir.writePatterns(patterns);

    const meta = {
      lastScan: Date.now(),
      projectPath: rootPath,
      languages: Object.keys(graph.stats.languages),
      entryPoints: findEntryPoints(files, rootPath),
    };
    await cgDir.writeMeta(meta);

    if (graphDiff.filesAdded.length || graphDiff.filesRemoved.length || graphDiff.dependencyChanges) {
      console.log(chalk.gray('   Graph diff:'));
      if (graphDiff.filesAdded.length) {
        console.log(chalk.gray(`     + ${graphDiff.filesAdded.length} new file(s)`));
      }
      if (graphDiff.filesRemoved.length) {
        console.log(chalk.gray(`     - ${graphDiff.filesRemoved.length} removed file(s)`));
      }
      if (graphDiff.dependencyChanges) {
        console.log(chalk.gray(`     ~ ${graphDiff.dependencyChanges} dependency change(s)`));
      }
      console.log(chalk.gray(`     Patterns updated (${patterns.importHubs.length} hubs)`));
    }

    await appendMemorySession(cgDir, {
      type: 'scan',
      summary: `Scan: ${files.length} files, ${graph.stats.totalDependencies} deps`,
      metadata: { graphDiff },
    });

    console.log(chalk.green('✓ Scan complete!'));
    console.log(chalk.green('✓ Updated .cg/ (graph, symbols, arch, patterns, memory)'));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`✗ Error: ${message}`));
    process.exit(1);
  }
}

function inferArchitecture(graph: { files?: Record<string, unknown> }): {
  layers: Record<string, string[]>;
  inferred: boolean;
  timestamp: number;
} {
  const layers: Record<string, string[]> = {
    service: [],
    model: [],
    util: [],
    component: [],
    other: [],
  };

  for (const filePath of Object.keys(graph.files || {})) {
    if (filePath.includes('service') || filePath.includes('controller')) {
      layers.service.push(filePath);
    } else if (filePath.includes('model') || filePath.includes('schema')) {
      layers.model.push(filePath);
    } else if (
      filePath.includes('util') ||
      filePath.includes('helper') ||
      filePath.includes('constant')
    ) {
      layers.util.push(filePath);
    } else if (filePath.includes('component')) {
      layers.component.push(filePath);
    } else {
      layers.other.push(filePath);
    }
  }

  return {
    layers: Object.fromEntries(
      Object.entries(layers).filter(([, files]) => files.length > 0),
    ),
    inferred: true,
    timestamp: Date.now(),
  };
}

function findEntryPoints(files: { path: string }[], _rootPath: string): string[] {
  const entryPoints: string[] = [];
  const commonEntries = [
    'index.ts',
    'index.js',
    'main.ts',
    'main.js',
    'app.ts',
    'app.js',
    'index.tsx',
    'app.tsx',
  ];

  for (const entry of commonEntries) {
    if (files.some((f) => f.path === entry)) {
      entryPoints.push(entry);
    }
  }

  if (entryPoints.length === 0 && files.length > 0) {
    entryPoints.push(files[0].path);
  }

  return entryPoints;
}
