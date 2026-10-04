import { resolve } from 'path';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import chalk from 'chalk';
import { CgDirectory } from '../cg-directory';
import { loadCxgrdEnv } from '../config/env';
import { requireProFeature, ProRequiredError } from '../auth/entitlements';
import { appendMemorySession, formatMemoryForPrompt, readRepoMemory } from '../memory/repo-memory';
import { buildPromptSubgraph } from '../prompt/subgraph';
import { generateDeterministicPrompt } from '../prompt/generator';

export async function promptCommand(changeDescription: string, projectPath?: string): Promise<void> {
  await loadCxgrdEnv();
  const rootPath = resolve(projectPath || process.cwd());

  console.log(chalk.blue('Generating deterministic coding prompt (Pro)...'));
  console.log(chalk.gray(`   Input: ${changeDescription}`));

  try {
    const session = await requireProFeature('prompt');

    const cgDir = new CgDirectory(rootPath);
    const graph = await cgDir.readGraph();
    const arch = await cgDir.readArch();
    const symbols = await cgDir.readSymbols();
    const patterns = await cgDir.readPatterns();

    const err_code = 'NO_GRAPH';
    if (!graph) {
      console.error(chalk.red('✗ No dependency graph found. Run "cxgrd scan" first.'), err_code);
      process.exit(1);
    }

    const preSolvedFiles: string[] = [];
    const lastBlast = await cgDir.readLastBlast();
    if (
      typeof lastBlast?.description === 'string' &&
      lastBlast.description.trim().toLowerCase() === changeDescription.trim().toLowerCase() &&
      Array.isArray(lastBlast.seedFiles)
    ) {
      for (const file of lastBlast.seedFiles) {
        if (typeof file === 'string') preSolvedFiles.push(file);
      }
    }

    const memory = await readRepoMemory(cgDir);
    const repoMemoryBlock = formatMemoryForPrompt(memory, patterns);

    // Pass pre-solved files so subgraph builder skips broad re-resolution
    const subgraph = buildPromptSubgraph(
      changeDescription,
      graph,
      symbols,
      arch,
      rootPath,
      preSolvedFiles.length > 0 ? preSolvedFiles : undefined,
    );
    const prompt = generateDeterministicPrompt(subgraph, repoMemoryBlock);

    console.log(chalk.green('\n✓ Generated prompt\n'));
    console.log(chalk.yellow(prompt));
    console.log(chalk.gray(`\n   deterministic engine · plan: ${session.plan}`));

    const outPath = join(cgDir.getPath(), 'last-prompt.md');
    await writeFile(outPath, prompt, 'utf-8');
    console.log(chalk.gray(`   Saved to ${outPath}`));

    await appendMemorySession(cgDir, {
      type: 'prompt',
      summary: changeDescription.slice(0, 120),
      metadata: {
        generator: 'deterministic',
        affectedCount: subgraph.affectedFiles.length,
        riskLevel: subgraph.riskLevel,
        usedPreSolvedFiles: preSolvedFiles.length > 0,
      },
    });

    const history = await cgDir.readHistory();
    history.push({
      timestamp: Date.now(),
      type: 'prompt',
      input: changeDescription,
      status: 'completed',
      generator: 'deterministic',
    });
    await cgDir.writeHistory(history);
  } catch (err: unknown) {
    if (err instanceof ProRequiredError) {
      console.error(chalk.red(`\n✗ ${err.message}`));
      process.exit(1);
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`✗ Error: ${message}`));
    process.exit(1);
  }
}
