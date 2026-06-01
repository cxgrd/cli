#!/usr/bin/env node

import yargs, { ArgumentsCamelCase } from 'yargs';
import { hideBin } from 'yargs/helpers';
import chalk from 'chalk';
import { scanCommand } from './commands/scan';
import { inputCommand } from './commands/input';
import { promptCommand } from './commands/prompt';
import { checkCommand } from './commands/check';
import { initHooksCommand } from './commands/init-hooks';
import { watchCommand } from './commands/watch';
import { doctorCommand } from './commands/doctor';
import { authLoginCommand, authLogoutCommand, authStatusCommand } from './commands/auth';
import { loadCxgrdEnv } from './config/env';
import { syncPushCommand, syncPullCommand, syncStatusCommand } from './commands/sync';
import { orgStatusCommand, orgPolicyRefreshCommand, orgPolicyShowCommand } from './commands/org';
import { teamPrecommitCommand } from './commands/team-precommit';

async function main() {
  await loadCxgrdEnv();

  try {
    await yargs(hideBin(process.argv))
      .command(
        'scan [path]',
        'Scan project and build dependency graph',
        (y: any) =>
          y
            .positional('path', {
              describe: 'Project path (default: current directory)',
              type: 'string',
            })
            .option('sync', {
              describe: 'Push graph to org cloud after scan (Team+)',
              type: 'boolean',
              default: false,
            }),
        async (argv: any) => {
          await scanCommand(argv.path as string, { sync: argv.sync });
        },
      )
      .command(
        'input <description>',
        'Analyze blast radius of a change',
        (y: any) =>
          y
            .positional('description', {
              describe: 'Description of the change',
              type: 'string',
            })
            .option('path', {
              describe: 'Project path (default: current directory)',
              type: 'string',
              alias: 'p',
            }),
        async (argv: any) => {
          await inputCommand(argv.description as string, argv.path as string);
        },
      )
      .command(
        'prompt <description>',
        'Generate LLM-enriched AI prompt (Pro / Team / Enterprise)',
        (y: any) =>
          y
            .positional('description', {
              describe: 'Description of the change',
              type: 'string',
            })
            .option('path', {
              describe: 'Project path (default: current directory)',
              type: 'string',
              alias: 'p',
            }),
        async (argv: any) => {
          await promptCommand(argv.description as string, argv.path as string);
        },
      )
      .command(
        'check [path]',
        'Validate architecture and run compiler-backed verification',
        (y: any) =>
          y
            .positional('path', {
              describe: 'Project path (default: current directory)',
              type: 'string',
            })
            .option('staged', {
              describe: 'Only check git staged files (for pre-commit hooks)',
              type: 'boolean',
              default: false,
            })
            .option('changed', {
              describe: 'Only check staged and unstaged changed files',
              type: 'boolean',
              default: false,
            })
            .option('skip-compiler', {
              describe: 'Skip compiler-backed verification (structural only)',
              type: 'boolean',
              default: false,
            })
            .option('skip-structural', {
              describe: 'Skip structural graph checks (compiler only)',
              type: 'boolean',
              default: false,
            })
            .option('strict', {
              describe:
                'Fail if a detected language compiler was skipped (e.g. Pyright missing on a Python project)',
              type: 'boolean',
              default: false,
            }),
        async (argv: any) => {
          const scope = argv.staged ? 'staged' : argv.changed ? 'changed' : 'all';
          await checkCommand(argv.path as string, {
            scope,
            skipCompiler: argv.skipCompiler,
            skipStructural: argv.skipStructural,
            strict: argv.strict,
          });
        },
      )
      .command('auth', 'Sign in for Pro features (prompt, repo memory)', (y: any) =>
        y
          .command('login', 'Open browser to sign in with GitHub', {}, async () => {
            await authLoginCommand();
          })
          .command('logout', 'Remove stored credentials', {}, async () => {
            await authLogoutCommand();
          })
          .command('status', 'Show current plan and auth state', {}, async () => {
            await authStatusCommand();
          })
          .demandCommand(1, 'Specify auth login, logout, or status')
          .help(),
      )
      .command(
        'doctor [path]',
        'Check runtime, compiler tools, and project readiness for cxgrd check --strict',
        (y: any) =>
          y.positional('path', {
            describe: 'Project path (optional; omit for global toolchain only)',
            type: 'string',
          }),
        async (argv: any) => {
          await doctorCommand(argv.path as string);
        },
      )
      .command(
        'init-hooks [path]',
        'Set up pre-commit hooks for architecture checks',
        (y: any) =>
          y
            .positional('path', {
              describe: 'Project path (default: current directory)',
              type: 'string',
            })
            .option('block-critical', {
              describe: 'Block commits on critical risk',
              type: 'boolean',
              default: true,
            })
            .option('block-high', {
              describe: 'Block commits on high risk',
              type: 'boolean',
              default: false,
            })
            .option('warn-medium', {
              describe: 'Warn on medium risk',
              type: 'boolean',
              default: true,
            })
            .option('threshold', {
              describe: 'Risk threshold (0-100)',
              type: 'number',
              default: 70,
            })
            .option('uninstall', {
              describe: 'Uninstall hooks',
              type: 'boolean',
              default: false,
            }),
        async (argv: any) => {
          await initHooksCommand(argv.path as string, {
            blockCritical: argv.blockCritical,
            blockHigh: argv.blockHigh,
            warnMedium: argv.warnMedium,
            threshold: argv.threshold,
            uninstall: argv.uninstall,
          });
        },
      )
      .command('sync', 'Shared org dependency graph (Team / Enterprise)', (y: any) =>
        y
          .command(
            'push [path]',
            'Upload local .cg graph to org cloud',
            (yy: any) => yy.positional('path', { type: 'string' }),
            async (argv: any) => {
              await syncPushCommand(argv.path as string);
            },
          )
          .command(
            'pull [path]',
            'Download org graph into local .cg',
            (yy: any) => yy.positional('path', { type: 'string' }),
            async (argv: any) => {
              await syncPullCommand(argv.path as string);
            },
          )
          .command(
            'status [path]',
            'Compare local vs remote graph',
            (yy: any) => yy.positional('path', { type: 'string' }),
            async (argv: any) => {
              await syncStatusCommand(argv.path as string);
            },
          )
          .demandCommand(1, 'Specify sync push, pull, or status')
          .help(),
      )
      .command('org', 'Organization settings (Team / Enterprise)', (y: any) =>
        y
          .command('status', 'Show org membership and plan', {}, async () => {
            await orgStatusCommand();
          })
          .command(
            'policy-refresh [path]',
            'Fetch and cache org audit policy',
            (yy: any) => yy.positional('path', { type: 'string' }),
            async (argv: any) => {
              await orgPolicyRefreshCommand(argv.path as string);
            },
          )
          .command(
            'policy-show [path]',
            'Print cached org policy JSON',
            (yy: any) => yy.positional('path', { type: 'string' }),
            async (argv: any) => {
              await orgPolicyShowCommand(argv.path as string);
            },
          )
          .demandCommand(1, 'Specify org status, policy-refresh, or policy-show')
          .help(),
      )
      .command('team', 'Team workflows', (y: any) =>
        y
          .command(
            'precommit [path]',
            'Pre-commit: org policy + blast radius + check',
            (yy: any) => yy.positional('path', { type: 'string' }),
            async (argv: any) => {
              await teamPrecommitCommand(argv.path as string);
            },
          )
          .demandCommand(1, 'Specify team precommit')
          .help(),
      )
      .command(
        'watch [path]',
        'Monitor project for real-time architecture analysis',
        (y: any) =>
          y
            .positional('path', {
              describe: 'Project path (default: current directory)',
              type: 'string',
            })
            .option('debounce', {
              describe: 'Debounce time in ms',
              type: 'number',
              default: 500,
            }),
        async (argv: any) => {
          await watchCommand(argv.path as string, {
            debounce: argv.debounce,
          });
        },
      )
      .version('0.1.0')
      .help()
      .alias('h', 'help')
      .epilogue(chalk.gray('For more information, visit: https://cxgrd.com'))
      .demandCommand(1, chalk.red('You must provide a command'))
      .strict()
      .parseAsync();
  } catch (err: any) {
    console.error(chalk.red(`✗ Error: ${err.message}`));
    process.exit(1);
  }
}

main();
