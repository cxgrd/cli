/**
 * Change Detection Utility
 * 
 * Detects what files are being changed and extracts intent from descriptions
 */

import { execSync } from 'child_process';

export interface ChangedFilesInfo {
  files: string[];
  stagedFiles: string[];
  unstaged: string[];
  confidence: number;
}

export interface IntentMatch {
  files: string[];
  confidence: number;
  intent: string;
}

export class ChangeDetector {
  constructor(private projectRoot: string) {}

  /**
   * Get currently changed files from git
   */
  getChangedFiles(): ChangedFilesInfo {
    try {
      const staged = this.getGitStatus('--cached');
      const unstaged = this.getGitStatus('');
      const allChanged = [...new Set([...staged, ...unstaged])];

      return {
        files: allChanged,
        stagedFiles: staged,
        unstaged,
        confidence: 1.0,
      };
    } catch {
      return {
        files: [],
        stagedFiles: [],
        unstaged: [],
        confidence: 0,
      };
    }
  }

  /**
   * Parse description to identify changed files
   */
  parseDescription(description: string, availableFiles: string[]): IntentMatch {
    const patterns = this.extractPatterns(description);
    const matchedFiles: string[] = [];
    let confidence = 0;

    // Pattern 1: "refactor X module"
    for (const pattern of patterns.modules) {
      for (const file of availableFiles) {
        if (file.toLowerCase().includes(pattern.toLowerCase())) {
          matchedFiles.push(file);
          confidence = Math.max(confidence, 0.7);
        }
      }
    }

    // Pattern 2: File names mentioned
    for (const file of availableFiles) {
      const fileName = file.split('/').pop() || file;
      if (description.toLowerCase().includes(fileName.toLowerCase())) {
        if (!matchedFiles.includes(file)) {
          matchedFiles.push(file);
          confidence = Math.max(confidence, 0.9);
        }
      }
    }

    // Pattern 3: Component/feature references
    for (const feature of patterns.features) {
      for (const file of availableFiles) {
        if (file.toLowerCase().includes(feature.toLowerCase())) {
          if (!matchedFiles.includes(file)) {
            matchedFiles.push(file);
            confidence = Math.max(confidence, 0.6);
          }
        }
      }
    }

    // If no matches, use heuristics based on keywords
    if (matchedFiles.length === 0) {
      if (description.includes('middleware') || description.includes('auth')) {
        confidence = 0.3;
      }
      if (description.includes('API') || description.includes('endpoint')) {
        confidence = 0.3;
      }
      if (description.includes('database') || description.includes('schema')) {
        confidence = 0.3;
      }
    }

    return {
      files: matchedFiles,
      confidence: Math.min(1, confidence),
      intent: description,
    };
  }

  /**
   * Extract patterns from description
   */
  private extractPatterns(description: string): {
    modules: string[];
    features: string[];
    actions: string[];
  } {
    const modules: string[] = [];
    const features: string[] = [];
    const actions: string[] = [];

    // Extract module names (usually after "module", "service", "in")
    const modulePattern = /(?:module|service|in|for)\s+([a-zA-Z_]+)/gi;
    let match;
    while ((match = modulePattern.exec(description)) !== null) {
      modules.push(match[1]);
    }

    // Extract feature names (usually after "add", "implement", "create")
    const featurePattern = /(?:add|implement|create|build)\s+([a-zA-Z_\s]+)(?:\s+feature|\s+to|$)/gi;
    while ((match = featurePattern.exec(description)) !== null) {
      features.push(match[1].trim());
    }

    // Common action verbs
    const actionKeywords = [
      'refactor', 'fix', 'optimize', 'add', 'remove', 'update', 'implement', 'patch',
    ];
    for (const action of actionKeywords) {
      if (description.toLowerCase().includes(action)) {
        actions.push(action);
      }
    }

    return { modules, features, actions };
  }

  /**
   * Git status parsing — uses only --name-only, no --porcelain conflict
   */
  private getGitStatus(flag: string): string[] {
    try {
      const flagStr = flag ? `${flag} ` : '';
      const output = execSync(
        `git diff ${flagStr}--name-only --diff-filter=ACMRUXB`,
        { cwd: this.projectRoot, encoding: 'utf-8' }
      );
      return output.split('\n').filter(f => f.length > 0);
    } catch {
      return [];
    }
  }

  /**
   * Suggest related files based on the change description
   */
  suggestRelatedFiles(
    changedFiles: string[],
    allFiles: string[],
    maxSuggestions: number = 5
  ): string[] {
    const suggestions: Array<[string, number]> = [];
    const changed = new Set(changedFiles);

    for (const file of allFiles) {
      if (changed.has(file)) continue;

      let score = 0;

      const changedDir = changedFiles[0]?.split('/').slice(0, -1).join('/');
      const fileDir = file.split('/').slice(0, -1).join('/');
      if (changedDir && fileDir === changedDir) score += 3;

      for (const c of changedFiles) {
        const similarity = this.stringSimilarity(c, file);
        score += similarity * 2;
      }

      if (file.includes('test') || file.includes('spec')) score += 2;
      if (file.includes('types') || file.includes('interface')) score += 1;

      if (score > 0) {
        suggestions.push([file, score]);
      }
    }

    return suggestions
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxSuggestions)
      .map(([file]) => file);
  }

  private stringSimilarity(a: string, b: string): number {
    const longer = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;
    if (longer.length === 0) return 1;
    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  private levenshteinDistance(s1: string, s2: string): number {
    const distances: number[][] = [];
    for (let i = 0; i <= s1.length; i++) distances[i] = [i];
    for (let j = 0; j <= s2.length; j++) distances[0][j] = j;
    for (let i = 1; i <= s1.length; i++) {
      for (let j = 1; j <= s2.length; j++) {
        if (s1[i - 1] === s2[j - 1]) {
          distances[i][j] = distances[i - 1][j - 1];
        } else {
          distances[i][j] = Math.min(
            distances[i - 1][j] + 1,
            distances[i][j - 1] + 1,
            distances[i - 1][j - 1] + 1
          );
        }
      }
    }
    return distances[s1.length][s2.length];
  }
}
