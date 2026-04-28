# Drift Sentinel

> Detect semantic drift between your documentation and code.

Drift Sentinel scans your project's documentation (Markdown, MDX) and checks every reference—links, code examples, CLI commands, symbol references, version numbers—against the actual state of your codebase. When docs fall out of sync with code, drift sentinel tells you exactly what's wrong and can auto-fix many issues.

## Drift Kinds

| Kind | Severity | Description |
|------|----------|-------------|
| `dead-external-link` | high/medium/low | External URL returns 404/410 (high), other 4xx/5xx (medium), or network error (low) |
| `dead-file-ref` | high | Link to a file/path that doesn't exist |
| `missing-symbol` | high | References a function/class/type not found in code |
| `invalid-code-example` | medium | Code block has syntax or type errors |
| `unknown-cli-command` | high | Documents an `npm run` / `cargo` / `make` command that doesn't exist |
| `version-mismatch` | low | Version in docs doesn't match package.json / Cargo.toml |
| `deprecated-api-mention` | low/medium | Docs reference a `@deprecated` API (medium in tutorials) |
| `orphan-doc` | low | Markdown file with no inbound links |

## Quick Start

```bash
npx drift-sentinel audit .
```

## Installation

```bash
npm install -g drift-sentinel
```

### As a dev dependency

```bash
npm install -D drift-sentinel
```

## Usage

### Audit

```bash
# Audit the current directory
drift audit .

# Only check docs changed since a git ref
drift audit --since origin/main .

# Output as JSON
drift audit --json .

# Output as SARIF (for GitHub Code Scanning)
drift audit --sarif .

# Skip external link checks (offline mode)
drift audit --offline .

# Fail only on high-severity issues
drift audit --max-severity high .

# Ignore specific paths
drift audit --ignore "docs/legacy/**,archive/**" .

# Run only specific kinds
drift audit --kind dead-file-ref,missing-symbol .

# Add extra include globs (in addition to defaults)
drift audit --include "guides/**/*.md" .

# Skip the DRIFT_REPORT.md file
drift audit --no-report .

# Write the markdown report to a custom location
drift audit --report-path build/drift-report.md .
```

### Discover verifiers

```bash
# List all drift kinds with default severity and description
drift verifiers list
```

### Init

```bash
# Scaffold a starter drift.config.mjs in the project root
drift init
drift init --force   # overwrite existing config
```

### Fix

```bash
# Preview auto-fixes
drift fix --dry-run

# Apply auto-fixes
drift fix
```

### Git Hook

```bash
# Install a pre-push hook that runs drift audit
drift hook install
```

## Configuration

Create a `drift.config.mjs` (recommended), `drift.config.cjs`, `drift.config.js`, or `drift.config.ts` in your project root. Note: `drift.config.ts` requires a TypeScript loader (e.g. run with `node --import tsx`); use `.mjs` if you don't want a loader dependency.

```js
// drift.config.mjs
/** @type {import('drift-sentinel').DriftConfig} */
export default {
  include: ['**/*.md', '**/*.mdx'],
  ignorePaths: ['**/node_modules/**', '**/dist/**'],
  rules: {
    'dead-external-link': 'medium',
    'orphan-doc': 'off',           // disable a rule
    'missing-symbol': 'high',
  },
  // kinds: ['missing-symbol', 'dead-file-ref'],   // restrict to a subset
  // writeReport: true,                            // default true for terminal mode
  // reportPath: 'build/drift-report.md',          // custom output path
  linkTimeout: 5000,
  linkCacheDays: 7,
  offline: false,
};
```

## Inline Suppressions

Suppress a specific check on a reference by placing a comment above it:

```markdown
<!-- drift-ignore: dead-external-link -->
[This link is expected to 404](https://example.com/expected-404)
```

The comment must appear within 3 lines above the reference and include the drift kind (e.g., `dead-external-link`, `missing-symbol`, `unknown-cli-command`).

## Output Formats

- **Terminal** — colored summary (always printed to stdout for the default format)
- **Markdown** — `DRIFT_REPORT.md` written to the project root (default for terminal format; opt in for `--json`/`--sarif`; suppress with `--no-report`; relocate with `--report-path`)
- **JSON** — `--json` flag, **only** JSON to stdout (a one-line summary goes to stderr)
- **SARIF** — `--sarif` flag, **only** SARIF JSON to stdout with relative `artifactLocation.uri` values (suitable for GitHub code scanning); summary on stderr

## GitHub Action

```yaml
- uses: bsurprised/drift-sentinel/actions@v1
  with:
    max-severity: high
    path: '.'
```

## Claude Code Skill

Copy `SKILL.md` to your project root. Claude Code will automatically detect it and use drift-sentinel when appropriate.

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | No drift found above threshold |
| 1 | Drift found at or above `--max-severity` |
| 2 | Internal error |

## License

MIT
