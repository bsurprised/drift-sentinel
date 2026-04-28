export type DriftKind =
  | 'dead-external-link'
  | 'dead-file-ref'
  | 'missing-symbol'
  | 'invalid-code-example'
  | 'unknown-cli-command'
  | 'version-mismatch'
  | 'deprecated-api-mention'
  | 'orphan-doc';

export type Severity = 'high' | 'medium' | 'low';

export interface DocSource {
  path: string;
  type: 'markdown' | 'jsdoc' | 'tsdoc' | 'rustdoc' | 'xmldoc';
  content: string;
}

export interface ParsedDoc {
  source: DocSource;
  ast: unknown;
}

export interface DocReference {
  id: string;
  source: { path: string; line: number; column: number };
  kind: 'link-external' | 'link-file' | 'symbol' | 'code-block' | 'cli-command' | 'version-ref';
  target: string;
  context: string;
  language?: string;
  /** How this reference was expressed in source. Missing means treat as 'markdown-link'. */
  origin?: 'inline-code' | 'markdown-link';
}

export interface DriftIssue {
  reference: DocReference;
  kind: DriftKind;
  severity: Severity;
  message: string;
  suggestion?: string;
  autoFixable: boolean;
  patch?: string;
}

export interface ProjectContext {
  root: string;
  packageJson?: PackageJson;
  tsconfig?: TsConfig;
  cargoToml?: CargoToml;
  pyproject?: Pyproject;
  csprojs?: Array<{ path: string; version?: string }>;
  makefileTargets: string[];
  detectedLanguages: Array<'typescript' | 'javascript' | 'rust' | 'dotnet' | 'python' | 'go'>;
  /** Lazily returns all git-tracked paths whose basename equals `name`. Returns [] if git is absent. */
  findFilesByBasename?(name: string): Promise<string[]>;
}

export interface PackageJson {
  name?: string;
  version?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
}

export interface TsConfig {
  compilerOptions?: Record<string, unknown>;
  include?: string[];
  exclude?: string[];
  [key: string]: unknown;
}

export interface CargoToml {
  package?: { name?: string; version?: string };
  bin?: Array<{ name: string; path?: string }>;
  [key: string]: unknown;
}

export interface Pyproject {
  project?: { name?: string; version?: string };
  tool?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface DriftReport {
  root: string;
  scannedDocs: number;
  scannedReferences: number;
  issues: DriftIssue[];
  durationMs: number;
  generatedAt: string;
}

export interface ResolveResult {
  found: boolean;
  locations: Array<{ file: string; line: number; column: number }>;
  deprecated: boolean;
  deprecationMessage?: string;
}

export interface SymbolResolver {
  language: 'typescript' | 'javascript' | 'rust' | 'dotnet' | 'python' | 'grep';
  canHandle(project: ProjectContext): boolean;
  resolve(symbol: string, context: DocReference): Promise<ResolveResult>;
  dispose?(): void;
}

export interface Verifier {
  kind: DriftKind;
  check(
    ref: DocReference,
    ctx: ProjectContext,
    resolvers: Map<string, SymbolResolver>
  ): Promise<DriftIssue | null>;
}

export interface DriftConfig {
  include: string[];
  exclude: string[];
  rules: Partial<Record<DriftKind, Severity | 'off'>>;
  ignorePaths: string[];
  resolvers: {
    typescript?: { tsconfig?: string };
    grep?: { enabled?: boolean };
  };
  linkTimeout: number;
  linkCacheDays: number;
  maxSeverity: Severity;
  offline: boolean;
  json: boolean;
  sarif: boolean;
  debug: boolean;
  verbose: boolean;
  since?: string;
  reportPath?: string;
  writeReport?: boolean;
}
