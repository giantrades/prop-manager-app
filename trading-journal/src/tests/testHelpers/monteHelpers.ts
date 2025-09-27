// @apps/trading-journal/src/tests/testHelpers/monteHelpers.ts
export function simulateRun(cfg: any, rng: () => number, empiricalR?: number[]) {
  const { maxTradesPerRun, winProb, expectancyR, riskPerTradePct, initialCapital } = cfg;
  let equity = initialCapital;
  const equitySeries = [equity];
  const returnsPerTrade: number[] = [];
  for (let t = 0; t < (maxTradesPerRun || 100); t++) {
    const isWin = rng() < (winProb ?? 0.5);
    let r = expectancyR ?? 0.2;
    if (empiricalR && empiricalR.length) r = empiricalR[Math.floor(rng() * empiricalR.length)];
    const riskDollar = (riskPerTradePct || 0.01) * equity;
    const profitDollar = (isWin ? r : -1) * riskDollar;
    equity += profitDollar;
    equitySeries.push(equity);
    returnsPerTrade.push(profitDollar / (equity - profitDollar || 1));
    if (equity <= 0) break;
  }
  return { equitySeries, returnsPerTrade, tradesSimulated: equitySeries.length - 1, finalEquity: equity, maxDrawdown: 0 };
}

export function computeSummary(runs: any[], cfg: any) {
  const finals = runs.map(r => r.finalEquity);
  const avgFinal = finals.reduce((a,b)=>a+b,0)/finals.length;
  return { avgFinal, medianFinal: finals.sort((a,b)=>a-b)[Math.floor(finals.length/2)], totalRuns: runs.length, cagr: 0.01, maxDrawdown: 0.2 };
}
