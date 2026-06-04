import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// In CommonJS (which this project uses), __dirname is a built-in global.
// No need to construct it from import.meta.url (that's ESM-only).

let loaded = false;

function parseEnvFile(content: string): void {
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

async function tryLoad(path: string): Promise<void> {
  if (!existsSync(path)) return;
  try {
    parseEnvFile(await readFile(path, 'utf-8'));
  } catch {
    // ignore unreadable .env
  }
}

/** Load .env from cwd, repo root, cli package, and ~/.cg/.env (first wins per key). */
export async function loadCxgrdEnv(cwd = process.cwd()): Promise<void> {
  if (loaded) return;
  loaded = true;

  const cliRoot = join(__dirname, '..', '..');
  const paths = [
    join(homedir(), '.cg', '.env'),
    join(cwd, '.env'),
    join(cwd, 'cli', '.env'),
    join(cliRoot, '.env'),
  ];

  for (const path of paths) {
    await tryLoad(path);
  }
}

export function envString(key: string, fallback = ''): string {
  return process.env[key]?.trim() || fallback;
}

export function envBool(key: string): boolean {
  const v = process.env[key]?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}
