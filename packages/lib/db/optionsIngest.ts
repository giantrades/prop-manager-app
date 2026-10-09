// Ingest de opções (F3): normaliza payloads do bridge Quantower → tipos do app e faz
// dedup de pernas por `quantowerId`. Sem cálculo financeiro (só mapeamento/normalização).
//
// Fonte: DOCS/04_STAGE3_TRADING_OS/06-OPTIONS_BRIDGE_SPEC.md

import type { Greeks, OptionChainQuote, OptionLeg, OptionQuoteSource, OptionRight } from './types';
import { optionQuoteId } from './options';

/**
 * Deriva `strike`/`right` do NOME do contrato. O bridge manda o `symbol` cru (a API do
 * Quantower não expõe `Strike` direto) e a derivação fica no app — assim uma variação de
 * nomenclatura é corrigida aqui, sem recompilar o bridge. Best-effort; null se não achar.
 * Formatos cobertos: OCC (`AAPL250117C00150000`), `<strike><C|P>` (`PETR4 40C`) e
 * `<C|P><strike>` (`AAPL C150`, `C00150000`).
 */
export function parseOptionSymbol(name: string): { strike: number; right: OptionRight } | null {
  const s = String(name || '').toUpperCase().replace(/\s+/g, ' ').trim();
  if (!s) return null;
  let m = s.match(/(\d{6})([CP])(\d{8})\b/); // OCC: yymmdd + C/P + strike*1000 (8 díg.)
  if (m) {
    const strike = parseInt(m[3], 10) / 1000;
    if (strike > 0) return { right: m[2] === 'C' ? 'call' : 'put', strike };
  }
  m = s.match(/(\d+(?:[.,]\d+)?)\s*([CP])\b/); // <strike><C|P>
  if (m) {
    const strike = Number(m[1].replace(',', '.'));
    if (strike > 0) return { right: m[2] === 'C' ? 'call' : 'put', strike };
  }
  m = s.match(/\b([CP])\s*(\d+(?:[.,]\d+)?)\b/); // <C|P><strike>
  if (m) {
    let strike = Number(m[2].replace(',', '.'));
    if (strike >= 100000) strike /= 1000;
    if (strike > 0) return { right: m[1] === 'C' ? 'call' : 'put', strike };
  }
  return null;
}

export interface BridgeChainQuote {
  /** Opcional: se ausente, é derivado do `symbol` via `parseOptionSymbol`. */
  strike?: number;
  right?: OptionRight;
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

export interface NormalizeChainOptions {
  source?: OptionQuoteSource;
  /** Multiplier do contrato quando a linha não traz um (ex.: configuração do subjacente). Sem ele, a linha é rejeitada. */
  defaultMultiplier?: number;
}

export interface RejectedRow {
  index: number;
  reason: string;
}

/**
 * Normaliza uma cadeia do bridge. O `multiplier` vem do contrato (linha) ou de
 * `defaultMultiplier` configurado pelo usuário — NUNCA é chutado em 100. Linha sem
 * multiplier válido é rejeitada e listada em `rejected` (a UI avisa).
 */
export function normalizeOptionChainDetailed(
  payload: BridgeChainPayload,
  opts?: NormalizeChainOptions,
): { quotes: OptionChainQuote[]; rejected: RejectedRow[] } {
  const source = opts?.source ?? 'bridge';
  const quotes: OptionChainQuote[] = [];
  const rejected: RejectedRow[] = [];
  (payload.quotes ?? []).forEach((q, index) => {
    const parsed = (typeof q.strike === 'number' && q.strike > 0 && q.right)
      ? { strike: q.strike, right: q.right }
      : parseOptionSymbol(q.symbol ?? '');
    if (!parsed) {
      rejected.push({ index, reason: `strike/right não deriváveis do símbolo (${q.symbol ?? '?'})` });
      return;
    }
    const multiplier = q.multiplier ?? opts?.defaultMultiplier;
    if (!(typeof multiplier === 'number' && multiplier > 0)) {
      rejected.push({ index, reason: `multiplier ausente (${payload.underlying} ${parsed.strike} ${parsed.right})` });
      return;
    }
    quotes.push({
      id: optionQuoteId(payload.underlying, payload.expiry, parsed.strike, parsed.right),
      underlying: payload.underlying,
      expiry: payload.expiry,
      strike: parsed.strike,
      right: parsed.right,
      symbol: q.symbol ?? `${payload.underlying}${parsed.right[0].toUpperCase()}${parsed.strike}`,
      bid: q.bid ?? null,
      ask: q.ask ?? null,
      last: q.last ?? null,
      iv: q.iv ?? null,
      oi: q.oi ?? null,
      volume: q.volume ?? null,
      greeks: q.greeks ?? null,
      multiplier,
      at: q.at ?? new Date().toISOString(),
      source,
      updatedAt: new Date().toISOString(),
      deviceId: '',
      version: 0,
    });
  });
  return { quotes, rejected };
}

/** Versão simples: só as cotações válidas (linhas sem multiplier ficam de fora). */
export function normalizeOptionChain(payload: BridgeChainPayload, opts?: NormalizeChainOptions): OptionChainQuote[] {
  return normalizeOptionChainDetailed(payload, opts).quotes;
}

export interface BridgeOptionPosition {
  platformPositionId: string;
  accountId: string;
  underlying: string;
  symbol?: string;
  /** Opcional: se ausente, derivado do `symbol`. */
  right?: OptionRight;
  strike?: number;
  expiry: string;
  qty: number;
  avgPrice: number;
  multiplier?: number;
  /** Data real de abertura (ISO com offset), se o bridge informar. */
  openedAt?: string;
  iv?: number | null;
  greeks?: Greeks | null;
}

export interface BridgePositionsPayload {
  positions: BridgeOptionPosition[];
}

/**
 * Normaliza posições do bridge. Id determinístico por `platformPositionId`.
 * Multiplier: do contrato ou de `defaultMultiplier`; sem nenhum dos dois a posição é
 * rejeitada (nunca vira 100 silencioso). Sem `openedAt`, a data de entrada é a do
 * primeiro sync — e o merge preserva essa data nos syncs seguintes.
 */
export function normalizeOptionPositionsDetailed(
  payload: BridgePositionsPayload,
  opts?: { defaultMultiplier?: number },
): { legs: OptionLeg[]; rejected: RejectedRow[] } {
  const legs: OptionLeg[] = [];
  const rejected: RejectedRow[] = [];
  (payload.positions ?? []).forEach((p, index) => {
    const parsed = (typeof p.strike === 'number' && p.strike > 0 && p.right)
      ? { strike: p.strike, right: p.right }
      : parseOptionSymbol(p.symbol ?? '');
    if (!parsed) {
      rejected.push({ index, reason: `strike/right não deriváveis (${p.symbol ?? '?'})` });
      return;
    }
    const multiplier = p.multiplier ?? opts?.defaultMultiplier;
    if (!(typeof multiplier === 'number' && multiplier > 0)) {
      rejected.push({ index, reason: `multiplier ausente (${p.underlying} ${parsed.strike} ${parsed.right})` });
      return;
    }
    const now = new Date().toISOString();
    legs.push({
      id: `opt_${p.platformPositionId}`,
      accountId: p.accountId,
      underlying: p.underlying,
      symbol: p.symbol ?? `${p.underlying}${parsed.right[0].toUpperCase()}${parsed.strike}`,
      right: parsed.right,
      strike: parsed.strike,
      expiry: p.expiry,
      qty: p.qty,
      multiplier,
      entryPrice: p.avgPrice,
      entryDatetime: p.openedAt ?? now,
      fees: 0,
      ivEntry: p.iv ?? undefined,
      greeksEntry: p.greeks ?? undefined,
      source: 'quantower',
      quantowerId: p.platformPositionId,
      updatedAt: now,
      deviceId: '',
      version: 0,
    });
  });
  return { legs, rejected };
}

export function normalizeOptionPositions(payload: BridgePositionsPayload, opts?: { defaultMultiplier?: number }): OptionLeg[] {
  return normalizeOptionPositionsDetailed(payload, opts).legs;
}

/**
 * Mescla pernas novas com as existentes: casa por `quantowerId` e atualiza no lugar.
 * Do bridge entram só os campos "de mercado" (qty, preço médio, contrato). Identidade e
 * contexto do usuário — id local, data de entrada, IV/gregas de entrada, grupo,
 * estratégia, tags, taxas e a saída já registrada — são preservados. O que não casa é
 * adicionado. Nunca duplica posição do bridge.
 */
export function mergeOptionLegs(existing: OptionLeg[], incoming: OptionLeg[]): OptionLeg[] {
  const result = [...existing];
  const indexByQt = new Map<string, number>();
  result.forEach((l, i) => { if (l.quantowerId) indexByQt.set(l.quantowerId, i); });
  for (const inc of incoming) {
    const idx = inc.quantowerId ? indexByQt.get(inc.quantowerId) : undefined;
    if (idx != null) {
      const prev = result[idx];
      result[idx] = {
        ...prev,
        accountId: inc.accountId || prev.accountId,
        symbol: inc.symbol || prev.symbol,
        right: inc.right,
        strike: inc.strike,
        expiry: inc.expiry,
        qty: inc.qty,
        multiplier: inc.multiplier,
        entryPrice: inc.entryPrice,
        updatedAt: inc.updatedAt,
        source: 'quantower',
      };
    } else {
      result.push(inc);
      if (inc.quantowerId) indexByQt.set(inc.quantowerId, result.length - 1);
    }
  }
  return result;
}
