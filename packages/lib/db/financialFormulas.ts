// STAGE 2 — Fórmulas financeiras. ÚNICA implementação (proibido reimplementar em tela).
// Fonte: DOCS/02_STAGE1_DOMAIN/02-FINANCIAL_FORMULAS.md
//
// Regras duras:
//  - rate=0 PROIBIDO.
//  - R sem stop definido => null (nunca 0).
//  - PF: grossLoss=0 && grossWin=0 => "n/a"; grossLoss=0 && grossWin>0 => "∞".
//  - Sharpe por dia, nunca por trade. Amostra < 20 dias => "amostra insuficiente".

import type { Trade, TradeDirection, Greeks, OptionLeg, OptionRight } from './types';
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
  const raw = trade?.resultNet as unknown;
  // Aceita número OU string numérica (CSV/bridge antigo). Vazio/null/NaN cai na fórmula.
  if (raw !== null && raw !== undefined && raw !== '') {
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return tradePnl(trade);
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
  // `tradeNetPnl` (não `t.resultNet` cru): resultadoNet ausente/string virava 0 e
  // distorcia o WR — e `+= undefined` em profitFactor gerava NaN.
  const wins = trades.filter((t) => tradeNetPnl(t) > 0).length;
  const losses = trades.filter((t) => tradeNetPnl(t) < 0).length;
  if (wins + losses === 0) return 0;
  return Number((wins / (wins + losses)).toFixed(6));
}

export type ProfitFactor = number | 'n/a' | 'infinity';

export function profitFactor(trades: Trade[]): ProfitFactor {
  let grossWin = 0;
  let grossLoss = 0;
  for (const t of trades) {
    const pnl = tradeNetPnl(t);
    if (pnl > 0) grossWin += pnl;
    else if (pnl < 0) grossLoss += Math.abs(pnl);
  }
  if (grossLoss === 0 && grossWin === 0) return 'n/a';
  if (grossLoss === 0) return 'infinity'; // renderizar como "∞", nunca JS Infinity cru
  return Number((grossWin / grossLoss).toFixed(4));
}

// ---------------------------------------------------------------------------
// Opções — Black-Scholes-Merton, gregas, IV, payoff, exposição.
// Fonte: DOCS/02_STAGE1_DOMAIN/02-FINANCIAL_FORMULAS.md § Opções.
// Proibido calcular na UI: estas funções são a única implementação.
// ---------------------------------------------------------------------------

/** Normal padrão densidade. */
export function normalPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/** Normal padrão acumulada (Abramowitz-Stegun 26.2.17; erro < 7.5e-8). */
export function normalCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const poly =
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  return 0.5 * (1 + sign * (1 - poly * Math.exp(-z * z)));
}

export interface BsmInput {
  S: number; // preço do subjacente
  K: number; // strike
  T: number; // anos até o vencimento (ACT/365)
  r: number; // taxa livre de risco (decimal; ex. 0.05)
  sigma: number; // vol (decimal; ex. 0.20 = 20%)
  right: OptionRight;
  q?: number; // dividend yield (default 0)
}

/** Valor intrínseco (payoff no vencimento). */
export function optionIntrinsic(S: number, K: number, right: OptionRight): number {
  return right === 'call' ? Math.max(S - K, 0) : Math.max(K - S, 0);
}

/**
 * Preço BSM. `sigma<=0` ou `T<=0` => intrínseco (nunca preço determinístico falso).
 * `S<=0`/`K<=0` => null.
 */
export function bsmPrice(input: BsmInput): number | null {
  const { S, K, T, r, sigma, right } = input;
  const q = input.q ?? 0;
  if (!(S > 0) || !(K > 0)) return null;
  if (!(sigma > 0) || !(T > 0)) return optionIntrinsic(S, K, right);
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + (sigma * sigma) / 2) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const price =
    right === 'call'
      ? S * Math.exp(-q * T) * normalCdf(d1) - K * Math.exp(-r * T) * normalCdf(d2)
      : K * Math.exp(-r * T) * normalCdf(-d2) - S * Math.exp(-q * T) * normalCdf(-d1);
  return Number(price.toFixed(8));
}

/** Gregas BSM. Retorna null quando `sigma<=0`/`T<=0`/`S<=0` (n/a, nunca zero mudo).
 *  Escala crua do contrato: theta por ANO, vega/rho por 1.00 — a UI formata. */
export function bsmGreeks(input: BsmInput): Greeks | null {
  const { S, K, T, r, sigma, right } = input;
  const q = input.q ?? 0;
  if (!(S > 0) || !(K > 0) || !(sigma > 0) || !(T > 0)) return null;
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + (sigma * sigma) / 2) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const nd1 = normalPdf(d1);
  const eq = Math.exp(-q * T);
  const er = Math.exp(-r * T);

  const delta = right === 'call' ? eq * normalCdf(d1) : eq * (normalCdf(d1) - 1);
  const gamma = (eq * nd1) / (S * sigma * sqrtT);
  const vega = S * eq * nd1 * sqrtT;
  const theta =
    right === 'call'
      ? -(S * eq * nd1 * sigma) / (2 * sqrtT) - r * K * er * normalCdf(d2) + q * S * eq * normalCdf(d1)
      : -(S * eq * nd1 * sigma) / (2 * sqrtT) + r * K * er * normalCdf(-d2) - q * S * eq * normalCdf(-d1);
  const rho = right === 'call' ? K * T * er * normalCdf(d2) : -K * T * er * normalCdf(-d2);

  return {
    delta: Number(delta.toFixed(6)),
    gamma: Number(gamma.toFixed(8)),
    theta: Number(theta.toFixed(8)),
    vega: Number(vega.toFixed(8)),
    rho: Number(rho.toFixed(8)),
  };
}

export interface IvInput extends Omit<BsmInput, 'sigma'> {
  price: number;
}

/**
 * Volatilidade implícita por bisseção em `[1e-4, 5]`. Sem bracket (preço abaixo do
 * limite arbitrário) => null. NUNCA devolve aproximação chutada.
 */
export function impliedVolatility(input: IvInput): number | null {
  const { S, K, T, r, right, price } = input;
  const q = input.q ?? 0;
  if (!(price > 0) || !(S > 0) || !(K > 0) || !(T > 0)) return null;
  const f = (sigma: number) => (bsmPrice({ S, K, T, r, sigma, right, q }) ?? 0) - price;
  let a = 1e-4;
  let b = 5;
  let fa = f(a);
  let fb = f(b);
  if (Math.abs(fa) < 1e-8) return a;
  if (Math.abs(fb) < 1e-8) return b;
  if (fa * fb > 0) return null; // sem bracket
  for (let i = 0; i < 100; i += 1) {
    const m = (a + b) / 2;
    const fm = f(m);
    if (Math.abs(fm) < 1e-8 || b - a < 1e-8) return Number(m.toFixed(6));
    if (fa * fm <= 0) {
      b = m;
      fb = fm;
    } else {
      a = m;
      fa = fm;
    }
  }
  void fb;
  return Number(((a + b) / 2).toFixed(6));
}

/** Anos até o vencimento (ACT/365). `expiry` ISO. */
export function timeToExpiry(expiry: string, now: Date = new Date()): number {
  const days = (parseDate(expiry).getTime() - now.getTime()) / 86400000;
  return Math.max(0, days / 365);
}

/** P/L da perna no vencimento de um subjacente `S` (inclui fees da perna). */
export function optionLegPayoffAtExpiry(leg: OptionLeg, S: number): number {
  const mult = leg.multiplier || 1;
  const gross = leg.qty * mult * (optionIntrinsic(S, leg.strike, leg.right) - leg.entryPrice);
  return Number((gross - (leg.fees || 0)).toFixed(6));
}

/** P/L realizado da perna (exitPrice presente). null se ainda aberta. */
export function optionLegRealizedPnl(leg: OptionLeg): number | null {
  if (leg.exitPrice == null) return null;
  const mult = leg.multiplier || 1;
  return Number((leg.qty * mult * (leg.exitPrice - leg.entryPrice) - (leg.fees || 0)).toFixed(6));
}

/** Prêmio líquido do grupo: positivo = crédito recebido; negativo = débito pago. */
export function optionNetPremium(legs: OptionLeg[]): number {
  let premium = 0;
  let fees = 0;
  for (const leg of legs) {
    premium -= leg.qty * (leg.multiplier || 1) * leg.entryPrice;
    fees += leg.fees || 0;
  }
  return Number((premium - fees).toFixed(6));
}

/** P/L do grupo no vencimento, para um subjacente `S`. */
export function optionStrategyPnlAtExpiry(legs: OptionLeg[], S: number): number {
  return Number(legs.reduce((s, l) => s + optionLegPayoffAtExpiry(l, S), 0).toFixed(6));
}

export interface PayoffPoint {
  S: number;
  pnl: number;
}

/** Curva de payoff amostrada entre `min` e `max`. */
export function optionPayoffCurve(
  legs: OptionLeg[],
  opts: { min: number; max: number; points: number },
): PayoffPoint[] {
  const { min, max, points } = opts;
  if (!(max > min) || points < 2) return [];
  const out: PayoffPoint[] = [];
  for (let i = 0; i < points; i += 1) {
    const S = min + ((max - min) * i) / (points - 1);
    out.push({ S: Number(S.toFixed(4)), pnl: optionStrategyPnlAtExpiry(legs, S) });
  }
  return out;
}

/** Breakevens no vencimento: raízes de P/L=0, ordenadas (0, 1 ou mais). */
export function optionBreakevens(legs: OptionLeg[], opts: { min: number; max: number; step?: number }): number[] {
  const { min, max } = opts;
  const step = opts.step ?? (max - min) / 1000;
  if (!(max > min) || !(step > 0)) return [];
  const f = (S: number) => optionStrategyPnlAtExpiry(legs, S);
  const roots: number[] = [];
  let prevS = min;
  let prev = f(min);
  if (Math.abs(prev) < 1e-9) roots.push(Number(min.toFixed(4)));
  for (let S = min + step; S <= max + 1e-9; S += step) {
    const cur = f(S);
    if (Math.abs(cur) < 1e-9) {
      roots.push(Number(S.toFixed(4)));
    } else if (prev * cur < 0) {
      let a = prevS;
      let b = S;
      let fa = prev;
      for (let k = 0; k < 60; k += 1) {
        const m = (a + b) / 2;
        const fm = f(m);
        if (fa * fm <= 0) b = m;
        else {
          a = m;
          fa = fm;
        }
      }
      roots.push(Number(((a + b) / 2).toFixed(4)));
    }
    prevS = S;
    prev = cur;
  }
  const out: number[] = [];
  for (const r of roots) if (!out.some((x) => Math.abs(x - r) < 1e-3)) out.push(r);
  return out;
}

export interface MaxProfitLoss {
  maxProfit: number;
  maxLoss: number;
  maxProfitUnbounded: boolean;
  maxLossUnbounded: boolean;
}

/** Máx lucro/perda na janela `[min,max]` + flag de ilimitado pelas inclinações das pontas. */
export function optionMaxProfitLoss(legs: OptionLeg[], opts: { min: number; max: number }): MaxProfitLoss {
  const { min, max } = opts;
  const curve = optionPayoffCurve(legs, { min, max, points: 401 });
  let maxProfit = -Infinity;
  let maxLoss = Infinity;
  for (const p of curve) {
    if (p.pnl > maxProfit) maxProfit = p.pnl;
    if (p.pnl < maxLoss) maxLoss = p.pnl;
  }
  const f = (S: number) => optionStrategyPnlAtExpiry(legs, S);
  const eps = (max - min) * 1e-3;
  const slopeMax = (f(max) - f(max - eps)) / eps;
  const slopeMin = (f(min + eps) - f(min)) / eps;
  return {
    maxProfit: Number((Number.isFinite(maxProfit) ? maxProfit : 0).toFixed(2)),
    maxLoss: Number((Number.isFinite(maxLoss) ? maxLoss : 0).toFixed(2)),
    maxProfitUnbounded: slopeMax > 1e-6 || slopeMin < -1e-6,
    maxLossUnbounded: slopeMax < -1e-6 || slopeMin > 1e-6,
  };
}

export interface OptionMarketPoint {
  S: number;
  r: number;
  q?: number;
  now?: Date;
}

/** Gregas líquidas do grupo (Δ em ações-equivalentes; Γ/Θ/V/ρ em dólares se ×multiplier).
 *  Usa `ivEntry` da perna; pernas sem IV/T são ignoradas. */
export function netOptionGreeks(legs: OptionLeg[], market: OptionMarketPoint): Greeks {
  const q = market.q ?? 0;
  const now = market.now ?? new Date();
  const acc: Greeks = { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
  for (const leg of legs) {
    const T = timeToExpiry(leg.expiry, now);
    const sigma = leg.ivEntry;
    if (!(sigma && sigma > 0) || !(T > 0)) continue;
    const g = bsmGreeks({ S: market.S, K: leg.strike, T, r: market.r, sigma, right: leg.right, q });
    if (!g) continue;
    const mult = leg.multiplier || 1;
    acc.delta += g.delta * leg.qty * mult;
    acc.gamma += g.gamma * leg.qty * mult;
    acc.theta += g.theta * leg.qty * mult;
    acc.vega += g.vega * leg.qty * mult;
    acc.rho += g.rho * leg.qty * mult;
  }
  return {
    delta: Number(acc.delta.toFixed(4)),
    gamma: Number(acc.gamma.toFixed(6)),
    theta: Number(acc.theta.toFixed(6)),
    vega: Number(acc.vega.toFixed(4)),
    rho: Number(acc.rho.toFixed(4)),
  };
}

/** Delta notional do grupo (|Δ| × S) e delta líquido em ações-equivalentes. */
export function optionDeltaNotional(
  legs: OptionLeg[],
  market: OptionMarketPoint,
): { netDelta: number; deltaNotional: number } {
  const g = netOptionGreeks(legs, market);
  return { netDelta: g.delta, deltaNotional: Number((Math.abs(g.delta) * market.S).toFixed(2)) };
}

/** Cost basis por ação ao exercer uma PUT vendida (strike pago − prêmio líquido recebido). */
export function assignmentPutCostBasis(input: { strike: number; shares: number; netPremium: number }): number {
  if (!(input.shares > 0)) return 0;
  return Number(((input.strike * input.shares - input.netPremium) / input.shares).toFixed(6));
}

/** Recebido por ação ao ser exercido numa CALL vendida (strike + prêmio líquido). */
export function assignmentCallProceeds(input: { strike: number; shares: number; netPremium: number }): number {
  if (!(input.shares > 0)) return 0;
  return Number(((input.strike * input.shares + input.netPremium) / input.shares).toFixed(6));
}

/** Yield de renda (prêmio / base). `annualize` multiplica por 365/dias. */
export function optionIncomeYield(input: {
  netPremium: number;
  basis: number;
  daysToExpiry: number;
  annualize?: boolean;
}): number | null {
  const { netPremium, basis, daysToExpiry } = input;
  if (!(basis > 0) || !(daysToExpiry > 0)) return null;
  const y = netPremium / basis;
  return input.annualize ? Number(((y * 365) / daysToExpiry).toFixed(6)) : Number(y.toFixed(6));
}

/** Covered call: prêmio / (spot × multiplier × contratos). */
export function coveredCallYield(input: {
  netPremium: number;
  spot: number;
  multiplier: number;
  contracts: number;
  daysToExpiry: number;
  annualize?: boolean;
}): number | null {
  return optionIncomeYield({
    netPremium: input.netPremium,
    basis: input.spot * input.multiplier * input.contracts,
    daysToExpiry: input.daysToExpiry,
    annualize: input.annualize,
  });
}

/** Cash-secured put: prêmio / (strike × multiplier × contratos). */
export function cashSecuredPutYield(input: {
  netPremium: number;
  strike: number;
  multiplier: number;
  contracts: number;
  daysToExpiry: number;
  annualize?: boolean;
}): number | null {
  return optionIncomeYield({
    netPremium: input.netPremium,
    basis: input.strike * input.multiplier * input.contracts,
    daysToExpiry: input.daysToExpiry,
    annualize: input.annualize,
  });
}

// ---------------------------------------------------------------------------
// Opções — cenários teóricos (T+0 / What-If), gregas por preço, risco de venda
// descoberta. Mesma regra: só aqui há fórmula; a UI apenas exibe.
// ---------------------------------------------------------------------------

/** Theta por DIA (a escala crua de `bsmGreeks` é por ANO). */
export function optionThetaPerDay(thetaPerYear: number): number {
  return Number((thetaPerYear / 365).toFixed(8));
}

export interface OptionScenario {
  r: number; // taxa livre de risco (decimal)
  q?: number; // dividend yield
  asOf?: Date; // data-base (default: agora)
  daysForward?: number; // avanço no tempo (decaimento), dias corridos
  volShift?: number; // choque ABSOLUTO de vol (+0.05 = +5 pontos de IV)
  fallbackIv?: number; // IV p/ pernas sem `ivEntry` (se ausente, a perna fica "sem preço")
}

/** Valor teórico (por ação) da perna no cenário. null = sem IV (não inventa preço). */
export function optionLegTheoreticalValue(leg: OptionLeg, S: number, scenario: OptionScenario): number | null {
  const base = leg.ivEntry && leg.ivEntry > 0 ? leg.ivEntry : scenario.fallbackIv;
  if (!(base && base > 0)) return null;
  const asOf = scenario.asOf ?? new Date();
  const T = Math.max(0, timeToExpiry(leg.expiry, asOf) - (scenario.daysForward ?? 0) / 365);
  const sigma = Math.max(1e-4, base + (scenario.volShift ?? 0));
  return bsmPrice({ S, K: leg.strike, T, r: scenario.r, sigma, right: leg.right, q: scenario.q ?? 0 });
}

/**
 * P/L teórico do grupo no cenário (marcação a modelo).
 * - perna ABERTA: qty × mult × (valor teórico − entrada) − fees
 * - perna FECHADA: P/L realizado (constante)
 * - perna sem IV: fora da conta, contada em `unpriced` (a UI avisa).
 */
export function optionStrategyTheoreticalPnl(
  legs: OptionLeg[],
  S: number,
  scenario: OptionScenario,
): { pnl: number; unpriced: number } {
  let pnl = 0;
  let unpriced = 0;
  for (const leg of legs) {
    const realized = optionLegRealizedPnl(leg);
    if (realized != null) {
      pnl += realized;
      continue;
    }
    const v = optionLegTheoreticalValue(leg, S, scenario);
    if (v == null) {
      unpriced += 1;
      continue;
    }
    pnl += leg.qty * (leg.multiplier || 1) * (v - leg.entryPrice) - (leg.fees || 0);
  }
  return { pnl: Number(pnl.toFixed(6)), unpriced };
}

/** Curva teórica P/L × S para um cenário (T+0, What-If de vol e/ou tempo). */
export function optionTheoreticalCurve(
  legs: OptionLeg[],
  opts: { min: number; max: number; points: number },
  scenario: OptionScenario,
): { points: PayoffPoint[]; unpriced: number } {
  const { min, max, points } = opts;
  if (!(max > min) || points < 2) return { points: [], unpriced: 0 };
  const out: PayoffPoint[] = [];
  let unpriced = 0;
  for (let i = 0; i < points; i += 1) {
    const S = min + ((max - min) * i) / (points - 1);
    const r = optionStrategyTheoreticalPnl(legs, S, scenario);
    unpriced = r.unpriced;
    out.push({ S: Number(S.toFixed(4)), pnl: r.pnl });
  }
  return { points: out, unpriced };
}

export interface GreeksPoint extends Greeks {
  S: number;
}

/** Gregas líquidas (pernas abertas) em cada preço do subjacente — base dos overlays Δ Γ Θ V ρ. */
export function optionGreeksCurve(
  legs: OptionLeg[],
  opts: { min: number; max: number; points: number },
  market: { r: number; q?: number; now?: Date },
): GreeksPoint[] {
  const { min, max, points } = opts;
  if (!(max > min) || points < 2) return [];
  const open = legs.filter((l) => l.exitPrice == null);
  const out: GreeksPoint[] = [];
  for (let i = 0; i < points; i += 1) {
    const S = min + ((max - min) * i) / (points - 1);
    const g = netOptionGreeks(open, { S, r: market.r, q: market.q, now: market.now });
    out.push({ S: Number(S.toFixed(4)), ...g });
  }
  return out;
}

export interface NakedExposure {
  /** Há risco sem hedge: call líquida vendida além das ações, ou put líquida vendida sem put comprada abaixo. */
  naked: boolean;
  /** Perda teórica ilimitada (call descoberta). */
  unbounded: boolean;
  /** Perda máxima FINITA no vencimento (put até o subjacente a zero); null se ilimitada. */
  maxLoss: number | null;
  stressPct: number;
  /** Perda no pior dos cenários spot×(1±stressPct) no vencimento (≥ 0). */
  stressLoss: number;
}

/**
 * Risco de venda descoberta (risk gate A2). Considera só pernas ABERTAS do mesmo subjacente.
 * `shares` = ações em carteira que cobrem calls (custo neutro no spot). Exato: o P/L no
 * vencimento é linear por partes, então o mínimo está em S=0 ou em algum strike.
 * Não estima margem de corretora (cada broker difere) — mostra perda máxima e estresse.
 */
export function optionNakedExposure(
  legs: OptionLeg[],
  opts: { spot: number; stressPct: number; shares?: number },
): NakedExposure {
  const open = legs.filter((l) => l.exitPrice == null);
  const sh = opts.shares ?? 0;
  const f = (S: number) => optionStrategyPnlAtExpiry(open, S) + sh * (S - opts.spot);

  const callQty = open.filter((l) => l.right === 'call').reduce((s, l) => s + l.qty * (l.multiplier || 1), 0);
  const putQty = open.filter((l) => l.right === 'put').reduce((s, l) => s + l.qty * (l.multiplier || 1), 0);
  const unbounded = callQty + sh < -1e-9; // inclinação para S→∞
  const downsideOpen = -putQty > 1e-9; // put líquida vendida: perde ao cair (ações em carteira não hedgeiam put vendida)

  const strikes = [...new Set(open.map((l) => l.strike))];
  const probes = [0, ...strikes, Math.max(opts.spot, ...strikes, 1) * 3];
  const minPnl = Math.min(...probes.map(f));
  const bump = Math.max(0, opts.stressPct);
  const worst = Math.min(f(opts.spot * (1 - bump)), f(opts.spot * (1 + bump)));

  return {
    naked: unbounded || downsideOpen,
    unbounded,
    maxLoss: unbounded ? null : Number(Math.max(0, -minPnl).toFixed(2)),
    stressPct: bump,
    stressLoss: Number(Math.max(0, -worst).toFixed(2)),
  };
}

/**
 * P/L "de mercado" do grupo: pernas abertas marcadas a um preço de mercado informado
 * (`marks[legId]`, ex.: mid da cadeia) + realizado das fechadas. Difere do P/L TEÓRICO
 * (`optionStrategyTheoreticalPnl`, preço de modelo). Pernas abertas sem marca ficam em
 * `unmarked` — o chamador decide não exibir total parcial como se fosse completo.
 */
export function optionStrategyMarkPnl(
  legs: OptionLeg[],
  marks: Record<string, number | null | undefined>,
): { pnl: number; unmarked: number } {
  let pnl = 0;
  let unmarked = 0;
  for (const leg of legs) {
    const realized = optionLegRealizedPnl(leg);
    if (realized != null) {
      pnl += realized;
      continue;
    }
    const mark = marks[leg.id];
    if (mark == null || !Number.isFinite(mark)) {
      unmarked += 1;
      continue;
    }
    pnl += leg.qty * (leg.multiplier || 1) * (mark - leg.entryPrice) - (leg.fees || 0);
  }
  return { pnl: Number(pnl.toFixed(6)), unmarked };
}

/** Vega por 1 ponto de vol (a escala crua é por 1.00 de vol). */
export function optionVegaPerPoint(vegaRaw: number): number {
  return Number((vegaRaw / 100).toFixed(8));
}

/** Rho por 1 ponto de taxa (a escala crua é por 1.00 de taxa). */
export function optionRhoPerPoint(rhoRaw: number): number {
  return Number((rhoRaw / 100).toFixed(8));
}
