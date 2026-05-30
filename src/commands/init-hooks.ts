/**
 * Init Hooks Command
 * 
 * Initializes cxgrd pre-commit hook integration
 */

import { resolve } from 'path';
import { GitHookManager } from '../utils/git-hook-manager';
import { RichOutput, CLIFormatter } from '../utils/cli-formatter';

export interface InitHooksOptions {
  blockCritical?: boolean;
  blockHigh?: boolean;
  warnMedium?: boolean;
  threshold?: number;
  disable?: boolean;
  uninstall?: boolean;
}

export async function initHooksCommand(
  projectPath?: string,
  options?: InitHooksOptions
): Promise<void> {
  const rootPath = resolve(projectPath || process.cwd());

  RichOutput.header('Pre-commit Hook Setup');

  try {
    const hookManager = new GitHookManager(rootPath);
    const status = hookManager.getStatus();

    if (options?.uninstall) {
      RichOutput.info('Uninstalling cxgrd pre-commit hooks...');
      await hookManager.uninstallHooks();
      RichOutput.success('Hooks uninstalled');
      return;
    }

    if (status.installed && status.enabled && !options?.disable) {
      RichOutput.info('Pre-commit hooks already installed and enabled.');
      displayHookStatus(status);
      return;
    }

    // Setup hooks
    RichOutput.info('Setting up pre-commit hook...');

    const config = {
      enabled: !options?.disable,
      blockOnCritical: options?.blockCritical ?? true,
      blockOnHigh: options?.blockHigh ?? false,
      warnOnMedium: options?.warnMedium ?? true,
      autoFixSuggestions: true,
      ignoredPatterns: [
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/*.test.js',
        '**/*.spec.js',
        'docs/**',
        '*.md',
        '.env*',
        'package-lock.json',
        'yarn.lock',
      ],
      riskThreshold: options?.threshold ?? 70,
    };

    await hookManager.setupHooks(config);

    RichOutput.blank();
    RichOutput.success('Pre-commit hook installed successfully!');

    RichOutput.blank();
    RichOutput.section('Configuration');
    console.log(CLIFormatter.stats({
      'Status': config.enabled ? '✓ Enabled' : '✗ Disabled',
      'Block Critical': config.blockOnCritical ? 'Yes' : 'No',
      'Block High': config.blockOnHigh ? 'Yes' : 'No',
      'Warn Medium': config.warnOnMedium ? 'Yes' : 'No',
      'Risk Threshold': `${config.riskThreshold}/100`,
    }));

    RichOutput.blank();
    RichOutput.section('What This Does');
    console.log(CLIFormatter.list(
      [
        { icon: '🛡️ ', text: 'Prevents commits that break the architecture' },
        { icon: '⚠️  ', text: 'Warns about high-risk changes' },
        { icon: '🔍', text: 'Analyzes staged files for impact' },
        { icon: '📋', text: 'Generates fix suggestions' },
      ],
      3
    ));

    RichOutput.blank();
    RichOutput.section('How to Use');
    console.log(CLIFormatter.list(
      [
        { text: 'git add <files>' },
        { text: 'git commit -m "message"' },
        { text: '← Hook runs automatically' },
        { text: 'If blocking: fix issues or use --no-verify to skip' },
      ],
      3
    ));

    RichOutput.blank();
    RichOutput.tip('To bypass the hook: git commit --no-verify');

    RichOutput.blank();
  } catch (err: any) {
    RichOutput.error(err.message);
    process.exit(1);
  }
}

function displayHookStatus(status: any): void {
  RichOutput.blank();
  RichOutput.section('Current Status');

  if (status.config) {
    console.log(CLIFormatter.stats({
      'Installed': status.installed ? '✓ Yes' : '✗ No',
      'Enabled': status.config.enabled ? '✓ Yes' : '✗ No',
      'Block Critical': status.config.blockOnCritical ? '✓ Yes' : '✗ No',
      'Risk Threshold': `${status.config.riskThreshold}/100`,
    }));
  }

  RichOutput.blank();
  RichOutput.section('Next Steps');
  console.log(`   1. Make a change to your code`);
  console.log(`   2. Stage the changes: git add <files>`);
  console.log(`   3. Try to commit: git commit -m "your message"`);
  console.log(`   4. The hook will run automatically`);
}

