// STAGE 8 — Opções (Options Analytics). Domínio: templates de estratégia, agrupamento
// de pernas, resumo (payoff/gregas/breakevens) e preparação de assignment.
// As FÓRMULAS vivem em `financialFormulas.ts` (§ Opções) — aqui só composição.
//
// Fonte: DOCS/10_MODULES/options/00-spec.md

import type {
  Greeks,
  OptionChainQuote,
  OptionLeg,
  OptionRight,
  OptionSource,
  OptionStrategyTemplate,
  OptionTemplateCategory,
} from './types';
import {
  netOptionGreeks,
  optionBreakevens,
  optionLegRealizedPnl,
  optionMaxProfitLoss,
  optionNetPremium,
  optionPayoffCurve,
  type OptionMarketPoint,
  type PayoffPoint,
} from './financialFormulas';
import { parseDate } from './dateUtils';

function newId(prefix: string): string {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${rnd}`;
}

/** Id determinístico de uma linha da cadeia. */
export function optionQuoteId(
  underlying: string,
  expiry: string,
  strike: number,
  right: OptionRight,
): string {
  return `${underlying}:${expiry}:${strike}:${right}`;
}

/** Dias corridos até o vencimento (mínimo 0). */
export function optionDaysToExpiry(expiry: string, now: Date = new Date()): number {
  const ms = parseDate(expiry).getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / 86400000));
}

/** Strike mais próximo do preço à vista dentre as cotações. */
export function nearestStrike(quotes: OptionChainQuote[], spot: number): number | null {
  const strikes = [...new Set(quotes.map((q) => q.strike))].sort((a, b) => a - b);
  if (strikes.length === 0) return null;
  return strikes.reduce((best, s) => (Math.abs(s - spot) < Math.abs(best - spot) ? s : best), strikes[0]);
}

export interface BuildLegOpts {
  accountId: string;
  qty: number; // + long / − short
  entryDatetime?: string;
  entryPrice?: number; // default = mid da cotação (bid/ask); cai no last
  groupId?: string;
  strategyId?: string;
  fees?: number;
  multiplier?: number;
  source?: OptionSource;
  quantowerId?: string;
}

/** Cria uma `OptionLeg` a partir de uma linha da cadeia (paper ou ordem real). */
export function buildOptionLegFromQuote(quote: OptionChainQuote, opts: BuildLegOpts): OptionLeg {
  const mid =
    quote.bid != null && quote.ask != null
      ? (quote.bid + quote.ask) / 2
      : quote.last ?? quote.ask ?? quote.bid ?? 0;
  return {
    id: newId('leg'),
    accountId: opts.accountId,
    underlying: quote.underlying,
    symbol: quote.symbol,
    right: quote.right,
    strike: quote.strike,
    expiry: quote.expiry,
    qty: opts.qty,
    multiplier: opts.multiplier ?? quote.multiplier ?? 100,
    entryPrice: opts.entryPrice ?? mid,
    entryDatetime: opts.entryDatetime ?? new Date().toISOString(),
    fees: opts.fees ?? 0,
    ivEntry: quote.iv ?? undefined,
    greeksEntry: quote.greeks ?? undefined,
    groupId: opts.groupId,
    strategyId: opts.strategyId,
    source: opts.source ?? 'manual',
    quantowerId: opts.quantowerId,
    updatedAt: new Date().toISOString(),
    deviceId: '',
    version: 0,
  };
}

export type OptionStrategyKind =
  | 'single-call'
  | 'single-put'
  | 'vertical'
  | 'straddle'
  | 'strangle'
  | 'condor'
  | 'butterfly'
  | 'calendar'
  | 'custom';

export interface OptionStrategyGroup {
  id: string;
  underlying: string;
  legs: OptionLeg[];
  kind: OptionStrategyKind;
  open: boolean;
  netPremium: number;
  realizedPnl: number;
  hasShortCall: boolean;
  hasShortPut: boolean;
}

function classifyGroup(legs: OptionLeg[]): OptionStrategyKind {
  const calls = legs.filter((l) => l.right === 'call');
  const puts = legs.filter((l) => l.right === 'put');
  const strikes = new Set(legs.map((l) => l.strike));
  const expiries = new Set(legs.map((l) => l.expiry));
  if (legs.length === 2 && expiries.size === 2 && calls.length + puts.length === 2) return 'calendar';
  if (legs.length === 1) return legs[0].right === 'call' ? 'single-call' : 'single-put';
  if (legs.length === 2 && (calls.length === 2 || puts.length === 2) && strikes.size === 2) return 'vertical';
  if (legs.length === 2 && calls.length === 1 && puts.length === 1) {
    return strikes.size === 1 ? 'straddle' : 'strangle';
  }
  if (legs.length === 4) {
    if (calls.length === 2 && puts.length === 2) return strikes.size === 3 ? 'butterfly' : 'condor';
    return 'butterfly';
  }
  if (legs.length === 3) return 'butterfly';
  return 'custom';
}

/**
 * Agrupa pernas por `groupId` (perna sem grupo = grupo próprio). Estratégias/posições
 * são SEMPRE derivadas — nunca duplicadas em store.
 */
export function groupOptionLegs(legs: OptionLeg[]): OptionStrategyGroup[] {
  const map = new Map<string, OptionLeg[]>();
  for (const leg of legs) {
    const key = leg.groupId || `single:${leg.id}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(leg);
  }
  const groups: OptionStrategyGroup[] = [];
  for (const [id, groupLegs] of map) {
    const realizedPnl = Number(
      groupLegs.reduce((s, l) => s + (optionLegRealizedPnl(l) ?? 0), 0).toFixed(6),
    );
    groups.push({
      id,
      underlying: groupLegs[0]?.underlying ?? '',
      legs: groupLegs,
      kind: classifyGroup(groupLegs),
      open: groupLegs.some((l) => l.exitPrice == null),
      netPremium: optionNetPremium(groupLegs),
      realizedPnl,
      hasShortCall: groupLegs.some((l) => l.right === 'call' && l.qty < 0),
      hasShortPut: groupLegs.some((l) => l.right === 'put' && l.qty < 0),
    });
  }
  return groups.sort((a, b) => a.underlying.localeCompare(b.underlying) || a.id.localeCompare(b.id));
}

export interface OptionSummaryInput {
  S: number;
  r: number;
  q?: number;
  now?: Date;
  rangePct?: number; // ex. 0.5 => +/-50% do spot
  points?: number;
}

export interface OptionStrategySummary {
  netPremium: number;
  realizedPnl: number;
  maxProfit: number;
  maxLoss: number;
  maxProfitUnbounded: boolean;
  maxLossUnbounded: boolean;
  breakevens: number[];
  greeks: Greeks;
  deltaNotional: number;
  payoff: PayoffPoint[];
}

/**
 * Resumo da estratégia: prêmio, P/L realizado, máx lucro/perda, breakevens, gregas
 * líquidas, Δ-notional e a curva de payoff (para o gráfico do Analyzer).
 */
export function summarizeOptionStrategy(
  legs: OptionLeg[],
  input: OptionSummaryInput,
): OptionStrategySummary {
  const rangePct = input.rangePct ?? 0.5;
  const min = Math.max(0.0001, input.S * (1 - rangePct));
  const max = input.S * (1 + rangePct);
  const maxPL = optionMaxProfitLoss(legs, { min, max });
  const market: OptionMarketPoint = { S: input.S, r: input.r, q: input.q, now: input.now };
  const greeks = netOptionGreeks(legs, market);
  return {
    netPremium: optionNetPremium(legs),
    realizedPnl: Number(legs.reduce((s, l) => s + (optionLegRealizedPnl(l) ?? 0), 0).toFixed(6)),
    maxProfit: maxPL.maxProfit,
    maxLoss: maxPL.maxLoss,
    maxProfitUnbounded: maxPL.maxProfitUnbounded,
    maxLossUnbounded: maxPL.maxLossUnbounded,
    breakevens: optionBreakevens(legs, { min, max }),
    greeks,
    deltaNotional: Number((Math.abs(greeks.delta) * input.S).toFixed(2)),
    payoff: optionPayoffCurve(legs, { min, max, points: input.points ?? 121 }),
  };
}

/** Prêmios realizados por mês (`YYYY-MM`) — base do widget de renda. */
export function optionIncomeByMonth(legs: OptionLeg[]): Array<{ month: string; premium: number; legs: number }> {
  const map = new Map<string, { premium: number; legs: number }>();
  for (const leg of legs) {
    const stamp = leg.exitDatetime || leg.entryDatetime;
    if (!stamp) continue;
    const month = stamp.slice(0, 7);
    const entry = map.get(month) ?? { premium: 0, legs: 0 };
    entry.premium += optionLegRealizedPnl(leg) ?? 0;
    entry.legs += 1;
    map.set(month, entry);
  }
  return [...map.entries()]
    .map(([month, v]) => ({ month, premium: Number(v.premium.toFixed(2)), legs: v.legs }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

// ---------------------------------------------------------------------------
// 37 templates de estratégia (4 categorias, inspirados no Quantower/OptionStrat).
// `strikeOffset`: 'atm' ou nº de passos do grid (ex.: +1 = um strike acima do ATM).
// ---------------------------------------------------------------------------

const t = (
  id: string,
  name: string,
  category: OptionTemplateCategory,
  legs: OptionStrategyTemplate['legs'],
  description: string,
): OptionStrategyTemplate => ({ id, name, category, legs, description });

export const DEFAULT_OPTION_TEMPLATES: OptionStrategyTemplate[] = [
  // Up Trend (9)
  t('long-call', 'Long Call', 'up', [{ right: 'call', qty: 1, strikeOffset: 'atm' }], 'Alta com risco limitado ao débito.'),
  t('bull-call-spread', 'Bull Call Spread', 'up', [{ right: 'call', qty: 1, strikeOffset: 'atm' }, { right: 'call', qty: -1, strikeOffset: 1 }], 'Alta com custo menor e lucro capado.'),
  t('bull-put-spread', 'Bull Put Spread', 'up', [{ right: 'put', qty: -1, strikeOffset: 'atm' }, { right: 'put', qty: 1, strikeOffset: -1 }], 'Crédito com viés de alta.'),
  t('covered-call', 'Covered Call', 'up', [{ right: 'call', qty: -1, strikeOffset: 1 }], 'Renda sobre ações que você possui.'),
  t('cash-secured-put', 'Cash-Secured Put', 'up', [{ right: 'put', qty: -1, strikeOffset: -1 }], 'Renda vendendo put com caixa reservado.'),
  t('synthetic-long', 'Synthetic Long', 'up', [{ right: 'call', qty: 1, strikeOffset: 'atm' }, { right: 'put', qty: -1, strikeOffset: 'atm' }], 'Long sintético (mesmo strike).'),
  t('risk-reversal', 'Risk Reversal', 'up', [{ right: 'call', qty: 1, strikeOffset: 1 }, { right: 'put', qty: -1, strikeOffset: -1 }], 'Compra call financiada pela venda de put.'),
  t('call-ratio-backspread', 'Call Ratio Backspread', 'up', [{ right: 'call', qty: 1, strikeOffset: 'atm' }, { right: 'call', qty: -2, strikeOffset: 1 }], 'Explosão de alta com crédito/baixo custo.'),
  t('collar', 'Collar', 'up', [{ right: 'put', qty: 1, strikeOffset: -1 }, { right: 'call', qty: -1, strikeOffset: 1 }], 'Protege a ação com custo financiado pela call.'),

  // Down Trend (8)
  t('long-put', 'Long Put', 'down', [{ right: 'put', qty: 1, strikeOffset: 'atm' }], 'Queda com risco limitado ao débito.'),
  t('bear-put-spread', 'Bear Put Spread', 'down', [{ right: 'put', qty: 1, strikeOffset: 'atm' }, { right: 'put', qty: -1, strikeOffset: -1 }], 'Queda com custo menor e lucro capado.'),
  t('bear-call-spread', 'Bear Call Spread', 'down', [{ right: 'call', qty: -1, strikeOffset: 'atm' }, { right: 'call', qty: 1, strikeOffset: 1 }], 'Crédito com viés de queda.'),
  t('synthetic-short', 'Synthetic Short', 'down', [{ right: 'call', qty: -1, strikeOffset: 'atm' }, { right: 'put', qty: 1, strikeOffset: 'atm' }], 'Short sintético (mesmo strike).'),
  t('put-ratio-backspread', 'Put Ratio Backspread', 'down', [{ right: 'put', qty: 1, strikeOffset: 'atm' }, { right: 'put', qty: -2, strikeOffset: -1 }], 'Explosão de baixa com crédito/baixo custo.'),
  t('naked-call', 'Naked Call', 'down', [{ right: 'call', qty: -1, strikeOffset: 1 }], 'Venda descoberta de call (risco ilimitado).'),
  t('naked-put', 'Naked Put', 'down', [{ right: 'put', qty: -1, strikeOffset: -1 }], 'Venda descoberta de put (risco alto).'),
  t('put-calendar', 'Put Calendar', 'down', [{ right: 'put', qty: -1, strikeOffset: 'atm' }, { right: 'put', qty: 1, strikeOffset: 'atm' }], 'Calendário de put (vender perto, comprar longe).'),

  // Volatility Based (13)
  t('long-straddle', 'Long Straddle', 'vol', [{ right: 'call', qty: 1, strikeOffset: 'atm' }, { right: 'put', qty: 1, strikeOffset: 'atm' }], 'Aposta em movimento forte (qualquer lado).'),
  t('long-strangle', 'Long Strangle', 'vol', [{ right: 'call', qty: 1, strikeOffset: 1 }, { right: 'put', qty: 1, strikeOffset: -1 }], 'Movimento forte com custo menor.'),
  t('short-straddle', 'Short Straddle', 'vol', [{ right: 'call', qty: -1, strikeOffset: 'atm' }, { right: 'put', qty: -1, strikeOffset: 'atm' }], 'Venda de vol com risco de cauda.'),
  t('short-strangle', 'Short Strangle', 'vol', [{ right: 'call', qty: -1, strikeOffset: 1 }, { right: 'put', qty: -1, strikeOffset: -1 }], 'Venda de vol com banda larga.'),
  t('iron-condor', 'Iron Condor', 'vol', [{ right: 'put', qty: -1, strikeOffset: -1 }, { right: 'put', qty: 1, strikeOffset: -2 }, { right: 'call', qty: -1, strikeOffset: 1 }, { right: 'call', qty: 1, strikeOffset: 2 }], 'Renda em mercado lateral (risco definido).'),
  t('iron-butterfly', 'Iron Butterfly', 'vol', [{ right: 'put', qty: -1, strikeOffset: -1 }, { right: 'put', qty: 1, strikeOffset: 'atm' }, { right: 'call', qty: -1, strikeOffset: 'atm' }, { right: 'call', qty: 1, strikeOffset: 1 }], 'Crédito ATM com risco definido.'),
  t('long-call-butterfly', 'Long Call Butterfly', 'vol', [{ right: 'call', qty: 1, strikeOffset: -1 }, { right: 'call', qty: -2, strikeOffset: 'atm' }, { right: 'call', qty: 1, strikeOffset: 1 }], 'Aposta no pin do strike ATM.'),
  t('long-put-butterfly', 'Long Put Butterfly', 'vol', [{ right: 'put', qty: 1, strikeOffset: 1 }, { right: 'put', qty: -2, strikeOffset: 'atm' }, { right: 'put', qty: 1, strikeOffset: -1 }], 'Borboleta de put.'),
  t('short-call-butterfly', 'Short Call Butterfly', 'vol', [{ right: 'call', qty: -1, strikeOffset: -1 }, { right: 'call', qty: 2, strikeOffset: 'atm' }, { right: 'call', qty: -1, strikeOffset: 1 }], 'Inverso da borboleta de call (venda de pin).'),
  t('short-put-butterfly', 'Short Put Butterfly', 'vol', [{ right: 'put', qty: -1, strikeOffset: 1 }, { right: 'put', qty: 2, strikeOffset: 'atm' }, { right: 'put', qty: -1, strikeOffset: -1 }], 'Inverso da borboleta de put.'),
  t('call-broken-wing', 'Call Broken Wing Butterfly', 'vol', [{ right: 'call', qty: 1, strikeOffset: -1 }, { right: 'call', qty: -2, strikeOffset: 'atm' }, { right: 'call', qty: 1, strikeOffset: 2 }], 'Asa quebrada para crédito/risco assimétrico.'),
  t('put-broken-wing', 'Put Broken Wing Butterfly', 'vol', [{ right: 'put', qty: 1, strikeOffset: 1 }, { right: 'put', qty: -2, strikeOffset: 'atm' }, { right: 'put', qty: 1, strikeOffset: -2 }], 'Asa quebrada de put.'),
  t('double-diagonal', 'Double Diagonal', 'vol', [{ right: 'put', qty: -1, strikeOffset: -1 }, { right: 'put', qty: 1, strikeOffset: 'atm' }, { right: 'call', qty: -1, strikeOffset: 1 }, { right: 'call', qty: 1, strikeOffset: 'atm' }], 'Condor com vencimentos diferentes.'),

  // Arbitrage (7)
  t('call-calendar', 'Call Calendar', 'arb', [{ right: 'call', qty: -1, strikeOffset: 'atm' }, { right: 'call', qty: 1, strikeOffset: 'atm' }], 'Calendário de call (vender perto, comprar longe).'),
  t('box', 'Box Spread', 'arb', [{ right: 'call', qty: 1, strikeOffset: 'atm' }, { right: 'call', qty: -1, strikeOffset: 2 }, { right: 'put', qty: 1, strikeOffset: 2 }, { right: 'put', qty: -1, strikeOffset: 'atm' }], 'Caixa de juros (slope conhecido).'),
  t('conversion', 'Conversion', 'arb', [{ right: 'put', qty: -1, strikeOffset: 'atm' }, { right: 'call', qty: 1, strikeOffset: 'atm' }], 'Long stock + synth short (conversão).'),
  t('reversal', 'Reversal', 'arb', [{ right: 'put', qty: 1, strikeOffset: 'atm' }, { right: 'call', qty: -1, strikeOffset: 'atm' }], 'Short stock + synth long (reversão).'),
  t('jelly-roll', 'Jelly Roll', 'arb', [{ right: 'call', qty: -1, strikeOffset: 'atm' }, { right: 'put', qty: 1, strikeOffset: 'atm' }, { right: 'call', qty: 1, strikeOffset: 'atm' }, { right: 'put', qty: -1, strikeOffset: 'atm' }], 'Roll de calendário sintético (mesmo strike).'),
  t('christmas-tree', 'Christmas Tree', 'arb', [{ right: 'call', qty: 1, strikeOffset: 'atm' }, { right: 'call', qty: -1, strikeOffset: 1 }, { right: 'call', qty: -1, strikeOffset: 2 }], 'Borboleta assimétrica (ratio 1-1-2).'),
  t('skip-strike-butterfly', 'Skip-Strike Butterfly', 'arb', [{ right: 'call', qty: 1, strikeOffset: -1 }, { right: 'call', qty: -2, strikeOffset: 1 }, { right: 'call', qty: 1, strikeOffset: 3 }], 'Borboleta com strike central saltado.'),
];

export function optionTemplatesByCategory(category: OptionTemplateCategory): OptionStrategyTemplate[] {
  return DEFAULT_OPTION_TEMPLATES.filter((x) => x.category === category);
}
