// Ingest de opções (F3): normaliza payloads do bridge Quantower → tipos do app e faz
// dedup de pernas por `quantowerId`. Sem cálculo financeiro (só mapeamento/normalização).
//
// Fonte: DOCS/04_STAGE3_TRADING_OS/06-OPTIONS_BRIDGE_SPEC.md

import type { Greeks, OptionChainQuote, OptionLeg, OptionQuoteSource, OptionRight } from './types';
import { optionQuoteId } from './options';

export interface BridgeChainQuote {
  strike: number;
  right: OptionRight;
  symbol?: string;
  bid?: number | null;
  ask?: number | null;
  last?: number | null;
  iv?: number | null;
  oi?: number | null;
  volume?: number | null;
  greeks?: Greeks | null;
  multiplier?: number;
  at?: string;
}

export interface BridgeChainPayload {
  underlying: string;
  expiry: string;
  spot?: number;
  quotes: BridgeChainQuote[];
}

/** Normaliza uma cadeia do bridge. `multiplier` ausente NÃO vira 100 silencioso: fica
 *  no default do contrato (100) mas é marcado pela UI quando a origem é 'bridge'. */
export function normalizeOptionChain(
  payload: BridgeChainPayload,
  opts?: { source?: OptionQuoteSource },
): OptionChainQuote[] {
  const source = opts?.source ?? 'bridge';
  return (payload.quotes ?? []).map((q) => ({
    id: optionQuoteId(payload.underlying, payload.expiry, q.strike, q.right),
    underlying: payload.underlying,
    expiry: payload.expiry,
    strike: q.strike,
    right: q.right,
    symbol: q.symbol ?? `${payload.underlying}${q.right[0].toUpperCase()}${q.strike}`,
    bid: q.bid ?? null,
    ask: q.ask ?? null,
    last: q.last ?? null,
    iv: q.iv ?? null,
    oi: q.oi ?? null,
    volume: q.volume ?? null,
    greeks: q.greeks ?? null,
    multiplier: q.multiplier ?? 100,
    at: q.at ?? new Date().toISOString(),
    source,
    updatedAt: new Date().toISOString(),
    deviceId: '',
    version: 0,
  }));
}

export interface BridgeOptionPosition {
  platformPositionId: string;
  accountId: string;
  underlying: string;
  symbol?: string;
  right: OptionRight;
  strike: number;
  expiry: string;
  qty: number;
  avgPrice: number;
  multiplier?: number;
  iv?: number | null;
  greeks?: Greeks | null;
}

export interface BridgePositionsPayload {
  positions: BridgeOptionPosition[];
}

/** Normaliza posições do bridge. Id determinístico por `platformPositionId`. */
export function normalizeOptionPositions(payload: BridgePositionsPayload): OptionLeg[] {
  return (payload.positions ?? []).map((p) => ({
    id: `opt_${p.platformPositionId}`,
    accountId: p.accountId,
    underlying: p.underlying,
    symbol: p.symbol ?? `${p.underlying}${p.right[0].toUpperCase()}${p.strike}`,
    right: p.right,
    strike: p.strike,
    expiry: p.expiry,
    qty: p.qty,
    multiplier: p.multiplier ?? 100,
    entryPrice: p.avgPrice,
    entryDatetime: new Date().toISOString(),
    fees: 0,
    ivEntry: p.iv ?? undefined,
    greeksEntry: p.greeks ?? undefined,
    source: 'quantower',
    quantowerId: p.platformPositionId,
    updatedAt: new Date().toISOString(),
    deviceId: '',
    version: 0,
  }));
}

/**
 * Mescla pernas novas com as existentes: casa por `quantowerId` e atualiza no lugar
 * (mantém o id local); o que não casa é adicionado. Nunca duplica posição do bridge.
 */
export function mergeOptionLegs(existing: OptionLeg[], incoming: OptionLeg[]): OptionLeg[] {
  const result = [...existing];
  const indexByQt = new Map<string, number>();
  result.forEach((l, i) => { if (l.quantowerId) indexByQt.set(l.quantowerId, i); });
  for (const inc of incoming) {
    const idx = inc.quantowerId ? indexByQt.get(inc.quantowerId) : undefined;
    if (idx != null) {
      const prev = result[idx];
      result[idx] = { ...prev, ...inc, id: prev.id };
    } else {
      result.push(inc);
      if (inc.quantowerId) indexByQt.set(inc.quantowerId, result.length - 1);
    }
  }
  return result;
}
