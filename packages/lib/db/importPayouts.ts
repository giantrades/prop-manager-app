// STAGE 2 — Importador OPCIONAL de payouts. Lê os 2 payouts atuais do app antigo
// (localStorage['propmanager-data-v1']) e converte em `Transaction` (payout_in + fee)
// + `Payout` seed. Nada de trades/contas/goals antigos.
//
// PIVOT: não migramos os 3 storages — só os payouts importam.

import type { DataChainEngine } from './DataChainEngine';
import type { DataService } from './DataService';
import { nowIso } from './dateUtils';
import type { Payout, PayoutSplit, PayoutStatus, Transaction } from './types';

const LEGACY_LS_KEY = 'propmanager-data-v1';

export interface LegacyPayout {
  id?: string;
  dateCreated?: string;
  date?: string;
  amountSolicited?: number;
  amountReceived?: number;
  gross?: number;
  net?: number;
  fee?: number;
  method?: string;
  status?: PayoutStatus;
  accountIds?: string[];
  splitByAccount?: Record<string, Partial<PayoutSplit> & { gross?: number; net?: number; fee?: number }>;
  attachments?: Record<string, object>;
}

export interface ImportPayoutsResult {
  payouts: Payout[];
  transactionIds: string[];
  importedCount: number;
  skippedCount: number;
}

export interface ImportPayoutsOptions {
  destinationAccountId?: string;
}

/** Lê os payouts do blob legado (somente no browser). */
export function readLegacyPayouts(): LegacyPayout[] {
  if (typeof localStorage === 'undefined') return [];
  const raw = localStorage.getItem(LEGACY_LS_KEY);
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data.payouts) ? (data.payouts as LegacyPayout[]) : [];
  } catch {
    return [];
  }
}

export function normalizeLegacyPayout(p: LegacyPayout): Payout {
  const gross = Number(p.gross ?? p.amountSolicited ?? 0);
  const net = Number(p.net ?? p.amountReceived ?? 0);
  const fee = Number(p.fee ?? (gross - net));
  const splitByAccount: Record<string, PayoutSplit> = {};
  if (p.splitByAccount) {
    for (const [accountId, s] of Object.entries(p.splitByAccount)) {
      const sg = Number(s.gross ?? 0);
      const sn = Number(s.net ?? 0);
      const sf = Number(s.fee ?? (sg - sn));
      splitByAccount[accountId] = { gross: sg, net: sn, fee: sf };
    }
  }
  const accountIds = p.accountIds ?? [];
  const effectiveNet = Object.keys(splitByAccount).length > 0
    ? Object.values(splitByAccount).reduce((sum, s) => sum + s.net, 0)
    : net;
  const effectiveFee = Object.keys(splitByAccount).length > 0
    ? Object.values(splitByAccount).reduce((sum, s) => sum + s.fee, 0)
    : fee;

  return {
    id: p.id ?? `payout-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    accountIds,
    gross,
    fee: Number(effectiveFee.toFixed(2)),
    net: Number(effectiveNet.toFixed(2)),
    splitByAccount,
    status: p.status ?? 'Pending',
    method: p.method ?? 'Rise',
    attachments: p.attachments ?? {},
    date: p.date ?? p.dateCreated ?? nowIso(),
    updatedAt: nowIso(),
    deviceId: '',
    version: 0,
  };
}

/**
 * Importa payouts legados -> `Payout` seed + `Transaction` (`payout_in` + `fee`).
 * Retorna o que foi importado e o que foi pulado (ex.: payout sem valor).
 */
export async function importPayouts(
  dataService: DataService,
  chain: DataChainEngine,
  legacyPayouts: LegacyPayout[],
  opts?: ImportPayoutsOptions,
): Promise<ImportPayoutsResult> {
  const imported: Payout[] = [];
  const transactionIds: string[] = [];
  let skippedCount = 0;

  for (const legacy of legacyPayouts) {
    const payout = normalizeLegacyPayout(legacy);
    if (payout.gross <= 0 && payout.net <= 0) {
      skippedCount += 1;
      continue;
    }
    // Payout seed (preserva toda a info legada).
    await dataService.payouts.put(payout, { source: 'restore' });
    // Transactions de payout_in + fee via chain (wallet inflow).
    const result = await chain.applyPayout(payout, { destinationAccountId: opts?.destinationAccountId });
    transactionIds.push(...result.transactionIds);
    imported.push(payout);
  }

  return {
    payouts: imported,
    transactionIds,
    importedCount: imported.length,
    skippedCount,
  };
}

/** Atalho: importa direto do localStorage legado (browser). */
export async function importLegacyPayoutsFromStorage(
  dataService: DataService,
  chain: DataChainEngine,
  opts?: ImportPayoutsOptions,
): Promise<ImportPayoutsResult> {
  const payouts = readLegacyPayouts();
  return importPayouts(dataService, chain, payouts, opts);
}
