// F5 — ctraderIngest. Normaliza trades do cTrader (adapter `ctraderAdapter.js`,
// deals normalizados) para o schema app-db v3 (Trade) e ingere via
// DataService/DataChainEngine (único writer). Template de `quantowerIngest.ts`.
//
// Dedup por primary-key `ct_<platformTradeId>` (get direto, sem índice novo —
// o índice único `quantowerId` é exclusivo do Quantower). `platformTradeId`
// guarda o id original da plataforma. Fórmulas só do motor (`tradePnl`).

import type { DataService } from './DataService';
import type { DataChainEngine } from './DataChainEngine';
import { nowIso } from './dateUtils';
import { tradePnl } from './financialFormulas';
import type { Trade, TradeDirection } from './types';

/** Trade normalizado pelo CTraderAdapter (`normalizeTrade`). */
export interface CTraderTrade {
  platformTradeId: string; // já vem prefixado `ct_` do adapter
  symbol: string;
  side: string; // 'Buy' | 'Sell'
  quantity: number;
  price: number; // preço de execução do deal
  dateTime?: string;
  netPnl?: number;
  grossPnl?: number;
  fee?: number;
  platformAccountId?: string;
  platformName?: string;
  connectionName?: string;
}

export interface CTraderIngestResult {
  created: number;
  updated: number;
  skipped: number;
}

/**
 * Mapeia um trade cTrader para o schema app-db v3 (Trade). O `id` é o próprio
 * `platformTradeId` (`ct_...`, nunca colide com UUID manual nem com `qt_`).
 * Deals cTrader não trazem as duas pernas no shape normalizado: `exitPrice`
 * fica undefined e `resultNet` carrega o `netPnl` do deal (mesmo padrão do
 * ingest Quantower). `resultR` fica null (sem stop).
 */
export function ctraderToTrade(q: CTraderTrade, accountId?: string): Omit<Trade, 'updatedAt' | 'deviceId' | 'version'> {
  const direction: TradeDirection = (q.side || '').toLowerCase() === 'sell' ? 'short' : 'long';
  const entryDatetime = q.dateTime || nowIso();
  const resultNet = q.netPnl ?? 0;
  const trade = {
    id: q.platformTradeId,
    accountId,
    symbol: q.symbol || '',
    direction,
    entryDatetime,
    // cTrader entrega DEALS (execuções já com PnL realizado), não pares entrada/saída.
    // Sem `exitDatetime`, o `closedTrades` do journal o ignora e ele fica "aberto" PARA SEMPRE
    // no mapa de sessões. Tratamos o deal como registro FECHADO no próprio instante/preço —
    // o `resultNet` vem do `netPnl` do deal. (Duração fica 0: o bridge não separa as pernas.)
    exitDatetime: entryDatetime,
    qty: q.quantity ?? 0,
    entryPrice: q.price ?? 0,
    exitPrice: q.price ?? 0,
    commission: 0,
    swap: 0,
    rebate: 0,
    fees: q.fee ?? 0,
    source: 'ctrader' as const,
    platformName: 'ctrader',
    platformTradeId: q.platformTradeId,
    platformAccountId: q.platformAccountId,
    resultNet,
    resultR: null,
  };
  return trade;
}

/**
 * Ingere trades cTrader no app-db v3. Resolve `accountId` por `platformAccountId`
 * (quando a conta interna tem o mapeamento em `Account.platformAccountId`);
 * senão deixa sem conta (UI mostra como "sem conta" para mapear).
 * Dedup por primary-key (id determinístico `ct_...`): re-ingest atualiza, nunca duplica.
 */
export async function ingestCtraderTrades(
  ds: DataService,
  chain: DataChainEngine,
  trades: CTraderTrade[],
): Promise<CTraderIngestResult> {
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const q of trades) {
    if (!q.platformTradeId) {
      skipped += 1;
      continue;
    }
    let accountId: string | undefined;
    if (q.platformAccountId) {
      const matches = await ds.accounts.byPlatformAccountId(q.platformAccountId);
      accountId = (matches.find((a) => !a.disabled) ?? matches[0])?.id;
    }

    const trade = ctraderToTrade(q, accountId);
    const existing = await ds.trades.get(trade.id);
    if (existing) {
      const merged: Trade = { ...existing, ...trade, id: existing.id };
      await ds.trades.put(merged, { source: 'local' });
      await chain.syncTrade(merged);
      updated += 1;
    } else {
      const rec = await ds.trades.put(
        { ...trade, updatedAt: nowIso(), deviceId: ds.deviceId, version: 0 } as Trade,
        { source: 'local' },
      );
      await chain.syncTrade(rec);
      created += 1;
    }
  }

  return { created, updated, skipped };
}
