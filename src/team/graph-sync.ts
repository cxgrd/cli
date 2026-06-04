import { join } from 'path';
import { writeFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import type { CgDirectory, CgMeta } from '../cg-directory';
import type { ActiveSession } from '../auth/auth-session';
import type { GraphBundle, SyncMeta } from './types';
import { resolveRepoIdentity } from './repo-identity';
import { pushGraph, pullGraph } from './cloud-client';

export async function buildBundleFromCg(
  cgDir: CgDirectory,
  projectRoot: string,
  session: ActiveSession,
): Promise<GraphBundle | null> {
  const graph = await cgDir.readGraph();
  if (!graph) return null;

  const identity = resolveRepoIdentity(projectRoot);

  return {
    version: 1,
    repoId: identity.repoId,
    gitRef: identity.gitRef,
    uploadedAt: Date.now(),
    uploadedBy: session.email,
    graph,
    symbols: await cgDir.readSymbols(),
    arch: await cgDir.readArch(),
    meta: await cgDir.readMeta(),
    patterns: await cgDir.readPatterns(),
  };
}

export async function applyBundleToCg(cgDir: CgDirectory, bundle: GraphBundle): Promise<void> {
  await cgDir.writeGraph(bundle.graph);
  await cgDir.writeSymbols(bundle.symbols);
  if (bundle.arch) await cgDir.writeArch(bundle.arch);
  if (bundle.meta) await cgDir.writeMeta(bundle.meta as CgMeta);
  if (bundle.patterns) await cgDir.writePatterns(bundle.patterns);
}

export async function readSyncMeta(cgDir: CgDirectory): Promise<SyncMeta | null> {
  const path = join(cgDir.getPath(), 'sync-meta.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(await readFile(path, 'utf-8')) as SyncMeta;
  } catch {
    return null;
  }
}

export async function writeSyncMeta(cgDir: CgDirectory, meta: SyncMeta): Promise<void> {
  const path = join(cgDir.getPath(), 'sync-meta.json');
  await writeFile(path, JSON.stringify(meta, null, 2), 'utf-8');
}

export async function syncPush(
  cgDir: CgDirectory,
  projectRoot: string,
  session: ActiveSession,
): Promise<GraphBundle> {
  const bundle = await buildBundleFromCg(cgDir, projectRoot, session);
  if (!bundle) {
    throw new Error('No local graph. Run cxgrd scan first.');
  }

  await pushGraph(session, bundle);

  await writeSyncMeta(cgDir, {
    repoId: bundle.repoId,
    gitRef: bundle.gitRef,
    lastPushedAt: bundle.uploadedAt,
    remoteUploadedAt: bundle.uploadedAt,
  });

  return bundle;
}

export async function syncPull(
  cgDir: CgDirectory,
  projectRoot: string,
  session: ActiveSession,
): Promise<GraphBundle | null> {
  const identity = resolveRepoIdentity(projectRoot);
  const remote = await pullGraph(session, identity.repoId, identity.gitRef);

  if (!remote) {
    return null;
  }

  await applyBundleToCg(cgDir, remote);

  await writeSyncMeta(cgDir, {
    repoId: identity.repoId,
    gitRef: identity.gitRef,
    lastPulledAt: Date.now(),
    remoteUploadedAt: remote.uploadedAt,
  });

  return remote;
}
