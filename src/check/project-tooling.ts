import { readdir, stat } from 'fs/promises';
import { join, dirname, relative } from 'path';

export interface TypeScriptProject {
  configPath: string;
  rootDir: string;
}

export interface RustWorkspace {
  manifestPath: string;
  rootDir: string;
}

export interface PythonProject {
  rootDir: string;
  configPath?: string;
}

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'target',
  '.cg',
  'coverage',
  '.venv',
  'venv',
  '__pycache__',
]);

async function walkForFiles(
  root: string,
  matcher: (name: string) => boolean,
  maxDepth = 6,
): Promise<string[]> {
  const found: string[] = [];

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;

    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory() && IGNORE_DIRS.has(entry.name)) {
        continue;
      }

      const fullPath = join(dir, entry.name);
      if (entry.isFile() && matcher(entry.name)) {
        found.push(fullPath);
      } else if (entry.isDirectory()) {
        await walk(fullPath, depth + 1);
      }
    }
  }

  await walk(root, 0);
  return found;
}

export async function discoverTypeScriptProjects(projectRoot: string): Promise<TypeScriptProject[]> {
  const configs = await walkForFiles(projectRoot, (name) => name === 'tsconfig.json');
  return configs.map((configPath) => ({
    configPath,
    rootDir: dirname(configPath),
  }));
}

export async function discoverRustWorkspaces(projectRoot: string): Promise<RustWorkspace[]> {
  const manifests = await walkForFiles(projectRoot, (name) => name === 'Cargo.toml');
  return manifests.map((manifestPath) => ({
    manifestPath,
    rootDir: dirname(manifestPath),
  }));
}

export async function discoverPythonProjects(projectRoot: string): Promise<PythonProject[]> {
  const roots = new Set<string>();

  const pyproject = await walkForFiles(projectRoot, (name) => name === 'pyproject.toml');
  for (const path of pyproject) {
    roots.add(dirname(path));
  }

  const requirements = await walkForFiles(projectRoot, (name) => name === 'requirements.txt');
  for (const path of requirements) {
    roots.add(dirname(path));
  }

  // If .py files exist at root but no config, still allow pyright at project root
  if (roots.size === 0) {
    const pyFiles = await walkForFiles(projectRoot, (name) => name.endsWith('.py'));
    if (pyFiles.length > 0) {
      roots.add(projectRoot);
    }
  }

  return [...roots].map((rootDir) => ({
    rootDir,
    configPath: pyproject.find((p) => dirname(p) === rootDir),
  }));
}

export function projectOverlapsScope(
  projectDir: string,
  projectRoot: string,
  scopeFiles: Set<string> | null,
): boolean {
  if (!scopeFiles) {
    return true;
  }
  if (scopeFiles.size === 0) {
    return false;
  }

  const relProject = relative(projectRoot, projectDir).replace(/\\/g, '/') || '.';
  const prefix = relProject === '.' ? '' : `${relProject}/`;

  for (const file of scopeFiles) {
    if (relProject === '.' || file.startsWith(prefix) || file === relProject) {
      return true;
    }
  }
  return false;
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
