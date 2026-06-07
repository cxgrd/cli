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

  private patterns: Record<string, RegExp[]> = {
    typescript: [
      /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"](\.\.\/?[^'"]+|[^/][^'"]*)['\"]/gm,
      /import\s+['"](\.\.\/?[^'"]+|[^/][^'"]*)['\"]/gm,
      /from\s+['"](\.\.\/?[^'"]+|[^/][^'"]*)['\"]/gm,
      /require\s*\(\s*['"](\.\.\/?[^'"]+|[^/][^'"]*)['"]\s*\)/gm,
    ],
    javascript: [
      /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"](\.\.\/?[^'"]+|[^/][^'"]*)['\"]/gm,
      /import\s+['"](\.\.\/?[^'"]+|[^/][^'"]*)['\"]/gm,
      /from\s+['"](\.\.\/?[^'"]+|[^/][^'"]*)['\"]/gm,
      /require\s*\(\s*['"](\.\.\/?[^'"]+|[^/][^'"]*)['"]\s*\)/gm,
    ],
    python: [
      /from\s+([\.\w]+)\s+import/gm,
      /import\s+([\.\w]+)/gm,
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
      case 'javascript': {
        // Top-level and exported functions
        const funcMatches = content.matchAll(
          /(?:export\s+)?(?:async\s+)?function\s+(\w+)|(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(/gm
        );
        for (const match of funcMatches) {
          const sym = match[1] || match[2];
          if (sym) symbols.push(sym);
        }
        // Classes
        const classMatches = content.matchAll(/(?:export\s+)?class\s+(\w+)/gm);
        for (const match of classMatches) symbols.push(match[1]);
        // Class methods
        const methodMatches = content.matchAll(/^\s{2,}(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*\w+\s*)?\{/gm);
        for (const match of methodMatches) {
          const sym = match[1];
          if (sym && !['if', 'for', 'while', 'switch', 'catch'].includes(sym)) symbols.push(sym);
        }
        // Interfaces and types
        const typeMatches = content.matchAll(/(?:export\s+)?(?:interface|type)\s+(\w+)/gm);
        for (const match of typeMatches) symbols.push(match[1]);
        break;
      }

      case 'python': {
        // Top-level AND indented def/class — catches methods inside classes
        const pyMatches = content.matchAll(/^[ \t]*(?:async\s+)?def\s+(\w+)|^[ \t]*class\s+(\w+)/gm);
        for (const match of pyMatches) {
          const sym = match[1] || match[2];
          if (sym) symbols.push(sym);
        }
        break;
      }

      case 'rust': {
        const rustMatches = content.matchAll(/(?:pub\s+)?(?:async\s+)?fn\s+(\w+)|(?:pub\s+)?struct\s+(\w+)|(?:pub\s+)?enum\s+(\w+)/gm);
        for (const match of rustMatches) {
          const sym = match[1] || match[2] || match[3];
          if (sym) symbols.push(sym);
        }
        break;
      }

      case 'go': {
        const goMatches = content.matchAll(/func\s+(?:\(\w+\s+\*?\w+\)\s+)?(\w+)/gm);
        for (const match of goMatches) symbols.push(match[1]);
        break;
      }
    }

    return [...new Set(symbols)];
  }

  private extractDependencies(filePath: string, content: string, language: string): Dependency[] {
    const dependencies: Dependency[] = [];
    const patterns = this.patterns[language] || [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of patterns) {
        pattern.lastIndex = 0;
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

      this.graph.stats.languages[file.language] = (this.graph.stats.languages[file.language] || 0) + 1;
      this.graph.stats.totalDependencies += dependencies.length;
    }

    return this.graph;
  }

  getGraph(): DependencyGraph {
    return this.graph;
  }
}
