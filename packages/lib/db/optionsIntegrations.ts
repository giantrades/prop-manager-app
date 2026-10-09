// Integrações de opções (F4): prêmio no ledger, assignment → Position, exposição,
// cobertura e vencimentos. Fórmulas SÓ de `financialFormulas.ts` (§ Opções).
//
// Fonte: DOCS/10_MODULES/options/00-spec.md (F4).

import type { DataService } from './DataService';
import type { Greeks, OptionLeg, OptionRight, Position, Transaction } from './types';
import {
  assignmentCallProceeds,
  assignmentPutCostBasis,
  netOptionGreeks,
  optionLegRealizedPnl,
  optionNetPremium,
  type OptionMarketPoint,
} from './financialFormulas';
import { groupOptionLegs } from './options';

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

/** P/L realizado por perna (reexport de conveniência p/ integrações). */
export { optionLegRealizedPnl };
