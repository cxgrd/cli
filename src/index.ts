#!/usr/bin/env node

import yargs, { ArgumentsCamelCase } from 'yargs';
import { hideBin } from 'yargs/helpers';
import chalk from 'chalk';
import { scanCommand } from './commands/scan';
import { inputCommand } from './commands/input';
import { promptCommand } from './commands/prompt';
import { checkCommand } from './commands/check';

async function main() {
  try {
    await yargs(hideBin(process.argv))
      .command(
        'scan [path]',
        'Scan project and build dependency graph',
        (y: any) =>
          y.positional('path', {
            describe: 'Project path (default: current directory)',
            type: 'string',
          }),
        async (argv: any) => {
          await scanCommand(argv.path as string);
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
        'Generate enriched AI prompt with architectural context',
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
        'Check implementation for architecture violations',
        (y: any) =>
          y.positional('path', {
            describe: 'Project path (default: current directory)',
            type: 'string',
          }),
        async (argv: any) => {
          await checkCommand(argv.path as string);
        },
      )
      .version('0.1.0')
      .help()
      .alias('h', 'help')
      .epilogue(chalk.gray('For more information, visit: https://cxgrd.dev'))
      .demandCommand(1, chalk.red('You must provide a command'))
      .strict()
      .parseAsync();
  } catch (err: any) {
    console.error(chalk.red(`✗ Error: ${err.message}`));
    process.exit(1);
  }
}

main();
