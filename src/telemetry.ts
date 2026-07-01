import https from 'https';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';

// PostHog public write-only key — safe to ship in CLI source
const POSTHOG_KEY = 'phc_PvPYwxDBSkjfgTX3506gCplb8TL1FSnKUkdFZDlNEFu';
const POSTHOG_URL = 'https://us.i.posthog.com';
const url = new URL(POSTHOG_URL);
const CLI_VERSION = '0.1.0';

const CONFIG_DIR = path.join(os.homedir(), '.cg');
const TELEMETRY_PATH = path.join(CONFIG_DIR, 'telemetry.json');

interface TelemetryConfig {
  deviceId: string;
  optOut: boolean;
  firstRunAt?: number;
}

function readConfig(): TelemetryConfig | null {
  try {
    if (!fs.existsSync(TELEMETRY_PATH)) return null;
    return JSON.parse(fs.readFileSync(TELEMETRY_PATH, 'utf8')) as TelemetryConfig;
  } catch {
    return null;
  }
}

function writeConfig(config: TelemetryConfig): void {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(TELEMETRY_PATH, JSON.stringify(config, null, 2));
  } catch {
    // non-fatal
  }
}

function getOrCreateDeviceId(): string {
  const existing = readConfig();
  if (existing?.deviceId) return existing.deviceId;
  const deviceId = randomUUID();
  writeConfig({ deviceId, optOut: false, firstRunAt: Date.now() });
  return deviceId;
}

export function isOptedOut(): boolean {
  return readConfig()?.optOut === true;
}

export function optOut(): void {
  const config = readConfig();
  writeConfig({ deviceId: config?.deviceId ?? randomUUID(), optOut: true });
}

export function optIn(): void {
  const config = readConfig();
  writeConfig({ deviceId: config?.deviceId ?? randomUUID(), optOut: false });
}

// Print one-line notice on very first run (no config file yet)
export function printFirstRunNotice(): void {
  if (fs.existsSync(TELEMETRY_PATH)) return;
  console.log(
    '\x1b[90mℹ  Anonymous usage stats help improve cxgrd. Disable: cxgrd config --disable-telemetry\x1b[0m',
  );
}

// Fire-and-forget — never blocks the CLI, never throws
export function trackEvent(event: string, props: Record<string, unknown> = {}): void {
  if (isOptedOut()) return;
  if (POSTHOG_KEY.includes('REPLACE')) return; // dev environment guard

  const deviceId = getOrCreateDeviceId();
  const body = JSON.stringify({
    api_key: POSTHOG_KEY,
    event,
    distinct_id: deviceId,
    properties: {
      ...props,
      cli_version: CLI_VERSION,
      platform: process.platform,
      node_version: process.version,
      $lib: 'cxgrd-cli',
    },
  });

  try {
    const req = https.request({
      hostname: url.hostname,
      path: '/capture/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 3000,
    });
    req.on('error', (e) => console.error('telemetry error:', e));
    req.on('timeout', () => req.destroy());
    req.write(body);
    req.end();
  } catch (e) {
    console.error('telemetry error:', e);
  }
}
