import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { generateSarifReport } from '../../../src/report/sarif.js';
import type { DriftReport, DriftIssue, DocReference } from '../../../src/types.js';

// Use the OS temp dir as root so paths are always absolute
const root = path.join(os.tmpdir(), 'sarif-test-proj');

function makeRef(overrides: Partial<DocReference> = {}): DocReference {
  return {
    id: 'ref-1',
    source: { path: path.join(root, 'README.md'), line: 10, column: 1 },
    kind: 'link-external',
    target: 'https://example.com',
    context: 'some context',
    ...overrides,
  };
}

function makeIssue(overrides: Partial<DriftIssue> = {}): DriftIssue {
  return {
    reference: makeRef(),
    kind: 'dead-external-link',
    severity: 'high',
    message: 'Link is dead',
    autoFixable: false,
    ...overrides,
  };
}

function makeReport(overrides: Partial<DriftReport> = {}): DriftReport {
  return {
    root,
    scannedDocs: 5,
    scannedReferences: 20,
    issues: [],
    durationMs: 123,
    generatedAt: '2024-06-15T10:30:00Z',
    ...overrides,
  };
}

describe('generateSarifReport — relative URIs (LLD-E)', () => {
  it('artifactLocation.uri is relative (no drive letter, no absolute slash prefix)', () => {
    const report = makeReport({
      issues: [
        makeIssue({
          reference: makeRef({ source: { path: path.join(root, 'docs', 'guide.md'), line: 1, column: 1 } }),
        }),
      ],
    });
    const parsed = JSON.parse(generateSarifReport(report));
    const uri: string = parsed.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri;
    expect(uri).toBe('docs/guide.md');
    // Must not contain drive letters or leading slashes
    expect(uri).not.toMatch(/^[A-Za-z]:/);
    expect(uri).not.toMatch(/^\//);
  });

  it('artifactLocation.uriBaseId is PROJECTROOT', () => {
    const report = makeReport({
      issues: [makeIssue()],
    });
    const parsed = JSON.parse(generateSarifReport(report));
    const loc = parsed.runs[0].results[0].locations[0].physicalLocation;
    expect(loc.artifactLocation.uriBaseId).toBe('PROJECTROOT');
  });

  it('run contains originalUriBaseIds.PROJECTROOT with a file:// URI', () => {
    const parsed = JSON.parse(generateSarifReport(makeReport()));
    const baseIds = parsed.runs[0].originalUriBaseIds;
    expect(baseIds).toBeDefined();
    expect(baseIds.PROJECTROOT).toBeDefined();
    expect(baseIds.PROJECTROOT.uri).toMatch(/^file:\/\//);
  });

  it('originalUriBaseIds.PROJECTROOT uri ends with /', () => {
    const parsed = JSON.parse(generateSarifReport(makeReport()));
    const uri: string = parsed.runs[0].originalUriBaseIds.PROJECTROOT.uri;
    expect(uri.endsWith('/')).toBe(true);
  });

  it('percent-encodes spaces in artifact URIs', () => {
    const spacePath = path.join(root, 'my docs', 'guide.md');
    const report = makeReport({
      issues: [
        makeIssue({
          reference: makeRef({ source: { path: spacePath, line: 1, column: 1 } }),
        }),
      ],
    });
    const parsed = JSON.parse(generateSarifReport(report));
    const uri: string = parsed.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri;
    expect(uri).toBe('my%20docs/guide.md');
  });
});
