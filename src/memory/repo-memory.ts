import type { CgDirectory } from '../cg-directory';
import type { CgMemoryFile, CgPatternsFile, MemorySessionEntry } from './types';

const MAX_SESSIONS = 50;

export async function readRepoMemory(cgDir: CgDirectory): Promise<CgMemoryFile> {
  const raw = await cgDir.readMemory();
  if (!raw || raw.version !== 1) {
    return { version: 1, updatedAt: Date.now(), sessions: [], notes: [] };
  }
  return raw as CgMemoryFile;
}

export async function appendMemorySession(
  cgDir: CgDirectory,
  entry: Omit<MemorySessionEntry, 'timestamp'> & { timestamp?: number },
): Promise<void> {
  const memory = await readRepoMemory(cgDir);
  memory.sessions.unshift({
    timestamp: entry.timestamp ?? Date.now(),
    type: entry.type,
    summary: entry.summary,
    metadata: entry.metadata,
  });
  memory.sessions = memory.sessions.slice(0, MAX_SESSIONS);
  memory.updatedAt = Date.now();
  await cgDir.writeMemory(memory);
}

export function formatMemoryForPrompt(
  memory: CgMemoryFile,
  patterns: CgPatternsFile | null,
  maxSessions = 8,
): string {
  const lines: string[] = [];

  if (patterns?.importHubs?.length) {
    lines.push('## Recurring dependency patterns');
    for (const hub of patterns.importHubs.slice(0, 8)) {
      lines.push(`- ${hub.description}`);
    }
  }

  if (patterns?.lastGraphDiff) {
    const d = patterns.lastGraphDiff;
    if (d.filesAdded.length || d.filesRemoved.length) {
      lines.push('\n## Recent graph changes (last scan)');
      if (d.filesAdded.length) {
        lines.push(`- Added ${d.filesAdded.length} file(s): ${d.filesAdded.slice(0, 5).join(', ')}`);
      }
      if (d.filesRemoved.length) {
        lines.push(`- Removed ${d.filesRemoved.length} file(s)`);
      }
      if (d.dependencyChanges > 0) {
        lines.push(`- ${d.dependencyChanges} file(s) changed dependencies`);
      }
    }
  }

  const recent = memory.sessions.slice(0, maxSessions);
  if (recent.length > 0) {
    lines.push('\n## Recent cxgrd sessions (repo memory)');
    for (const s of recent) {
      const date = new Date(s.timestamp).toISOString().slice(0, 10);
      lines.push(`- [${date}] ${s.type}: ${s.summary}`);
    }
  }

  return lines.join('\n');
}

export function buildArchitecturalNotes(
  arch: { layers?: Record<string, string[]> } | null,
  meta: { languages?: string[]; entryPoints?: string[] } | null,
): string[] {
  const notes: string[] = [];
  if (meta?.languages?.length) {
    notes.push(`Languages: ${meta.languages.join(', ')}`);
  }
  if (meta?.entryPoints?.length) {
    notes.push(`Entry points: ${meta.entryPoints.join(', ')}`);
  }
  if (arch?.layers) {
    for (const [layer, files] of Object.entries(arch.layers)) {
      if (files.length > 0) {
        notes.push(`${layer} layer: ${files.length} module(s)`);
      }
    }
  }
  return notes;
}
