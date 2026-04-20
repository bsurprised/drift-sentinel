import { join } from 'node:path';
import type { SymbolResolver, ProjectContext } from '../types.js';
import { TypeScriptResolver } from './typescript.js';
import { GrepResolver } from './grep.js';

export class ResolverRegistry {
  private resolvers: SymbolResolver[] = [];

  register(resolver: SymbolResolver): void {
    this.resolvers.push(resolver);
  }

  getResolver(project: ProjectContext): SymbolResolver | undefined {
    return this.resolvers.find((r) => r.canHandle(project));
  }

  getAll(): Map<string, SymbolResolver> {
    const map = new Map<string, SymbolResolver>();
    for (const r of this.resolvers) {
      map.set(r.language, r);
    }
    return map;
  }

  async disposeAll(): Promise<void> {
    for (const r of this.resolvers) {
      if (r.dispose) await r.dispose();
    }
  }
}

export function createDefaultRegistry(project: ProjectContext): ResolverRegistry {
  const registry = new ResolverRegistry();

  // TypeScript resolver first (higher priority) if the project has TS
  if (
    project.detectedLanguages.includes('typescript') ||
    project.detectedLanguages.includes('javascript')
  ) {
    const tsconfigPath = join(project.root, 'tsconfig.json');
    registry.register(new TypeScriptResolver(tsconfigPath));
  }

  // Grep is always registered as a fallback
  registry.register(new GrepResolver());

  return registry;
}
