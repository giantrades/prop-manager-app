// STAGE 2 — DataChainEngine. Propaga Trade -> Ledger -> Equity -> Eligibility -> Wallet.
// Trade NUNCA atualiza equity direto — só cria Transaction (ledger) via este engine.
// Equity é derivado, nunca escrito à mão (anti-currentFunding).

import type { DataService } from './DataService';
import {
  computeEquity,
  computePayoutEligibility,
  drawdownExceeded,
  tradeNetPnl,
  computeMaxDrawdown,
  computeTrailingDrawdown,
  computeDailyDrawdown,
  type EligibilityResult,
  type EquityPoint,
} from './financialFormulas';
import { EVENTS } from './events';
import { nowIso } from './dateUtils';
import type {
  Account,
  Payout,
  PropExtension,
  Trade,
  Transaction,
  TransactionKind,
} from './types';

export interface TradeSyncResult {
  accountIds: string[];
  equityByAccount: Record<string, number>;
}

export interface PayoutApplyResult {
  transactionIds: string[];
  totalNet: number;
  totalFee: number;
}

export interface ChainOptions {
  /** Gera transactions de custo no ledger (commission/swap/rebate/fee). */
  ledgerCosts?: boolean;
}

export class DataChainEngine {
  constructor(
    private readonly ds: DataService,
    private readonly opts: ChainOptions = { ledgerCosts: true },
  ) {}

  // -------------------------------------------------------------------------
  // Trade -> Ledger
  // -------------------------------------------------------------------------

  /**
   * Sincroniza um trade pro ledger (costs) e recalcula equity das contas afetadas.
   * Idempotente: apaga costs antigos do trade antes de recriar (sem duplicar).
   */
  async syncTrade(trade: Trade): Promise<TradeSyncResult> {
    if (this.opts.ledgerCosts) {
      await this.syncTradeCosts(trade);
    }
    const affected = await this.affectedAccountIds(trade);
    const equityByAccount: Record<string, number> = {};
    for (const accountId of affected) {
      equityByAccount[accountId] = await this.computeEquity(accountId);
      await this.emitRiskIfExceeded(accountId);
    }
    return { accountIds: affected, equityByAccount };
  }

  private async syncTradeCosts(trade: Trade): Promise<void> {
    const costs: Array<{ kind: TransactionKind; amount: number }> = [];
    if (trade.commission) costs.push({ kind: 'commission', amount: -Math.abs(trade.commission) });
    if (trade.swap) costs.push({ kind: 'swap', amount: -Math.abs(trade.swap) });
    if (trade.fees) costs.push({ kind: 'fee', amount: -Math.abs(trade.fees) });
    if (trade.rebate) costs.push({ kind: 'rebate', amount: Math.abs(trade.rebate) });

    // Apaga costs antigos do trade (ref.type=tradeId && ref.id===trade.id).
    const existing = await this.ds.transactions.list();
    const stale = existing.filter(
      (t) => t.ref?.type === 'tradeId' && t.ref.id === trade.id,
    );
    await Promise.all(stale.map((t) => this.ds.transactions.remove(t.id, { emitChange: false })));

    if (costs.length === 0) return;

    const accountIds = await this.affectedAccountIds(trade);
    const currency = (await this.resolveCurrency(accountIds[0])) ?? 'USD';
    const firmId = await this.resolveFirmId(accountIds[0]);
    const records: Transaction[] = costs.map((c) => ({
      id: `${trade.id}:${c.kind}`,
      accountId: accountIds[0] ?? '',
      firmId,
      kind: c.kind,
      amount: Number(c.amount.toFixed(2)),
      currency,
      date: trade.exitDatetime ?? trade.entryDatetime,
      ref: { type: 'tradeId', id: trade.id },
      note: `trade ${trade.symbol}`,
      updatedAt: nowIso(),
      deviceId: this.ds.deviceId,
      version: 0,
    }));
    await this.ds.transactions.bulkPut(records, { source: 'local', emitChange: true });
  }

  async deleteTrade(tradeId: string): Promise<void> {
    const stale = (await this.ds.transactions.list()).filter(
      (t) => t.ref?.type === 'tradeId' && t.ref.id === tradeId,
    );
    await Promise.all(stale.map((t) => this.ds.transactions.remove(t.id, { emitChange: false })));
  }

  private async affectedAccountIds(trade: Trade): Promise<string[]> {
    if (trade.accounts && trade.accounts.length > 0) {
      return trade.accounts.map((a) => a.accountId);
    }
    return trade.accountId ? [trade.accountId] : [];
  }

  private async resolveCurrency(accountId?: string): Promise<string | null> {
    if (!accountId) return null;
    const account = await this.ds.accounts.get(accountId);
    return account?.currency ?? null;
  }

  private async resolveFirmId(accountId?: string): Promise<string | undefined> {
    if (!accountId) return undefined;
    const prop = await this.ds.propExtensions.byAccountId(accountId);
    return prop ? accountId : undefined; // firm id simplificado = accountId (1:1 prop)
  }

  // -------------------------------------------------------------------------
  // Equity (derivado)
  // -------------------------------------------------------------------------

  async computeEquity(accountId: string): Promise<number> {
    const account = await this.ds.accounts.get(accountId);
    const trades = await this.ds.trades.list();
    const prop = await this.ds.propExtensions.byAccountId(accountId);
    const base = account?.kind === 'prop' && prop ? prop.nominalSize : 0;
    return computeEquity(base, accountId, trades);
  }

  /** Série de equity ao longo do tempo (para drawdown). Ordenada por data. */
  async equitySeries(accountId: string): Promise<EquityPoint[]> {
    const trades = await this.ds.trades.list();
    const account = await this.ds.accounts.get(accountId);
    const prop = await this.ds.propExtensions.byAccountId(accountId);
    const base = account?.kind === 'prop' && prop ? prop.nominalSize : 0;

    const relevant = trades
      .filter((t) => {
        if (t.accounts && t.accounts.length > 0) {
          return t.accounts.some((a) => a.accountId === accountId);
        }
        return t.accountId === accountId;
      })
      .sort((a, b) => a.entryDatetime.localeCompare(b.entryDatetime));

    const points: EquityPoint[] = [];
    let equity = base;
    points.push({ at: relevant[0]?.entryDatetime ?? nowIso(), equity: Number(equity.toFixed(2)) });
    for (const t of relevant) {
      const w = t.accounts?.find((a) => a.accountId === accountId)?.weight ?? (t.accountId === accountId ? 1 : 0);
      equity += tradeNetPnl(t) * w;
      points.push({ at: t.exitDatetime ?? t.entryDatetime, equity: Number(equity.toFixed(2)) });
    }
    return points;
  }

  async drawdowns(accountId: string) {
    const account = await this.ds.accounts.get(accountId);
    const prop = await this.ds.propExtensions.byAccountId(accountId);
    const series = await this.equitySeries(accountId);
    const base = account?.kind === 'prop' && prop ? prop.nominalSize : 0;
    return {
      maxDD: computeMaxDrawdown(series, base),
      trailingDD: computeTrailingDrawdown(series, base),
      dailyDD: computeDailyDrawdown(series, prop?.timezoneOffsetMinutes ?? 0),
    };
  }

  // -------------------------------------------------------------------------
  // Payout Eligibility
  // -------------------------------------------------------------------------

  async checkPayoutEligibility(accountId: string): Promise<EligibilityResult | null> {
    const prop = await this.ds.propExtensions.byAccountId(accountId);
    if (!prop) return null;
    const equity = await this.computeEquity(accountId);
    const { maxDD, trailingDD, dailyDD } = await this.drawdowns(accountId);

    // DD usado (fração do limite): pior dos 3.
    const ddUsed = Math.max(
      prop.maxDD > 0 ? maxDD / prop.maxDD : 0,
      prop.trailingDD > 0 ? trailingDD / prop.trailingDD : 0,
      prop.dailyDD > 0 ? dailyDD / prop.dailyDD : 0,
    );

    const trades = await this.ds.trades.list();
    const relevant = trades.filter((t) => {
      if (t.accounts && t.accounts.length > 0) return t.accounts.some((a) => a.accountId === accountId);
      return t.accountId === accountId;
    });
    const daysOperated = new Set(relevant.map((t) => t.entryDatetime.slice(0, 10))).size;
    let bestSingleDayProfit = 0;
    let totalProfit = 0;
    for (const t of relevant) {
      totalProfit += tradeNetPnl(t);
    }
    const byDay = new Map<string, number>();
    for (const t of relevant) {
      const day = t.exitDatetime?.slice(0, 10) ?? t.entryDatetime.slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + tradeNetPnl(t));
    }
    for (const v of byDay.values()) if (v > bestSingleDayProfit) bestSingleDayProfit = v;

    return computePayoutEligibility({
      equity,
      target: prop.target,
      drawdownUsed: ddUsed,
      daysOperated,
      minDays: prop.minDays,
      bestSingleDayProfit,
      totalProfit,
      consistencyPct: prop.consistencyPct,
    });
  }

  private async emitRiskIfExceeded(accountId: string): Promise<void> {
    const prop = await this.ds.propExtensions.byAccountId(accountId);
    if (!prop) return;
    const { maxDD, trailingDD, dailyDD } = await this.drawdowns(accountId);
    const checks: Array<{ metric: 'maxDD' | 'trailingDD' | 'dailyDD'; value: number; limit: number }> = [
      { metric: 'maxDD', value: maxDD, limit: prop.maxDD },
      { metric: 'trailingDD', value: trailingDD, limit: prop.trailingDD },
      { metric: 'dailyDD', value: dailyDD, limit: prop.dailyDD },
    ];
    for (const c of checks) {
      if (c.limit > 0 && drawdownExceeded(c.value, c.limit, false)) {
        const level = c.value >= c.limit * 1.25 ? 'stop' : 'warn';
        this.ds.bus.emit(EVENTS.RISK_WARNING, {
          accountId,
          level,
          metric: c.metric,
          currentValue: c.value,
          limit: c.limit,
          headroom: c.limit - c.value,
          triggeredAt: nowIso(),
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // Payout -> Wallet
  // -------------------------------------------------------------------------

  /**
   * Aplica um payout: cria `Transaction` `payout_in` (gross) + `fee` por conta do split.
   * `destinationAccountId` é a conta de destino (wallet/bank) se houver; senão usa a
   * primeira conta prop. `rate`/`rateTimestamp` = PTAX de venda do dia do recebimento
   * (guardado na Transaction — FINANCIAL_FORMULAS.md, nunca recalcular depois).
   */
  async applyPayout(
    payout: Payout,
    opts?: { destinationAccountId?: string; rate?: number; rateTimestamp?: string },
  ): Promise<PayoutApplyResult> {
    if (opts?.rate != null && opts.rate <= 0) {
      throw new Error('rate=0 PROIBIDO no payout (zera cálculo silenciosamente)');
    }
    const currency = await this.resolveCurrency(
      opts?.destinationAccountId ?? payout.accountIds[0],
    );
    const records: Transaction[] = [];
    let totalNet = 0;
    let totalFee = 0;

    const dest = opts?.destinationAccountId ?? payout.accountIds[0];
    const mk = (id: string, accountId: string, firmId: string | undefined, kind: TransactionKind, amount: number, cur: string, note: string): Transaction => ({
      id,
      accountId,
      firmId,
      kind,
      amount: Number(amount.toFixed(2)),
      currency: cur,
      rate: opts?.rate,
      rateTimestamp: opts?.rateTimestamp,
      date: payout.date ?? nowIso(),
      ref: { type: 'payoutId', id: payout.id },
      note,
      updatedAt: nowIso(),
      deviceId: this.ds.deviceId,
      version: 0,
    });

    const splitKeys = Object.keys(payout.splitByAccount ?? {});
    if (splitKeys.length > 0) {
      for (const accountId of splitKeys) {
        const s = payout.splitByAccount[accountId];
        const cur = (await this.resolveCurrency(dest)) ?? currency ?? 'USD';
        // payout_in = GROSS (o que a firm grossou); fee = -fee (a parte da firm).
        // O net (gross - fee) é o que entra na wallet. Firm P&L = Σ payout_in - Σ(...+fee).
        const grossAmount = s.gross > 0 ? s.gross : s.net + s.fee;
        records.push(mk(`${payout.id}:${accountId}:payout_in`, dest ?? accountId, accountId, 'payout_in', grossAmount, cur, `payout ${accountId}`));
        records.push(mk(`${payout.id}:${accountId}:fee`, dest ?? accountId, accountId, 'fee', -s.fee, cur, `fee payout ${accountId}`));
        totalNet += s.net;
        totalFee += s.fee;
      }
    } else {
      const grossAmount = payout.gross > 0 ? payout.gross : payout.net + payout.fee;
      records.push(mk(`${payout.id}:payout_in`, dest ?? '', undefined, 'payout_in', grossAmount, currency ?? 'USD', 'payout'));
      records.push(mk(`${payout.id}:fee`, dest ?? '', undefined, 'fee', -payout.fee, currency ?? 'USD', 'fee payout'));
      totalNet = payout.net;
      totalFee = payout.fee;
    }

    await this.ds.transactions.bulkPut(records, { source: 'local' });
    return { transactionIds: records.map((r) => r.id), totalNet, totalFee };
  }
}
