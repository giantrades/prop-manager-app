// STAGE 2 — Fórmulas financeiras. ÚNICA implementação (proibido reimplementar em tela).
// Fonte: DOCS/02_STAGE1_DOMAIN/02-FINANCIAL_FORMULAS.md
//
// Regras duras:
//  - rate=0 PROIBIDO.
//  - R sem stop definido => null (nunca 0).
//  - PF: grossLoss=0 && grossWin=0 => "n/a"; grossLoss=0 && grossWin>0 => "∞".
//  - Sharpe por dia, nunca por trade. Amostra < 20 dias => "amostra insuficiente".

import type { Trade, TradeDirection } from './types';
import { parseDate, startOfDayInTimezone } from './dateUtils';

export interface PnlInput {
  entryPrice: number;
  exitPrice: number;
  direction: TradeDirection;
  qty: number;
  commission: number;
  fees: number;
  swap: number;
  slippage?: number;
  multiplier?: number;
}

export function realizedPnl(input: PnlInput): number {
  const { entryPrice, exitPrice, direction, qty, commission, fees, swap, slippage = 0 } = input;
  const multiplier = input.multiplier ?? 1;
  const dir = direction === 'long' ? 1 : -1;
  const gross = (exitPrice - entryPrice) * dir * qty * multiplier;
  return Number((gross - commission - fees - swap - slippage).toFixed(8));
}

export function tradePnl(trade: Trade, multiplier = 1): number {
  if (trade.exitPrice == null) return 0;
  return realizedPnl({
    entryPrice: trade.entryPrice,
    exitPrice: trade.exitPrice,
    direction: trade.direction,
    qty: trade.qty,
    commission: trade.commission,
    fees: trade.fees,
    swap: trade.swap,
    slippage: trade.slippage,
    multiplier: trade.multiplier ?? multiplier,
  });
}

export interface RInput extends PnlInput {
  stopPrice?: number;
}

export function calcR(input: RInput): number | null {
  const { entryPrice, stopPrice, direction, qty, multiplier = 1 } = input;
  if (stopPrice == null) return null; // sem stop definido => n/a, nunca 0
  const risk = Math.abs(entryPrice - stopPrice) * qty * multiplier;
  if (risk === 0) return null;
  const pnl = realizedPnl(input);
  return Number((pnl / risk).toFixed(4));
}

export function tradeR(trade: Trade, opts?: { stopPrice?: number; multiplier?: number }): number | null {
  if (trade.exitPrice == null) return null;
  return calcR({
    entryPrice: trade.entryPrice,
    exitPrice: trade.exitPrice,
    direction: trade.direction,
    qty: trade.qty,
    commission: trade.commission,
    fees: trade.fees,
    swap: trade.swap,
    slippage: trade.slippage,
    stopPrice: opts?.stopPrice,
    multiplier: opts?.multiplier ?? trade.multiplier ?? 1,
  });
}

/**
 * PnL realizado do trade: prefere `resultNet` (o que a PLATAFORMA/ledger computou —
 * já líquido e correto mesmo sem `multiplier`) e cai na fórmula `tradePnl` só se
 * `resultNet` não for um número. Fonte ÚNICA para todos os widgets do journal, para
 * não divergir entre telas (heatmap/calendário/drawdown x lista).
 */
export function tradeNetPnl(trade: Trade): number {
  return typeof trade.resultNet === 'number' && Number.isFinite(trade.resultNet)
    ? trade.resultNet
    : tradePnl(trade);
}

/**
 * VWAP de uma lista de execuções (fills). Campo único `Trade.executions`.
 * Usado para derivar `entryPrice`/`exitPrice` de trades com execuções parciais.
 * Retorna null se não houver execuções com quantidade.
 */
export function vwapOfExecutions(executions: Array<{ side: string; price: number; quantity: number }> | undefined): number | null {
  if (!executions || executions.length === 0) return null;
  let totalQty = 0;
  let notional = 0;
  for (const e of executions) {
    const q = Number(e.quantity) || 0;
    if (q <= 0) continue;
    totalQty += q;
    notional += Number(e.price) * q;
  }
  if (totalQty <= 0) return null;
  return Number((notional / totalQty).toFixed(6));
}

// ---------------------------------------------------------------------------
// Equity (derivado) — proibido escrever saldo direto
// ---------------------------------------------------------------------------

/**
 * Peso do trade na conta. Se `trade.accounts[]` existe, usa o weight rateado;
 * senão, fallback para 1 (trade de conta única via `trade.accountId`).
 */
export function weightForAccount(trade: Trade, accountId: string): number {
  if (trade.accounts && trade.accounts.length > 0) {
    const found = trade.accounts.find((a) => a.accountId === accountId);
    return found ? found.weight : 0;
  }
  if (trade.accountId === accountId) return 1;
  return 0;
}

/** Contas de um trade: as rateadas (`accounts[]`) ou a única (`accountId`). Vazio = sem conta. */
export function tradeAccountIds(trade: Trade): string[] {
  if (trade.accounts && trade.accounts.length > 0) return trade.accounts.map((a) => a.accountId);
  return trade.accountId ? [trade.accountId] : [];
}

/**
 * Equity(account) = base + Σ PnL rateado por weight.
 * base = PropExtension.nominalSize quando kind=prop; senão 0 (balanço de conta
 * não-prop vem do ledger de transactions).
 */
export function computeEquity(
  base: number,
  accountId: string,
  trades: Trade[],
  multiplier = 1,
): number {
  let equity = base;
  for (const t of trades) {
    const w = weightForAccount(t, accountId);
    if (w === 0) continue;
    equity += tradePnl(t, multiplier) * w;
  }
  return Number(equity.toFixed(2));
}

// ---------------------------------------------------------------------------
// Drawdown — maxDD, trailingDD, dailyDD
// ---------------------------------------------------------------------------

export interface EquityPoint {
  at: string;
  equity: number;
}

/** maxDD = (peakEquity - currentEquity)/initialFunding, pico desde o início da fase. */
export function computeMaxDrawdown(series: EquityPoint[], initialFunding: number): number {
  if (initialFunding <= 0 || series.length === 0) return 0;
  let peak = series[0].equity;
  let maxDD = 0;
  for (const p of series) {
    if (p.equity > peak) peak = p.equity;
    const dd = (peak - p.equity) / initialFunding;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}

/** trailingDD (atual) = (pico mais recente - equity atual)/initialFunding. */
export function computeTrailingDrawdown(series: EquityPoint[], initialFunding: number): number {
  if (initialFunding <= 0 || series.length === 0) return 0;
  let peak = series[0].equity;
  for (const p of series) {
    if (p.equity > peak) peak = p.equity;
  }
  const current = series[series.length - 1].equity;
  return Number(((peak - current) / initialFunding).toFixed(6));
}

/**
 * dailyDD = (equityAt00h - currentEquity)/equityAt00h, no fuso da PRÓPRIA firm.
 * `equityAt00h` é a equity no início do dia corrente (fuso da firm).
 */
export function computeDailyDrawdown(
  series: EquityPoint[],
  timezoneOffsetMinutes = 0,
): number {
  if (series.length === 0) return 0;
  const last = series[series.length - 1];
  const dayStart = startOfDayInTimezone(last.at, timezoneOffsetMinutes);
  // Procura a equity mais próxima do início do dia (<= dayStart).
  let baseEquity = series[0].equity;
  for (const p of series) {
    const at = parseDate(p.at);
    if (at.getTime() <= dayStart.getTime()) baseEquity = p.equity;
    else break;
  }
  if (baseEquity <= 0) return 0;
  return Number(((baseEquity - last.equity) / baseEquity).toFixed(6));
}

/** Usado (% de DD) vs limite do contrato. Retorna true se excede o limite. */
export function drawdownExceeded(
  dd: number,
  limit: number,
  allowEqual = true,
): boolean {
  return allowEqual ? dd >= limit : dd > limit;
}

// ---------------------------------------------------------------------------
// Consistency % (trava Payout Eligibility)
// ---------------------------------------------------------------------------

export function consistencyPercent(bestSingleDayProfit: number, totalProfit: number): number | null {
  if (totalProfit <= 0) return null; // "n/a" — nunca dividir por zero/negativo
  return Number((bestSingleDayProfit / totalProfit).toFixed(6));
}

// ---------------------------------------------------------------------------
// Payout Eligibility (checklist exposto, não YES/NO cego)
// ---------------------------------------------------------------------------

export interface EligibilityChecks {
  equityReachedTarget: boolean;
  drawdownOk: boolean;
  daysOperatedOk: boolean;
  consistencyOk: boolean;
}

export interface EligibilityInput {
  equity: number;
  target: number;
  drawdownUsed: number; // fração 0..1 do limite já usado (ex.: 0.82)
  daysOperated: number;
  minDays: number;
  bestSingleDayProfit: number;
  totalProfit: number;
  consistencyPct: number; // limite configurado na firm
}

export interface EligibilityResult {
  eligible: boolean;
  checks: EligibilityChecks;
}

export function computePayoutEligibility(input: EligibilityInput): EligibilityResult {
  const equityReachedTarget = input.equity >= input.target;
  const drawdownOk = input.drawdownUsed < 1; // DD usado < 100% do limite
  const daysOperatedOk = input.daysOperated >= input.minDays;
  const consistency = consistencyPercent(input.bestSingleDayProfit, input.totalProfit);
  const consistencyOk = consistency == null || consistency <= input.consistencyPct;

  const eligible =
    equityReachedTarget &&
    drawdownOk &&
    daysOperatedOk &&
    consistencyOk;

  return {
    eligible,
    checks: {
      equityReachedTarget,
      drawdownOk,
      daysOperatedOk,
      consistencyOk,
    },
  };
}

// ---------------------------------------------------------------------------
// Winrate / PF / Sharpe (não usado no gate, mas faz parte do contrato de fórmulas)
// ---------------------------------------------------------------------------

export function winrate(trades: Trade[]): number {
  const wins = trades.filter((t) => t.resultNet > 0).length;
  const losses = trades.filter((t) => t.resultNet < 0).length;
  if (wins + losses === 0) return 0;
  return Number((wins / (wins + losses)).toFixed(6));
}

export type ProfitFactor = number | 'n/a' | 'infinity';

export function profitFactor(trades: Trade[]): ProfitFactor {
  let grossWin = 0;
  let grossLoss = 0;
  for (const t of trades) {
    if (t.resultNet > 0) grossWin += t.resultNet;
    else if (t.resultNet < 0) grossLoss += Math.abs(t.resultNet);
  }
  if (grossLoss === 0 && grossWin === 0) return 'n/a';
  if (grossLoss === 0) return 'infinity'; // renderizar como "∞", nunca JS Infinity cru
  return Number((grossWin / grossLoss).toFixed(4));
}
