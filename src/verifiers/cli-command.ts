import type { Verifier, DriftIssue, DocReference, ProjectContext, SymbolResolver } from '../types.js';
import { fuzzyMatch } from '../util/fuzzy.js';

interface ParsedCommand {
  type: 'npm' | 'yarn' | 'pnpm' | 'cargo' | 'make' | 'other';
  script: string;
  fullCommand: string;
}

const CARGO_BUILTINS = new Set([
  'build', 'run', 'test', 'bench', 'check', 'clean', 'doc',
  'new', 'init', 'add', 'remove', 'search', 'publish', 'install', 'update',
]);

const NPM_LIFECYCLE_SCRIPTS = new Set(['install', 'uninstall', 'ci', 'pack', 'publish']);

function parseCommand(command: string): ParsedCommand {
  const trimmed = command.trim().replace(/^\$\s*/, '');
  const parts = trimmed.split(/\s+/);
  const bin = parts[0] ?? '';

  if (bin === 'npx') {
    return { type: 'other', script: '', fullCommand: trimmed };
  }

  if (bin === 'npm') {
    const sub = parts[1] ?? '';
    if (sub === 'run' || sub === 'run-script') {
      return { type: 'npm', script: parts[2] ?? '', fullCommand: trimmed };
    }
    // npm start, npm test, npm install, etc.
    return { type: 'npm', script: sub, fullCommand: trimmed };
  }

  if (bin === 'yarn') {
    const sub = parts[1] ?? '';
    if (sub === 'run') {
      return { type: 'yarn', script: parts[2] ?? '', fullCommand: trimmed };
    }
    return { type: 'yarn', script: sub, fullCommand: trimmed };
  }

  if (bin === 'pnpm') {
    const sub = parts[1] ?? '';
    if (sub === 'run') {
      return { type: 'pnpm', script: parts[2] ?? '', fullCommand: trimmed };
    }
    return { type: 'pnpm', script: sub, fullCommand: trimmed };
  }

  if (bin === 'cargo') {
    return { type: 'cargo', script: parts[1] ?? '', fullCommand: trimmed };
  }

  if (bin === 'make') {
    return { type: 'make', script: parts[1] ?? '', fullCommand: trimmed };
  }

  return { type: 'other', script: '', fullCommand: trimmed };
}

function generatePatch(ref: DocReference, corrected: string): string {
  return `--- ${ref.source.path}\n+++ ${ref.source.path}\n@@ -${ref.source.line} @@\n-${ref.target}\n+${corrected}`;
}

function buildRunCmd(type: 'npm' | 'yarn' | 'pnpm', script: string): string {
  const special = new Set(['start', 'test', 'stop', 'restart']);
  if (type === 'npm' || type === 'pnpm') {
    return special.has(script) ? `${type} ${script}` : `${type} run ${script}`;
  }
  // yarn: all scripts can be called directly
  return `yarn ${script}`;
}

export class CliCommandVerifier implements Verifier {
  kind = 'unknown-cli-command' as const;

  async check(
    ref: DocReference,
    ctx: ProjectContext,
    _resolvers: Map<string, SymbolResolver>,
  ): Promise<DriftIssue | null> {
    if (ref.kind !== 'cli-command') return null;

    const parsed = parseCommand(ref.target);

    if (parsed.type === 'other') return null;

    if (parsed.type === 'npm' || parsed.type === 'yarn' || parsed.type === 'pnpm') {
      return this.checkNodeScript(ref, ctx, parsed);
    }

    if (parsed.type === 'cargo') {
      return this.checkCargo(ref, ctx, parsed);
    }

    if (parsed.type === 'make') {
      return this.checkMake(ref, ctx, parsed);
    }

    return null;
  }

  private checkNodeScript(
    ref: DocReference,
    ctx: ProjectContext,
    parsed: ParsedCommand,
  ): DriftIssue | null {
    const { script } = parsed;
    const type = parsed.type as 'npm' | 'yarn' | 'pnpm';

    if (!script) return null;

    // Lifecycle scripts that are always valid
    if (NPM_LIFECYCLE_SCRIPTS.has(script)) return null;

    const scripts = ctx.packageJson?.scripts;

    // No package.json or no scripts section → can't verify
    if (!scripts) return null;

    const available = Object.keys(scripts);

    if (available.includes(script)) return null;

    // Script not found
    const closest = fuzzyMatch(script, available);
    const corrected = closest ? buildRunCmd(type, closest) : undefined;

    return {
      reference: ref,
      kind: 'unknown-cli-command',
      severity: 'high',
      message: `\`${ref.target}\` has no matching script in package.json`,
      suggestion: closest
        ? `Did you mean \`${corrected}\`? That's the closest match.`
        : undefined,
      autoFixable: !!closest,
      patch: closest ? generatePatch(ref, corrected!) : undefined,
    };
  }

  private checkCargo(
    ref: DocReference,
    ctx: ProjectContext,
    parsed: ParsedCommand,
  ): DriftIssue | null {
    const { script } = parsed;

    if (!script) return null;

    if (CARGO_BUILTINS.has(script)) return null;

    const binNames = ctx.cargoToml?.bin?.map((b) => b.name) ?? [];
    if (binNames.includes(script)) return null;

    return {
      reference: ref,
      kind: 'unknown-cli-command',
      severity: 'medium',
      message: `\`cargo ${script}\` is not a built-in subcommand or project binary`,
      suggestion: undefined,
      autoFixable: false,
    };
  }

  private checkMake(
    ref: DocReference,
    ctx: ProjectContext,
    parsed: ParsedCommand,
  ): DriftIssue | null {
    const { script } = parsed;

    if (!script) return null;

    const targets = ctx.makefileTargets;

    if (targets.includes(script)) return null;

    const closest = fuzzyMatch(script, targets);
    const corrected = closest ? `make ${closest}` : undefined;

    return {
      reference: ref,
      kind: 'unknown-cli-command',
      severity: 'high',
      message: `\`make ${script}\` has no matching target in Makefile`,
      suggestion: closest
        ? `Did you mean \`${corrected}\`? That's the closest match.`
        : undefined,
      autoFixable: !!closest,
      patch: closest ? generatePatch(ref, corrected!) : undefined,
    };
  }
}
