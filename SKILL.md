---
name: drift-sentinel
description: Audits documentation for drift against the code. Use when preparing a release, onboarding someone new, or when the user mentions out-of-date docs. Also use after large refactors to catch stale doc references.
allowed-tools:
  - Bash(drift *)
---

## When to use this skill

- User says "update the docs" or "check the README" → run `drift audit`
- Before a release → run `drift audit --max-severity=medium`
- After a big refactor → run `drift audit --since <last-merge>`
- User mentions a stale example or broken link → run `drift audit`

## How to interpret results

- HIGH — must fix; users will follow a broken instruction
- MEDIUM — should fix before release
- LOW — nice to have; often acceptable to defer

After running, read `DRIFT_REPORT.md`. For auto-fixable items, suggest running `drift fix --dry-run` first, then `drift fix`.
