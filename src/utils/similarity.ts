// levensthein
function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

export function similarity(a: string, b: string): number {
  const la = a.toLowerCase(), lb = b.toLowerCase();
  const longer = la.length >= lb.length ? la : lb;
  const shorter = la.length >= lb.length ? lb : la;
  if (longer.length === 0) { return 1.0; }
  return (longer.length - editDistance(longer, shorter)) / longer.length;
}

export function findClosest(
  target: string,
  candidates: string[],
  threshold = 0.7
): { match: string; score: number } | undefined {
  let best: { match: string; score: number } | undefined;
  for (const c of candidates) {
    const score = similarity(target, c);
    if (score >= threshold && (!best || score > best.score)) {
      best = { match: c, score };
    }
  }
  return best;
}
