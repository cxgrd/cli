import { resolve } from 'path';
import { FileScanner } from '../scanner';
import { DependencyGraphBuilder } from '../graph';
import { CgDirectory } from '../cg-directory';
import chalk from 'chalk';
import { diffGraphs, analyzePatterns } from '../memory/pattern-analyzer';
import type { CgPatternsFile } from '../memory/types';
import { appendMemorySession } from '../memory/repo-memory';
import { resolveActiveSession } from '../auth/auth-session';
import { planIncludesFeature } from '../auth/plans';
import { syncPush } from '../team/graph-sync';
import {
  checkFreeAuditLimit,
  incrementAuditCount,
  printAuditUsageStatus,
  AuditUsageExceededError,
} from '../auth/audit-usage';
import { postAuditEvent, postHealthSnapshot } from '../team/cloud-client';
import {resolveRepoFullName, resolveGitSha} from '../utils/git';
import type { ActiveSession } from '../auth/auth-session';

export interface ScanCommandOptions {
  sync?: boolean;
  team?: boolean;
}

export async function scanCommand(
  projectPath?: string,
  options: ScanCommandOptions = {},
): Promise<void> {
  const rootPath = resolve(projectPath || process.cwd());

  console.log(chalk.blue('🔍 Scanning project...'));
  console.log(chalk.gray(`   Path: ${rootPath}`));

  try {
    const session = await resolveActiveSession();

    // ── Team flag validation ──────────────────────────────────────────────────
    if (options.team) {
      if (!session) {
        console.error(chalk.red('\n✗ Not authenticated. Run: cxgrd auth login'));
        process.exit(1);
      }
      if (session.plan !== 'team') {
        console.error(chalk.red('\n✗ --team requires a Team plan. Upgrade at https://cxgrd.com/pricing'));
        process.exit(1);
      }
      if (!session.orgId) {
        console.error(chalk.red('\n✗ No team associated with your account. Ask your team owner to invite you.'));
        process.exit(1);
      }
      console.log(chalk.gray(`   Team: ${session.orgName ?? session.orgId} (${session.role})`));
    }

    // ── Free tier audit limit ─────────────────────────────────────────────────
    if (!session || session.plan === 'free') {
      try {
        await checkFreeAuditLimit();
      } catch (err) {
        if (err instanceof AuditUsageExceededError) {
          console.error(chalk.red(`\n✗ ${err.message}`));
          process.exit(1);
        }
        throw err;
      }
    }

    const cgDir = new CgDirectory(rootPath);
    const previousGraph = await cgDir.readGraph();
    const previousPatterns = await cgDir.readPatterns();

    const scanner = new FileScanner();
    const files = await scanner.scanDirectory(rootPath);
    console.log(chalk.green(`✓ Found ${files.length} source files`));

    const builder = new DependencyGraphBuilder();
    const graph = builder.buildGraph(files);

    console.log(chalk.blue('📊 Building dependency graph...'));
    console.log(chalk.gray(`   Total dependencies: ${graph.stats.totalDependencies}`));
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
      if (graphDiff.filesAdded.length) console.log(chalk.gray(`     + ${graphDiff.filesAdded.length} new file(s)`));
      if (graphDiff.filesRemoved.length) console.log(chalk.gray(`     - ${graphDiff.filesRemoved.length} removed file(s)`));
      if (graphDiff.dependencyChanges) console.log(chalk.gray(`     ~ ${graphDiff.dependencyChanges} dependency change(s)`));
      console.log(chalk.gray(`     Patterns updated (${patterns.importHubs.length} hubs)`));
    }

    await appendMemorySession(cgDir, {
      type: 'scan',
      summary: `Scan: ${files.length} files, ${graph.stats.totalDependencies} deps`,
      metadata: { graphDiff },
    });

    console.log(chalk.green('✓ Scan complete!'));
    console.log(chalk.green('✓ Updated .cg/ (graph, symbols, arch, patterns, memory)'));

    if (!session || session.plan === 'free') {
      await incrementAuditCount();
      await printAuditUsageStatus();
    }

    // ── Sync + team telemetry ─────────────────────────────────────────────────
    const shouldSync =
      options.team ||
      options.sync ||
      (session && planIncludesFeature(session.plan, 'cloud_sync'));

    if (shouldSync && session) {
      try {
        await syncPush(cgDir, rootPath, session);
        if (options.team) {
          console.log(chalk.green(`✓ Shared graph updated (team: ${session.orgName ?? session.orgId})`));
        } else {
          console.log(chalk.green('✓ Synced graph to cloud'));
        }
      } catch (syncErr: unknown) {
        const msg = syncErr instanceof Error ? syncErr.message : String(syncErr);
        if (options.team) {
          console.error(chalk.red(`✗ Team sync failed: ${msg}`));
          process.exit(1);
        }
        console.log(chalk.yellow(`   Sync skipped: ${msg}`));
      }
    }

    // ── Post health snapshot + audit event (team only, fire-and-forget) ───────
    if (options.team && session?.orgId) {
      const repoId = await resolveRepoFullName(rootPath);
      const commitSha = await resolveGitSha(rootPath);
      const healthMetrics = computeHealthMetrics(graph, patterns);

      // Non-fatal — don't block the CLI on telemetry
      postHealthSnapshot(session, {
        repoId,
        commitSha,
        fileCount: files.length,
        depCount: graph.stats.totalDependencies,
        ...healthMetrics,
      }).catch(() => {});

      postAuditEvent(session, {
        eventType: 'scan',
        repoId,
        gitRef: commitSha,
        summary: `Scanned ${files.length} files, ${graph.stats.totalDependencies} deps`,
        metadata: {
          filesAdded: graphDiff.filesAdded.length,
          filesRemoved: graphDiff.filesRemoved.length,
          dependencyChanges: graphDiff.dependencyChanges,
          languages: Object.keys(graph.stats.languages),
        },
      }).catch(() => {});
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`✗ Error: ${message}`));
    process.exit(1);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computeHealthMetrics(
  graph: { files?: Record<string, unknown>; stats: { totalDependencies: number } },
  patterns: CgPatternsFile,
): {
  avgBlastRadius: number;
  maxBlastRadius: number;
  couplingScore: number;
  hubCount: number;
  hotspots: string[];
} {
  const files = Object.keys(graph.files ?? {});
  const fileCount = files.length;

  // Coupling score: ratio of deps to files (0-1 range, clamped)
  const couplingScore = fileCount > 0
    ? Math.min(graph.stats.totalDependencies / fileCount / 10, 1)
    : 0;

  // Hub files are high-import files — use patterns.importHubs if available
  const hubs: string[] = patterns.importHubs?.map((h) => h.target) ?? [];
  const hubCount = hubs.length;

  // Hotspots = top 5 hub files (most imported = highest blast radius potential)
  const hotspots = hubs.slice(0, 5);

  // Blast radius estimates: hubs get higher scores, others get low defaults
  const hubSet = new Set(hubs);
  const blastScores = files.map((f) => (hubSet.has(f) ? Math.min(fileCount * 0.4, 80) : Math.min(fileCount * 0.05, 20)));
  const avgBlastRadius = blastScores.length > 0
    ? Math.round(blastScores.reduce((a, b) => a + b, 0) / blastScores.length)
    : 0;
  const maxBlastRadius = blastScores.length > 0 ? Math.round(Math.max(...blastScores)) : 0;

  return {
    avgBlastRadius,
    maxBlastRadius,
    couplingScore: Math.round(couplingScore * 100) / 100,
    hubCount,
    hotspots,
  };
}

function inferArchitecture(graph: { files?: Record<string, unknown> }): {
  layers: Record<string, string[]>;
  inferred: boolean;
  timestamp: number;
} {
  const layers: Record<string, string[]> = { service: [], model: [], util: [], component: [], other: [] };
  for (const filePath of Object.keys(graph.files || {})) {
    if (filePath.includes('service') || filePath.includes('controller')) layers.service.push(filePath);
    else if (filePath.includes('model') || filePath.includes('schema')) layers.model.push(filePath);
    else if (filePath.includes('util') || filePath.includes('helper') || filePath.includes('constant')) layers.util.push(filePath);
    else if (filePath.includes('component')) layers.component.push(filePath);
    else layers.other.push(filePath);
  }
  return {
    layers: Object.fromEntries(Object.entries(layers).filter(([, files]) => files.length > 0)),
    inferred: true,
    timestamp: Date.now(),
  };
}

function findEntryPoints(files: { path: string }[], _rootPath: string): string[] {
  const entries = ['index.ts', 'index.js', 'main.ts', 'main.js', 'app.ts', 'app.js', 'index.tsx', 'app.tsx'];
  const found = entries.filter((e) => files.some((f) => f.path === e));
  return found.length > 0 ? found : files.length > 0 ? [files[0].path] : [];
}
