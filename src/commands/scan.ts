import { resolve } from 'path';
import { FileScanner } from '../scanner';
import { DependencyGraphBuilder } from '../graph';
import { CgDirectory } from '../cg-directory';
import chalk from 'chalk';

export async function scanCommand(projectPath?: string): Promise<void> {
  const rootPath = resolve(projectPath || process.cwd());

  console.log(chalk.blue('🔍 Scanning project...'));
  console.log(chalk.gray(`   Path: ${rootPath}`));

  try {
    const scanner = new FileScanner();
    const files = await scanner.scanDirectory(rootPath);

    console.log(chalk.green(`✓ Found ${files.length} source files`));

    const builder = new DependencyGraphBuilder();
    const graph = builder.buildGraph(files);

    console.log(chalk.blue('📊 Building dependency graph...'));
    console.log(chalk.gray(`   Total dependencies: ${graph.stats.totalDependencies}`));
    console.log(chalk.gray(`   Languages: ${Object.entries(graph.stats.languages).map(([lang, count]) => `${lang}(${count})`).join(', ')}`));

    const cgDir = new CgDirectory(rootPath);

    // Extract symbols data
    const symbolsData: Record<string, string[]> = {};
    for (const [filePath, node] of Object.entries(graph.files)) {
      const fileNode = node as any;
      symbolsData[filePath] = fileNode.symbols;
    }

    // Infer architecture layers
    const archData = inferArchitecture(graph);

    // Write all files
    await cgDir.writeGraph(graph);
    await cgDir.writeSymbols(symbolsData);
    await cgDir.writeArch(archData);
    await cgDir.writeHistory([]);
    await cgDir.writePatterns({});

    const meta = {
      lastScan: Date.now(),
      projectPath: rootPath,
      languages: Object.keys(graph.stats.languages),
      entryPoints: findEntryPoints(files, rootPath),
    };
    await cgDir.writeMeta(meta);

    console.log(chalk.green('✓ Scan complete!'));
    console.log(chalk.green(`✓ Created .cg/ directory with dependency graph`));
  } catch (err: any) {
    console.error(chalk.red(`✗ Error: ${err.message}`));
    process.exit(1);
  }
}

function inferArchitecture(graph: any): any {
  const layers: Record<string, string[]> = {
    service: [],
    model: [],
    util: [],
    component: [],
    other: [],
  };

  for (const [filePath, node] of Object.entries(graph.files as any)) {
    if (filePath.includes('service') || filePath.includes('controller')) {
      layers.service.push(filePath);
    } else if (filePath.includes('model') || filePath.includes('schema')) {
      layers.model.push(filePath);
    } else if (filePath.includes('util') || filePath.includes('helper') || filePath.includes('constant')) {
      layers.util.push(filePath);
    } else if (filePath.includes('component')) {
      layers.component.push(filePath);
    } else {
      layers.other.push(filePath);
    }
  }

  return {
    layers: Object.fromEntries(Object.entries(layers).filter(([_, files]) => files.length > 0)),
    inferred: true,
    timestamp: Date.now(),
  };
}

function findEntryPoints(files: any[], rootPath: string): string[] {
  const entryPoints = [];

  // Look for common entry points
  const commonEntries = ['index.ts', 'index.js', 'main.ts', 'main.js', 'app.ts', 'app.js', 'index.tsx', 'app.tsx'];

  for (const entry of commonEntries) {
    if (files.some(f => f.path === entry)) {
      entryPoints.push(entry);
    }
  }

  if (entryPoints.length === 0 && files.length > 0) {
    entryPoints.push(files[0].path);
  }

  return entryPoints;
}
