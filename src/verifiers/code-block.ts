import ts from 'typescript';
import { writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import YAML from 'yaml';
import type { Verifier, DriftIssue, DocReference, ProjectContext, SymbolResolver } from '../types.js';

const TS_LANGUAGES = new Set(['typescript', 'ts', 'javascript', 'js', 'jsx', 'tsx']);
const JSON_LANGUAGES = new Set(['json']);
const YAML_LANGUAGES = new Set(['yaml', 'yml']);

// Diagnostic codes to ignore — common in doc examples that omit imports
const IGNORED_DIAGNOSTIC_CODES = new Set([
  2304, // Cannot find name 'X'
  2307, // Cannot find module 'X'
  2792, // Cannot find module 'X'. Consider using '--resolveJsonModule'
  6133, // 'X' is declared but its value is never read
]);

export class CodeBlockVerifier implements Verifier {
  kind = 'invalid-code-example' as const;

  async check(
    ref: DocReference,
    _ctx: ProjectContext,
    _resolvers: Map<string, SymbolResolver>,
  ): Promise<DriftIssue | null> {
    if (ref.kind !== 'code-block') return null;

    const lang = ref.language?.toLowerCase();
    if (!lang) return null;

    const code = ref.target;
    if (!code.trim()) return null;

    if (TS_LANGUAGES.has(lang)) return this.checkTypeScript(ref, code, lang);
    if (JSON_LANGUAGES.has(lang)) return this.checkJSON(ref, code);
    if (YAML_LANGUAGES.has(lang)) return this.checkYAML(ref, code);

    return null;
  }

  private async checkTypeScript(
    ref: DocReference,
    code: string,
    lang: string,
  ): Promise<DriftIssue | null> {
    const ext = lang === 'tsx' ? '.tsx' : lang === 'jsx' ? '.jsx' : lang === 'javascript' || lang === 'js' ? '.js' : '.ts';
    const tempFile = join(tmpdir(), `drift-check-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);

    try {
      await writeFile(tempFile, code, 'utf-8');

      const program = ts.createProgram([tempFile], {
        noEmit: true,
        allowJs: true,
        skipLibCheck: true,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.Node16,
        moduleResolution: ts.ModuleResolutionKind.Node16,
        strict: false,
        jsx: (lang === 'tsx' || lang === 'jsx') ? ts.JsxEmit.ReactJSX : undefined,
      });

      const diagnostics = ts.getPreEmitDiagnostics(program);

      const errors = diagnostics.filter(
        (d) =>
          d.category === ts.DiagnosticCategory.Error &&
          !IGNORED_DIAGNOSTIC_CODES.has(d.code),
      );

      if (errors.length === 0) return null;

      const firstError = ts.flattenDiagnosticMessageText(errors[0].messageText, ' ');

      return {
        reference: ref,
        kind: 'invalid-code-example',
        severity: 'medium',
        message: `${ref.language} code example does not compile: ${firstError}`,
        suggestion: 'Fix the code example or update it to match the current API',
        autoFixable: false,
      };
    } finally {
      await unlink(tempFile).catch(() => {});
    }
  }

  private checkJSON(ref: DocReference, code: string): DriftIssue | null {
    try {
      JSON.parse(code);
      return null;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        reference: ref,
        kind: 'invalid-code-example',
        severity: 'medium',
        message: `json code example does not compile: ${msg}`,
        suggestion: 'Fix the code example or update it to match the current API',
        autoFixable: false,
      };
    }
  }

  private checkYAML(ref: DocReference, code: string): DriftIssue | null {
    try {
      YAML.parse(code);
      return null;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        reference: ref,
        kind: 'invalid-code-example',
        severity: 'medium',
        message: `yaml code example does not compile: ${msg}`,
        suggestion: 'Fix the code example or update it to match the current API',
        autoFixable: false,
      };
    }
  }
}
