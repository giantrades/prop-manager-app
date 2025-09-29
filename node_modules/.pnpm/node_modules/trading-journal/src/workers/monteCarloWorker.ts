// @apps/trading-journal/src/workers/monteCarloWorker.ts
// Web Worker: calculations heavy. Use only ES features supported by worker bundling.
import type { MonteCarloConfig, MonteCarloRun, MonteCarloSummary } from '../types/monteCarlo';

type WorkerMsg =
  | { type: 'START'; config: MonteCarloConfig; empiricalR?: number[] }
  | { type: 'TERMINATE' };

type PostResult = {
  type: 'RESULT';
  summary: MonteCarloSummary;
  sampleRuns: MonteCarloRun[]; // a few sample runs for plotting
};

declare const self: DedicatedWorkerGlobalScope & {
  postMessage: (msg: any) => void;
};


function seededRandomFactory(seed: number) {
  let s = seed >>> 0;
  return function random() {
    // xorshift32
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) / 0xffffffff);
  };
}

function mean(arr: number[]) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
function variance(arr: number[], sample = false) {
  const m = mean(arr);
  const v = arr.reduce((s, x) => s + Math.pow(x - m, 2), 0) / (arr.length - (sample ? 1 : 0) || 1);
  return v;
}
function std(arr: number[]) {
  return Math.sqrt(variance(arr));
}
function skewness(arr: number[]) {
  const m = mean(arr);
  const s = std(arr) || 1;
  const n = arr.length;
  const a3 = arr.reduce((acc, x) => acc + Math.pow((x - m) / s, 3), 0) / n;
  return a3;
}
function kurtosis(arr: number[]) {
  const m = mean(arr);
  const s = std(arr) || 1;
  const n = arr.length;
  const a4 = arr.reduce((acc, x) => acc + Math.pow((x - m) / s, 4), 0) / n;
  return a4 - 3; // excess kurtosis
}

// 💥 NOVO NOME/AJUSTE: Antiga função 'pct' agora é 'percentile'.
function percentile(arr: number[], p: number) {
  if (!arr.length) return 0;
  // p é 0..1, então usamos (s.length - 1) * p para indexar.
  const s = [...arr].sort((a, b) => a - b);
  const idx = (s.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return s[lo];
  // Interpolação linear entre os dois pontos mais próximos
  return s[lo] * (hi - idx) + s[hi] * (idx - lo);
}

function maxDrawdown(equity: number[]) {
  let peak = -Infinity;
  let maxdd = 0;
  for (const v of equity) {
    if (v > peak) peak = v;
    const dd = (peak - v) / peak;
    if (dd > maxdd) maxdd = dd;
  }
  return maxdd;
}

// simulate single run
function simulateRun(config: MonteCarloConfig, rng: () => number, empiricalR?: number[]) {
  const {
    maxTradesPerRun,
    winProb,
    expectancyR,
    riskPerTradePct,
    riskPerTradeValue,
    initialCapital,
  } = config;
  let equity = initialCapital;
  const equitySeries: number[] = [equity];
  const returnsPerTrade: number[] = [];
  for (let t = 0; t < maxTradesPerRun; t++) {
    const isWin = rng() < winProb;
    // sample R from empirical distribution if provided; otherwise use expectancyR +/- noise
    let rOutcome = expectancyR;
    if (empiricalR && empiricalR.length > 0) {
      const idx = Math.floor(rng() * empiricalR.length);
      rOutcome = empiricalR[idx];
      // add slight noise
      rOutcome = rOutcome * (0.98 + rng() * 0.04);
    } else {
      // simulate per-trade R: draw from normal around expectancy with std=|expectancy|*1.2
      const norm = Math.tan(Math.PI * (rng() - 0.5)) * 0.01; // tiny noise
      rOutcome = expectancyR + norm;
    }

    // Decision: if win -> gain = rOutcome * risk, else loss = -1 * risk (R scale)
    // Determine risk in dollars
    const riskDollar = riskPerTradeValue ?? (riskPerTradePct ? equity * riskPerTradePct : equity * 0.01);
    const profitDollar = (isWin ? rOutcome : -1) * riskDollar;
    const retFraction = profitDollar / equity; // fractional return on current equity
    equity = equity + profitDollar;
    // avoid negative infinite, floor at tiny positive value
    if (!isFinite(equity) || equity <= 0) {
      equity = 0;
      equitySeries.push(equity);
      returnsPerTrade.push(retFraction);
      break; // run ended (ruin)
    }
    equitySeries.push(equity);
    returnsPerTrade.push(retFraction);
  }

  const finalEquity = equity;
  const md = maxDrawdown(equitySeries);
  return {
    equitySeries,
    returnsPerTrade,
    tradesSimulated: equitySeries.length - 1,
    maxDrawdown: md,
    finalEquity,
  };
}

function computeSummary(runs: any[], config: MonteCarloConfig) {
  const finals = runs.map((r) => r.finalEquity);
  const avgFinal = mean(finals);
  
  // 💥 CÁLCULO DOS NOVOS PERCENTIS (usando 0.25 e 0.75 para 25% e 75%)
  const medianFinal = percentile(finals, 0.5);
  const p05 = percentile(finals, 0.05);
  const p25 = percentile(finals, 0.25); // 💥 NOVO
  const p75 = percentile(finals, 0.75); // 💥 NOVO
  const p95 = percentile(finals, 0.95);
  
  // approximate CAGR: need years. Estimate average trades per run (use config.tradesPerYear or default 252)
  const tradesPerYear = config.tradesPerYear ?? 252;
  const avgTrades = mean(runs.map((r) => r.tradesSimulated || 0));
  const years = Math.max(1 / 365, avgTrades / tradesPerYear); // avoid div by zero
  const cagr = Math.pow(avgFinal / (config.initialCapital || 1), 1 / years) - 1;

  // compute returns per trade across all runs
  const allReturns: number[] = [];
  runs.forEach((r) => allReturns.push(...(r.returnsPerTrade || [])));
  const avgRet = mean(allReturns);
  const sdRet = std(allReturns);
  const sharpe = sdRet === 0 ? 0 : (avgRet / sdRet) * Math.sqrt(tradesPerYear);
  // downside std
  const downside = Math.sqrt(mean(allReturns.filter((x) => x < 0).map((x) => x * x)));
  const sortino = downside === 0 ? 0 : (avgRet / downside) * Math.sqrt(tradesPerYear);

  const maxDD = Math.max(...runs.map((r) => r.maxDrawdown ?? 0));
  const calmar = maxDD === 0 ? 0 : cagr / maxDD;

  const sumWins = allReturns.filter((r) => r > 0).reduce((a, b) => a + b, 0);
  const sumLoss = Math.abs(allReturns.filter((r) => r < 0).reduce((a, b) => a + b, 0));
  const profitFactor = sumLoss === 0 ? Infinity : sumWins / sumLoss;

  const expectedValue = avgRet * (config.riskPerTradeValue ?? (config.riskPerTradePct ? config.initialCapital * config.riskPerTradePct : config.initialCapital * 0.01));

  const sk = skewness(allReturns);
  const kurt = kurtosis(allReturns);

  const probRuin = runs.filter((r) => r.finalEquity <= 0).length / runs.length;

  return {
    avgFinal,
    medianFinal,
    p05,
    p25, // 💥 NOVO: Incluído no retorno para corrigir TS2339
    p75, // 💥 NOVO: Incluído no retorno para corrigir TS2339
    p95,
    cagr,
    maxDrawdown: maxDD,
    calmar,
    sharpe,
    sortino,
    profitFactor,
    expectedValue,
    skewness: sk,
    kurtosis: kurt,
    probRuin,
    totalRuns: runs.length,
  } as MonteCarloSummary;
}

self.addEventListener('message', (ev: MessageEvent) => {
  const msg: WorkerMsg = ev.data;
  if (msg.type === 'TERMINATE') {
    // gracefully close
    try {
      self.close();
    } catch (e) {}
    return;
  }
  if (msg.type === 'START') {
    const config = msg.config;
    const empiricalR = msg.empiricalR;
    const rng = config.seed ? seededRandomFactory(config.seed) : Math.random;
    const runs: any[] = [];
    const sampleRuns: any[] = [];
    const batch = Math.max(1, Math.floor(config.simulations / 100)); // for progress
    let lastProgress = 0;
    try {
      for (let i = 0; i < config.simulations; i++) {
        const r = simulateRun(config, rng, empiricalR);
        runs.push(r);
        // collect a few sample runs for plotting (up to 30 evenly spaced)
        if (sampleRuns.length < 30 && (i % Math.max(1, Math.floor(Math.max(1, config.simulations / 30)))) === 0) {
          sampleRuns.push(r);
        }
        if (i % batch === 0) {
          const progress = Math.floor((i / config.simulations) * 100);
          if (progress !== lastProgress) {
            lastProgress = progress;
            self.postMessage({ type: 'PROGRESS', progress });
          }
        }
      }

      const summary = computeSummary(runs, config);
      const payload: PostResult = { type: 'RESULT', summary, sampleRuns };
      self.postMessage(payload);
    } catch (err: any) {
      self.postMessage({ type: 'ERROR', message: err?.message || String(err) });
    }
  }
});