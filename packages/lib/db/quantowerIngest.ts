// STAGE 11 — quantowerIngest. Normaliza trades da Quantower (bridge v2) para o schema
// app-db v3 (Trade) e ingere via DataService/DataChainEngine (único writer).
// Dedup por `quantowerId` (índice único). Fórmulas só do motor (`tradePnl`).

import type { DataService } from './DataService';
import type { DataChainEngine } from './DataChainEngine';
import { nowIso } from './dateUtils';
import { tradePnl, tradeR } from './financialFormulas';
import type { Trade, TradeDirection } from './types';

/** Trade normalizado pelo QuantowerAdapter (bridge v2). */
export interface QuantowerTrade {
  platformTradeId: string;
  symbol: string;
  side: string; // 'Long' | 'Short'
  quantity: number;
  entryPrice: number;
  exitPrice?: number;
  entryDateTime?: string | null;
  exitDateTime?: string | null;
  stopPrice?: number | null;
  takePrice?: number | null;
  /** [PATCH C] MAE/MFE em $ vindos do bridge (excursão sobre os fills). */
  mae?: number | null;
  mfe?: number | null;
  multiplier?: number | null;
  /** Valor do ponto/contrato (contract size) — v2.1.0 do bridge. Preferido p/ o R. */
  contractSize?: number | null;
  grossPnl?: number;
  netPnl?: number;
  fee?: number;
  platformAccountId?: string;
  accountName?: string;
  connectionId?: string;
  connectionName?: string;
}

export interface IngestResult {
  created: number;
  updated: number;
  skipped: number;
}

// Trades que o usuário APAGOU: guardamos a "lápide" (id da plataforma ou impressão
// digital) para o sync NÃO reimportar o que foi excluído de propósito.
const DELETED_TRADES_KEY = 'bridge:deletedTrades';

export function tradeFingerprint(t: { symbol?: string; entryDatetime?: string; exitDatetime?: string; qty?: number; entryPrice?: number; exitPrice?: number }): string {
  return `${t.symbol ?? ''}|${t.entryDatetime ?? ''}|${t.exitDatetime ?? ''}|${t.qty ?? ''}|${t.entryPrice ?? ''}|${t.exitPrice ?? ''}`;
}

export async function getDeletedTradeKeys(ds: DataService): Promise<Set<string>> {
  try {
    const rec = await ds.meta.getKey(DELETED_TRADES_KEY);
    return new Set(Array.isArray(rec?.value) ? (rec.value as string[]) : []);
  } catch {
    return new Set();
  }
}

/** Registra lápides de trades excluídos (id da plataforma e/ou impressão digital). */
export async function rememberDeletedTrades(ds: DataService, keys: string[]): Promise<void> {
  const cur = await getDeletedTradeKeys(ds);
  for (const k of keys) if (k) cur.add(k);
  try {
    await ds.meta.setKey(DELETED_TRADES_KEY, [...cur].slice(-5000));
  } catch {
    /* noop */
  }
}

/** Limpa o histórico de exclusão: um próximo sync pode reimportar tudo novamente. */
export async function clearDeletedTrades(ds: DataService): Promise<void> {
  try {
    await ds.meta.setKey(DELETED_TRADES_KEY, []);
  } catch {
    /* noop */
  }
}

/**
 * Mapeia um trade Quantower para o schema app-db v3 (Trade). O `id` é prefixado
 * `qt_` (nunca colide com UUID manual). `resultNet` usa o `netPnl` do bridge; `fees`
 * recebe a `fee` da plataforma.
 */
export function quantowerToTrade(q: QuantowerTrade, accountId?: string): Omit<Trade, 'updatedAt' | 'deviceId' | 'version'> {
  const direction: TradeDirection = (q.side || '').toLowerCase() === 'short' ? 'short' : 'long';
  const entryDatetime = q.entryDateTime ?? nowIso();
  const exitPrice = q.exitPrice && q.exitPrice !== 0 ? q.exitPrice : undefined;
  const stopPrice = q.stopPrice != null && q.stopPrice !== 0 ? q.stopPrice : undefined;
  const takePrice = q.takePrice != null && q.takePrice !== 0 ? q.takePrice : undefined;
  const entryPrice = q.entryPrice ?? 0;
  const qty = q.quantity ?? 0;
  // CONTRACT SIZE (multiplier): o bridge não envia. Deriva do dinheiro que a PLATAFORMA
  // reportou → grossPnl / (variação de preço × qty). Sem isso, o R (e o fallback de PnL)
  // ficava errado por um fator fixo em futuros (MNQ ×2, MES ×5, NQ ×20, ES ×50…).
  const multiplier = (() => {
    if (typeof q.multiplier === 'number' && Number.isFinite(q.multiplier) && q.multiplier > 0) return q.multiplier;
    // v2.1.0: o bridge já manda o valor do ponto calculado no lado dele.
    if (typeof q.contractSize === 'number' && Number.isFinite(q.contractSize) && q.contractSize > 0) return q.contractSize;
    const gross = Number(q.grossPnl);
    if (!Number.isFinite(gross) || gross === 0 || exitPrice == null || qty === 0) return undefined;
    const dirSign = direction === 'short' ? -1 : 1;
    const denom = (exitPrice - entryPrice) * dirSign * qty;
    if (!Number.isFinite(denom) || Math.abs(denom) < 1e-9) return undefined;
    const m = Math.abs(gross / denom);
    if (!Number.isFinite(m) || m <= 0) return undefined;
    const snapped = Math.abs(m - Math.round(m)) < 0.02 ? Math.round(m) : m; // 1.9998 → 2
    return Number(snapped.toFixed(4));
  })();
  // [PATCH C] MAE/MFE reais do bridge — `maeMfe()` os prefere ao proxy via fills.
  const mae = typeof q.mae === 'number' ? q.mae : undefined;
  const mfe = typeof q.mfe === 'number' ? q.mfe : undefined;
  // `hasNet`: a plataforma REPORTou o PnL (mesmo 0 = breakeven). Sem isso, um 0 real
  // era sobrescrito pela fórmula (que pode errar sem o multiplier) — e o valor errado
  // ficava gravado, contaminando todos os widgets.
  // Fee/Swap são CUSTO: guarda em módulo. Algumas conexões mandam negativo e, se o sinal
  // escapar, o net fica `gross + |fee|` (prejuízo menor do que é).
  const fees = Math.abs(Number(q.fee) || 0);
  const hasNet = typeof q.netPnl === 'number' && Number.isFinite(q.netPnl);
  // NET preferido = o que a plataforma ganhou/perdeu: gross (dinheiro) − custos.
  // O `netPnl` do bridge é uma RECOMPUTAÇÃO dos fills; se o sinal da fee escapar (DLL
  // antiga) ele vem errado — então, quando temos o gross, usamos gross − |fees|.
  let resultNet = hasNet ? (q.netPnl as number) : 0;
  // Só usa a via do gross quando ele é um número REALMENTE informado (≠ 0). O adapter
  // preenche 0 quando o bridge não manda — e usar isso como base sobrescreveria um net bom.
  const hasGross = typeof q.grossPnl === 'number' && Number.isFinite(q.grossPnl) && q.grossPnl !== 0;
  if (hasGross) {
    const expected = Number((((q.grossPnl as number) - fees)).toFixed(2));
    resultNet = Math.abs((hasNet ? (q.netPnl as number) : expected) - expected) < 0.02
      ? (hasNet ? (q.netPnl as number) : expected)
      : expected; // bridge inconsistente (fee somada com sinal errado) → usa gross − |fees|
  }
  const trade = {
    id: `qt_${q.platformTradeId}`,
    accountId,
    symbol: q.symbol || '',
    direction,
    entryDatetime,
    exitDatetime: q.exitDateTime ?? undefined,
    qty,
    entryPrice,
    exitPrice,
    stopPrice,
    takePrice,
    mae,
    mfe,
    multiplier,
    commission: 0,
    swap: 0,
    rebate: 0,
    fees,
    source: 'quantower' as const,
    quantowerId: q.platformTradeId,
    // Guarda o id da plataforma para permitir religar a conta depois (relink).
    platformAccountId: q.platformAccountId,
    resultNet,
    resultR: null as number | null,
  };
  // Se o bridge NÃO trouxe netPnl, deriva via fórmula única (para Equity funcionar).
  if (!hasNet && exitPrice != null) {
    const computed = tradePnl(trade as Trade);
    if (computed !== 0) trade.resultNet = Number(computed.toFixed(2));
  }
  // R via fórmula única quando o bridge expôs o stop (PATCH B no bridge).
  if (stopPrice != null && exitPrice != null) {
    const r = tradeR(trade as Trade, { stopPrice });
    if (r != null) trade.resultR = r;
  }
  return trade;
}

export interface PruneResult {
  removed: number;
  scanned: number;
}

/**
 * Remove do app os trades de ponte que a PLATAFORMA não devolve mais (dentro da janela
 * lida) — os "fantasma" de conexões/contas antigas que ficaram gravados e poluíam
 * calendário/heat/review. Segurança: só considera trades de origem `quantower` (ou com
 * `quantowerId`) e só dentro da janela (`sinceIso`), para nunca apagar histórico que a
 * ponte não lê por limite de período. Grava lápide (senão o próximo sync reimporta).
 */
export async function pruneUnknownTrades(
  ds: DataService,
  chain: DataChainEngine,
  bridgeTrades: QuantowerTrade[],
  sinceIso: string,
): Promise<PruneResult> {
  const knownId = new Set<string>();
  const knownFp = new Set<string>();
  for (const q of bridgeTrades) {
    if (q.platformTradeId) knownId.add(q.platformTradeId);
    knownFp.add(tradeFingerprint(quantowerToTrade(q) as Trade));
  }
  const since = Date.parse(sinceIso);
  const all = await ds.trades.list();
  const victims = all.filter((t) => {
    if (t.source !== 'quantower' && !t.quantowerId) return false;
    const stamp = t.exitDatetime || t.entryDatetime;
    if (!stamp || !Number.isFinite(since) || Date.parse(stamp) < since) return false;
    if (t.quantowerId && knownId.has(t.quantowerId)) return false;
    if (knownFp.has(tradeFingerprint(t))) return false;
    return true;
  });
  if (victims.length === 0) return { removed: 0, scanned: all.length };
  const keys: string[] = [];
  for (const t of victims) {
    if (t.quantowerId) keys.push(t.quantowerId);
    keys.push(tradeFingerprint(t));
  }
  await rememberDeletedTrades(ds, keys);
  for (const t of victims) {
    try {
      await chain.deleteTrade(t.id);
    } catch {
      /* ledger: segue para o remove */
    }
    await ds.trades.remove(t.id);
  }
  return { removed: victims.length, scanned: all.length };
}

/**
 * Ingere trades Quantower no app-db v3. Resolve `accountId` por `platformAccountId`
 * (quando a conta interna tem o mapeamento); senão deixa sem conta (UI mostra como
 * "sem conta" para mapear). Emite `quantower:synced` no final.
 */
export async function ingestQuantowerTrades(
  ds: DataService,
  chain: DataChainEngine,
  trades: QuantowerTrade[],
): Promise<IngestResult> {
  let created = 0;
  let updated = 0;
  let skipped = 0;

  // Dedup: por `quantowerId` E por impressão digital (símbolo+entrada+saída+qtd+preços).
  // A impressão digital evita duplicar quando o id do bridge muda entre leituras.
  const fpOf = tradeFingerprint;
  // Lápides: nunca reimportar trade que o usuário apagou.
  const deleted = await getDeletedTradeKeys(ds);
  const existingAll = await ds.trades.list();
  const byQt = new Map<string, Trade>();
  const byFp = new Map<string, Trade>();
  for (const t of existingAll) {
    if (t.quantowerId) byQt.set(t.quantowerId, t);
    byFp.set(fpOf(t), t);
  }

  // Sanidade: nunca ingerir "fantasma". Sem entrada, sem saída (não é trade fechado)
  // ou com data absurdamente no futuro → fora (eram os trades "de amanhã" sem conta
  // que poluíam heat/calendário).
  const farFuture = Date.now() + 24 * 3600 * 1000;
  const isFuture = (v?: string | null) => {
    if (!v) return false;
    const ts = Date.parse(v);
    return Number.isFinite(ts) && ts > farFuture;
  };

  for (const q of trades) {
    if (!q.platformTradeId) {
      skipped += 1;
      continue;
    }
    if (!q.entryDateTime || isFuture(q.entryDateTime) || isFuture(q.exitDateTime)) {
      skipped += 1;
      continue;
    }
    if (!q.exitDateTime && !(typeof q.exitPrice === 'number' && q.exitPrice > 0)) {
      skipped += 1;
      continue;
    }
    // Resolve conta interna pelo platformAccountId (prefere conta ATIVA: uma conta
    // desabilitada não deve receber trades novos; histórico antigo continua ligado).
    let accountId: string | undefined;
    if (q.platformAccountId) {
      const matches = await ds.accounts.byPlatformAccountId(q.platformAccountId);
      accountId = (matches.find((a) => !a.disabled) ?? matches[0])?.id;
    }

    const trade = quantowerToTrade(q, accountId);
    const fp = fpOf(trade);
    if (deleted.has(q.platformTradeId) || deleted.has(fp)) {
      skipped += 1;
      continue;
    }
    const existing = byQt.get(q.platformTradeId) ?? byFp.get(fp);
    if (existing) {
      // Preserva MAE/MFE já conhecidos quando o bridge desta rodada não os enviou.
      const merged: Trade = {
        ...existing,
        ...trade,
        id: existing.id,
        mae: trade.mae ?? existing.mae,
        mfe: trade.mfe ?? existing.mfe,
      };
      // Nada mudou? Não reescreve (evita churn/sync desnecessário em janelas de overlap).
      // `multiplier`/`resultR` entram na comparação: um re-sync passa a CORRIGIR o R
      // dos trades que já estavam gravados com o multiplier errado.
      const changed = ['symbol', 'direction', 'qty', 'entryPrice', 'exitPrice', 'entryDatetime',
        'exitDatetime', 'resultNet', 'fees', 'stopPrice', 'takePrice', 'accountId', 'mae', 'mfe', 'multiplier', 'resultR']
        .some((k) => (existing as unknown as Record<string, unknown>)[k] !== (merged as unknown as Record<string, unknown>)[k]);
      byQt.set(q.platformTradeId, merged);
      byFp.set(fpOf(merged), merged);
      if (!changed) {
        skipped += 1;
        continue;
      }
      await ds.trades.put(merged, { source: 'quantower' });
      await chain.syncTrade(merged);
      updated += 1;
    } else {
      // put() carimba updatedAt/deviceId/version; os campos abaixo são sobrescritos lá.
      const rec = await ds.trades.put(
        { ...trade, updatedAt: nowIso(), deviceId: ds.deviceId, version: 0 } as Trade,
        { source: 'quantower' },
      );
      await chain.syncTrade(rec);
      byQt.set(q.platformTradeId, rec);
      byFp.set(fpOf(rec), rec);
      created += 1;
    }
  }

  // Sync Center — resumo do último run (para a página do Quantower).
  try {
    await ds.meta.setKey('qt:lastRun', {
      at: nowIso(),
      created,
      updated,
      skipped,
      total: created + updated + skipped,
    });
  } catch {
    /* noop */
  }

  ds.bus.emit('quantower:synced' as any, {
    count: created + updated,
    lastSync: nowIso(),
    accountIds: [],
  });

  return { created, updated, skipped };
}
