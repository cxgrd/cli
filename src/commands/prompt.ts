import { resolve } from 'path';
import { CgDirectory } from '../cg-directory';
import chalk from 'chalk';

export async function promptCommand(changeDescription: string, projectPath?: string): Promise<void> {
  const rootPath = resolve(projectPath || process.cwd());

  console.log(chalk.blue('🔄 Generating enriched prompt...'));
  console.log(chalk.gray(`   Input: ${changeDescription}`));

  try {
    const cgDir = new CgDirectory(rootPath);
    const graph = await cgDir.readGraph();
    const arch = await cgDir.readArch();
    const meta = await cgDir.readMeta();

    if (!graph) {
      console.error(chalk.red('✗ No dependency graph found. Run "cxgrd scan" first.'));
      process.exit(1);
    }

    // Build architectural context
    const context = buildArchitecturalContext(changeDescription, graph, arch, meta);

    // Generate enriched prompt
    const enrichedPrompt = generateEnrichedPrompt(changeDescription, context);

    console.log(chalk.green('\n✓ Enriched Prompt:\n'));
    console.log(chalk.yellow(enrichedPrompt));

    // Save to history
    const history = await cgDir.readHistory();
    history.push({
      timestamp: Date.now(),
      type: 'prompt_generation',
      input: changeDescription,
      status: 'completed',
    });
    await cgDir.writeHistory(history);
  } catch (err: any) {
    console.error(chalk.red(`✗ Error: ${err.message}`));
    process.exit(1);
  }
}

interface ArchitecturalContext {
  affectedModules: string[];
  architectureLayers: Record<string, string[]>;
  relatedSymbols: string[];
  dependencies: any[];
}

function buildArchitecturalContext(
  change: string,
  graph: any,
  arch: any,
  meta: any,
): ArchitecturalContext {
  const affectedModules = findAffectedModules(change, graph);
  const dependencies = extractRelevantDependencies(affectedModules, graph);
  const relatedSymbols = extractRelatedSymbols(affectedModules, graph);

  return {
    affectedModules,
    architectureLayers: arch?.layers || {},
    relatedSymbols,
    dependencies,
  };
}

function findAffectedModules(change: string, graph: any): string[] {
  const modules: string[] = [];
  const changeWords = change.toLowerCase().split(/\s+/);

  for (const [filePath] of Object.entries(graph.files || {})) {
    const pathLower = filePath.toLowerCase();
    for (const word of changeWords) {
      if (pathLower.includes(word) && !modules.includes(filePath)) {
        modules.push(filePath);
        break;
      }
    }
  }

  return modules.slice(0, 10);
}

function extractRelevantDependencies(modules: string[], graph: any): any[] {
  const deps: any[] = [];

  for (const module of modules) {
    const node = graph.files?.[module];
    if (node?.dependencies) {
      deps.push(...node.dependencies.slice(0, 5));
    }
  }

  return deps;
}

function extractRelatedSymbols(modules: string[], graph: any): string[] {
  const symbols = new Set<string>();

  for (const module of modules) {
    const node = graph.files?.[module];
    if (node?.symbols) {
      node.symbols.slice(0, 5).forEach((s: string) => symbols.add(s));
    }
  }

  return Array.from(symbols);
}

function generateEnrichedPrompt(changeDescription: string, context: ArchitecturalContext): string {
  let prompt = `# Architectural Context for Your Change\n\n`;
  prompt += `## Original Request\n${changeDescription}\n\n`;

  prompt += `## Affected Modules\n`;
  if (context.affectedModules.length > 0) {
    for (const module of context.affectedModules) {
      prompt += `- \`${module}\`\n`;
    }
  } else {
    prompt += `- No specific modules identified\n`;
  }

  prompt += `\n## Architectural Considerations\n`;
  for (const [layer, files] of Object.entries(context.architectureLayers)) {
    if (files.length > 0) {
      prompt += `- **${layer}**: ${(files as string[]).length} modules\n`;
    }
  }

  if (context.relatedSymbols.length > 0) {
    prompt += `\n## Related Symbols to Consider\n`;
    for (const symbol of context.relatedSymbols) {
      prompt += `- \`${symbol}\`\n`;
    }
  }

  prompt += `\n## Key Dependencies\n`;
  if (context.dependencies.length > 0) {
    for (const dep of context.dependencies.slice(0, 5)) {
      prompt += `- ${dep.from} → ${dep.to} (${dep.type})\n`;
    }
  } else {
    prompt += `- No external dependencies identified\n`;
  }

  prompt += `\n## Recommendations\n`;
  prompt += `1. Review all affected modules above before making changes\n`;
  prompt += `2. Update all related imports and dependencies\n`;
  prompt += `3. Run tests to verify no architecture violations\n`;
  prompt += `4. Consider the impact on the ${Object.keys(context.architectureLayers).join(', ')} layers\n`;

  return prompt;
}
