interface Dependency {
  from: string;
  to: string;
  type: 'import' | 'require' | 'include' | 'sql' | 'reference';
  line: number;
}

interface FileNode {
  path: string;
  language: string;
  dependencies: Dependency[];
  symbols: string[];
}

interface DependencyGraph {
  files: Record<string, FileNode>;
  stats: {
    totalFiles: number;
    totalDependencies: number;
    languages: Record<string, number>;
  };
}

export class DependencyGraphBuilder {
  private graph: DependencyGraph = {
    files: {},
    stats: {
      totalFiles: 0,
      totalDependencies: 0,
      languages: {},
    },
  };

  // Regex patterns for extracting imports/requires
  private patterns: Record<string, RegExp[]> = {
    typescript: [
      /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"](\.\.?\/[^'"]+|[^/][^'"]*)['"]/gm,
      /import\s+['"](\.\.?\/[^'"]+|[^/][^'"]*)['"]/gm,
      /from\s+['"](\.\.?\/[^'"]+|[^/][^'"]*)['"]/gm,
      /require\s*\(\s*['"](\.\.?\/[^'"]+|[^/][^'"]*)['"]\s*\)/gm,
    ],
    javascript: [
      /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"](\.\.?\/[^'"]+|[^/][^'"]*)['"]/gm,
      /import\s+['"](\.\.?\/[^'"]+|[^/][^'"]*)['"]/gm,
      /from\s+['"](\.\.?\/[^'"]+|[^/][^'"]*)['"]/gm,
      /require\s*\(\s*['"](\.\.?\/[^'"]+|[^/][^'"]*)['"]\s*\)/gm,
    ],
    python: [
      /from\s+([.\w]+)\s+import/gm,
      /import\s+([.\w]+)/gm,
    ],
    java: [
      /import\s+([a-zA-Z0-9_.]+);/gm,
    ],
    cpp: [
      /#include\s+[<"](.*?)[>"]/gm,
    ],
  };

  private extractSymbols(content: string, language: string): string[] {
    const symbols: string[] = [];

    switch (language) {
      case 'typescript':
      case 'javascript':
        // Extract function declarations
        const funcMatches = content.matchAll(/(?:export\s+)?(?:async\s+)?function\s+(\w+)|const\s+(\w+)\s*=|let\s+(\w+)\s*=/gm);
        for (const match of funcMatches) {
          const symbol = match[1] || match[2] || match[3];
          if (symbol) symbols.push(symbol);
        }

        // Extract class declarations
        const classMatches = content.matchAll(/(?:export\s+)?class\s+(\w+)/gm);
        for (const match of classMatches) {
          symbols.push(match[1]);
        }

        // Extract interface/type declarations
        const typeMatches = content.matchAll(/(?:export\s+)?(?:interface|type)\s+(\w+)/gm);
        for (const match of typeMatches) {
          symbols.push(match[1]);
        }
        break;

      case 'python':
        // Extract function and class definitions
        const pyMatches = content.matchAll(/^(?:def|class)\s+(\w+)/gm);
        for (const match of pyMatches) {
          symbols.push(match[1]);
        }
        break;
    }

    return [...new Set(symbols)]; // Remove duplicates
  }

  private extractDependencies(filePath: string, content: string, language: string): Dependency[] {
    const dependencies: Dependency[] = [];
    const patterns = this.patterns[language] || [];

    let lineNum = 0;
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      for (const pattern of patterns) {
        pattern.lastIndex = 0; // Reset regex state
        let match;
        while ((match = pattern.exec(line)) !== null) {
          const importPath = match[1];
          if (importPath) {
            dependencies.push({
              from: filePath,
              to: importPath,
              type: line.includes('import') || line.includes('from') ? 'import' : 'require',
              line: i + 1,
            });
          }
        }
      }
    }

    return dependencies;
  }

  buildGraph(files: Array<{ path: string; content: string; language: string }>): DependencyGraph {
    this.graph = {
      files: {},
      stats: {
        totalFiles: files.length,
        totalDependencies: 0,
        languages: {},
      },
    };

    for (const file of files) {
      const dependencies = this.extractDependencies(file.path, file.content, file.language);
      const symbols = this.extractSymbols(file.content, file.language);

      this.graph.files[file.path] = {
        path: file.path,
        language: file.language,
        dependencies,
        symbols,
      };

      // Update stats
      this.graph.stats.languages[file.language] = (this.graph.stats.languages[file.language] || 0) + 1;
      this.graph.stats.totalDependencies += dependencies.length;
    }

    return this.graph;
  }

  getGraph(): DependencyGraph {
    return this.graph;
  }
}
