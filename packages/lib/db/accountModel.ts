// STAGE 3 — accountModel. Conta unificada (Account + PropExtension) e Risk genérico.
// Fonte: DOCS/02_STAGE1_DOMAIN/00-DOMAIN_MODEL.md + DOCS/04_STAGE3_TRADING_OS/00-produto.md
//
// Risk genérico: `getRiskStatus(account)` -> { status: 'SAFE'|'WARN'|'STOP', reason, headroom }.
//  - Prop: daily/trailing/max DD, target, consistency, minDays (🟢 SAFE / 🟡 WARN 50% / 🔴 STOP)
//  - Invest/Crypto: allocation, concentration, drawdown, exposure/volatilidade
//
// Proibido escrever saldo direto aqui — equity/drawdown são derivados (DataChainEngine).

import type { Account, AccountKind, PropExtension, PropPhase, LegacyPropPhase } from './types';
import type { DataService } from './DataService';
import type { DataChainEngine } from './DataChainEngine';
import {
  tradePnl,
  weightForAccount,
  computePayoutEligibility,
  type EligibilityResult,
  type EquityPoint,
} from './financialFormulas';
import { parseDate, formatDate } from './dateUtils';

// ---------------------------------------------------------------------------
// Status da conta prop + normalização de valores legados
// ---------------------------------------------------------------------------

/**
 * Normaliza o status vindo do banco (pode haver valores antigos):
 * challenge1/challenge2 -> challenge · paused/failed -> standby.
 */
export function normalizePropPhase(phase: string | undefined): PropPhase | undefined {
  if (!phase) return undefined;
  if (phase === 'challenge' || phase === 'funded' || phase === 'live' || phase === 'standby') {
    return phase;
  }
  const legacy: Record<LegacyPropPhase, PropPhase> = {
    challenge1: 'challenge',
    challenge2: 'challenge',
    paused: 'standby',
    failed: 'standby',
  };
  return legacy[phase as LegacyPropPhase];
}

/** Fases ativas (Risk Center só considera estas). */
export const ACTIVE_PROP_PHASES: PropPhase[] = ['challenge', 'funded', 'live'];

export function isActiveProp(phase: PropPhase | string | undefined): boolean {
  const p = normalizePropPhase(phase);
  return !!p && ACTIVE_PROP_PHASES.includes(p);
}

export function isPropAccount(account: Account): boolean {
  return account.kind === 'prop';
}

export function needsPropExtension(account: Account): boolean {
  return account.kind === 'prop';
}

/** Contas que o Risk Center considera (prop ativa + não-ocultas). */
export function isRiskTracked(account: Account, prop?: PropExtension): boolean {
  if (account.hidden) return false;
  if (account.kind === 'prop') {
    return isActiveProp(prop?.phase);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Risk levels
// ---------------------------------------------------------------------------

export type RiskLevel = 'SAFE' | 'WARN' | 'STOP';

export interface RiskHeadroom {
  /** Quanto ainda resta em valor monetário até o limite. */
  value: number;
  /** Fração 0..1 do limite ainda disponível. */
  percent: number;
}

export interface RiskStatus {
  status: RiskLevel;
  reason: string;
  headroom: RiskHeadroom;
}

/** Métricas derivadas usadas pra decidir o risco (preenchidas pelo RiskService). */
export interface AccountRiskMetrics {
  accountId: string;
  kind: AccountKind;
  // Prop
  equity?: number;
  nominalSize?: number;
  peakEquity?: number;
  maxDDUsed?: number; // fração 0..1+ do limite
  trailingDDUsed?: number;
  dailyDDUsed?: number;
  daysOperated?: number;
  minDays?: number;
  consistency?: number | null; // bestSingleDayProfit / totalProfit
  consistencyPct?: number; // limite configurado na firm
  eligible?: boolean;
  target?: number;
  // A1 — PnL não realizado (posições abertas). Somado ao equity antes dos limites.
  livePnl?: number;
  liveCount?: number;
  includesLive?: boolean;
  // Invest/Crypto
  allocation?: number; // valor da conta / net worth
  concentration?: number; // maior símbolo / portfólio
  drawdown?: number; // fração 0..1 desde o pico
  exposure?: number; // exposição / capital (alavancagem)
  volatility?: number; // desvio diário recente
}

// Limiares default para contas não-prop (invest/crypto). Configuráveis por conta.
export const DEFAULT_INVEST_RISK = {
  /** drawdown de STOP (fração 0..1). */
  stopDrawdown: 0.25,
  /** drawdown de WARN (fração 0..1). */
  warnDrawdown: 0.12,
  /** concentração de STOP (fração 0..1 num símbolo). */
  stopConcentration: 0.5,
  /** concentração de WARN. */
  warnConcentration: 0.3,
  /** exposição/alavancagem de STOP (multiplicador). */
  stopExposure: 4,
  /** exposição/alavancagem de WARN. */
  warnExposure: 2,
};

/**
 * Regra de decisão para conta PROP.
 * `ddUsed` = pior dos 3 drawdowns como fração do respectivo limite (0..1+).
 * WARN em 50%, STOP em 100% (limite atingido/excedido).
 */
export function propRiskStatus(metrics: AccountRiskMetrics): RiskStatus {
  const ddUsed = Math.max(
    metrics.maxDDUsed ?? 0,
    metrics.trailingDDUsed ?? 0,
    metrics.dailyDDUsed ?? 0,
  );
  const limit = 1; // 100% do limite configurado
  const headroom = { value: Math.max(0, limit - ddUsed), percent: Math.max(0, 1 - ddUsed) };

  const best = pickWorstPropMetric(metrics);
  const reason = best.reason;

  if (ddUsed >= limit) {
    return {
      status: 'STOP',
      reason: `Drawdown ${best.label} no limite — ${reason}`,
      headroom: { value: 0, percent: 0 },
    };
  }
  if (ddUsed >= 0.5) {
    return {
      status: 'WARN',
      reason: `Drawdown ${best.label} em ${Math.round(ddUsed * 100)}% do limite — ${reason}`,
      headroom,
    };
  }
  return {
    status: 'SAFE',
    reason: `Drawdown ${best.label} em ${Math.round(ddUsed * 100)}% do limite`,
    headroom,
  };
}

/** Retorna qual métrica de DD está mais perto de estourar (para a razão/mensagem). */
function pickWorstPropMetric(metrics: AccountRiskMetrics): { label: string; value: number; reason: string } {
  const candidates: Array<{ label: string; value: number }> = [];
  if (metrics.maxDDUsed != null) candidates.push({ label: 'maxDD', value: metrics.maxDDUsed });
  if (metrics.trailingDDUsed != null) candidates.push({ label: 'trailingDD', value: metrics.trailingDDUsed });
  if (metrics.dailyDDUsed != null) candidates.push({ label: 'dailyDD', value: metrics.dailyDDUsed });
  if (candidates.length === 0) {
    return { label: 'drawdown', value: 0, reason: 'sem dados de drawdown' };
  }
  const worst = candidates.reduce((a, b) => (b.value > a.value ? b : a));
  const detail = describePropRisk(metrics);
  return { label: worst.label, value: worst.value, reason: detail };
}

/** Descreve em texto o estado geral da conta prop (equity vs target, dias, consistency). */
function describePropRisk(metrics: AccountRiskMetrics): string {
  const parts: string[] = [];
  if (metrics.equity != null && metrics.target != null) {
    parts.push(`equity ${fmtMoney(metrics.equity)} / target ${fmtMoney(metrics.target)}`);
  }
  if (metrics.daysOperated != null && metrics.minDays != null) {
    parts.push(`${metrics.daysOperated}/${metrics.minDays} dias`);
  }
  if (metrics.consistency != null && metrics.consistencyPct != null) {
    parts.push(`consistência ${Math.round(metrics.consistency * 100)}% ≤ ${Math.round(metrics.consistencyPct * 100)}%`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'sem dados de risco';
}

/**
 * Regra de decisão para conta NÃO-prop (bank/wallet/invest/crypto/cash).
 * Usa drawdown, concentração e exposição quando disponíveis.
 */
export function investRiskStatus(metrics: AccountRiskMetrics): RiskStatus {
  const cfg = DEFAULT_INVEST_RISK;
  const drawdown = metrics.drawdown ?? 0;
  const concentration = metrics.concentration ?? 0;
  const exposure = metrics.exposure ?? 0;

  const ratios = [
    { value: drawdown, stop: cfg.stopDrawdown, warn: cfg.warnDrawdown, label: 'drawdown' },
    { value: concentration, stop: cfg.stopConcentration, warn: cfg.warnConcentration, label: 'concentração' },
    { value: exposure, stop: cfg.stopExposure, warn: cfg.warnExposure, label: 'exposição' },
  ];

  const worst = ratios.reduce((a, b) => {
    const aRatio = a.value >= a.stop ? 1 : a.value / Math.max(a.warn, 1e-9);
    const bRatio = b.value >= b.stop ? 1 : b.value / Math.max(b.warn, 1e-9);
    return bRatio > aRatio ? b : a;
  });

  const ratio = worst.value / Math.max(worst.warn, 1e-9);
  const headroom = { value: Math.max(0, worst.stop - worst.value), percent: Math.max(0, 1 - worst.value / worst.stop) };

  if (worst.value >= worst.stop) {
    return {
      status: 'STOP',
      reason: `${worst.label} em ${pct(worst.value)} — acima do limite ${pct(worst.stop)}`,
      headroom: { value: 0, percent: 0 },
    };
  }
  if (ratio >= 0.5) {
    return {
      status: 'WARN',
      reason: `${worst.label} em ${pct(worst.value)} — ${Math.round(ratio * 50)}% do limite`,
      headroom,
    };
  }
  return { status: 'SAFE', reason: `${worst.label} em ${pct(worst.value)}`, headroom };
}

/**
 * Decisão genérica de risco por conta.
 *
 * @param account conta
 * @param metrics métricas derivadas (obrigatórias para a decisão real). Se ausentes,
 *   retorna SAFE com "sem dados" (nunca mente que há risco onde não há métrica).
 * @param prop extensão prop (quando kind=prop)
 */
export function getRiskStatus(
  account: Account,
  metrics?: AccountRiskMetrics,
  prop?: PropExtension,
): RiskStatus {
  if (account.kind === 'prop') {
    if (!prop) {
      return { status: 'SAFE', reason: 'conta prop sem PropExtension', headroom: { value: 0, percent: 0 } };
    }
    if (!metrics) {
      return { status: 'SAFE', reason: 'sem métricas de risco calculadas', headroom: { value: 0, percent: 0 } };
    }
    return propRiskStatus(metrics);
  }
  if (!metrics) {
    return { status: 'SAFE', reason: 'sem métricas de risco calculadas', headroom: { value: 0, percent: 0 } };
  }
  return investRiskStatus(metrics);
}

// ---------------------------------------------------------------------------
// Helpers de exibição
// ---------------------------------------------------------------------------

function fmtMoney(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${value.toFixed(0)}`;
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function r2acct(n: number): number {
  return Number(n.toFixed(2));
}

export interface AccountTradeSummary {
  count: number;
  wins: number;
  losses: number;
  pnl: number;
  daysOperated: number;
  bestSingleDay: number;
  totalProfit: number;
}

/**
 * F1 — resumo de trades da conta (puro, com rateio por peso).
 * PnL por trade = tradePnl x weightForAccount. Dias = dias locais distintos de exit.
 * bestSingleDay/totalProfit alimentam `computePayoutEligibility` (consistency);
 * totalProfit é o net do período (<=0 => consistency n/a, regra da fórmula).
 */
export function accountTradeStats(
  trades: import("./types").Trade[],
  accountId: string,
): AccountTradeSummary {
  const mine = trades.filter((t) => weightForAccount(t, accountId) > 0 && t.exitPrice != null);
  let wins = 0;
  let losses = 0;
  let pnl = 0;
  const byDay = new Map<string, number>();
  for (const t of mine) {
    const contrib = r2acct(tradePnl(t) * weightForAccount(t, accountId));
    pnl = r2acct(pnl + contrib);
    if (contrib > 0) wins += 1;
    else if (contrib < 0) losses += 1;
    const stamp = t.exitDatetime || t.entryDatetime;
    if (!stamp) continue;
    const key = formatDate(parseDate(stamp), "yyyy-MM-dd");
    byDay.set(key, r2acct((byDay.get(key) ?? 0) + contrib));
  }
  const days = [...byDay.values()];
  return {
    count: mine.length,
    wins,
    losses,
    pnl,
    daysOperated: byDay.size,
    bestSingleDay: days.length ? Math.max(...days) : 0,
    totalProfit: pnl,
  };
}

export interface AccountPayoutSummary {
  count: number;
  totalNet: number;
}

export interface AccountDashboard {
  accountId: string;
  equity: number;
  peak: number;
  drawdown: { value: number; fraction: number };
  headroom: RiskHeadroom;
  limitValue: number;
  payouts: AccountPayoutSummary;
  trades: AccountTradeSummary;
  eligibility: EligibilityResult | null;
  series: EquityPoint[];
}

/**
 * F1 — dashboard da conta (equity/peak/DD/headroom/payouts/trades/eligibility).
 * Tudo derivado via DataChainEngine + fórmulas únicas. Prop sem PropExtension
 * ou conta não-prop: eligibility null, limite 0.
 */
export async function accountDashboard(
  ds: DataService,
  chain: DataChainEngine,
  accountId: string,
): Promise<AccountDashboard | null> {
  const account = await ds.accounts.get(accountId);
  if (!account) return null;
  const prop = account.kind === "prop" ? await ds.propExtensions.byAccountId(accountId) : undefined;

  const [equity, series, payouts, trades] = await Promise.all([
    chain.computeEquity(accountId),
    chain.equitySeries(accountId),
    ds.payouts.list(),
    ds.trades.list(),
  ]);

  const peak = series.reduce((m, p) => Math.max(m, p.equity), equity);
  const nominal = prop?.nominalSize ?? 0;
  const limitPct = prop ? (prop.trailingDD ?? prop.maxDD ?? 0) : 0;
  const limitValue = r2acct(nominal * limitPct);
  const ddValue = r2acct(Math.max(0, peak - equity));
  const fraction = limitValue > 0 ? Number((ddValue / limitValue).toFixed(4)) : 0;

  const mine = payouts.filter((p) => (p.accountIds || []).includes(accountId));
  const totalNet = r2acct(
    mine.reduce((s, p) => s + (p.status === "Pending" ? 0 : (p.splitByAccount?.[accountId]?.net ?? 0)), 0),
  );

  const tstats = accountTradeStats(trades, accountId);
  const eligibility = prop
    ? computePayoutEligibility({
        equity,
        target: prop.target ?? 0,
        drawdownUsed: fraction,
        daysOperated: tstats.daysOperated,
        minDays: prop.minDays ?? 0,
        bestSingleDayProfit: tstats.bestSingleDay,
        totalProfit: tstats.totalProfit,
        consistencyPct: prop.consistencyPct ?? 1,
      })
    : null;

  return {
    accountId,
    equity,
    peak,
    drawdown: { value: ddValue, fraction },
    headroom: { value: r2acct(limitValue - ddValue), percent: limitValue > 0 ? Number((1 - fraction).toFixed(4)) : 0 },
    limitValue,
    payouts: { count: mine.length, totalNet },
    trades: tstats,
    eligibility,
    series,
  };
}
