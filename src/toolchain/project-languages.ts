import { relative } from 'path';
import {
  discoverPythonProjects,
  discoverRustWorkspaces,
  discoverTypeScriptProjects,
  projectOverlapsScope,
} from '../check/project-tooling';
import type { CompilerLanguage, ProjectCompilerNeeds } from './types';

export async function getCompilerLanguagesInScope(
  projectRoot: string,
  scopeFiles: Set<string> | null,
): Promise<CompilerLanguage[]> {
  const langs = new Set<CompilerLanguage>();

  for (const project of await discoverTypeScriptProjects(projectRoot)) {
    if (projectOverlapsScope(project.rootDir, projectRoot, scopeFiles)) {
      langs.add('typescript');
    }
  }
  for (const project of await discoverPythonProjects(projectRoot)) {
    if (projectOverlapsScope(project.rootDir, projectRoot, scopeFiles)) {
      langs.add('python');
    }
  }
  for (const workspace of await discoverRustWorkspaces(projectRoot)) {
    if (projectOverlapsScope(workspace.rootDir, projectRoot, scopeFiles)) {
      langs.add('rust');
    }
  }

  return [...langs];
}

export async function detectProjectCompilerNeeds(
  projectRoot: string,
): Promise<ProjectCompilerNeeds> {
  const ts = await discoverTypeScriptProjects(projectRoot);
  const py = await discoverPythonProjects(projectRoot);
  const rust = await discoverRustWorkspaces(projectRoot);

  return {
    typescript: {
      count: ts.length,
      paths: ts.map((p) => relative(projectRoot, p.configPath).replace(/\\/g, '/') || '.'),
    },
    python: {
      count: py.length,
      paths: py.map((p) => relative(projectRoot, p.rootDir).replace(/\\/g, '/') || '.'),
    },
    rust: {
      count: rust.length,
      paths: rust.map((w) => relative(projectRoot, w.manifestPath).replace(/\\/g, '/') || '.'),
    },
  };
}
