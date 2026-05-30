export type CompilerLanguage = 'typescript' | 'python' | 'rust';

export interface ToolProbe {
  name: string;
  status: 'ok' | 'missing' | 'warning';
  detail: string;
  installHint?: string;
  requiredForCxgrd: boolean;
}

export interface ProjectCompilerNeeds {
  typescript: { count: number; paths: string[] };
  python: { count: number; paths: string[] };
  rust: { count: number; paths: string[] };
}

export interface DoctorReport {
  probes: ToolProbe[];
  projectPath?: string;
  projectNeeds?: ProjectCompilerNeeds;
  graphPresent: boolean;
  metaLanguages?: string[];
  readyForStrictCheck: boolean;
  blockers: string[];
}
