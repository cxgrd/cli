import { mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';

export interface AuditUsageRecord {
  year: number;
  month: number; // 1-12
  count: number;
  lastUpdated: number; // timestamp
}

export class AuditUsageExceededError extends Error {
  constructor(
    public readonly used: number,
    public readonly limit: number,
  ) {
    super(
      `Monthly audit limit exceeded. Used: ${used}/${limit}\n` +
        `  Upgrade to Pro for unlimited audits at https://cxgrd.com/pricing`,
    );
    this.name = 'AuditUsageExceededError';
  }
}

export const FREE_MONTHLY_AUDIT_LIMIT = 50;
function getUsagePath(): string {
  return join(homedir(), '.cg', 'usage.json');
}

async function readUsageFile(): Promise<AuditUsageRecord[]> {
  try {
    const content = await readFile(getUsagePath(), 'utf-8');
    return JSON.parse(content);
  } catch {
    return [];
  }
}

async function writeUsageFile(records: AuditUsageRecord[]): Promise<void> {
  const path = getUsagePath();
  const dir = join(homedir(), '.cg');
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(path, JSON.stringify(records, null, 2), 'utf-8');
  } catch {
    // Silently fail if we can't write usage (e.g., permission issues)
    // Don't block user from running commands
  }
}

function getCurrentMonth(): { year: number; month: number } {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1, // getMonth() is 0-indexed
  };
}

/**
 * Get current month's audit count for free tier tracking
 */
export async function getCurrentMonthAuditCount(): Promise<number> {
  const records = await readUsageFile();
  const current = getCurrentMonth();

  const record = records.find((r) => r.year === current.year && r.month === current.month);
  return record?.count ?? 0;
}

/**
 * Increment audit count (called after successful scan/check)
 */
export async function incrementAuditCount(): Promise<void> {
  const records = await readUsageFile();
  const current = getCurrentMonth();

  const record = records.find((r) => r.year === current.year && r.month === current.month);

  if (record) {
    record.count++;
    record.lastUpdated = Date.now();
  } else {
    records.push({
      year: current.year,
      month: current.month,
      count: 1,
      lastUpdated: Date.now(),
    });
  }

  // Clean up old records (keep last 12 months)
  const thirteenMonthsAgo = new Date();
  thirteenMonthsAgo.setMonth(thirteenMonthsAgo.getMonth() - 13);

  const filtered = records.filter((r) => {
    const recordDate = new Date(r.lastUpdated);
    return recordDate > thirteenMonthsAgo;
  });

  await writeUsageFile(filtered);
}

/**
 * Check if free tier audit limit exceeded
 * Returns true if limit OK, throws if exceeded
 */
export async function checkFreeAuditLimit(): Promise<void> {
  const count = await getCurrentMonthAuditCount();
  if (count >= FREE_MONTHLY_AUDIT_LIMIT) {
    throw new AuditUsageExceededError(count, FREE_MONTHLY_AUDIT_LIMIT);
  }
}

/**
 * Print current usage status to console
 */
export async function printAuditUsageStatus(): Promise<void> {
  const count = await getCurrentMonthAuditCount();
  const percent = Math.round((count / FREE_MONTHLY_AUDIT_LIMIT) * 100);

  console.log(
    chalk.gray(
      `   Audits this month: ${count}/${FREE_MONTHLY_AUDIT_LIMIT} (${percent}%)`,
    ),
  );

  if (count >= FREE_MONTHLY_AUDIT_LIMIT - 5) {
    console.log(
      chalk.yellow(`   ⚠ Approaching monthly limit — upgrade to Pro for unlimited audits`),
    );
  }
}
