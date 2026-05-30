import ts from 'typescript';
import { commandExists } from '../check/run-command';
import type { CompilerLanguage, DoctorReport, ProjectCompilerNeeds, ToolProbe } from './types';
import { detectProjectCompilerNeeds } from './project-languages';
import { CgDirectory } from '../cg-directory';

const MIN_NODE_MAJOR = 18;

export async function probeRuntime(): Promise<ToolProbe[]> {
  const probes: ToolProbe[] = [];

  const nodeMajor = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);
  probes.push({
    name: 'Node.js',
    status: nodeMajor >= MIN_NODE_MAJOR ? 'ok' : 'missing',
    detail:
      nodeMajor >= MIN_NODE_MAJOR
        ? `v${process.versions.node} (required >=${MIN_NODE_MAJOR})`
        : `v${process.versions.node} — upgrade to Node ${MIN_NODE_MAJOR}+`,
    requiredForCxgrd: true,
    installHint: 'https://nodejs.org/',
  });

  const hasGit = await commandExists('git');
  probes.push({
    name: 'Git',
    status: hasGit ? 'ok' : 'warning',
    detail: hasGit ? 'available (for --staged / pre-commit hooks)' : 'not on PATH — scoped checks need git',
    requiredForCxgrd: false,
    installHint: hasGit ? undefined : 'https://git-scm.com/',
  });

  probes.push({
    name: 'TypeScript (bundled)',
    status: 'ok',
    detail: `typescript@${ts.version} ships with cxgrd — no global tsc required`,
    requiredForCxgrd: false,
  });

  const hasPyright = await commandExists('pyright');
  probes.push({
    name: 'Pyright',
    status: hasPyright ? 'ok' : 'missing',
    detail: hasPyright ? 'on PATH' : 'not on PATH',
    installHint: 'pip install pyright',
    requiredForCxgrd: false,
  });

  const hasCargo = await commandExists('cargo');
  probes.push({
    name: 'Cargo (Rust)',
    status: hasCargo ? 'ok' : 'missing',
    detail: hasCargo ? 'on PATH' : 'not on PATH',
    installHint: 'https://rustup.rs/',
    requiredForCxgrd: false,
  });

  return probes;
}

export function toolReadyForLanguage(probes: ToolProbe[], language: CompilerLanguage): boolean {
  switch (language) {
    case 'typescript':
      return probes.find((p) => p.name.startsWith('TypeScript'))?.status === 'ok';
    case 'python':
      return probes.find((p) => p.name === 'Pyright')?.status === 'ok';
    case 'rust':
      return probes.find((p) => p.name.startsWith('Cargo'))?.status === 'ok';
  }
}

export function evaluateStrictReadiness(
  languages: CompilerLanguage[],
  probes: ToolProbe[],
): { ready: boolean; blockers: string[] } {
  const blockers: string[] = [];

  for (const lang of languages) {
    if (!toolReadyForLanguage(probes, lang)) {
      const probe = probes.find((p) =>
        lang === 'typescript'
          ? p.name.startsWith('TypeScript')
          : lang === 'python'
            ? p.name === 'Pyright'
            : p.name.startsWith('Cargo'),
      );
      blockers.push(
        `${lang}: ${probe?.installHint ? `install via ${probe.installHint}` : probe?.detail || 'tool missing'}`,
      );
    }
  }

  return { ready: blockers.length === 0, blockers };
}

function languagesFromNeeds(needs: ProjectCompilerNeeds): CompilerLanguage[] {
  const langs: CompilerLanguage[] = [];
  if (needs.typescript.count > 0) langs.push('typescript');
  if (needs.python.count > 0) langs.push('python');
  if (needs.rust.count > 0) langs.push('rust');
  return langs;
}

export async function buildDoctorReport(projectPath?: string): Promise<DoctorReport> {
  const probes = await probeRuntime();
  const blockers: string[] = [];

  const nodeProbe = probes.find((p) => p.name === 'Node.js');
  if (nodeProbe?.status !== 'ok') {
    blockers.push(nodeProbe?.detail || 'Node.js version too old');
  }

  let projectNeeds: ProjectCompilerNeeds | undefined;
  let graphPresent = false;
  let metaLanguages: string[] | undefined;
  let readyForStrictCheck = true;

  if (projectPath) {
    const cgDir = new CgDirectory(projectPath);
    graphPresent = (await cgDir.readGraph()) !== null;
    const meta = await cgDir.readMeta();
    metaLanguages = meta?.languages;

    projectNeeds = await detectProjectCompilerNeeds(projectPath);
    const languages = languagesFromNeeds(projectNeeds);
    const strictEval = evaluateStrictReadiness(languages, probes);
    readyForStrictCheck = strictEval.ready && graphPresent;
    blockers.push(...strictEval.blockers);

    if (!graphPresent) {
      blockers.push('No .cg/graph.json — run `cxgrd scan` first');
      readyForStrictCheck = false;
    }
  } else {
    readyForStrictCheck = nodeProbe?.status === 'ok';
  }

  return {
    probes,
    projectPath,
    projectNeeds,
    graphPresent,
    metaLanguages,
    readyForStrictCheck,
    blockers: [...new Set(blockers)],
  };
}
