import { describe, it, expect } from 'vitest';
import {
  SYMBOL_PATTERN,
  FUNCTION_CALL_PATTERN,
  VERSION_PATTERN,
  CLI_PREFIXES,
  CLI_LANGS,
  BADGE_PATTERN,
} from '../../src/extractor/patterns.js';

describe('SYMBOL_PATTERN', () => {
  it.each([
    'UserService.create',
    'Config.database.host',
    'A.b',
    'Foo.bar.baz',
    'UserService.createUser()',
    'Foo.bar(arg1, arg2)',
  ])('matches %s', (input) => {
    expect(SYMBOL_PATTERN.test(input)).toBe(true);
  });

  it.each([
    'lowercase.method',
    'SingleWord',
    'const x = 1',
    'hello',
    '',
    '.leading',
    'Trailing.',
  ])('does not match %s', (input) => {
    expect(SYMBOL_PATTERN.test(input)).toBe(false);
  });
});

describe('FUNCTION_CALL_PATTERN', () => {
  it.each([
    'createUser()',
    'foo(bar)',
    '_init()',
    '$helper(x)',
  ])('matches %s', (input) => {
    expect(FUNCTION_CALL_PATTERN.test(input)).toBe(true);
  });

  it.each([
    'noParens',
    'const x = 1',
    '123abc()',
    '',
  ])('does not match %s', (input) => {
    expect(FUNCTION_CALL_PATTERN.test(input)).toBe(false);
  });
});

describe('VERSION_PATTERN', () => {
  it.each([
    ['v1.2.3', '1.2.3'],
    ['1.2.3', '1.2.3'],
    ['v1.2', '1.2'],
    ['v2.0.0-beta.1', '2.0.0-beta.1'],
  ])('extracts version from %s → %s', (input, expected) => {
    const m = VERSION_PATTERN.exec(input);
    expect(m).not.toBeNull();
    expect(m![1]).toBe(expected);
  });

  it('does not match non-version strings', () => {
    expect(VERSION_PATTERN.test('hello')).toBe(false);
    expect(VERSION_PATTERN.test('abc')).toBe(false);
  });
});

describe('CLI_PREFIXES', () => {
  it('includes common prefixes', () => {
    expect(CLI_PREFIXES).toContain('$ ');
    expect(CLI_PREFIXES).toContain('npm ');
    expect(CLI_PREFIXES).toContain('cargo ');
    expect(CLI_PREFIXES).toContain('make ');
  });
});

describe('CLI_LANGS', () => {
  it('includes bash and sh', () => {
    expect(CLI_LANGS).toContain('bash');
    expect(CLI_LANGS).toContain('sh');
    expect(CLI_LANGS).toContain('shell');
    expect(CLI_LANGS).toContain('console');
  });
});

describe('BADGE_PATTERN', () => {
  it('matches badge URLs with versions', () => {
    const url = 'https://img.shields.io/badge/version-1.2.3-blue';
    const m = BADGE_PATTERN.exec(url);
    expect(m).not.toBeNull();
    expect(m![1]).toBe('1.2.3');
  });

  it('matches shield URLs', () => {
    const url = 'https://shields.io/badge/v2.0.0';
    const m = BADGE_PATTERN.exec(url);
    expect(m).not.toBeNull();
    expect(m![1]).toBe('2.0.0');
  });

  it('does not match unrelated URLs', () => {
    expect(BADGE_PATTERN.test('https://example.com/page')).toBe(false);
  });
});
