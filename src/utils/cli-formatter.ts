/**
 * CLI Output Formatting Utilities
 * 
 * Creates formatted tables, boxes, and colored output for better UX
 */

import chalk from 'chalk';

export interface TableColumn {
  key: string;
  label: string;
  width?: number;
  align?: 'left' | 'center' | 'right';
}

export interface TableRow {
  [key: string]: string | number;
}

export class CLIFormatter {
  /**
   * Create a formatted table
   */
  static table(columns: TableColumn[], rows: TableRow[]): string {
    if (rows.length === 0) {
      return chalk.gray('   (no data)');
    }

    // Calculate column widths
    const widths = new Map<string, number>();
    for (const col of columns) {
      let maxWidth = col.label.length;
      for (const row of rows) {
        const value = String(row[col.key] || '');
        maxWidth = Math.max(maxWidth, value.length);
      }
      widths.set(col.key, Math.min(maxWidth, col.width || 50) + 2);
    }

    // Build header
    let result = '   ' + columns
      .map(col => this.padCell(col.label, widths.get(col.key) || 10, 'left'))
      .join('');
    result += '\n   ' + columns
      .map(col => '─'.repeat(widths.get(col.key) || 10))
      .join('');
    result += '\n';

    // Build rows
    for (const row of rows) {
      result += '   ' + columns
        .map(col => this.padCell(String(row[col.key] || ''), widths.get(col.key) || 10, col.align || 'left'))
        .join('');
      result += '\n';
    }

    return result;
  }

  /**
   * Create a severity badge
   */
  static severity(level: 'critical' | 'high' | 'medium' | 'low'): string {
    const badges: Record<string, string> = {
      critical: chalk.bgRed.white(' CRITICAL '),
      high: chalk.bgYellow.black(' HIGH '),
      medium: chalk.bgCyan.black(' MEDIUM '),
      low: chalk.bgGreen.black(' LOW '),
    };
    return badges[level] || level;
  }

  /**
   * Create a progress bar
   */
  static progressBar(current: number, total: number, width: number = 20): string {
    const percentage = current / total;
    const filled = Math.round(width * percentage);
    const empty = width - filled;

    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    const percent = Math.round(percentage * 100);

    return `[${bar}] ${percent}%`;
  }

  /**
   * Create a boxed section
   */
  static box(title: string, content: string, width: number = 60): string {
    const titleBox = ` ${title} `;
    const padding = width - titleBox.length;
    const leftPad = Math.floor(padding / 2);
    const rightPad = padding - leftPad;

    let result = '┌' + '─'.repeat(leftPad) + titleBox + '─'.repeat(rightPad) + '┐\n';

    const lines = content.split('\n');
    for (const line of lines) {
      const contentWidth = width - 2;
      const paddedLine = line.padEnd(contentWidth);
      result += '│ ' + paddedLine + ' │\n';
    }

    result += '└' + '─'.repeat(width) + '┘';

    return result;
  }

  /**
   * Create a bullet list with icons
   */
  static list(items: Array<{ icon?: string; text: string; color?: typeof chalk }>, indent: number = 3): string {
    return items
      .map(item => {
        const icon = item.icon || '•';
        const spaces = ' '.repeat(indent);
        const colored = item.color ? item.color(item.text) : item.text;
        return `${spaces}${icon} ${colored}`;
      })
      .join('\n');
  }

  /**
   * Create a diff-style output
   */
  static diff(before: string[], after: string[]): string {
    let result = '';

    const beforeSet = new Set(before);
    const afterSet = new Set(after);

    // Added lines
    for (const line of after) {
      if (!beforeSet.has(line)) {
        result += chalk.green(`+ ${line}\n`);
      }
    }

    // Removed lines
    for (const line of before) {
      if (!afterSet.has(line)) {
        result += chalk.red(`- ${line}\n`);
      }
    }

    // Unchanged
    for (const line of before) {
      if (afterSet.has(line)) {
        result += chalk.gray(`  ${line}\n`);
      }
    }

    return result;
  }

  /**
   * Create a stats overview
   */
  static stats(data: Record<string, string | number>): string {
    const entries = Object.entries(data);
    const maxKeyLength = Math.max(...entries.map(([k]) => k.length));

    return entries
      .map(([key, value]) => {
        const paddedKey = key.padEnd(maxKeyLength);
        return `   ${chalk.cyan(paddedKey)} : ${chalk.bold(value)}`;
      })
      .join('\n');
  }

  /**
   * Create a warning banner
   */
  static warning(message: string): string {
    return chalk.yellow(
      '\n⚠️  ' + message + '\n'
    );
  }

  /**
   * Create an error banner
   */
  static error(message: string): string {
    return chalk.red(
      '\n✗ ' + message + '\n'
    );
  }

  /**
   * Create a success banner
   */
  static success(message: string): string {
    return chalk.green(
      '\n✓ ' + message + '\n'
    );
  }

  /**
   * Pad cell content
   */
  private static padCell(content: string, width: number, align: 'left' | 'center' | 'right' = 'left'): string {
    const truncated = content.length > width ? content.substring(0, width - 1) + '…' : content;

    switch (align) {
      case 'right':
        return truncated.padStart(width);
      case 'center':
        const leftPad = Math.floor((width - truncated.length) / 2);
        return ' '.repeat(leftPad) + truncated.padEnd(width - leftPad);
      default:
        return truncated.padEnd(width);
    }
  }
}

/**
 * Rich console output helper
 */
export class RichOutput {
  static header(title: string): void {
    console.log('\n' + chalk.cyan('═'.repeat(title.length + 4)));
    console.log(chalk.cyan(`  ${title}`));
    console.log(chalk.cyan('═'.repeat(title.length + 4)) + '\n');
  }

  static section(title: string): void {
    console.log('\n' + chalk.blue(`▶ ${title}`));
    console.log(chalk.gray('─'.repeat(title.length + 2)) + '\n');
  }

  static info(message: string): void {
    console.log(chalk.blue(`ℹ  ${message}`));
  }

  static success(message: string): void {
    console.log(chalk.green(`✓ ${message}`));
  }

  static warning(message: string): void {
    console.log(chalk.yellow(`⚠  ${message}`));
  }

  static error(message: string): void {
    console.log(chalk.red(`✗ ${message}`));
  }

  static tip(message: string): void {
    console.log(chalk.cyan(`💡 ${message}`));
  }

  static debug(message: string): void {
    console.log(chalk.gray(`[DEBUG] ${message}`));
  }

  static blank(): void {
    console.log('');
  }
}
