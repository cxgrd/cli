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
import { syncPush, syncPull } from '../team/graph-sync';
import {
  checkFreeAuditLimit,
  incrementAuditCount,
  printAuditUsageStatus,
  AuditUsageExceededError,
} from '../auth/audit-usage';
import { postAuditEvent, postHealthSnapshot } from '../team/cloud-client';
import {resolveRepoFullName, resolveGitSha} from '../utils/git';

function makeLogger(json: boolean) {
  return {
    log: (msg: string) => { if (!json) console.log(msg); },
    error: (msg: string) => { if (!json) console.error(msg); },
  };
}

function exitJson(json: boolean, error: string, code: string): never {
  if (json) {
    console.log(JSON.stringify({ error, code }));
  } else {
    console.error(chalk.red(`\n✗ ${error}`));
  }
  process.exit(1);
}

export interface ScanCommandOptions {
  sync?: boolean;
  team?: boolean;
  pull?: boolean;
  json?: boolean;
}

export interface ScanResult {
  status: string;
  error?: [];
  filesScanned?: number;
  graphNodes: number;
  totalDependencies: number;
  languages : {};
  filesAdded: number;
  filesRemoved: number;
  dependencyChanges: number;
  errors : [];
}

export async function scanCommand(
  projectPath?: string,
  options: ScanCommandOptions = {},
): Promise<ScanResult | undefined> {
  const out = makeLogger(!!options.json);
  const json = !!options.json;
  const rootPath = resolve(projectPath || process.cwd());

  out.log(chalk.blue('🔍 Scanning project...'));
  out.log(chalk.gray(`   Path: ${rootPath}`));

  try {
    const session = await resolveActiveSession();

    const cgDir = new CgDirectory(rootPath);
    const previousGraph = await cgDir.readGraph();
    const previousPatterns = await cgDir.readPatterns();


    // ── Pull from cloud (Pro/Team) ──────────────────────────────────────────────
    if (options.pull) {
      if (!session) {
        exitJson(json, 'Not authenticated. Run: cxgrd auth login', 'NOT_AUTHENTICATED');
      }
      if (!planIncludesFeature(session.plan, 'team_cloud')) {
        exitJson(json, '--pull requires a Team plan. Visit https://cxgrd.com/pricing', 'PLAN_REQUIRED');
      }

      out.log(chalk.blue('⬇ Pulling team graph from cloud...'));
      const bundle = await syncPull(cgDir, rootPath, session);
      if (!bundle) {
        exitJson(json, 'No graph found in cloud for this repo. Run cxgrd scan --sync first.', 'NO_CLOUD_GRAPH');
      }

      out.log(chalk.green(`✓ Graph pulled from cloud`));
      out.log(chalk.gray(`   Uploaded by: ${bundle.uploadedBy ?? 'unknown'}`));
      out.log(chalk.gray(`   Ref: ${bundle.gitRef ?? 'unknown'}`));

      if (json) {
        out.log(JSON.stringify({
          status: 'success',
          source: 'cloud',
          uploadedBy: bundle.uploadedBy ?? null,
          gitRef: bundle.gitRef ?? null,
        }));
      }
      return;
    }


    // ── Team flag validation ──────────────────────────────────────────────────
    if (options.team) {
      if (!session) {
        out.error(chalk.red('\n✗ Not authenticated. Run: cxgrd auth login'));
        process.exit(1);
      }
      if (session.plan !== 'team') {
        out.error(chalk.red('\n✗ --team requires a Team plan. Upgrade at https://cxgrd.com/pricing'));
        process.exit(1);
      }
      if (!session.orgId) {
        out.error(chalk.red('\n✗ No team associated with your account. Ask your team owner to invite you.'));
        process.exit(1);
      }
      out.log(chalk.gray(`   Team: ${session.orgName ?? session.orgId} (${session.role})`));
    }

    // ── Free tier audit limit ─────────────────────────────────────────────────
    if (!session || session.plan === 'free') {
      try {
        await checkFreeAuditLimit();
      } catch (err) {
        if (err instanceof AuditUsageExceededError) {
          out.error(chalk.red(`\n✗ ${err.message}`));
          process.exit(1);
        }
        throw err;
      }
    }

    const scanner = new FileScanner();
    const files = await scanner.scanDirectory(rootPath);
    out.log(chalk.green(`✓ Found ${files.length} source files`));

    const builder = new DependencyGraphBuilder();
    const graph = builder.buildGraph(files);

    out.log(chalk.blue('📊 Building dependency graph...'));
    out.log(chalk.gray(`   Total dependencies: ${graph.stats.totalDependencies}`));
    out.log(
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
      out.log(chalk.gray('   Graph diff:'));
      if (graphDiff.filesAdded.length) out.log(chalk.gray(`     + ${graphDiff.filesAdded.length} new file(s)`));
      if (graphDiff.filesRemoved.length) out.log(chalk.gray(`     - ${graphDiff.filesRemoved.length} removed file(s)`));
      if (graphDiff.dependencyChanges) out.log(chalk.gray(`     ~ ${graphDiff.dependencyChanges} dependency change(s)`));
      out.log(chalk.gray(`     Patterns updated (${patterns.importHubs.length} hubs)`));
    }

    await appendMemorySession(cgDir, {
      type: 'scan',
      summary: `Scan: ${files.length} files, ${graph.stats.totalDependencies} deps`,
      metadata: { graphDiff },
    });

    out.log(chalk.green('✓ Scan complete!'));
    out.log(chalk.green('✓ Updated .cg/ (graph, symbols, arch, patterns, memory)'));
    const status = "success";

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
          out.log(chalk.green(`✓ Shared graph updated (team: ${session.orgName ?? session.orgId})`));
        } else {
          out.log(chalk.green('✓ Synced graph to cloud'));
        }
      } catch (syncErr: unknown) {
        const msg = syncErr instanceof Error ? syncErr.message : String(syncErr);
        if (options.team) {
          out.error(chalk.red(`✗ Team sync failed: ${msg}`));
          process.exit(1);
        }
        out.log(chalk.yellow(`   Sync skipped: ${msg}`));
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

    const scanres: ScanResult = {
      status : status,
      filesScanned: files.length,
      graphNodes: Object.keys(graph.files ?? {}).length,
      totalDependencies: graph.stats.totalDependencies,
      languages: graph.stats.languages,
      filesAdded: graphDiff.filesAdded.length,
      filesRemoved: graphDiff.filesRemoved.length,
      dependencyChanges: graphDiff.dependencyChanges,
      errors: [],
    };

    return scanres;

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    out.error(chalk.red(`✗ Error: ${message}`));
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
