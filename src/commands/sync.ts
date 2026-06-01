import { resolve } from 'path';
import chalk from 'chalk';
import { CgDirectory } from '../cg-directory';
import { requireTeamFeature, TeamRequiredError } from '../auth/entitlements';
import { syncPush, syncPull, readSyncMeta } from '../team/graph-sync';
import { resolveRepoIdentity } from '../team/repo-identity';
import { recordAuditEventIfTeam } from '../team/audit';
import { resolveActiveSession } from '../auth/auth-session';
import { pullGraph } from '../team/cloud-client';

export async function syncPushCommand(projectPath?: string): Promise<void> {
  const rootPath = resolve(projectPath || process.cwd());

  try {
    const session = await requireTeamFeature('team_cloud');
    const cgDir = new CgDirectory(rootPath);
    const bundle = await syncPush(cgDir, rootPath, session);

    console.log(chalk.green('✓ Graph pushed to org cloud'));
    console.log(chalk.gray(`   Repo: ${bundle.repoId} · ref: ${bundle.gitRef}`));
    console.log(chalk.gray(`   Uploaded: ${new Date(bundle.uploadedAt).toISOString()}`));

    await recordAuditEventIfTeam(session, rootPath, {
      eventType: 'sync',
      summary: 'push',
      metadata: { direction: 'push' },
    });
  } catch (err: unknown) {
    handleTeamError(err);
  }
}

export async function syncPullCommand(projectPath?: string): Promise<void> {
  const rootPath = resolve(projectPath || process.cwd());

  try {
    const session = await requireTeamFeature('team_cloud');
    const cgDir = new CgDirectory(rootPath);
    const bundle = await syncPull(cgDir, rootPath, session);

    if (!bundle) {
      console.log(chalk.yellow('   No remote graph for this repo/ref yet. Run cxgrd sync push from another machine.'));
      return;
    }

    console.log(chalk.green('✓ Graph pulled from org cloud'));
    console.log(chalk.gray(`   Repo: ${bundle.repoId} · ref: ${bundle.gitRef}`));
    console.log(chalk.gray(`   Remote version: ${new Date(bundle.uploadedAt).toISOString()}`));

    await recordAuditEventIfTeam(session, rootPath, {
      eventType: 'sync',
      summary: 'pull',
      metadata: { direction: 'pull' },
    });
  } catch (err: unknown) {
    handleTeamError(err);
  }
}

export async function syncStatusCommand(projectPath?: string): Promise<void> {
  const rootPath = resolve(projectPath || process.cwd());

  try {
    const session = await requireTeamFeature('team_cloud');
    const cgDir = new CgDirectory(rootPath);
    const identity = resolveRepoIdentity(rootPath);
    const localMeta = await cgDir.readMeta();
    const syncMeta = await readSyncMeta(cgDir);

    console.log(chalk.blue('✓ Sync status\n'));
    console.log(chalk.gray(`   Repo ID: ${identity.repoId}`));
    console.log(chalk.gray(`   Git ref: ${identity.gitRef}`));
    if (identity.remoteUrl) {
      console.log(chalk.gray(`   Remote: ${identity.remoteUrl}`));
    }

    if (localMeta) {
      console.log(chalk.gray(`   Local scan: ${new Date(localMeta.lastScan).toISOString()}`));
    } else {
      console.log(chalk.yellow('   No local scan — run cxgrd scan'));
    }

    if (syncMeta?.lastPushedAt) {
      console.log(chalk.gray(`   Last push: ${new Date(syncMeta.lastPushedAt).toISOString()}`));
    }
    if (syncMeta?.lastPulledAt) {
      console.log(chalk.gray(`   Last pull: ${new Date(syncMeta.lastPulledAt).toISOString()}`));
    }

    const session2 = await resolveActiveSession();
    if (session2) {
      const remote = await pullGraph(session2, identity.repoId, identity.gitRef);
      if (remote) {
        const behind =
          localMeta && remote.uploadedAt > localMeta.lastScan ? chalk.yellow('behind remote') : chalk.green('up to date');
        console.log(chalk.gray(`   Remote graph: ${new Date(remote.uploadedAt).toISOString()} — ${behind}`));
      } else {
        console.log(chalk.gray('   Remote graph: not uploaded yet'));
      }
    }
  } catch (err: unknown) {
    handleTeamError(err);
  }
}

function handleTeamError(err: unknown): never {
  if (err instanceof TeamRequiredError) {
    console.error(chalk.red(`\n✗ ${err.message}`));
    process.exit(1);
  }
  const message = err instanceof Error ? err.message : String(err);
  console.error(chalk.red(`✗ ${message}`));
  process.exit(1);
}
