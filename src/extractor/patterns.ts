/** Matches dot-notation symbols like Class.method or Config.db.host */
export const SYMBOL_PATTERN = /^[A-Z][a-zA-Z0-9_$]*(?:\.[a-zA-Z_$][a-zA-Z0-9_$]*)+(?:\([^)]*\))?$/;

/** Matches function call patterns like createUser() or _init() */
export const FUNCTION_CALL_PATTERN = /^[a-zA-Z_$][a-zA-Z0-9_$]*\([^)]*\)$/;

/** Captures a semver-style version string */
export const VERSION_PATTERN = /v?(\d+\.\d+(?:\.\d+)?(?:-[a-zA-Z0-9.]+)?)/;

/** Inline-code prefixes that signal a CLI command */
export const CLI_PREFIXES = [
  '$ ',
  'npm ',
  'yarn ',
  'pnpm ',
  'cargo ',
  'dotnet ',
  'python ',
  'pip ',
  'make ',
];

/** Fenced-code-block languages treated as CLI/shell */
export const CLI_LANGS = ['bash', 'sh', 'shell', 'console'];

/** Detects version numbers inside badge / shield URLs */
export const BADGE_PATTERN = /(?:badge|shield).*?v?(\d+\.\d+(?:\.\d+)?)/i;
