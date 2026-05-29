import { readdir, readFile, stat } from 'fs/promises';
import { join, relative, extname } from 'path';

interface FileInfo {
  path: string;
  content: string;
  language: string;
}

export class FileScanner {
  private ignorePatterns: string[] = [
    'node_modules',
    '.git',
    'dist',
    'build',
    '.next',
    '.venv',
    '__pycache__',
    'target',
    '.cg',
    '.vscode',
    '.idea',
    'coverage',
    "venv",
    ".env",
    "env",
    "site-packages",
  ];

  private languageMap: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.py': 'python',
    '.java': 'java',
    '.cpp': 'cpp',
    '.cc': 'cpp',
    '.cxx': 'cpp',
    '.h': 'cpp',
    '.hpp': 'cpp',
    '.cs': 'csharp',
    '.rb': 'ruby',
    '.go': 'go',
    '.rs': 'rust',
    '.sql': 'sql',
    '.json': 'json',
    '.yaml': 'yaml',
    '.yml': 'yaml',
  };

  private shouldIgnore(filePath: string): boolean {
    return this.ignorePatterns.some(pattern => {
      const parts = filePath.replace(/\\/g, '/').split('/');
      return parts.includes(pattern);
    });
  }

  async scanDirectory(rootPath: string): Promise<FileInfo[]> {
    const files: FileInfo[] = [];

    const walkDir = async (dir: string) => {
      try {
        const entries = await readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          const relativePath = relative(rootPath, fullPath);

          if (this.shouldIgnore(relativePath)) {
            continue;
          }

          if (entry.isDirectory()) {
            await walkDir(fullPath);
          } else if (entry.isFile()) {
            const ext = extname(entry.name).toLowerCase();
            const language = this.languageMap[ext];

            if (language) {
              try {
                const content = await readFile(fullPath, 'utf-8');
                files.push({
                  path: relativePath.replace(/\\/g, '/'),
                  content,
                  language,
                });
              } catch (err) {
                // Skip files that can't be read
              }
            }
          }
        }
      } catch (err) {
        // Skip directories that can't be read
      }
    };

    await walkDir(rootPath);
    return files;
  }
}
