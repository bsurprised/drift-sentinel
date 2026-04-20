export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0) as number[]);

  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost,
      );
    }
  }

  return dp[m]![n]!;
}

export function fuzzyMatch(input: string, candidates: string[]): string | undefined {
  if (candidates.length === 0) return undefined;

  let bestCandidate: string | undefined;
  let bestScore = -Infinity;

  for (const candidate of candidates) {
    const maxLen = Math.max(input.length, candidate.length);
    if (maxLen === 0) continue;

    const distance = levenshtein(input.toLowerCase(), candidate.toLowerCase());
    const similarity = 1 - distance / maxLen;

    if (similarity > bestScore) {
      bestScore = similarity;
      bestCandidate = candidate;
    }
  }

  return bestScore > 0.6 ? bestCandidate : undefined;
}
