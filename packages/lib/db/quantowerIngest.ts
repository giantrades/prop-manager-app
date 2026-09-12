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
    multiplier: q.multiplier ?? undefined,
    commission: 0,
    swap: 0,
    rebate: 0,
    fees: q.fee ?? 0,
    source: 'quantower' as const,
    quantowerId: q.platformTradeId,
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
    const existing = await ds.trades.byQuantowerId(q.platformTradeId);
    if (existing.length > 0) {
      const merged: Trade = { ...existing[0], ...trade, id: existing[0].id };
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
      created += 1;
    }
  }

  ds.bus.emit('quantower:synced' as any, {
    count: created + updated,
    lastSync: nowIso(),
    accountIds: [],
  });

  return { created, updated, skipped };
}
