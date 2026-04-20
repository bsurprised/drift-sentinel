import path from 'node:path';
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { runAudit } from './audit.js';
import { loadConfig } from './config.js';
import { createLogger } from './util/logger.js';
import { emitReport } from './report/index.js';
import { applyFixes } from './fixer/index.js';
import { installPrePushHook } from './hooks/install.js';
import type { Severity } from './types.js';

function severityOrder(s: Severity): number {
  return s === 'high' ? 0 : s === 'medium' ? 1 : 2;
}

function getPackageVersion(): string {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'));
    return pkg.version ?? '1.0.0';
  } catch {
    return '1.0.0';
  }
}

const program = new Command();

program
  .name('drift')
  .description('Detect semantic drift between documentation and code')
  .version(getPackageVersion());

program
  .command('audit')
  .description('Audit all docs for drift')
  .argument('[path]', 'Path to audit', '.')
  .option('--since <ref>', 'Only audit docs changed since git ref')
  .option('--kind <kinds>', 'Comma-separated drift kinds to check')
  .option('--json', 'Output as JSON')
  .option('--sarif', 'Output as SARIF')
  .option('--max-severity <level>', 'Exit non-zero above threshold', 'high')
  .option('--ignore <patterns>', 'Comma-separated glob patterns to skip')
  .option('--offline', 'Skip external link checks')
  .option('--verbose', 'Verbose logging')
  .option('--debug', 'Debug mode with intermediate output')
  .action(async (auditPath: string, options: Record<string, unknown>) => {
    try {
      const root = path.resolve(auditPath || '.');
      createLogger({
        verbose: options['verbose'] as boolean | undefined,
        debug: options['debug'] as boolean | undefined,
      });

      const config = await loadConfig({
        json: options['json'] as boolean | undefined,
        sarif: options['sarif'] as boolean | undefined,
        maxSeverity: (options['maxSeverity'] as Severity | undefined),
        offline: options['offline'] as boolean | undefined,
        debug: options['debug'] as boolean | undefined,
        verbose: options['verbose'] as boolean | undefined,
        since: options['since'] as string | undefined,
        ignorePaths: options['ignore']
          ? (options['ignore'] as string).split(',')
          : [],
      }, root);

      const report = await runAudit(root, config);
      await emitReport(report, config, root);

      // Exit code based on severity
      if (report.issues.length === 0) {
        process.exit(0);
      }
      const maxFound = report.issues.reduce<Severity>((max, i) =>
        severityOrder(i.severity) < severityOrder(max) ? i.severity : max,
        'low',
      );

      if (severityOrder(maxFound) <= severityOrder(config.maxSeverity)) {
        process.exit(1);
      }
      process.exit(0);
    } catch (err) {
      console.error('Internal error:', err);
      process.exit(2);
    }
  });

program
  .command('fix')
  .description('Apply safe auto-fixes')
  .option('--dry-run', 'Show patches without applying')
  .action(async (options: Record<string, unknown>) => {
    try {
      const root = path.resolve('.');
      createLogger({});
      const config = await loadConfig({}, root);
      const report = await runAudit(root, config);
      const result = await applyFixes(report, {
        dryRun: (options['dryRun'] as boolean) || false,
      });

      if (options['dryRun']) {
        console.log(`Would apply ${result.patches.length} fixes:`);
        for (const p of result.patches) {
          console.log(`  ${p.file}:${p.line} — ${p.kind}: ${p.original} → ${p.replacement}`);
        }
      } else {
        console.log(`Applied ${result.applied} fixes, skipped ${result.skipped}`);
      }
    } catch (err) {
      console.error('Internal error:', err);
      process.exit(2);
    }
  });

const hookCmd = program
  .command('hook')
  .description('Manage git hooks');

hookCmd
  .command('install')
  .description('Install pre-push hook')
  .action(async () => {
    try {
      const root = path.resolve('.');
      await installPrePushHook(root);
    } catch (err) {
      console.error('Error installing hook:', (err as Error).message);
      process.exit(2);
    }
  });

program.parse();
