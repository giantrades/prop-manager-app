// packages/journal-state/src/stats.js
export function mean(arr = []) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

export function winrate(resultsR = []) {
  const wins = resultsR.filter(r => r > 0).length;
  return resultsR.length ? wins / resultsR.length : 0;
}

export function profitFactor(pnls = []) {
  const gains = pnls.filter(p => p > 0).reduce((s, v) => s + v, 0);
  const losses = pnls.filter(p => p < 0).reduce((s, v) => s + v, 0);
  return losses === 0 ? Infinity : gains / Math.abs(losses);
}
