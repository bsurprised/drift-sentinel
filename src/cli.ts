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
import { VALID_DRIFT_KINDS } from './types.js';
import type { DriftConfig, DriftKind, Severity } from './types.js';

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
  .option('--include <patterns>', 'Comma-separated globs to add to discovery')
  .option('--json', 'Output as JSON')
  .option('--sarif', 'Output as SARIF')
  .option('--max-severity <level>', 'Exit non-zero above threshold', 'high')
  .option('--ignore <patterns>', 'Comma-separated glob patterns to skip')
  .option('--offline', 'Skip external link checks')
  .option('--verbose', 'Verbose logging')
  .option('--debug', 'Debug mode with intermediate output')
  .option('--no-report', 'Skip writing DRIFT_REPORT.md')
  .option('--report-path <path>', 'Path to write markdown report')
  .action(async (auditPath: string, opts: Record<string, unknown>) => {
    try {
      const root = path.resolve(auditPath || '.');
      createLogger({
        verbose: opts['verbose'] as boolean | undefined,
        debug: opts['debug'] as boolean | undefined,
      });

      // Load file config + defaults, passing only scalar CLI flags that never
      // cause an empty-array override bug.
      const loadedConfig = await loadConfig({
        json: opts['json'] as boolean | undefined,
        sarif: opts['sarif'] as boolean | undefined,
        maxSeverity: opts['maxSeverity'] as Severity | undefined,
        offline: opts['offline'] as boolean | undefined,
        debug: opts['debug'] as boolean | undefined,
        verbose: opts['verbose'] as boolean | undefined,
        since: opts['since'] as string | undefined,
      }, root);

      // Build CLI overrides — a key is only added when the user actually
      // supplied that flag (fixes B-17: --ignore was always passing [] before).
      const cliOverrides: Partial<DriftConfig> = {};

      if (opts['kind']) {
        const rawKinds = (opts['kind'] as string).split(',').map(s => s.trim()).filter(Boolean);
        const invalid = rawKinds.filter(k => !(VALID_DRIFT_KINDS as readonly string[]).includes(k));
        if (invalid.length > 0) {
          console.error(
            `Unknown drift kind(s): ${invalid.join(', ')}.\nValid kinds are: ${VALID_DRIFT_KINDS.join(', ')}`,
          );
          process.exit(2);
        }
        cliOverrides.kinds = rawKinds as DriftKind[];
      }

      if (opts['include']) {
        // Concatenate with whatever include patterns are already in the loaded config.
        const extra = (opts['include'] as string).split(',').map(s => s.trim()).filter(Boolean);
        cliOverrides.include = [...loadedConfig.include, ...extra];
      }

      if (opts['ignore']) {
        cliOverrides.ignorePaths = (opts['ignore'] as string)
          .split(',').map(s => s.trim()).filter(Boolean);
      }

      if (opts['reportPath'] !== undefined) {
        cliOverrides.reportPath = opts['reportPath'] as string;
      }

      if (opts['report'] === false) {
        cliOverrides.writeReport = false;
      }

      const config: DriftConfig = { ...loadedConfig, ...cliOverrides };

      const report = await runAudit(root, config);
      const format = config.json ? 'json' : config.sarif ? 'sarif' : 'terminal';
      await emitReport(report, { format, config });

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
