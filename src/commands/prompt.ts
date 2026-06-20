import { resolve } from 'path';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import chalk from 'chalk';
import { CgDirectory } from '../cg-directory';
import { loadCxgrdEnv } from '../config/env';
import { requireProFeature, ProRequiredError } from '../auth/entitlements';
import { appendMemorySession, formatMemoryForPrompt, readRepoMemory } from '../memory/repo-memory';
import { buildPromptSubgraph, serializeSubgraphForLlm } from '../prompt/subgraph';
import { generatePromptWithLlm } from '../prompt/llm-client';

export async function promptCommand(changeDescription: string, projectPath?: string): Promise<void> {
  await loadCxgrdEnv();
  const rootPath = resolve(projectPath || process.cwd());

  console.log(chalk.blue('🔄 Generating AI prompt (Pro)...'));
  console.log(chalk.gray(`   Input: ${changeDescription}`));

  try {
    const session = await requireProFeature('prompt');

    const cgDir = new CgDirectory(rootPath);
    const graph = await cgDir.readGraph();
    const arch = await cgDir.readArch();
    const meta = await cgDir.readMeta();
    const symbols = await cgDir.readSymbols();
    const patterns = await cgDir.readPatterns();

    if (!graph) {
      console.error(chalk.red('✗ No dependency graph found. Run "cxgrd scan" first.'));
      process.exit(1);
    }

    // Read the last blast radius result from history — produced by `cxgrd input`
    // These are already resolved, cwd-filtered files so we pass them directly
    // to the subgraph builder instead of re-resolving from scratch.
    const history = await cgDir.readHistory();
    const lastInput = [...history]
      .reverse()
      .find((h: any) => h.type === 'input' || h.description);

    const preSolvedFiles: string[] = [];
    if (lastInput) {
      // Read the last blast radius result which has the resolved affected files
      const lastCheck = await cgDir.readCheckResult().catch(() => null);
      // Also try reading from last-blast.json if it exists
      const lastBlast = await cgDir.readLastBlast().catch(() => null);
      if (lastBlast?.affectedFiles?.length) {
        for (const f of lastBlast.affectedFiles.slice(0, 20)) {
          if (typeof f === 'string') preSolvedFiles.push(f);
          else if (f?.path) preSolvedFiles.push(f.path);
        }
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
    const contextPayload = serializeSubgraphForLlm(subgraph, repoMemoryBlock);

    console.log(chalk.gray('   Calling LLM with architectural subgraph + repo memory...'));

    const { prompt, provider, model } = await generatePromptWithLlm(contextPayload, session);

    console.log(chalk.green('\n✓ Enriched prompt\n'));
    console.log(chalk.yellow(prompt));
    console.log(chalk.gray(`\n   via ${provider} (${model}) · plan: ${session.plan}`));

    const outPath = join(cgDir.getPath(), 'last-prompt.md');
    await writeFile(outPath, prompt, 'utf-8');
    console.log(chalk.gray(`   Saved to ${outPath}`));

    await appendMemorySession(cgDir, {
      type: 'prompt',
      summary: changeDescription.slice(0, 120),
      metadata: {
        provider,
        model,
        affectedCount: subgraph.affectedFiles.length,
        riskLevel: subgraph.riskLevel,
        usedPreSolvedFiles: preSolvedFiles.length > 0,
      },
    });

    history.push({
      timestamp: Date.now(),
      type: 'prompt',
      input: changeDescription,
      status: 'completed',
      provider,
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
