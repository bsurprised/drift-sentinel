import ts from 'typescript';
import { dirname } from 'node:path';
import type { SymbolResolver, ProjectContext, DocReference, ResolveResult } from '../types.js';

export class TypeScriptResolver implements SymbolResolver {
  language = 'typescript' as const;
  private program: ts.Program | null = null;
  private checker: ts.TypeChecker | null = null;
  private cache = new Map<string, ResolveResult>();

  constructor(private tsconfigPath: string) {}

  canHandle(project: ProjectContext): boolean {
    return (
      project.detectedLanguages.includes('typescript') ||
      project.detectedLanguages.includes('javascript')
    );
  }

  async resolve(symbol: string, _context: DocReference): Promise<ResolveResult> {
    const cacheKey = symbol;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey)!;

    this.ensureProgram();

    const result = this.lookupSymbol(symbol);
    this.cache.set(cacheKey, result);
    return result;
  }

  dispose(): void {
    this.program = null;
    this.checker = null;
    this.cache.clear();
  }

  // ---- private ----

  private ensureProgram(): void {
    if (this.program) return;

    const configFile = ts.readConfigFile(this.tsconfigPath, ts.sys.readFile);
    if (configFile.error) {
      throw new Error(
        `Failed to read tsconfig: ${ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n')}`,
      );
    }

    const parsed = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      dirname(this.tsconfigPath),
    );

    this.program = ts.createProgram(parsed.fileNames, parsed.options);
    this.checker = this.program.getTypeChecker();
  }

  private lookupSymbol(symbol: string): ResolveResult {
    if (!this.program || !this.checker) {
      return { found: false, locations: [], deprecated: false };
    }

    // Normalise: strip trailing parens
    const cleaned = symbol.replace(/\(\)$/, '');
    const parts = cleaned.split('.');

    const rootName = parts[0];
    const memberName = parts.length > 1 ? parts[parts.length - 1] : undefined;

    const locations: Array<{ file: string; line: number; column: number }> = [];
    let deprecated = false;
    let deprecationMessage: string | undefined;

    for (const sourceFile of this.program.getSourceFiles()) {
      if (sourceFile.isDeclarationFile) continue;

      ts.forEachChild(sourceFile, (node) => {
        this.visitNode(node, sourceFile, rootName, memberName, locations, (dep, msg) => {
          if (dep) {
            deprecated = true;
            if (msg) deprecationMessage = msg;
          }
        });
      });
    }

    return {
      found: locations.length > 0,
      locations,
      deprecated,
      ...(deprecationMessage ? { deprecationMessage } : {}),
    };
  }

  private visitNode(
    node: ts.Node,
    sourceFile: ts.SourceFile,
    rootName: string,
    memberName: string | undefined,
    locations: Array<{ file: string; line: number; column: number }>,
    setDeprecated: (dep: boolean, msg?: string) => void,
  ): void {
    const name = this.getNodeName(node);
    if (!name) return;

    if (name === rootName && !memberName) {
      this.addLocation(node, sourceFile, locations);
      this.checkDeprecated(node, setDeprecated);
      return;
    }

    if (name === rootName && memberName) {
      this.findMember(node, memberName, sourceFile, locations, setDeprecated);
    }
  }

  private getNodeName(node: ts.Node): string | undefined {
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isEnumDeclaration(node)
    ) {
      return node.name?.text;
    }

    if (ts.isVariableStatement(node)) {
      const decl = node.declarationList.declarations[0];
      if (decl && ts.isIdentifier(decl.name)) {
        return decl.name.text;
      }
    }

    return undefined;
  }

  private findMember(
    node: ts.Node,
    memberName: string,
    sourceFile: ts.SourceFile,
    locations: Array<{ file: string; line: number; column: number }>,
    setDeprecated: (dep: boolean, msg?: string) => void,
  ): void {
    if (ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node)) {
      for (const member of node.members) {
        const mName = member.name && ts.isIdentifier(member.name) ? member.name.text : undefined;
        if (mName === memberName) {
          this.addLocation(member, sourceFile, locations);
          this.checkDeprecated(member, setDeprecated);
        }
      }
    }
  }

  private addLocation(
    node: ts.Node,
    sourceFile: ts.SourceFile,
    locations: Array<{ file: string; line: number; column: number }>,
  ): void {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    locations.push({
      file: sourceFile.fileName,
      line: line + 1,
      column: character + 1,
    });
  }

  private checkDeprecated(
    node: ts.Node,
    setDeprecated: (dep: boolean, msg?: string) => void,
  ): void {
    const tags = ts.getJSDocTags(node);
    for (const tag of tags) {
      if (tag.tagName.text === 'deprecated') {
        const msg = typeof tag.comment === 'string' ? tag.comment : undefined;
        setDeprecated(true, msg);
        return;
      }
    }
  }
}
