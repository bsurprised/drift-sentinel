import { describe, it, expect } from 'vitest';
import { extractMakefileTargets } from '../../src/context/makefile.js';

describe('extractMakefileTargets', () => {
  it('extracts simple targets', () => {
    const content = `build:\n\tgcc main.c\ntest:\n\t./run_tests\nclean:\n\trm -rf build`;
    expect(extractMakefileTargets(content)).toEqual(['build', 'test', 'clean']);
  });

  it('ignores .PHONY and other dot-prefixed targets', () => {
    const content = `.PHONY: build test\nbuild:\n\techo build\n.DEFAULT:\n\techo default`;
    expect(extractMakefileTargets(content)).toEqual(['build']);
  });

  it('handles targets with dependencies', () => {
    const content = `build: src/main.c src/util.c\n\tgcc $^\ntest: build\n\t./test`;
    expect(extractMakefileTargets(content)).toEqual(['build', 'test']);
  });

  it('returns empty array for empty Makefile', () => {
    expect(extractMakefileTargets('')).toEqual([]);
  });

  it('returns empty array for comment-only Makefile', () => {
    const content = `# This is a comment\n# Another comment`;
    expect(extractMakefileTargets(content)).toEqual([]);
  });

  it('handles targets with hyphens and underscores', () => {
    const content = `build-all:\n\techo all\nrun_tests:\n\techo test`;
    expect(extractMakefileTargets(content)).toEqual(['build-all', 'run_tests']);
  });
});
