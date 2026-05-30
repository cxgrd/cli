# CXGRD CLI 

The TypeScript CLI provides user-friendly commands for dependency analysis and AI-safe code changes.

## CLI Commands

### cxgrd scan [path]
**Purpose:** Build complete dependency graph

**Syntax:**
```bash
cxgrd scan [projectPath]
```

**Options:**
- `projectPath` (optional): Path to analyze (default: current directory)

**Output:**
Creates `.cg/` directory containing:
- `graph.json` - Full dependency graph
- `symbols.json` - Exported symbols per file
- `arch.json` - Inferred architectural layers
- `meta.json` - Scan metadata
- `history.json` - Operation history
- `patterns.json` - Pattern analysis

**Example:**
```bash
cxgrd scan /path/to/myapp
```

---

### cxgrd input <description>
**Purpose:** Analyze blast radius of a change

**Syntax:**
```bash
cxgrd input "description" [--path /project/path]
```

**Options:**
- `description` (required): What you're planning to change
- `--path` or `-p` (optional): Project path

**Output:**
- List of affected files
- Severity levels (high/medium/low)
- Why each file is affected
- Total downstream impact

**Example:**
```bash
cxgrd input "rename AuthService to AuthController" --path /myapp
```

---

### cxgrd prompt <description>
**Purpose:** Generate enriched AI prompt

**Syntax:**
```bash
cxgrd prompt "description" [--path /project/path]
```

**Options:**
- `description` (required): What you want to build
- `--path` or `-p` (optional): Project path

**Output:**
- Original request
- Affected modules
- Architectural considerations
- Related symbols to consider
- Key dependencies
- AI-friendly recommendations

**Example:**
```bash
cxgrd prompt "add OAuth2 authentication" --path /myapp
```

---

### cxgrd check [path]
**Purpose:** Structural graph validation + compiler-backed semantic checks

**Syntax:**
```bash
cxgrd check [projectPath] [--staged] [--changed] [--skip-compiler] [--skip-structural]
```

**Options:**
- `projectPath` (optional): Path to analyze
- `--staged`: Only report issues in git staged files (used by pre-commit hooks)
- `--changed`: Staged + unstaged changed files
- `--skip-compiler`: Structural checks only
- `--skip-structural`: Compiler checks only
- `--strict`: Fail if a detected language's compiler was skipped (recommended for CI)

**Compiler tools (auto-detected per project):**
- TypeScript — programmatic `typescript` API per `tsconfig.json`
- Python — `pyright --outputjson` (skipped if pyright not on PATH)
- Rust — `cargo check --message-format=json`

**Output:**
- Structural: circular deps, orphans, layer violations
- Compiler: type/syntax errors with file, line, and diagnostic code
- `.cg/check-latest.json` with full result payload

**Examples:**
```bash
cxgrd check /myapp
cxgrd check . --staged
cxgrd check . --skip-structural
cxgrd check . --strict          # CI: fail if Pyright/cargo missing on detected projects
cxgrd doctor .                  # verify toolchain before enabling --strict
```

### cxgrd doctor [path]
**Purpose:** Verify Node/runtime tools and (optionally) project readiness for strict checks

**Syntax:**
```bash
cxgrd doctor          # global toolchain only
cxgrd doctor [path]   # + project language detection and .cg status
```

Exits with code 1 when the project cannot run `cxgrd check --strict` (missing Pyright on a Python repo, no scan, etc.).

### cxgrd init-hooks
**Purpose:** Initialize pre-commit hooks to catch errors before commiting to git

**Syntax:**
```bash
cxgrd init-hooks                 # initialize hook
cxgrd init-hooks --threshold 80 --block-critical    #initialize hook with threshold
cxgrd init-hooks --uninstall     # uninstall hook
```

### cxgrd watch
**Purpose:** Real time monitoring which works in background

**Syntax:**
```bash
cxgrd watch
```

## Output Format

### graph.json Structure
```json
{
  "files": {
    "src/services/auth.ts": {
      "path": "src/services/auth.ts",
      "language": "typescript",
      "dependencies": [
        {
          "from": "src/services/auth.ts",
          "to": "./utils/crypto.ts",
          "type": "import",
          "line": 3
        }
      ],
      "symbols": ["authenticate", "AuthService", "validateToken"]
    }
  },
  "stats": {
    "totalFiles": 42,
    "totalDependencies": 156,
    "languages": {
      "typescript": 32,
      "python": 10
    }
  }
}
```

## Development

### Installation
```bash
npm install
npm run build
```

### Basic Usage

#### Scan a Project
```bash
npm run dev -- scan /path/to/project
```
Analyzes the project and creates `.cg/` with dependency graph.

#### Analyze Blast Radius
```bash
npm run dev -- input "describe your change here"
```
Shows which files will be affected by your proposed change.

#### Generate AI Prompt
```bash
npm run dev -- prompt "describe your feature here"
```
Creates an architecturally-aware prompt for your AI assistant.

#### Validate Code
```bash
npm run dev -- check /path/to/project
```
Checks for circular dependencies, orphaned files, and architecture violations.

## Architecture Overview

1. **Scanner** - Recursively finds source files
2. **Graph Builder** - Extracts dependencies and symbols
3. **CG Directory** - Manages `.cg/` persistence
4. **Commands** - User-facing CLI operations

