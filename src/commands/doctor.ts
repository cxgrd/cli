import { resolve } from 'path';
import chalk from 'chalk';
import { buildDoctorReport } from '../toolchain/probe';
import type { ProjectCompilerNeeds } from '../toolchain/types';

export async function doctorCommand(projectPath?: string): Promise<void> {
  const rootPath = projectPath ? resolve(projectPath) : undefined;

  console.log(chalk.blue('✓ cxgrd doctor — environment & project readiness\n'));

  const report = await buildDoctorReport(rootPath);

  console.log(chalk.bold('Runtime & tools'));
  for (const probe of report.probes) {
    const icon =
      probe.status === 'ok' ? chalk.green('✓') : probe.status === 'warning' ? chalk.yellow('!') : chalk.red('✗');
    console.log(`  ${icon} ${chalk.bold(probe.name)}`);
    console.log(chalk.gray(`      ${probe.detail}`));
    if (probe.status !== 'ok' && probe.installHint) {
      console.log(chalk.yellow(`      → ${probe.installHint}`));
    }
  }

  if (rootPath && report.projectNeeds) {
    console.log('');
    console.log(chalk.bold(`Project: ${rootPath}`));
    printProjectNeeds(report.projectNeeds, report.graphPresent, report.metaLanguages);
  }

  console.log('');
  if (rootPath) {
    if (report.readyForStrictCheck) {
      console.log(chalk.green('✓ Ready for `cxgrd check --strict`'));
    } else {
      console.log(chalk.red('✗ Not ready for `cxgrd check --strict`'));
      console.log(chalk.gray('  Fix the items below, then re-run doctor:\n'));
      for (const blocker of report.blockers) {
        console.log(chalk.yellow(`  • ${blocker}`));
      }
    }
  } else {
    console.log(
      chalk.gray('  Tip: run `cxgrd doctor <path>` to verify compiler tools for a specific project.'),
    );
    if (report.blockers.length > 0) {
      console.log(chalk.red('\n  Blockers:'));
      for (const blocker of report.blockers) {
        console.log(chalk.yellow(`  • ${blocker}`));
      }
    }
  }

  console.log('');
  console.log(
    chalk.gray(
      '  `cxgrd check` runs without --strict and may skip missing compilers silently.\n' +
        '  Use `cxgrd check --strict` in CI or pre-commit when you need guaranteed compiler coverage.',
    ),
  );

  if (!report.readyForStrictCheck && (rootPath || report.blockers.some((b) => b.includes('Node')))) {
    process.exit(1);
  }
}

function printProjectNeeds(
  needs: ProjectCompilerNeeds,
  graphPresent: boolean,
  metaLanguages?: string[],
): void {
  const graphIcon = graphPresent ? chalk.green('✓') : chalk.red('✗');
  console.log(`  ${graphIcon} ${chalk.bold('.cg/graph.json')} ${graphPresent ? '' : chalk.red('(run cxgrd scan)')}`);

  if (metaLanguages?.length) {
    console.log(chalk.gray(`      Languages from last scan: ${metaLanguages.join(', ')}`));
  }

  printLangLine('TypeScript', needs.typescript.count, needs.typescript.paths, 'bundled with cxgrd');
  printLangLine('Python', needs.python.count, needs.python.paths, 'requires Pyright on PATH');
  printLangLine('Rust', needs.rust.count, needs.rust.paths, 'requires cargo on PATH');

  if (
    needs.typescript.count === 0 &&
    needs.python.count === 0 &&
    needs.rust.count === 0
  ) {
    console.log(
      chalk.gray(
        '      No tsconfig / Python / Rust projects detected — structural checks still work after scan.',
      ),
    );
  }
}

function printLangLine(
  label: string,
  count: number,
  paths: string[],
  requirement: string,
): void {
  if (count === 0) {
    console.log(chalk.gray(`      ${label}: none detected`));
    return;
  }
  const sample = paths.slice(0, 3).join(', ');
  const more = paths.length > 3 ? ` (+${paths.length - 3} more)` : '';
  console.log(`      ${label}: ${count} project(s) — ${sample}${more}`);
  console.log(chalk.gray(`        ${requirement}`));
}
