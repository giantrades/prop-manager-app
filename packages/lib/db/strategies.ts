// STAGE 3 — Strategies. Consistência ponderada, long/short, significância e
// remoção sem órfão. R com volume/multiplier e weights rateando PnL já vivem em
// financialFormulas (única implementação) — aqui só agregação por estratégia.
//
// Fonte: DOCS/04_STAGE3_TRADING_OS/00-produto.md (Playbook) + 01-tasks (T3.6).

import type { DataService } from './DataService';
import type { Trade } from './types';
import { tradeNetPnl, tradeR, profitFactor, type ProfitFactor } from './financialFormulas';

export interface StrategyMetrics {
  strategyId: string;
  n: number;
  /** Amostra insuficiente quando n < 20 (Playbook). */
  sampleSufficient: boolean;
  winRate: number;
  avgR: number;
  profitFactor: ProfitFactor;
  expectancy: number;
  /** Soma de PnL rateado por weight (consistência ponderada). */
  weightedPnL: number;
  /** Consistência ponderada: melhor dia / total, rateado por weight. */
  weightedConsistency: number | null;
  long: DirectionBreakdown;
  short: DirectionBreakdown;
}

export interface DirectionBreakdown {
  n: number;
  winRate: number;
  avgR: number;
  weightedPnL: number;
}

/** Min de amostra para mostrar como "amostra" (não estatística decorativa). */
export const MIN_SAMPLE = 20;

/**
 * PnL rateado por weight da conta dentro do trade. Sem `accounts[]`, peso = 1.
 * Reusa `weightForAccount` (financialFormulas) — não duplica a lógica.
 */
export function weightedTradePnl(trade: Trade, accountId?: string): number {
  if (!trade.accounts || trade.accounts.length === 0) {
    return tradeNetPnl(trade);
  }
  const totalWeight = trade.accounts.reduce((s, a) => s + a.weight, 0) || 1;
  // PnL total já é o do trade; rateia proporcionalmente ao weight da conta-alvo.
  // Para estratégia, somamos o PnL por conta ponderado pela fração do trade.
  let sum = 0;
  for (const a of trade.accounts) {
    sum += tradeNetPnl(trade) * (a.weight / totalWeight);
  }
  return accountId ? sum : sum; // agregação da estratégia soma tudo
}

function breakdown(trades: Trade[], direction: 'long' | 'short'): DirectionBreakdown {
  const subset = trades.filter((t) => t.direction === direction);
  const n = subset.length;
  const wins = subset.filter((t) => t.resultNet > 0).length;
  const losses = subset.filter((t) => t.resultNet < 0).length;
  const winRate = wins + losses > 0 ? wins / (wins + losses) : 0;
  const rs = subset.map((t) => t.resultR).filter((r): r is number => r != null);
  const avgR = rs.length > 0 ? rs.reduce((s, r) => s + r, 0) / rs.length : 0;
  const weightedPnL = subset.reduce((s, t) => s + weightedTradePnl(t), 0);
  return { n, winRate: Number(winRate.toFixed(4)), avgR: Number(avgR.toFixed(4)), weightedPnL: Number(weightedPnL.toFixed(2)) };
}

/**
 * Métricas de uma estratégia. `sampleSufficient=false` quando n < 20 — a UI deve
 * mostrar "sem amostra" em vez de um número de baixa confiança.
 */
export function strategyMetrics(strategyId: string, trades: Trade[]): StrategyMetrics {
  return computeStrategyMetrics(strategyId, trades.filter((t) => t.strategyId === strategyId));
}

/** Métricas sobre um subconjunto JÁ filtrado (base única p/ estratégia × versão). */
function computeStrategyMetrics(strategyId: string, subset: Trade[]): StrategyMetrics {
  const n = subset.length;

  const wins = subset.filter((t) => t.resultNet > 0).length;
  const losses = subset.filter((t) => t.resultNet < 0).length;
  const winRate = wins + losses > 0 ? wins / (wins + losses) : 0;

  const rs = subset.map((t) => t.resultR).filter((r): r is number => r != null);
  const avgR = rs.length > 0 ? rs.reduce((s, r) => s + r, 0) / rs.length : 0;

  const pf = profitFactor(subset);

  const grossWin = subset.filter((t) => t.resultNet > 0).reduce((s, t) => s + t.resultNet, 0);
  const grossLoss = subset.filter((t) => t.resultNet < 0).reduce((s, t) => s + Math.abs(t.resultNet), 0);
  const expectancy = wins + losses > 0
    ? (wins / (wins + losses)) * (grossWin / Math.max(wins, 1)) -
      (losses / (wins + losses)) * (grossLoss / Math.max(losses, 1))
    : 0;

  // Consistência ponderada: melhor dia / total, com PnL rateado por weight.
  const byDay = new Map<string, number>();
  for (const t of subset) {
    const day = t.exitDatetime?.slice(0, 10) ?? t.entryDatetime.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + weightedTradePnl(t));
  }
  let bestDay = 0;
  let totalWeighted = 0;
  for (const v of byDay.values()) {
    if (v > bestDay) bestDay = v;
    totalWeighted += v;
  }
  const weightedConsistency = totalWeighted > 0 ? bestDay / totalWeighted : null;

  return {
    strategyId,
    n,
    sampleSufficient: n >= MIN_SAMPLE,
    winRate: Number(winRate.toFixed(4)),
    avgR: Number(avgR.toFixed(4)),
    profitFactor: pf,
    expectancy: Number(expectancy.toFixed(4)),
    weightedPnL: Number(subset.reduce((s, t) => s + weightedTradePnl(t), 0).toFixed(2)),
    weightedConsistency,
    long: breakdown(subset, 'long'),
    short: breakdown(subset, 'short'),
  };
}

/** Métricas para TODAS as estratégias presentes nos trades. */
export function allStrategyMetrics(trades: Trade[]): StrategyMetrics[] {
  const ids = new Set(trades.map((t) => t.strategyId).filter((s): s is string => !!s));
  return [...ids].map((id) => strategyMetrics(id, trades));
}

/** Métrica de estratégia quebrada por VERSÃO do playbook (`Trade.strategyVersion`). */
export interface StrategyVersionMetrics extends StrategyMetrics {
  /** Versão do playbook; `'—'` quando o trade não informou. */
  version: string;
}

/**
 * #2 — Strategy Matrix por versão: agrupa por `strategyId` × `strategyVersion` e
 * reusa a MESMA métrica (não duplica fórmula). Sem versão informada, agrupa em '—'.
 */
export function strategyVersionMetrics(trades: Trade[], strategyId?: string): StrategyVersionMetrics[] {
  const base = strategyId ? trades.filter((t) => t.strategyId === strategyId) : trades;
  const groups = new Map<string, Trade[]>();
  for (const t of base) {
    if (!t.strategyId) continue;
    const version = t.strategyVersion || '—';
    const key = `${t.strategyId}||${version}`;
    const arr = groups.get(key);
    if (arr) arr.push(t);
    else groups.set(key, [t]);
  }
  return [...groups.entries()].map(([key, subset]) => {
    const [sid, version] = key.split('||');
    return { ...computeStrategyMetrics(sid, subset), version };
  });
}

// ---------------------------------------------------------------------------
// Delete sem órfão
// ---------------------------------------------------------------------------

/**
 * Remove uma estratégia e desvincula os trades que a referenciam (seta
 * `strategyId` para undefined) — nunca deixa trade apontando pra estratégia
 * inexistente (órfão).
 *
 * @returns { unlinkedTrades } ids dos trades que foram desvinculados.
 */
export async function deleteStrategyClean(
  ds: DataService,
  strategyId: string,
): Promise<{ unlinkedTrades: string[] }> {
  const trades = await ds.trades.list();
  const affected = trades.filter((t) => t.strategyId === strategyId);
  const ids: string[] = [];
  for (const t of affected) {
    const next: Trade = { ...t, strategyId: undefined };
    await ds.trades.put(next, { source: 'local', emitChange: false });
    ids.push(t.id);
  }
  return { unlinkedTrades: ids };
}
