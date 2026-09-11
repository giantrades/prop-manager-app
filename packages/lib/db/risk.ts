// STAGE 3 — RiskService. Agrega risco por conta (prop + invest/crypto) em lote e
// emite `risk:warning` quando algo estoura. Usa o DataChainEngine (equity/drawdown
// derivados) — nunca escreve saldo direto.
//
// Fonte: DOCS/04_STAGE3_TRADING_OS/00-produto.md + 01-DATA_CONTRACT.md (risk:warning).

import type { DataService } from './DataService';
import type { DataChainEngine } from './DataChainEngine';
import {
  getRiskStatus,
  isRiskTracked,
  type AccountRiskMetrics,
  type RiskStatus,
} from './accountModel';
import { EVENTS } from './events';
import type { Account, PropExtension, Trade } from './types';
import { tradePnl } from './financialFormulas';
import { nowIso } from './dateUtils';

export interface AccountRiskRow {
  account: Account;
  prop?: PropExtension;
  metrics: AccountRiskMetrics;
  status: RiskStatus;
}

export interface RiskSnapshot {
  /** Um registro por conta rastreada (prop ativa + não-oculta + invest/crypto). */
  rows: AccountRiskRow[];
  /** Contagem por nível. */
  counts: Record<'SAFE' | 'WARN' | 'STOP', number>;
  /** Conta com o pior risco (para o banner do dia). */
  worst: AccountRiskRow | null;
  /** PnL do dia (soma dos trades fechados hoje). */
  pnlToday: number;
  /** Trades win/loss de hoje. */
  tradesToday: { win: number; loss: number };
  /** Última vez que o risco foi calculado. */
  calculatedAt: string;
}

export interface RiskServiceOptions {
  /** Limiar de drawdown usado para emitir `risk:warning` (default: 0.5 = WARN em 50%). */
  warnThreshold?: number;
  /** Emite `risk:warning` no bus (default true). */
  emitWarnings?: boolean;
}

export class RiskService {
  constructor(
    private readonly ds: DataService,
    private readonly chain: DataChainEngine,
    private readonly opts: RiskServiceOptions = {},
  ) {}

  /** Métricas de risco de UMA conta (prop ou não). */
  async metricsFor(
    account: Account,
    prop?: PropExtension,
    live?: { pnl: number; count: number },
  ): Promise<AccountRiskMetrics> {
    const base: AccountRiskMetrics = { accountId: account.id, kind: account.kind };

    if (account.kind === 'prop' && prop) {
      // A1 — PnL live (posições abertas) entra no equity ANTES dos limites.
      // Sem live: idêntico ao cálculo anterior.
      const livePnl = live?.pnl ?? 0;
      const liveCount = live?.count ?? 0;
      const equity = Number(((await this.chain.computeEquity(account.id)) + livePnl).toFixed(2));
      const { maxDD, trailingDD, dailyDD } = await this.chain.drawdowns(account.id);
      const series = await this.chain.equitySeries(account.id);
      const peakEquity = Math.max(
        series.length > 0 ? Math.max(...series.map((s) => s.equity)) : equity,
        equity,
      );
      // Live positivo abate o drawdown; negativo aprofunda. Nunca abaixo de 0.
      // chain.drawdowns devolve FRAÇÃO do nominal — converte o live ($) antes.
      const liveFrac = prop.nominalSize > 0 ? livePnl / prop.nominalSize : 0;
      const adj = (v: number) => Math.max(0, v - liveFrac);
      const eligibility = await this.chain.checkPayoutEligibility(account.id);

      const trades = await this.tradesFor(account.id);
      const daysOperated = new Set(trades.map((t) => t.entryDatetime.slice(0, 10))).size;
      let bestSingleDayProfit = 0;
      let totalProfit = 0;
      const byDay = new Map<string, number>();
      for (const t of trades) {
        totalProfit += tradePnl(t);
        const day = t.exitDatetime?.slice(0, 10) ?? t.entryDatetime.slice(0, 10);
        byDay.set(day, (byDay.get(day) ?? 0) + tradePnl(t));
      }
      for (const v of byDay.values()) if (v > bestSingleDayProfit) bestSingleDayProfit = v;
      const consistency = totalProfit > 0 ? bestSingleDayProfit / totalProfit : null;

      base.equity = equity;
      base.nominalSize = prop.nominalSize;
      base.peakEquity = peakEquity;
      base.maxDDUsed = prop.maxDD > 0 ? adj(maxDD) / prop.maxDD : 0;
      base.trailingDDUsed = prop.trailingDD > 0 ? adj(trailingDD) / prop.trailingDD : 0;
      base.dailyDDUsed = prop.dailyDD > 0 ? adj(dailyDD) / prop.dailyDD : 0;
      base.livePnl = livePnl;
      base.liveCount = liveCount;
      base.includesLive = liveCount > 0;
      base.daysOperated = daysOperated;
      base.minDays = prop.minDays;
      base.consistency = consistency;
      base.consistencyPct = prop.consistencyPct;
      base.eligible = eligibility?.eligible ?? false;
      base.target = prop.target;
      return base;
    }

    // Não-prop: drawdown/alloc/concentration se houver positions/transactions.
    const positions = await this.ds.positions.list().catch(() => []);
    const accountPositions = positions.filter((p) => p.accountId === account.id);
    const notional = accountPositions.reduce((s, p) => s + p.qty * (p.avgPrice ?? 0), 0);
    const topSymbol = accountPositions.reduce((max, p) => {
      const notionalP = p.qty * (p.avgPrice ?? 0);
      return notionalP > max.notional ? { notional: notionalP } : max;
    }, { notional: 0 });
    if (notional > 0) {
      base.concentration = topSymbol.notional / notional;
    }

    // Drawdown da conta: pico de transactions de equity não-prop é raro; usamos
    // a variação do último mês de transactions como proxy conservador de drawdown.
    const txns = await this.ds.transactions.list();
    const accountTxns = txns
      .filter((t) => t.accountId === account.id)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (accountTxns.length > 0) {
      let peak = 0;
      let running = 0;
      let maxDD = 0;
      for (const t of accountTxns) {
        running += t.amount;
        if (running > peak) peak = running;
        const dd = (peak - running) / (Math.abs(peak) || 1);
        if (dd > maxDD) maxDD = dd;
      }
      base.drawdown = maxDD;
    }

    return base;
  }

  /** Riscos de uma conta (métricas + status). `live` = PnL não realizado. */
  async riskFor(
    account: Account,
    prop?: PropExtension,
    live?: { pnl: number; count: number },
  ): Promise<AccountRiskRow> {
    const metrics = await this.metricsFor(account, prop, live);
    const status = getRiskStatus(account, metrics, prop);
    return { account, prop, metrics, status };
  }

  /**
   * Snapshot de risco de TODAS as contas rastreadas (em lote).
   * `liveByAccount`: PnL não realizado por conta (posições abertas) — sem ele,
   * cálculo idêntico ao anterior (só trades fechados).
   */
  async snapshot(liveByAccount?: Record<string, { pnl: number; count: number }>): Promise<RiskSnapshot> {
    const accounts = await this.ds.accounts.list();
    const props = await this.ds.propExtensions.list();
    const propByAccount = new Map(props.map((p) => [p.accountId, p]));

    const rows: AccountRiskRow[] = [];
    for (const account of accounts) {
      const prop = propByAccount.get(account.id);
      if (!isRiskTracked(account, prop)) continue;
      rows.push(await this.riskFor(account, prop, liveByAccount?.[account.id]));
    }

    const counts = { SAFE: 0, WARN: 0, STOP: 0 };
    for (const r of rows) counts[r.status.status] += 1;

    const worst = rows.reduce<AccountRiskRow | null>((worst, r) => {
      if (!worst) return r;
      return rankRisk(r) > rankRisk(worst) ? r : worst;
    }, null);

    const { pnlToday, tradesToday } = await this.todayStats();
    const calculatedAt = nowIso();

    // Emite `risk:warning` para quem cruzou o limiar.
    if (this.opts.emitWarnings !== false) {
      for (const r of rows) {
        if (r.status.status === 'WARN' || r.status.status === 'STOP') {
          this.emitWarning(r);
        }
      }
      // A3 — `payout:eligible` 1x por ciclo: dispara quando fica elegível e só
      // de novo se chegar payout novo (a contagem muda e o ciclo reabre).
      // A lista do Action Center continua mostrando enquanto elegível (estado);
      // o evento é o gatilho único (toast/push).
      try {
        const payouts = await this.ds.payouts.list();
        for (const r of rows) {
          if (!r.metrics.eligible) continue;
          const count = payouts.filter((p) => (p.accountIds || []).includes(r.account.id)).length;
          const flagKey = `payout:eligible:${r.account.id}`;
          const flag = await this.ds.meta.getKey(flagKey).catch(() => undefined);
          const seen = flag?.value && typeof flag.value === 'object'
            ? (flag.value as { payoutCount?: number }).payoutCount
            : undefined;
          if (seen !== count) {
            await this.ds.meta.setKey(flagKey, { payoutCount: count }).catch(() => undefined);
            this.ds.bus.emit(EVENTS.PAYOUT_ELIGIBLE, {
              accountId: r.account.id,
              accountName: r.account.name,
              equity: r.metrics.equity ?? 0,
              triggeredAt: calculatedAt,
            });
          }
        }
      } catch {
        /* elegibilidade nunca pode quebrar o snapshot */
      }
    }

    return { rows, counts, worst, pnlToday, tradesToday, calculatedAt };
  }

  /** Estatísticas do dia (PnL + W/L) — usado no banner do Risk Center. */
  async todayStats(): Promise<{ pnlToday: number; tradesToday: { win: number; loss: number } }> {
    const trades = await this.ds.trades.list();
    const today = nowIso().slice(0, 10);
    let pnlToday = 0;
    let win = 0;
    let loss = 0;
    for (const t of trades) {
      const day = t.exitDatetime?.slice(0, 10) ?? t.entryDatetime.slice(0, 10);
      if (day !== today) continue;
      if (t.exitPrice == null) continue;
      const pnl = tradePnl(t);
      pnlToday += pnl;
      if (pnl > 0) win += 1;
      else if (pnl < 0) loss += 1;
    }
    return { pnlToday: Number(pnlToday.toFixed(2)), tradesToday: { win, loss } };
  }

  private async tradesFor(accountId: string): Promise<Trade[]> {
    const trades = await this.ds.trades.list();
    return trades.filter((t) => {
      if (t.accounts && t.accounts.length > 0) return t.accounts.some((a) => a.accountId === accountId);
      return t.accountId === accountId;
    });
  }

  private emitWarning(row: AccountRiskRow): void {
    // Métrica "pior" de DD (para payload do risk:warning).
    const metric = this.worstMetric(row.metrics);
    const limit = row.status.status === 'STOP' ? 1 : this.opts.warnThreshold ?? 0.5;
    const currentValue = metric.value;
    this.ds.bus.emit(EVENTS.RISK_WARNING, {
      accountId: row.account.id,
      level: row.status.status === 'STOP' ? 'stop' : 'warn',
      metric: metric.name,
      currentValue,
      limit,
      headroom: Math.max(0, limit - currentValue),
      triggeredAt: nowIso(),
    });
  }

  private worstMetric(metrics: AccountRiskMetrics): { name: 'dailyDD' | 'trailingDD' | 'maxDD' | 'concentration'; value: number } {
    const candidates: Array<{ name: 'dailyDD' | 'trailingDD' | 'maxDD' | 'concentration'; value: number }> = [];
    if (metrics.dailyDDUsed != null) candidates.push({ name: 'dailyDD', value: metrics.dailyDDUsed });
    if (metrics.trailingDDUsed != null) candidates.push({ name: 'trailingDD', value: metrics.trailingDDUsed });
    if (metrics.maxDDUsed != null) candidates.push({ name: 'maxDD', value: metrics.maxDDUsed });
    if (metrics.concentration != null) candidates.push({ name: 'concentration', value: metrics.concentration });
    if (candidates.length === 0) return { name: 'maxDD', value: 0 };
    return candidates.reduce((a, b) => (b.value > a.value ? b : a));
  }
}

/** Ordem de gravidade: SAFE < WARN < STOP. */
function rankRisk(row: AccountRiskRow): number {
  return row.status.status === 'STOP' ? 2 : row.status.status === 'WARN' ? 1 : 0;
}
