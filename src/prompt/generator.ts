import type { PromptSubgraph } from './subgraph';

export function generateDeterministicPrompt(
  subgraph: PromptSubgraph,
  repoMemoryBlock = '',
): string {
  const changeRequest = formatChangeRequest(subgraph.changeDescription);
  const lines = [
    changeRequest,
    '',
    'Refactor/change focus:',
  ];

  const layerByFile = new Map<string, string[]>();
  for (const [layer, files] of Object.entries(subgraph.architectureLayers)) {
    for (const file of files) {
      const layers = layerByFile.get(file) || [];
      layers.push(layer);
      layerByFile.set(file, layers);
    }
  }

  if (subgraph.seedFiles.length === 0 && subgraph.affectedFiles.length === 0) {
    lines.push('- No files were resolved by the blast-radius analysis. Inspect the repository and identify the correct files before editing; do not assume a file scope.');
  } else {
    for (const file of subgraph.seedFiles) {
      const layers = layerByFile.get(file);
      const layerNote = layers?.length ? `; architecture layer: ${layers.join(', ')}` : '';
      lines.push(`- \`${file}\` — direct change target identified from the request${layerNote}.`);
    }

    for (const file of subgraph.affectedFiles) {
      if (subgraph.seedFiles.includes(file.path)) continue;
      const distance = file.distance === 1 ? 'direct dependent' : `transitive dependent, depth ${file.distance}`;
      const required = file.changeRequired ? 'review and update if the change requires it' : 'review for compatibility';
      const layers = layerByFile.get(file.path);
      const layerNote = layers?.length ? `; architecture layer: ${layers.join(', ')}` : '';
      lines.push(
        `- \`${file.path}\` — ${file.severity} risk, ${distance}; ${file.reason}; ${required}${layerNote}.`,
      );
      if (file.suggestedFix) lines.push(`  Suggested action: ${file.suggestedFix}`);
    }
  }

  lines.push(
    '',
    `Blast-radius summary: ${subgraph.riskLevel} overall risk; ${subgraph.seedFiles.length} direct target(s), ${subgraph.affectedFiles.length} affected dependent(s).`,
  );

  const hasResolvedFiles = subgraph.seedFiles.length > 0 || subgraph.affectedFiles.length > 0;
  if (hasResolvedFiles && subgraph.dependencies.length > 0) {
    lines.push('', 'Relevant dependency edges:');
    for (const dependency of subgraph.dependencies.slice(0, 25)) {
      lines.push(`- \`${dependency.from}\` → \`${dependency.to}\` (${dependency.type})`);
    }
  }

  const symbolEntries = hasResolvedFiles ? Object.entries(subgraph.symbols) : [];
  if (symbolEntries.length > 0) {
    lines.push('', 'Relevant symbols to inspect:');
    for (const [file, symbols] of symbolEntries) {
      lines.push(`- \`${file}\`: ${symbols.join(', ')}`);
    }
  }

  if (subgraph.recommendations.length > 0) {
    lines.push('', 'Analyzer recommendations:');
    for (const recommendation of subgraph.recommendations) {
      lines.push(`- ${recommendation}`);
    }
  }

  lines.push(
    '',
    'Actionable steps:',
    '1. Inspect the direct targets and their listed dependents; preserve existing public interfaces and dependency direction unless the request requires changing them.',
    '2. Make the requested change in the focused files, updating dependent files only where the blast-radius notes indicate compatibility work is needed.',
    '3. Run the targeted unit and integration tests for the affected files. Include relevant boundary, error-handling, and regression cases, then run the project test suite.',
    '4. Run `cxgrd check --changed` and review any new architecture or dependency issues.',
  );

  if (repoMemoryBlock.trim()) {
    lines.push('', 'Repository context:', repoMemoryBlock.trim());
  }

  return lines.join('\n');
}

function formatChangeRequest(description: string): string {
  const trimmed = description.trim();
  const actionMatch = trimmed.match(/^(implement|change|modify)\b(.*)$/i);
  if (actionMatch) {
    const action = actionMatch[1][0].toUpperCase() + actionMatch[1].slice(1).toLowerCase();
    return `${action}${actionMatch[2]}`;
  }
  return `Implement ${trimmed}`;
}
