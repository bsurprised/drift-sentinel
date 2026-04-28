import path from 'node:path';
import { simpleGit } from 'simple-git';
import type { DriftConfig, DriftReport, DriftIssue, DocReference, DocSource, Severity, Verifier } from './types.js';
import { discoverDocs } from './discover/index.js';
import { parseDoc } from './parsers/index.js';
import { extractReferences } from './extractor/index.js';
import { detectProjectContext } from './context/index.js';
import { createDefaultRegistry } from './resolvers/registry.js';
import { LinkExternalVerifier } from './verifiers/link-external.js';
import { LinkFileVerifier } from './verifiers/link-file.js';
import { SymbolRefVerifier } from './verifiers/symbol-ref.js';
import { CodeBlockVerifier } from './verifiers/code-block.js';
import { CliCommandVerifier } from './verifiers/cli-command.js';
import { VersionRefVerifier } from './verifiers/version-ref.js';
import { DeprecatedApiVerifier } from './verifiers/deprecated-api.js';
import { OrphanDocVerifier } from './verifiers/orphan-doc.js';
import { isRuleEnabled, getEffectiveSeverity } from './config.js';
import { getLogger } from './util/logger.js';

export async function runAudit(root: string, config: DriftConfig): Promise<DriftReport> {
  const startTime = Date.now();
  const logger = getLogger();

  // 1. Detect project context
  logger.info('Detecting project context...');
  const ctx = await detectProjectContext(root);

  // 2. Boot resolvers
  logger.info('Initializing resolvers...');
  const registry = createDefaultRegistry(ctx);
  const resolvers = registry.getAll();

  // 3. Discover docs
  logger.info('Discovering documentation files...');
  let docs = await discoverDocs({
    root,
    include: config.include,
    exclude: config.exclude,
    ignorePaths: config.ignorePaths,
  });

  // 4. If --since given, filter to changed docs
  if (config.since) {
    docs = await filterChangedDocs(docs, config.since, root);
  }

  logger.info(`Found ${docs.length} documentation files`);

  // 5. Parse each doc
  logger.info('Parsing documentation...');
  const parsedDocs = await Promise.all(docs.map(d => parseDoc(d)));

  // 6. Extract references
  logger.info('Extracting references...');
  const allReferences: DocReference[] = [];
  for (const doc of parsedDocs) {
    const refs = extractReferences(doc);
    allReferences.push(...refs);
  }
  logger.info(`Extracted ${allReferences.length} references`);

  // 7. Create verifiers — filtered by both rules and optional kinds whitelist
  const verifiers: Verifier[] = [];

  function kindAllowed(kind: import('./types.js').DriftKind): boolean {
    return isRuleEnabled(config, kind) && (!config.kinds || config.kinds.includes(kind));
  }

  if (kindAllowed('dead-external-link')) {
    verifiers.push(new LinkExternalVerifier({
      timeout: config.linkTimeout,
      cacheDays: config.linkCacheDays,
      offline: config.offline,
      maxConcurrent: 10,
    }));
  }
  if (kindAllowed('dead-file-ref')) verifiers.push(new LinkFileVerifier());
  if (kindAllowed('missing-symbol')) verifiers.push(new SymbolRefVerifier());
  if (kindAllowed('invalid-code-example')) verifiers.push(new CodeBlockVerifier());
  if (kindAllowed('unknown-cli-command')) verifiers.push(new CliCommandVerifier());
  if (kindAllowed('version-mismatch')) verifiers.push(new VersionRefVerifier());
  if (kindAllowed('deprecated-api-mention')) verifiers.push(new DeprecatedApiVerifier());

  // 8. Run verifiers on each reference
  logger.info('Running verifiers...');
  const issues: DriftIssue[] = [];

  for (const ref of allReferences) {
    for (const verifier of verifiers) {
      try {
        const issue = await verifier.check(ref, ctx, resolvers);
        if (issue) {
          // Check inline suppression using the drift kind (not reference kind)
          if (isSuppressed(ref, issue.kind, docs)) continue;
          issue.severity = getEffectiveSeverity(config, issue.kind, issue.severity);
          issues.push(issue);
        }
      } catch (err) {
        logger.warn({ err, ref: ref.id, verifier: verifier.kind }, 'Verifier error');
      }
    }
  }

  // 9. Run orphan-doc verifier (operates on the full set)
  if (kindAllowed('orphan-doc')) {
    try {
      const orphanVerifier = new OrphanDocVerifier();
      const orphans = await orphanVerifier.checkAll(docs, allReferences, ctx);
      issues.push(...orphans);
    } catch (err) {
      logger.warn({ err }, 'Orphan-doc verifier error');
    }
  }

  // 10. Cleanup resolvers
  await registry.disposeAll();

  // 11. Build report
  const report: DriftReport = {
    root,
    scannedDocs: docs.length,
    scannedReferences: allReferences.length,
    issues: issues.sort((a, b) => severityOrder(a.severity) - severityOrder(b.severity)),
    durationMs: Date.now() - startTime,
    generatedAt: new Date().toISOString(),
  };

  logger.info(`Audit complete: ${issues.length} issues found in ${report.durationMs}ms`);
  return report;
}

function severityOrder(s: Severity): number {
  return s === 'high' ? 0 : s === 'medium' ? 1 : 2;
}

async function filterChangedDocs(docs: DocSource[], since: string, root: string): Promise<DocSource[]> {
  // Validate git ref to prevent injection
  if (since.startsWith('-') || !/^[a-zA-Z0-9_./\-~^@{}]+$/.test(since)) {
    throw new Error(`Invalid git ref: ${since}`);
  }
  const git = simpleGit({ baseDir: root, timeout: { block: 30000 } });
  const diff = await git.diff(['--name-only', since]);
  const changedFiles = new Set(
    diff.split('\n').filter(Boolean).map((f: string) => path.resolve(root, f)),
  );
  return docs.filter(d => changedFiles.has(path.resolve(d.path)));
}

function isSuppressed(ref: DocReference, driftKind: string, docs: DocSource[]): boolean {
  const doc = docs.find(d => d.path === ref.source.path);
  if (!doc) return false;
  const lines = doc.content.split('\n');
  // Check the 3 lines before the reference for a drift-ignore comment
  // Matches: <!-- drift-ignore: dead-external-link -->
  for (let i = Math.max(0, ref.source.line - 3); i < ref.source.line; i++) {
    const line = lines[i];
    if (line && line.includes('drift-ignore') && line.includes(driftKind)) {
      return true;
    }
  }
  return false;
}
