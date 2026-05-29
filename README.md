# CXGRD CLI - Phase 1 Implementation

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
npm run dev -- scan /path/to/myapp
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
npm run dev -- input "rename AuthService to AuthController" --path /myapp
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
npm run dev -- prompt "add OAuth2 authentication" --path /myapp
```

---

### cxgrd check [path]
**Purpose:** Validate codebase for issues

**Syntax:**
```bash
cxgrd check [projectPath]
```

**Options:**
- `projectPath` (optional): Path to analyze

**Output:**
- Circular dependency chains
- Orphaned files
- Architecture layer violations
- Potentially unused imports
- Overall status (passed/failed)

**Example:**
```bash
npm run dev -- check /myapp
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

## Supported Languages

**Phase 1:**
- TypeScript (.ts, .tsx)
- JavaScript (.js, .jsx)
- Python (.py)
- C++ (.cpp, .h, .hpp)
- Java (.java)
- SQL, YAML, JSON (basic support)

## Project Files

```
src/
├── index.ts              - Main CLI entry point (yargs)
├── scanner.ts            - File system scanning
├── graph.ts              - Dependency extraction
├── cg-directory.ts       - .cg/ management
└── commands/
    ├── scan.ts           - Build graph
    ├── input.ts          - Blast radius
    ├── prompt.ts         - AI prompt generation
    └── check.ts          - Validation
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

## Phase 1 Scope

✅ File scanning with language detection  
✅ Regex-based dependency extraction  
✅ Symbol extraction  
✅ Architecture inference  
✅ CLI commands (scan, input, prompt, check)  
✅ Blast radius analysis  
✅ AI prompt generation  
✅ Code validation  

## Phase 2 Roadmap

📋 Watch mode for continuous analysis  
📋 Pre-commit hooks  
📋 Tree-sitter integration for accuracy  
📋 Pattern detection  
📋 Team features (shared graph server)  
