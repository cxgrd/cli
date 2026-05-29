import { resolve } from 'path';
import { CgDirectory } from '../cg-directory';
import chalk from 'chalk';

interface AffectedFile {
  path: string;
  reason: string;
  severity: 'high' | 'medium' | 'low';
}

export async function inputCommand(description: string, projectPath?: string): Promise<void> {
  const rootPath = resolve(projectPath || process.cwd());

  console.log(chalk.blue('📋 Analyzing blast radius...'));
  console.log(chalk.gray(`   Change: ${description}`));

  try {
    const cgDir = new CgDirectory(rootPath);
    const graph = await cgDir.readGraph();

    if (!graph) {
      console.error(chalk.red('✗ No dependency graph found. Run "cxgrd scan" first.'));
      process.exit(1);
    }

    // Parse the change description to identify affected files
    const affectedFiles = parseChangeDescription(description, graph);

    // Find all downstream dependencies
    const allAffected = findDownstreamDependencies(affectedFiles, graph);

    // Log results
    console.log(chalk.yellow(`\n⚠️  Blast Radius Analysis`));
    console.log(chalk.gray(`   Direct changes: ${affectedFiles.length}`));
    console.log(chalk.gray(`   Downstream impact: ${allAffected.length}`));

    if (allAffected.length > 0) {
      console.log(chalk.yellow('\n📍 Affected files:'));
      for (const file of allAffected.slice(0, 20)) {
        const severityColor = file.severity === 'high' ? chalk.red : file.severity === 'medium' ? chalk.yellow : chalk.blue;
        console.log(`   ${severityColor(`[${file.severity}]`)} ${file.path}`);
        console.log(`      → ${file.reason}`);
      }

      if (allAffected.length > 20) {
        console.log(chalk.gray(`   ... and ${allAffected.length - 20} more files`));
      }
    }

    // Save to history
    const history = await cgDir.readHistory();
    history.push({
      timestamp: Date.now(),
      description,
      affectedCount: allAffected.length,
      status: 'pending',
    });
    await cgDir.writeHistory(history);

    console.log(chalk.green('\n✓ Blast radius saved to history'));
  } catch (err: any) {
    console.error(chalk.red(`✗ Error: ${err.message}`));
    process.exit(1);
  }
}

function parseChangeDescription(description: string, graph: any): string[] {
  // Try to identify files mentioned in the description
  const mentioned: string[] = [];
  const files = Object.keys(graph.files || {});

  for (const file of files) {
    if (description.toLowerCase().includes(file.toLowerCase())) {
      mentioned.push(file);
    }
  }

  return mentioned;
}

function findDownstreamDependencies(startFiles: string[], graph: any): AffectedFile[] {
  const affected = new Set<AffectedFile>();
  const visited = new Set<string>();
  const queue = [...startFiles];

  while (queue.length > 0) {
    const currentFile = queue.shift()!;

    if (visited.has(currentFile)) continue;
    visited.add(currentFile);

    // Find all files that import/depend on current file
    for (const [filePath, node] of Object.entries(graph.files || {})) {
      const fileNode = node as any;
      for (const dep of fileNode.dependencies || []) {
        if (dep.to === currentFile || dep.to.includes(currentFile)) {
          affected.add({
            path: filePath,
            reason: `Imports from ${currentFile}`,
            severity: 'high',
          });

          if (!visited.has(filePath)) {
            queue.push(filePath);
          }
        }
      }
    }
  }

  return Array.from(affected);
}
