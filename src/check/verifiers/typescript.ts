import { dirname, relative } from 'path';
import ts from 'typescript';
import type { CheckIssue, CompilerRunSummary } from '../types';
import { normalizeProjectPath } from '../scope';
import type { TypeScriptProject } from '../project-tooling';
import { runCommand } from '../run-command';
import { parseTscCliOutput } from '../parsers/tsc-cli';

function formatDiagnostic(diag: ts.Diagnostic, projectRoot: string): CheckIssue | null {
  if (diag.category === ts.DiagnosticCategory.Message) {
    return null;
  }

  let file: string | undefined;
  let line: number | undefined;
  let column: number | undefined;

  if (diag.file && diag.start !== undefined) {
    file = normalizeProjectPath(projectRoot, diag.file.fileName);
    const { line: ln, character } = diag.file.getLineAndCharacterOfPosition(diag.start);
    line = ln + 1;
    column = character + 1;
  }

  const severity =
    diag.category === ts.DiagnosticCategory.Error
      ? 'error'
      : diag.category === ts.DiagnosticCategory.Warning
        ? 'warning'
        : 'info';

  const message = ts.flattenDiagnosticMessageText(diag.messageText, '\n');

  return {
    severity,
    message,
    file,
    line,
    column,
    code: diag.code ? `TS${diag.code}` : undefined,
    source: 'compiler',
    language: 'typescript',
  };
}

export async function verifyTypeScriptProject(
  project: TypeScriptProject,
  projectRoot: string,
): Promise<{ issues: CheckIssue[]; summary: CompilerRunSummary }> {
  const relRoot = relative(projectRoot, project.rootDir) || '.';

  try {
    const configFile = ts.readConfigFile(project.configPath, ts.sys.readFile);
    if (configFile.error) {
      const issue = formatDiagnostic(configFile.error, projectRoot);
      return {
        issues: issue ? [issue] : [],
        summary: {
          language: 'typescript',
          tool: 'typescript',
          projectRoot: relRoot,
          passed: false,
          errorCount: 1,
          warningCount: 0,
          skipped: false,
        },
      };
    }

    const parsed = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      dirname(project.configPath),
    );

    const program = ts.createProgram({
      rootNames: parsed.fileNames,
      options: parsed.options,
      configFileParsingDiagnostics: parsed.errors,
    });

    const diagnostics = [
      ...parsed.errors,
      ...program.getSemanticDiagnostics(),
      ...program.getSyntacticDiagnostics(),
      ...program.getGlobalDiagnostics(),
    ];

    const issues = diagnostics
      .map((d) => formatDiagnostic(d, projectRoot))
      .filter((i): i is CheckIssue => i !== null);

    const errorCount = issues.filter((i) => i.severity === 'error').length;
    const warningCount = issues.filter((i) => i.severity === 'warning').length;

    return {
      issues,
      summary: {
        language: 'typescript',
        tool: 'typescript',
        projectRoot: relRoot,
        passed: errorCount === 0,
        errorCount,
        warningCount,
        skipped: false,
      },
    };
  } catch {
    return verifyTypeScriptProjectViaCli(project, projectRoot);
  }
}

async function verifyTypeScriptProjectViaCli(
  project: TypeScriptProject,
  projectRoot: string,
): Promise<{ issues: CheckIssue[]; summary: CompilerRunSummary }> {
  const relRoot = relative(projectRoot, project.rootDir) || '.';

  const result = await runCommand(
    'npx',
    ['tsc', '--noEmit', '--pretty', 'false', '-p', project.configPath],
    project.rootDir,
  );

  const issues = parseTscCliOutput(`${result.stdout}\n${result.stderr}`);
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;

  return {
    issues,
    summary: {
      language: 'typescript',
      tool: 'tsc',
      projectRoot: relRoot,
      passed: errorCount === 0,
      errorCount,
      warningCount,
      skipped: false,
    },
  };
}
