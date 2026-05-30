/**
 * Git Hook Manager
 * 
 * Manages pre-commit hooks integration with cxgrd
 */

import { execSync } from 'child_process';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, join } from 'path';

export interface HookConfig {
  enabled: boolean;
  blockOnCritical: boolean;
  blockOnHigh: boolean;
  warnOnMedium: boolean;
  autoFixSuggestions: boolean;
  ignoredPatterns: string[];
  riskThreshold: number; // 0-100
  notifySlack?: string;
}

export class GitHookManager {
  private projectRoot: string;
  private hooksDir: string;
  private gitDir: string;
  private cgDir: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.gitDir = resolve(projectRoot, '.git');
    this.hooksDir = resolve(this.gitDir, 'hooks');
    this.cgDir = resolve(projectRoot, '.cg');
  }

  /**
   * Initialize pre-commit hook setup
   */
  async setupHooks(config?: Partial<HookConfig>): Promise<void> {
    const fullConfig: HookConfig = {
      enabled: true,
      blockOnCritical: true,
      blockOnHigh: false,
      warnOnMedium: true,
      autoFixSuggestions: true,
      ignoredPatterns: ['**/*.test.ts', '**/*.spec.ts', 'docs/**', '*.md'],
      riskThreshold: 70,
      ...config,
    };

    // Create .cg directory if needed
    if (!existsSync(this.cgDir)) {
      mkdirSync(this.cgDir, { recursive: true });
    }

    // Save hook configuration
    this.writeHookConfig(fullConfig);

    // Create pre-commit hook script
    this.createPreCommitHook();

    // Make hook executable
    this.makeExecutable(resolve(this.hooksDir, 'pre-commit'));

    return;
  }

  /**
   * Create the actual pre-commit hook script
   */
  private createPreCommitHook(): void {
    const hookScript = `#!/bin/bash
# cxgrd pre-commit hook
# Prevents commits that break the architecture

set -e

# Get the project root
PROJECT_ROOT="$(git rev-parse --show-toplevel)"
CG_DIR="$PROJECT_ROOT/.cg"
HOOK_CONFIG="$CG_DIR/hooks.json"

# Check if cxgrd is available
if ! command -v cxgrd &> /dev/null; then
  echo "⚠️  cxgrd not found in PATH. Skipping architecture check."
  exit 0
fi

# Check if hook is enabled
if [ ! -f "$HOOK_CONFIG" ]; then
  exit 0
fi

# Get staged files
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACMRUXB)

if [ -z "$STAGED_FILES" ]; then
  exit 0
fi

echo "🔍 Running cxgrd architecture check..."

# Run cxgrd check on staged files
if ! cxgrd check "$PROJECT_ROOT" --staged; then
  echo "❌ Architecture check failed. Commit blocked."
  exit 1
fi

exit 0
`;

    writeFileSync(resolve(this.hooksDir, 'pre-commit'), hookScript);
  }

  /**
   * Write hook configuration to .cg/hooks.json
   */
  private writeHookConfig(config: HookConfig): void {
    const configPath = resolve(this.cgDir, 'hooks.json');
    writeFileSync(configPath, JSON.stringify(config, null, 2));
  }

  /**
   * Read hook configuration
   */
  readHookConfig(): HookConfig | null {
    const configPath = resolve(this.cgDir, 'hooks.json');
    if (!existsSync(configPath)) return null;

    try {
      return JSON.parse(readFileSync(configPath, 'utf-8'));
    } catch {
      return null;
    }
  }

  /**
   * Make file executable (Unix permissions)
   */
  private makeExecutable(filePath: string): void {
    try {
      execSync(`chmod +x "${filePath}"`);
    } catch {
      // May fail on Windows, but that's okay
    }
  }

  /**
   * Check if hooks are installed
   */
  isInstalled(): boolean {
    const hookPath = resolve(this.hooksDir, 'pre-commit');
    if (!existsSync(hookPath)) return false;

    try {
      const content = readFileSync(hookPath, 'utf-8');
      return content.includes('cxgrd');
    } catch {
      return false;
    }
  }

  /**
   * Uninstall hooks
   */
  async uninstallHooks(): Promise<void> {
    try {
      const hookPath = resolve(this.hooksDir, 'pre-commit');
      execSync(`rm "${hookPath}"`);
    } catch {
      // Hook might not exist
    }

    // Remove config
    try {
      const configPath = resolve(this.cgDir, 'hooks.json');
      execSync(`rm "${configPath}"`);
    } catch {
      // Config might not exist
    }
  }

  /**
   * Get information about hooks status
   */
  getStatus(): {
    installed: boolean;
    enabled: boolean;
    config: HookConfig | null;
  } {
    const config = this.readHookConfig();
    return {
      installed: this.isInstalled(),
      enabled: config?.enabled ?? false,
      config,
    };
  }

  /**
   * Enable/disable hooks
   */
  setEnabled(enabled: boolean): void {
    const config = this.readHookConfig();
    if (config) {
      config.enabled = enabled;
      const configPath = resolve(this.cgDir, 'hooks.json');
      writeFileSync(configPath, JSON.stringify(config, null, 2));
    }
  }

  /**
   * Update risk threshold
   */
  setRiskThreshold(threshold: number): void {
    const config = this.readHookConfig();
    if (config) {
      config.riskThreshold = Math.max(0, Math.min(100, threshold));
      const configPath = resolve(this.cgDir, 'hooks.json');
      writeFileSync(configPath, JSON.stringify(config, null, 2));
    }
  }

  /**
   * Get staged files that would trigger analysis
   */
  getStagedFiles(): string[] {
    try {
      const output = execSync('git diff --cached --name-only --diff-filter=ACMRUXB', {
        cwd: this.projectRoot,
        encoding: 'utf-8',
      });
      return output.split('\n').filter(f => f.length > 0);
    } catch {
      return [];
    }
  }

  /**
   * Check if file matches ignored patterns
   */
  isIgnored(filePath: string, patterns: string[]): boolean {
    for (const pattern of patterns) {
      // Simple glob pattern matching
      const regexPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');

      if (new RegExp(`^${regexPattern}$`).test(filePath)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get all staged files not matching ignore patterns
   */
  getRelevantStagedFiles(ignorePatterns: string[]): string[] {
    return this.getStagedFiles().filter(
      file => !this.isIgnored(file, ignorePatterns)
    );
  }
}
