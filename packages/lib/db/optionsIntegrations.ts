// Integrações de opções (F4): prêmio no ledger, assignment → Position, exposição,
// cobertura e vencimentos. Fórmulas SÓ de `financialFormulas.ts` (§ Opções).
//
// Fonte: DOCS/10_MODULES/options/00-spec.md (F4).

import type { DataService } from './DataService';
import type { Greeks, OptionLeg, OptionRight, Position, Transaction } from './types';
import {
  assignmentCallProceeds,
  assignmentPutCostBasis,
  cashSecuredPutYield,
  coveredCallYield,
  netOptionGreeks,
  optionMaxProfitLoss,
  optionLegRealizedPnl,
  optionNetPremium,
  type OptionMarketPoint,
} from './financialFormulas';
import { groupOptionLegs, optionDaysToExpiry } from './options';

// ---------------------------------------------------------------------------
// Prêmio realizado → ledger (kind 'option_premium', renda pessoal)
// ---------------------------------------------------------------------------

/**
 * Constrói Transações de prêmio (renda) para estratégias FECHADAS com resultado
 * positivo. Id determinístico (`optprem:<groupId>`) → reexecutar não duplica.
 */
export function buildOptionPremiumTransactions(
  legs: OptionLeg[],
  opts?: { accountId?: string; currency?: string; note?: string },
): Transaction[] {
  const groups = groupOptionLegs(legs);
  const out: Transaction[] = [];
  for (const g of groups) {
    if (g.open || !(g.realizedPnl > 0)) continue;
    const accountId = opts?.accountId ?? g.legs[0]?.accountId ?? '';
    const date = g.legs.reduce((latest, l) => {
      const d = l.exitDatetime ?? l.entryDatetime ?? '';
      return d > latest ? d : latest;
    }, '');
    out.push({
      id: `optprem:${g.id}`,
      accountId,
      kind: 'option_premium',
      amount: Number(g.realizedPnl.toFixed(2)),
      currency: opts?.currency ?? 'USD',
      date: date || new Date().toISOString(),
      note: opts?.note ?? `Prêmio de opções ${g.underlying}`,
      updatedAt: new Date().toISOString(),
      deviceId: '',
      version: 0,
    });
  }
  return out;
}

/** Grava os prêmios realizados no ledger. Retorna quantas transações criou. */
export async function recordOptionPremium(
  ds: DataService,
  legs: OptionLeg[],
  opts?: { accountId?: string; currency?: string; note?: string },
): Promise<number> {
  const txs = buildOptionPremiumTransactions(legs, opts);
  for (const t of txs) await ds.transactions.put(t, { source: 'local' });
  return txs.length;
}

// ---------------------------------------------------------------------------
// Assignment → Position (put exercida vira ações; call vira entrega)
// ---------------------------------------------------------------------------

export interface AssignmentResult {
  shares: number;
  /** Presente quando uma put vendida foi exercida (ações compradas). */
  position?: Position;
  /** Presente quando uma call vendida foi exercida (entrega das ações). */
  proceedsPerShare?: number;
}

/**
 * Converte a perna exercida em resultado de assignment. `netPremium` = crédito líquido
 * recebido (default: derivado da perna). Não persiste — o chamador decide.
 */
export function optionAssignment(
  leg: OptionLeg,
  opts?: { accountId?: string; netPremium?: number; positionId?: string },
): AssignmentResult {
  const shares = Math.abs(leg.qty) * (leg.multiplier || 1);
  const accountId = opts?.accountId ?? leg.accountId;
  const netPremium = opts?.netPremium ?? -(leg.qty * (leg.multiplier || 1) * leg.entryPrice);
  if (leg.right === 'put' && leg.qty < 0) {
    const avgPrice = assignmentPutCostBasis({ strike: leg.strike, shares, netPremium });
    return {
      shares,
      position: {
        id: opts?.positionId ?? `optassign:${leg.id}`,
        accountId,
        symbol: leg.underlying,
        qty: shares,
        avgPrice,
        currency: 'USD',
        assetKind: 'equity',
        lastMarkPrice: leg.strike,
        lastMarkAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deviceId: '',
        version: 0,
      },
    };
  }
  if (leg.right === 'call' && leg.qty < 0) {
    return { shares, proceedsPerShare: assignmentCallProceeds({ strike: leg.strike, shares, netPremium }) };
  }
  return { shares };
}

// ---------------------------------------------------------------------------
// Exposição (Risk): delta líquido/notional e prêmio aberto por subjacente
// ---------------------------------------------------------------------------

export interface UnderlyingExposure {
  underlying: string;
  netDelta: number;
  deltaNotional: number;
  openPremium: number;
  openLegs: number;
  shortCalls: number;
  shortPuts: number;
  greeks: Greeks;
}

export function optionPortfolioExposure(
  legs: OptionLeg[],
  market: { spotByUnderlying: Record<string, number>; r: number; q?: number; now?: Date },
): UnderlyingExposure[] {
  const open = legs.filter((l) => l.exitPrice == null);
  const byU = new Map<string, OptionLeg[]>();
  for (const l of open) {
    if (!byU.has(l.underlying)) byU.set(l.underlying, []);
    byU.get(l.underlying)!.push(l);
  }
  const zero: Greeks = { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
  const out: UnderlyingExposure[] = [];
  for (const [underlying, ls] of byU) {
    const spot = market.spotByUnderlying[underlying];
    const point: OptionMarketPoint = { S: spot ?? 0, r: market.r, q: market.q, now: market.now };
    const g = spot ? netOptionGreeks(ls, point) : zero;
    out.push({
      underlying,
      netDelta: g.delta,
      deltaNotional: spot ? Number((Math.abs(g.delta) * spot).toFixed(2)) : 0,
      openPremium: optionNetPremium(ls),
      openLegs: ls.length,
      shortCalls: ls.filter((l) => l.right === 'call' && l.qty < 0).length,
      shortPuts: ls.filter((l) => l.right === 'put' && l.qty < 0).length,
      greeks: g,
    });
  }
  return out.sort((a, b) => b.deltaNotional - a.deltaNotional);
}

// ---------------------------------------------------------------------------
// Cobertura (Investimentos): covered call sobre ações da carteira
// ---------------------------------------------------------------------------

export interface CoverageRow {
  underlying: string;
  shares: number;
  shortCallContracts: number;
  coveredContracts: number;
  coveragePct: number;
}

export function optionCoverage(legs: OptionLeg[], positions: Position[]): CoverageRow[] {
  const sharesByU = new Map<string, number>();
  for (const p of positions) {
    if (p.assetKind && p.assetKind !== 'equity') continue;
    sharesByU.set(p.symbol, (sharesByU.get(p.symbol) ?? 0) + (p.qty ?? 0));
  }
  const callsByU = new Map<string, OptionLeg[]>();
  for (const l of legs) {
    if (l.exitPrice != null || l.right !== 'call' || l.qty >= 0) continue;
    if (!callsByU.has(l.underlying)) callsByU.set(l.underlying, []);
    callsByU.get(l.underlying)!.push(l);
  }
  const out: CoverageRow[] = [];
  for (const [underlying, callLegs] of callsByU) {
    // Cobertura em AÇÕES: cada perna consome qty × multiplier do contrato (nunca 100 fixo).
    // Perna sem multiplier válido não é considerada coberta.
    const contracts = callLegs.reduce((s, l) => s + Math.abs(l.qty), 0);
    const shares = sharesByU.get(underlying) ?? 0;
    let remaining = shares;
    let coveredContracts = 0;
    for (const l of callLegs) {
      const m = l.multiplier;
      if (!(m > 0)) continue;
      const take = Math.min(Math.abs(l.qty), Math.floor(remaining / m));
      coveredContracts += take;
      remaining -= take * m;
    }
    out.push({
      underlying,
      shares,
      shortCallContracts: contracts,
      coveredContracts,
      coveragePct: contracts > 0 ? coveredContracts / contracts : 0,
    });
  }
  return out.sort((a, b) => b.shortCallContracts - a.shortCallContracts);
}

// ---------------------------------------------------------------------------
// Vencimentos (Calendar): pernas abertas dentro da janela
// ---------------------------------------------------------------------------

export interface OptionExpiryEvent {
  date: string;
  underlying: string;
  symbol: string;
  right: OptionRight;
  strike: number;
  qty: number;
  dte: number;
}

export function optionExpiryEvents(
  legs: OptionLeg[],
  opts?: { withinDays?: number; now?: Date },
): OptionExpiryEvent[] {
  const now = opts?.now ?? new Date();
  const within = opts?.withinDays ?? 30;
  const out: OptionExpiryEvent[] = [];
  for (const l of legs) {
    if (l.exitPrice != null) continue;
    const dte = Math.ceil((new Date(l.expiry).getTime() - now.getTime()) / 86400000);
    if (dte < 0 || dte > within) continue;
    out.push({ date: l.expiry, underlying: l.underlying, symbol: l.symbol, right: l.right, strike: l.strike, qty: l.qty, dte });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// ---------------------------------------------------------------------------
// Data-com (A1): risco de assignment antecipado em calls vendidas
// ---------------------------------------------------------------------------

export interface OptionDividendRisk {
  exDate: string;
  underlying: string;
  symbol: string;
  strike: number;
  expiry: string;
  qty: number;
  amountPerShare: number | null;
  daysToExDate: number;
  /** null = spot desconhecido. */
  itm: boolean | null;
  /** mark − intrínseco; null sem spot ou sem preço de mercado. */
  extrinsic: number | null;
  /** high: ITM e valor extrínseco < dividendo (exercício antecipado racional); watch: ITM; info: o resto. */
  level: 'high' | 'watch' | 'info';
}

/**
 * Calls VENDIDAS abertas cujo vencimento é posterior (ou igual) à data-com de um dividendo
 * do mesmo ativo. Só calls: o exercício antecipado por dividendo é risco de quem vende call.
 * Não prevê exercício — sinaliza quando ele passa a ser economicamente racional.
 */
export function optionDividendRisks(
  legs: OptionLeg[],
  dividends: Array<{ symbol: string; exDate: string; amountPerShare?: number }>,
  opts?: {
    spots?: Record<string, number>;
    marks?: Record<string, number | null | undefined>;
    now?: Date;
    withinDays?: number;
  },
): OptionDividendRisk[] {
  const now = opts?.now ?? new Date();
  const within = opts?.withinDays ?? 45;
  const today = now.toISOString().slice(0, 10);
  const out: OptionDividendRisk[] = [];
  for (const leg of legs) {
    if (leg.exitPrice != null || leg.right !== 'call' || !(leg.qty < 0)) continue;
    for (const d of dividends) {
      if (d.symbol.toUpperCase() !== leg.underlying.toUpperCase()) continue;
      if (d.exDate > leg.expiry || d.exDate < today) continue;
      const daysToExDate = optionDaysToExpiry(d.exDate, now);
      if (daysToExDate > within) continue;
      const spot = opts?.spots?.[leg.underlying];
      const itm = spot && spot > 0 ? spot > leg.strike : null;
      const mark = opts?.marks?.[leg.id];
      const extrinsic = spot && spot > 0 && mark != null ? Number((mark - Math.max(spot - leg.strike, 0)).toFixed(4)) : null;
      const amount = d.amountPerShare ?? null;
      let level: OptionDividendRisk['level'] = 'info';
      if (itm === true) level = extrinsic != null && amount != null && extrinsic < amount ? 'high' : 'watch';
      out.push({
        exDate: d.exDate, underlying: leg.underlying, symbol: leg.symbol, strike: leg.strike, expiry: leg.expiry,
        qty: leg.qty, amountPerShare: amount, daysToExDate, itm, extrinsic, level,
      });
    }
  }
  const rank = { high: 0, watch: 1, info: 2 } as const;
  return out.sort((a, b) => rank[a.level] - rank[b.level] || a.exDate.localeCompare(b.exDate));
}

// ---------------------------------------------------------------------------
// Analytics por subjacente (Journal): prêmio, win rate, R
// ---------------------------------------------------------------------------

export interface UnderlyingOptionStats {
  underlying: string;
  closedGroups: number;
  wins: number;
  /** null sem estratégias fechadas. */
  winRate: number | null;
  realized: number;
  avgPnl: number | null;
  /** Prêmio líquido (crédito − débito) das estratégias fechadas. */
  premiumClosed: number;
  /** R médio = P/L realizado ÷ perda máxima definida da estratégia. null se nenhuma tem risco definido. */
  avgR: number | null;
  rSamples: number;
  openGroups: number;
  openPremium: number;
}

export function optionAnalyticsByUnderlying(legs: OptionLeg[]): UnderlyingOptionStats[] {
  const acc = new Map<string, UnderlyingOptionStats & { rSum: number }>();
  for (const g of groupOptionLegs(legs)) {
    const cur =
      acc.get(g.underlying) ??
      { underlying: g.underlying, closedGroups: 0, wins: 0, winRate: null, realized: 0, avgPnl: null, premiumClosed: 0, avgR: null, rSamples: 0, openGroups: 0, openPremium: 0, rSum: 0 };
    if (g.open) {
      cur.openGroups += 1;
      cur.openPremium += g.netPremium;
    } else {
      cur.closedGroups += 1;
      cur.realized += g.realizedPnl;
      cur.premiumClosed += g.netPremium;
      if (g.realizedPnl > 0) cur.wins += 1;
      const strikes = g.legs.map((l) => l.strike);
      const pl = optionMaxProfitLoss(g.legs, { min: 0.0001, max: Math.max(...strikes) * 3 });
      if (!pl.maxLossUnbounded && pl.maxLoss < 0) {
        cur.rSum += g.realizedPnl / -pl.maxLoss;
        cur.rSamples += 1;
      }
    }
    acc.set(g.underlying, cur);
  }
  return [...acc.values()]
    .map(({ rSum, ...r }) => ({
      ...r,
      winRate: r.closedGroups > 0 ? r.wins / r.closedGroups : null,
      avgPnl: r.closedGroups > 0 ? Number((r.realized / r.closedGroups).toFixed(2)) : null,
      avgR: r.rSamples > 0 ? Number((rSum / r.rSamples).toFixed(3)) : null,
      realized: Number(r.realized.toFixed(2)),
      premiumClosed: Number(r.premiumClosed.toFixed(2)),
      openPremium: Number(r.openPremium.toFixed(2)),
    }))
    .sort((a, b) => b.realized - a.realized);
}

// ---------------------------------------------------------------------------
// Renda (Investimentos): yield de covered calls e cash-secured puts abertas
// ---------------------------------------------------------------------------

export interface OptionIncomeRow {
  groupId: string;
  underlying: string;
  kind: 'covered-call' | 'cash-secured-put';
  contracts: number;
  strike: number;
  expiry: string;
  dte: number;
  netPremium: number;
  /** Base do yield: spot (call) / strike (put) × multiplier × contratos. null sem spot (call). */
  basis: number | null;
  yieldPct: number | null;
  annualizedPct: number | null;
}

/** Linhas de renda das posições abertas de UMA perna vendida (call ou put). */
export function optionIncomeRows(
  legs: OptionLeg[],
  opts?: { spots?: Record<string, number>; now?: Date },
): OptionIncomeRow[] {
  const out: OptionIncomeRow[] = [];
  for (const g of groupOptionLegs(legs)) {
    const open = g.legs.filter((l) => l.exitPrice == null);
    if (!g.open || open.length !== 1 || g.legs.length !== 1) continue;
    const leg = open[0];
    if (!(leg.qty < 0)) continue;
    const dte = optionDaysToExpiry(leg.expiry, opts?.now);
    const contracts = Math.abs(leg.qty);
    const spot = opts?.spots?.[leg.underlying];
    const base = { netPremium: g.netPremium, multiplier: leg.multiplier, contracts, daysToExpiry: dte };
    if (leg.right === 'call') {
      const hasSpot = Boolean(spot && spot > 0);
      out.push({
        groupId: g.id, underlying: leg.underlying, kind: 'covered-call', contracts, strike: leg.strike, expiry: leg.expiry, dte,
        netPremium: g.netPremium,
        basis: hasSpot ? (spot as number) * leg.multiplier * contracts : null,
        yieldPct: hasSpot ? coveredCallYield({ ...base, spot: spot as number }) : null,
        annualizedPct: hasSpot ? coveredCallYield({ ...base, spot: spot as number, annualize: true }) : null,
      });
    } else {
      out.push({
        groupId: g.id, underlying: leg.underlying, kind: 'cash-secured-put', contracts, strike: leg.strike, expiry: leg.expiry, dte,
        netPremium: g.netPremium,
        basis: leg.strike * leg.multiplier * contracts,
        yieldPct: cashSecuredPutYield({ ...base, strike: leg.strike }),
        annualizedPct: cashSecuredPutYield({ ...base, strike: leg.strike, annualize: true }),
      });
    }
  }
  return out.sort((a, b) => a.expiry.localeCompare(b.expiry));
}

/** P/L realizado por perna (reexport de conveniência p/ integrações). */
export { optionLegRealizedPnl };
