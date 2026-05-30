import type { CheckIssue, CompilerRunSummary } from './types';
import {
  discoverPythonProjects,
  discoverRustWorkspaces,
  discoverTypeScriptProjects,
  projectOverlapsScope,
} from './project-tooling';
import { filterIssuesByScope, normalizeProjectPath } from './scope';
import { verifyTypeScriptProject } from './verifiers/typescript';
import { verifyPythonProject } from './verifiers/python';
import { verifyRustWorkspace } from './verifiers/rust';

export async function runCompilerChecks(
  projectRoot: string,
  scopeFiles: Set<string> | null,
): Promise<{ issues: CheckIssue[]; summaries: CompilerRunSummary[] }> {
  const allIssues: CheckIssue[] = [];
  const summaries: CompilerRunSummary[] = [];

  const tsProjects = await discoverTypeScriptProjects(projectRoot);
  for (const project of tsProjects) {
    if (!projectOverlapsScope(project.rootDir, projectRoot, scopeFiles)) {
      continue;
    }
    const { issues, summary } = await verifyTypeScriptProject(project, projectRoot);
    summaries.push(summary);
    allIssues.push(
      ...filterIssuesByScope(normalizeIssuePaths(issues, projectRoot), scopeFiles, projectRoot),
    );
  }

  const pyProjects = await discoverPythonProjects(projectRoot);
  for (const project of pyProjects) {
    if (!projectOverlapsScope(project.rootDir, projectRoot, scopeFiles)) {
      continue;
    }
    const { issues, summary } = await verifyPythonProject(project, projectRoot);
    summaries.push(summary);
    allIssues.push(
      ...filterIssuesByScope(normalizeIssuePaths(issues, projectRoot), scopeFiles, projectRoot),
    );
  }

  const rustWorkspaces = await discoverRustWorkspaces(projectRoot);
  for (const workspace of rustWorkspaces) {
    if (!projectOverlapsScope(workspace.rootDir, projectRoot, scopeFiles)) {
      continue;
    }
    const { issues, summary } = await verifyRustWorkspace(workspace, projectRoot);
    summaries.push(summary);
    allIssues.push(
      ...filterIssuesByScope(normalizeIssuePaths(issues, projectRoot), scopeFiles, projectRoot),
    );
  }

  if (tsProjects.length === 0 && pyProjects.length === 0 && rustWorkspaces.length === 0) {
    summaries.push({
      language: 'none',
      tool: 'none',
      projectRoot: '.',
      passed: true,
      errorCount: 0,
      warningCount: 0,
      skipped: true,
      skipReason: 'No TypeScript, Python, or Rust projects detected',
    });
  }

  const ranAny = summaries.some((s) => !s.skipped);
  if (!ranAny && scopeFiles && scopeFiles.size > 0) {
    summaries.push({
      language: 'none',
      tool: 'none',
      projectRoot: '.',
      passed: true,
      errorCount: 0,
      warningCount: 0,
      skipped: true,
      skipReason: 'No compiler projects overlap the current file scope',
    });
  }

  return { issues: allIssues, summaries };
}

function normalizeIssuePaths(issues: CheckIssue[], projectRoot: string): CheckIssue[] {
  return issues.map((issue) => ({
    ...issue,
    file: issue.file ? normalizeProjectPath(projectRoot, issue.file) : undefined,
  }));
}
