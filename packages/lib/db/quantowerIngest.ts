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
  // [PATCH C] MAE/MFE reais do bridge — `maeMfe()` os prefere ao proxy via fills.
  const mae = typeof q.mae === 'number' ? q.mae : undefined;
  const mfe = typeof q.mfe === 'number' ? q.mfe : undefined;
  const resultNet = q.netPnl ?? 0;
  const trade = {
    id: `qt_${q.platformTradeId}`,
    accountId,
    symbol: q.symbol || '',
    direction,
    entryDatetime,
    exitDatetime: q.exitDateTime ?? undefined,
    qty: q.quantity ?? 0,
    entryPrice: q.entryPrice ?? 0,
    exitPrice,
    stopPrice,
    mae,
    mfe,
    multiplier: q.multiplier ?? undefined,
    commission: 0,
    swap: 0,
    rebate: 0,
    fees: q.fee ?? 0,
    source: 'quantower' as const,
    quantowerId: q.platformTradeId,
    // Guarda o id da plataforma para permitir religar a conta depois (relink).
    platformAccountId: q.platformAccountId,
    resultNet,
    resultR: null as number | null,
  };
  // Se o bridge não trouxe netPnl, deriva via fórmula única (para Equity funcionar).
  if (!resultNet && exitPrice != null) {
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

  for (const q of trades) {
    if (!q.platformTradeId) {
      skipped += 1;
      continue;
    }
    // Resolve conta interna pelo platformAccountId.
    let accountId: string | undefined;
    if (q.platformAccountId) {
      const matches = await ds.accounts.byPlatformAccountId(q.platformAccountId);
      accountId = matches[0]?.id;
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
      const changed = ['symbol', 'direction', 'qty', 'entryPrice', 'exitPrice', 'entryDatetime',
        'exitDatetime', 'resultNet', 'stopPrice', 'accountId', 'mae', 'mfe']
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
