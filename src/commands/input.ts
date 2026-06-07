import { resolve } from 'path';
import { CgDirectory } from '../cg-directory';
import { BlastRadiusAnalyzer } from '../utils/blast-radius-analyzer';
import { ChangeDetector } from '../utils/change-detector';
import { RichOutput, CLIFormatter } from '../utils/cli-formatter';
import { appendMemorySession } from '../memory/repo-memory';
import { resolveActiveSession } from '../auth/auth-session';
import { recordAuditEventIfTeam } from '../team/audit';
import {
  checkFreeAuditLimit,
  incrementAuditCount,
  printAuditUsageStatus,
  AuditUsageExceededError,
} from '../auth/audit-usage';

export async function inputCommand(description: string, projectPath?: string): Promise<void> {
  const rootPath = resolve(projectPath || process.cwd());

  RichOutput.header('Blast Radius Analysis');
  RichOutput.info(`Analyzing change: "${description}"`);

  try {
    const session = await resolveActiveSession();
    if (!session || session.plan === 'free') {
      try {
        await checkFreeAuditLimit();
      } catch (err) {
        if (err instanceof AuditUsageExceededError) {
          RichOutput.error(err.message);
          process.exit(1);
        }
        throw err;
      }
    }

    const cgDir = new CgDirectory(rootPath);
    const graph = await cgDir.readGraph();

    if (!graph) {
      RichOutput.error('No dependency graph found. Run "cxgrd scan" first.');
      process.exit(1);
    }

    const allFiles = Object.keys(graph.files || {});
    const symbols = await cgDir.readSymbols().catch(() => ({}));

    // Build symbol → file map (lowercase keys for matching)
    const symbolToFile: Record<string, string> = {};
    for (const [filePath, fileSymbols] of Object.entries(symbols as Record<string, string[]>)) {
      for (const sym of fileSymbols) {
        symbolToFile[sym.toLowerCase()] = filePath;
      }
    }

    // Tokenize description into whole identifiers using regex
    // "renaming _set_session_cookie to set_cookie"
    // → ["renaming", "_set_session_cookie", "to", "set_cookie"]
    const descriptionTokens = new Set(
      description.toLowerCase().match(/[a-z_][a-z0-9_]*/g) || []
    );

    // Match only exact symbol tokens — no substring matching
    const symbolMatches: string[] = [];
    for (const [sym, filePath] of Object.entries(symbolToFile)) {
      if (descriptionTokens.has(sym)) {
        if (!symbolMatches.includes(filePath)) {
          symbolMatches.push(filePath);
          RichOutput.info(`Symbol match: "${sym}" → ${filePath}`);
        }
      }
    }

    // Filename/path matching from description
    const changeDetector = new ChangeDetector(rootPath);
    const gitChanges = changeDetector.getChangedFiles();
    const descriptionMatch = changeDetector.parseDescription(description, allFiles);

    // Combine all sources
    const uniqueFiles = [...new Set([
      ...gitChanges.files,
      ...descriptionMatch.files,
      ...symbolMatches,
    ])];

    if (uniqueFiles.length === 0) {
      RichOutput.warning('Could not identify changed files. Using heuristics based on description.');
    } else {
      RichOutput.info(`Detected ${uniqueFiles.length} changed file(s)`);
    }

    const analyzer = new BlastRadiusAnalyzer(graph);
    const result = analyzer.analyze(uniqueFiles.length > 0 ? uniqueFiles : []);

    displayBlastRadiusResults(result);

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

    await appendMemorySession(cgDir, {
      type: 'input',
      summary: description.slice(0, 120),
      metadata: {
        riskLevel: result.riskLevel,
        affected: result.affectedFiles.length,
      },
    });

    RichOutput.success('Blast radius analysis saved to history');

    if (!session || session.plan === 'free') {
      await incrementAuditCount();
      await printAuditUsageStatus();
    }

    await recordAuditEventIfTeam(session, rootPath, {
      eventType: 'input',
      riskScore: result.totalRisk,
      riskLevel: result.riskLevel,
      affectedCount: result.affectedFiles.length,
      summary: description.slice(0, 200),
    });

  } catch (err: any) {
    RichOutput.error(err.message);
    process.exit(1);
  }
}

function displayBlastRadiusResults(result: any): void {
  RichOutput.blank();
  RichOutput.section('Impact Summary');

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

  if (result.changeTypes.length > 0) {
    RichOutput.blank();
    RichOutput.section('Change Classification');
    for (const change of result.changeTypes) {
      const confidence = Math.round(change.confidence * 100);
      console.log(`   • ${change.type}: ${change.description} (${confidence}% confident)`);
    }
  }

  if (result.recommendations.length > 0) {
    RichOutput.blank();
    RichOutput.section('Recommendations');
    for (const rec of result.recommendations) {
      console.log(`   ${rec}`);
    }
  }

  RichOutput.blank();
}
