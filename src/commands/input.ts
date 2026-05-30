import { resolve } from 'path';
import { CgDirectory } from '../cg-directory';
import { BlastRadiusAnalyzer } from '../utils/blast-radius-analyzer';
import { ChangeDetector } from '../utils/change-detector';
import { RichOutput, CLIFormatter } from '../utils/cli-formatter';

export async function inputCommand(description: string, projectPath?: string): Promise<void> {
  const rootPath = resolve(projectPath || process.cwd());

  RichOutput.header('Blast Radius Analysis');
  RichOutput.info(`Analyzing change: "${description}"`);

  try {
    const cgDir = new CgDirectory(rootPath);
    const graph = await cgDir.readGraph();

    if (!graph) {
      RichOutput.error('No dependency graph found. Run "cxgrd scan" first.');
      process.exit(1);
    }

    // Detect changed files from description and git
    const changeDetector = new ChangeDetector(rootPath);
    const gitChanges = changeDetector.getChangedFiles();
    const descriptionMatch = changeDetector.parseDescription(description, Object.keys(graph.files || {}));

    // Combine both sources of information
    const changedFiles = [
      ...gitChanges.files,
      ...descriptionMatch.files,
    ];
    const uniqueFiles = [...new Set(changedFiles)];

    if (uniqueFiles.length === 0) {
      RichOutput.warning('Could not identify changed files. Using heuristics based on description.');
    } else {
      RichOutput.info(`Detected ${uniqueFiles.length} changed file(s)`);
    }

    // Run enhanced blast radius analysis
    const analyzer = new BlastRadiusAnalyzer(graph);
    const result = analyzer.analyze(uniqueFiles.length > 0 ? uniqueFiles : []);

    // Display results
    displayBlastRadiusResults(result);

    // Save to history
    const history = await cgDir.readHistory();
    history.push({
      timestamp: Date.now(),
      description,
      affectedCount: result.directlyAffected + result.transitivelyAffected,
      status: 'pending',
      riskLevel: result.riskLevel,
      confidence: descriptionMatch.confidence,
    });
    await cgDir.writeHistory(history);

    RichOutput.success('Blast radius analysis saved to history');
  } catch (err: any) {
    RichOutput.error(err.message);
    process.exit(1);
  }
}

function displayBlastRadiusResults(result: any): void {
  RichOutput.blank();
  RichOutput.section('Impact Summary');

  // Overall risk display
  const riskBadge = CLIFormatter.severity(result.riskLevel);
  console.log(`   Overall Risk: ${riskBadge}`);
  console.log(`   Risk Score: ${result.totalRisk}/100`);
  console.log(`   ${CLIFormatter.progressBar(result.totalRisk, 100)}`);

  RichOutput.blank();
  RichOutput.section('Affected Files');
  console.log(`   Direct impact: ${result.directlyAffected} file(s)`);
  console.log(`   Transitive impact: ${result.transitivelyAffected} file(s)`);
  console.log(`   Total affected: ${result.affectedFiles.length} file(s)`);

  if (result.affectedFiles.length > 0) {
    RichOutput.blank();
    console.log('   Top affected files:\n');

    const displayFiles = result.affectedFiles.slice(0, 15);
    for (const file of displayFiles) {
      const severity = CLIFormatter.severity(file.severity);
      const distanceLabel = file.distance === 1 ? '(direct)' : `(transitive, depth: ${file.distance})`;
      console.log(`   ${severity} ${file.path}`);
      console.log(`      └─ ${file.reason} ${distanceLabel}`);
    }

    if (result.affectedFiles.length > 15) {
      RichOutput.blank();
      console.log(`   ... and ${result.affectedFiles.length - 15} more files`);
    }
  }

  // Change types
  if (result.changeTypes.length > 0) {
    RichOutput.blank();
    RichOutput.section('Change Classification');
    for (const change of result.changeTypes) {
      const confidence = Math.round(change.confidence * 100);
      console.log(`   • ${change.type}: ${change.description} (${confidence}% confident)`);
    }
  }

  // Recommendations
  if (result.recommendations.length > 0) {
    RichOutput.blank();
    RichOutput.section('Recommendations');
    for (const rec of result.recommendations) {
      console.log(`   ${rec}`);
    }
  }

  RichOutput.blank();
}
