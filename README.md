# CXGRD CLI

> Make AI-assisted code changes without breaking your codebase.
> **[cxgrd.com](https://cxgrd.com)**

---

## What is CXGRD?

Modern codebases are deeply interconnected — changing one file can silently break a dozen others. When you ask an AI assistant to refactor a service or add a feature, it typically has no awareness of your project's dependency graph, architectural layers, or downstream impact.

**CXGRD** solves this. It scans your project and builds a complete dependency graph, then uses that graph to:

- **Tell you exactly what will break** before you make a change
- **Enrich your AI prompts** with architectural context so the AI makes safer, smarter suggestions
- **Validate your code** for circular dependencies, orphaned files, and layer violations — both structurally and with compiler-backed checks

Think of it as giving your AI assistant a map of your codebase before it starts digging.

---

## Installation

```bash
npm install -g cxgrd
```

---

## Core Commands

### `cxgrd auth login`
**Authenticate with CXGRD before first use.**

```bash
cxgrd auth login
```

---

### `cxgrd scan [path]`
**Build a complete dependency graph of your project.**

This is the first command to run. It recursively analyzes your source files and produces a `.cg/` directory containing the full dependency graph, exported symbols, architectural layers, and metadata.

```bash
cxgrd scan                        # scan current directory
cxgrd scan /path/to/myapp         # scan a specific project
```

**What gets created in `.cg/`:**

| File | Description |
|---|---|
| `graph.json` | Full dependency graph |
| `symbols.json` | Exported symbols per file |
| `arch.json` | Inferred architectural layers |
| `meta.json` | Scan metadata |
| `history.json` | Operation history |
| `patterns.json` | Pattern analysis |

---

### `cxgrd input "<description>"`
**Analyze the blast radius of a planned change.**

Before touching any code, describe what you're planning to change. CXGRD will tell you every file that will be affected, why it's affected, and how severe the impact is.

```bash
cxgrd input "rename AuthService to AuthController" --path /myapp
```

**Output includes:**
- List of affected files
- Severity levels (high / medium / low)
- Reason each file is impacted
- Total downstream impact count

Use this before making any significant refactor or before handing a task off to an AI assistant.

---

### `cxgrd prompt "<description>"`
**Generate an architecturally-aware prompt for your AI assistant.**

Instead of giving your AI a vague instruction, CXGRD generates an enriched prompt that includes the relevant modules, symbols, dependencies, and architectural constraints. Your AI gets the full picture — not just your words.

```bash
cxgrd prompt "add OAuth2 authentication" --path /myapp
```

**The generated prompt includes:**
- Your original request
- Affected modules and files
- Architectural considerations
- Related symbols to be aware of
- Key dependencies
- AI-friendly recommendations

Paste the output directly into Claude, ChatGPT, Cursor, or any AI tool.

---

## Additional Commands

### `cxgrd check [path]`
Validates your project structurally and with compiler-backed checks. Catches circular dependencies, orphaned files, layer violations, and type/syntax errors.

```bash
cxgrd check .
cxgrd check . --staged        # only staged files (great for pre-commit hooks)
cxgrd check . --strict        # fail if compiler tools are missing (recommended for CI)
```

Supports TypeScript, Python (Pyright), and Rust (cargo check) out of the box.

### `cxgrd doctor [path]`
Verifies your toolchain is ready before enabling strict checks.

```bash
cxgrd doctor          # check global toolchain
cxgrd doctor .        # check project-specific readiness
```

### `cxgrd init-hooks`
Sets up a pre-commit hook so CXGRD checks run automatically before every commit.

```bash
cxgrd init-hooks
cxgrd init-hooks --threshold 80 --block-critical
cxgrd init-hooks --uninstall
```

### `cxgrd watch`
Runs in the background and monitors your project for dependency changes in real time.

```bash
cxgrd watch
```

---

## Typical Workflow

```bash
# 1. Authenticate
cxgrd auth login

# 2. Scan your project
cxgrd scan .

# 3. Before making a change — check the blast radius
cxgrd input "extract UserService into a separate module"

# 4. Generate an enriched prompt for your AI
cxgrd prompt "extract UserService into a separate module"

# 5. Paste the prompt into your AI tool, make the changes

# 6. Validate the result
cxgrd check .
```

---

## Development

```bash
npm install
npm run build

# Run commands locally
npm run dev -- scan /path/to/project
npm run dev -- input "describe your change"
npm run dev -- prompt "describe your feature"
```

---

**Learn more at [cxgrd.com](https://cxgrd.com)**