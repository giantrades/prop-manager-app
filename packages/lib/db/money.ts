// STAGE 4 — Money OS (domain). Ledger LEAN + PayoutCenter + Wallets + Expenses +
// Tax Cockpit + Firm P&L. Tudo derivado de `Transaction`; NUNCA escreve saldo direto
// (anti-currentFunding). Fórmulas só daqui + `02-FINANCIAL_FORMULAS.md`.
//
// Fonte: DOCS/05_STAGE4_MONEY_OS/00-produto.md + 01-tasks.md
//
// Regras duras:
//  - `rate=0` PROIBIDO (zera cálculo silenciosamente).
//  - Split por PESO (nunca `amount/n`).
//  - Conta falhada: Transaction nunca é deletada; só `Account.phase='failed'`.
//  - Câmbio PTAX de venda do dia do recebimento guardado na Transaction.rate.

import type { DataService } from './DataService';
import type { DataChainEngine } from './DataChainEngine';
import { tradeNetPnl } from './financialFormulas';
import { nowIso, parseDate, startOfDay, compareIso, addDaysIso, daysBetween } from './dateUtils';
import type {
  Account,
  Payout,
  PayoutSplit,
  Trade,
  Transaction,
  TransactionKind,
  TransactionRef,
} from './types';

// ---------------------------------------------------------------------------
// Constantes / categorias
// ---------------------------------------------------------------------------

/** Categorias de despesa (trader-first, não YNAB completo). */
export const EXPENSE_CATEGORIES = [
  'Moradia',
  'Alimentação',
  'Transporte',
  'Saúde',
  'Lazer',
  'Impostos',
  'Trading',
  'Invest',
  'Educação',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/** Alíquotas de IR no Brasil (day-trade 20%, swing 15%) — FINANCIAL_FORMULAS.md. */
export const TAX_RATE_DAY = 0.2;
export const TAX_RATE_SWING = 0.15;

/** Kinds que representam custo/despesa (saem do caixa). */
export const COST_KINDS: ReadonlySet<TransactionKind> = new Set([
  'challenge_cost',
  'reset_fee',
  'monthly_fee',
  'commission',
  'swap',
  'fee',
  'expense',
  'tax_reserve',
]);

/** Kinds que representam receita (entram no caixa). */
export const INCOME_KINDS: ReadonlySet<TransactionKind> = new Set([
  'payout_in',
  'rebate',
  'income',
  'dividend',
  'option_premium',
]);

/**
 * "Dinheiro pessoal" (Gastos gerais / Mobills): o que o usuário REALMENTE ganha e gasta.
 * Exclui o que vem de TRADING (comissões/swaps/fees/rebates e custos de firm) — aquilo é
 * dinheiro da plataforma/conta, não o caixa pessoal — e a reserva de imposto (que tem
 * widget próprio). Assim card = gráfico = lista de lançamentos.
 */
export const PERSONAL_INCOME_KINDS: ReadonlySet<TransactionKind> = new Set([
  'payout_in',
  'income',
  'dividend',
  'option_premium',
]);
export const PERSONAL_EXPENSE_KINDS: ReadonlySet<TransactionKind> = new Set([
  'expense',
]);

/** Kinds neutros (movimentação de ativo, não consumo). */
export const NEUTRAL_KINDS: ReadonlySet<TransactionKind> = new Set([
  'transfer',
  'buy',
  'sell',
]);

// ---------------------------------------------------------------------------
// Helpers puros
// ---------------------------------------------------------------------------

/** round pra 2 casas, evitando drift de floating point. */
function r2(v: number): number {
  return Number(v.toFixed(2));
}

/**
 * Divide um total por PESO (nunca `amount/n`). Normaliza os pesos; corrige o drift
 * de arredondamento jogando o residual no bucket de maior peso.
 */
export function splitByWeight(total: number, weights: Record<string, number>): Record<string, number> {
  const entries = Object.entries(weights);
  if (entries.length === 0) return {};
  const sum = entries.reduce((s, [, w]) => s + Math.max(0, w), 0);
  if (sum <= 0) return { [entries[0][0]]: r2(total) };

  const out: Record<string, number> = {};
  let allocated = 0;
  for (const [id, w] of entries) {
    const share = total * (Math.max(0, w) / sum);
    out[id] = r2(share);
    allocated += share;
  }
  const residual = r2(total - allocated);
  if (Math.abs(residual) > 0.001) {
    const maxId = entries.reduce((a, b) => (weights[a[0]] >= weights[b[0]] ? a : b))[0];
    out[maxId] = r2((out[maxId] ?? 0) + residual);
  }
  return out;
}

/**
 * Monta o `splitByAccount` de um payout por peso. Cada conta recebe `gross` rateado
 * pelo peso, `fee` = gross * feePct, `net` = gross - fee.
 */
export function computePayoutSplitByWeight(
  gross: number,
  feePct: number,
  weights: Record<string, number>,
): Record<string, PayoutSplit> {
  const grossSplit = splitByWeight(gross, weights);
  const out: Record<string, PayoutSplit> = {};
  for (const [accountId, g] of Object.entries(grossSplit)) {
    const fee = r2(g * feePct);
    out[accountId] = { gross: g, fee, net: r2(g - fee) };
  }
  return out;
}

/** day-trade = abre e fecha no MESMO dia (na data da própria firm, sem `split('T')`). */
export function isDayTrade(trade: Trade): boolean {
  if (!trade.exitDatetime) return false;
  const entry = parseDate(trade.entryDatetime);
  const exit = parseDate(trade.exitDatetime);
  return startOfDay(entry).getTime() === startOfDay(exit).getTime();
}

/** Converte um valor pra BRL usando a taxa guardada na Transaction (rate=0 proibido). */
export function toBRL(amount: number, rate?: number): number | null {
  if (rate == null || rate <= 0) return null; // rate=0 PROIBIDO (zera cálculo)
  return amount * rate;
}

/**
 * Último dia útil (segunda..sexta) de um mês. `yearMonth` é "YYYY-MM".
 * Usado pra prazo do DARF (último dia útil do mês seguinte ao do trade).
 */
export function lastBusinessDayOfMonth(year: number, month: number): Date {
  // month é 1-based.
  const lastDay = new Date(year, month, 0); // último dia do mês
  const d = new Date(lastDay);
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() - 1);
  }
  return d;
}

/** Prazo DARF = último dia útil do mês seguinte ao mês dos trades. */
export function darfDeadline(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  const nextYear = m === 12 ? y + 1 : y;
  const nextMonth = m === 12 ? 1 : m + 1;
  return lastBusinessDayOfMonth(nextYear, nextMonth).toISOString();
}

// ---------------------------------------------------------------------------
// #4 — Dividendos: histórico, renda por mês/ativo e calendário de renda (puro).
// ---------------------------------------------------------------------------

export interface DividendRow {
  id: string;
  date: string;
  amount: number;
  currency: string;
  positionId: string;
  note?: string;
}

/** Proventos RECEBIDOS (kind='dividend' ligado a uma posição), mais recentes primeiro. */
export function dividendHistory(transactions: Transaction[]): DividendRow[] {
  return transactions
    .filter((t) => t.kind === 'dividend' && t.ref?.type === 'investmentId' && !!t.ref.id)
    .map((t) => ({
      id: t.id,
      date: t.date,
      amount: r2(Math.abs(t.amount)),
      currency: t.currency,
      positionId: (t.ref as { id: string }).id,
      note: t.note,
    }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export interface DividendMonthPoint { ym: string; amount: number; count: number; }

/** Renda por mês (opcionalmente restrita a uma lista de `ym`), ordenada cronologicamente. */
export function dividendIncomeByMonth(rows: DividendRow[], months?: string[]): DividendMonthPoint[] {
  const map = new Map<string, { amount: number; count: number }>();
  for (const d of rows) {
    const ym = d.date.slice(0, 7);
    if (months && months.length && !months.includes(ym)) continue;
    const cur = map.get(ym) ?? { amount: 0, count: 0 };
    cur.amount += d.amount;
    cur.count += 1;
    map.set(ym, cur);
  }
  return [...map.entries()]
    .map(([ym, v]) => ({ ym, amount: r2(v.amount), count: v.count }))
    .sort((a, b) => a.ym.localeCompare(b.ym));
}

export interface DividendAssetPoint { positionId: string; symbol: string; amount: number; count: number; }

/** Renda por ativo (usa o mapa positionId→symbol; sem símbolo fica o próprio id). */
export function dividendByAsset(rows: DividendRow[], symbolById: Record<string, string> = {}): DividendAssetPoint[] {
  const map = new Map<string, { amount: number; count: number }>();
  for (const d of rows) {
    const cur = map.get(d.positionId) ?? { amount: 0, count: 0 };
    cur.amount += d.amount;
    cur.count += 1;
    map.set(d.positionId, cur);
  }
  return [...map.entries()]
    .map(([positionId, v]) => ({ positionId, symbol: symbolById[positionId] ?? positionId, amount: r2(v.amount), count: v.count }))
    .sort((a, b) => b.amount - a.amount);
}

/** Evento anunciado mínimo (estrutura compatível com `DividendEvent`). */
export interface DividendAnnouncement { symbol: string; exDate: string; amountPerShare?: number; note?: string; }

export interface DividendCalendarDay {
  date: string;
  day: number;
  /** Total recebido nesse dia. */
  received: number;
  /** Anúncios (data-com) nesse dia. */
  announced: DividendAnnouncement[];
}

/** Calendário de renda de um mês: recebido + anunciado, dia a dia. */
export function dividendCalendar(
  rows: DividendRow[],
  events: DividendAnnouncement[],
  yearMonth: string,
): DividendCalendarDay[] {
  const [y, m] = yearMonth.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  const recv = new Map<number, number>();
  for (const d of rows) {
    if (d.date.slice(0, 7) !== yearMonth) continue;
    const day = Number(d.date.slice(8, 10));
    recv.set(day, (recv.get(day) ?? 0) + d.amount);
  }
  const ann = new Map<number, DividendAnnouncement[]>();
  for (const e of events ?? []) {
    if ((e.exDate || '').slice(0, 7) !== yearMonth) continue;
    const day = Number(e.exDate.slice(8, 10));
    const arr = ann.get(day) ?? [];
    arr.push(e);
    ann.set(day, arr);
  }
  return Array.from({ length: last }, (_, i) => {
    const day = i + 1;
    return {
      date: `${yearMonth}-${String(day).padStart(2, '0')}`,
      day,
      received: r2(recv.get(day) ?? 0),
      announced: ann.get(day) ?? [],
    };
  });
}

/** Janela da fatura aberta de um cartão (por dia de fechamento). */
export interface InvoiceCycle {
  /** Início (exclusivo) da fatura aberta: logo após o fechamento anterior. */
  start: string;
  /** Fechamento da fatura aberta (inclusivo). */
  end: string;
}

/**
 * #1 — Fatura ABERTA de um cartão a partir do dia de fechamento. Puro: dado o dia
 * de fechamento (1..28) e uma referência, devolve a janela [start, end] da fatura
 * que ainda está aberta (a que fecha no próximo fechamento). `closingDay` fora do
 * intervalo => dia 1 (comportamento previsível, nunca lança).
 */
export function invoiceCycle(closingDay?: number, ref: Date = new Date()): InvoiceCycle {
  const d = Math.min(28, Math.max(1, Math.floor(closingDay || 1)));
  const y = ref.getUTCFullYear();
  const m = ref.getUTCMonth();
  const day = ref.getUTCDate();
  // Se hoje passou do fechamento, a fatura aberta fecha no mês seguinte.
  let closeM = m;
  let closeY = y;
  if (day > d) {
    closeM = m + 1;
    if (closeM > 11) { closeM = 0; closeY = y + 1; }
  }
  const end = new Date(Date.UTC(closeY, closeM, d, 23, 59, 59, 999));
  const prevClose = new Date(Date.UTC(closeY, closeM - 1, d, 23, 59, 59, 999));
  return { start: new Date(prevClose.getTime() + 1).toISOString(), end: end.toISOString() };
}

// ---------------------------------------------------------------------------
// H5 — Fatura do cartão: aberta / fechada / paga / parcial
// ---------------------------------------------------------------------------

export type CardInvoiceState = 'aberta' | 'fechada' | 'paga' | 'parcial';

export interface CardInvoiceStatus {
  /** 'YYYY-MM' do fechamento (competência). */
  competencia: string;
  /** Fechamento da fatura (ISO, inclusivo). */
  fechamento: string;
  /** Vencimento (ISO; primeiro dia `dueDay` em/após o fechamento). */
  vencimento: string;
  /** Total gasto no cartão dentro do ciclo. */
  total: number;
  /** Já pago desta competência (baixas `invoice`). */
  pago: number;
  /** Falta pagar (nunca negativo). */
  restante: number;
  estado: CardInvoiceState;
  closingDay?: number;
  dueDay?: number;
}

/** Cartão mínimo aceito pelo seletor (evita dependência de `Card` completo). */
export interface InvoiceCardLike {
  id: string;
  name: string;
  closingDay?: number;
  dueDay?: number;
}

/**
 * H5 — estado da fatura de um cartão. Reusa `invoiceCycle` (janela por fechamento) e
 * as despesas do cartão no ciclo. `pago` = Σ baixas (`transfer` com `invoice`) da
 * competência. Sem fórmula financeira nova — só agregação.
 * `registry` é a lista de cartões (para casar `cardId`/nome); opcional.
 */
export function invoiceStatus(
  card: InvoiceCardLike,
  transactions: Transaction[],
  ref: Date = new Date(),
): CardInvoiceStatus {
  const cyc = invoiceCycle(card.closingDay, ref);
  const competencia = cyc.end.slice(0, 7);
  const fechamento = cyc.end;
  // Vencimento: primeiro dia `dueDay` (ou o fechamento, se não houver) em/após o fechamento.
  const dd = Math.min(28, Math.max(1, Math.floor(card.dueDay || card.closingDay || 1)));
  const endDate = new Date(cyc.end);
  let vy = endDate.getUTCFullYear();
  let vm = endDate.getUTCMonth();
  if (dd <= endDate.getUTCDate()) {
    vm += 1;
    if (vm > 11) { vm = 0; vy += 1; }
  }
  const vencimento = new Date(Date.UTC(vy, vm, dd, 12, 0, 0)).toISOString();

  const matches = (t: Transaction) => t.cardId === card.id || (!t.cardId && t.card === card.name);
  let total = 0;
  for (const t of transactions) {
    if (t.kind !== 'expense') continue;
    if (!matches(t)) continue;
    if (t.date < cyc.start || t.date > cyc.end) continue;
    total += Math.abs(t.amount);
  }
  let pago = 0;
  for (const t of transactions) {
    if (t.invoice?.cardId !== card.id) continue;
    if (t.invoice.competencia !== competencia) continue;
    pago += Math.abs(t.amount);
  }
  total = r2(total);
  pago = r2(pago);
  const restante = r2(Math.max(0, total - pago));
  const nowIsoStr = ref.toISOString();
  let estado: CardInvoiceState;
  if (total <= 0) estado = 'aberta';
  else if (pago > 0 && pago >= total) estado = 'paga';
  else if (pago > 0) estado = 'parcial';
  else if (nowIsoStr > fechamento) estado = 'fechada';
  else estado = 'aberta';
  return { competencia, fechamento, vencimento, total, pago, restante, estado, closingDay: card.closingDay, dueDay: card.dueDay };
}

// ---------------------------------------------------------------------------
// Firm P&L (puro) — exigência "quanto gastei com cada propfirm?"
// ---------------------------------------------------------------------------

export interface FirmPnlResult {
  firmId: string;
  payouts: number;      // Σ payout_in
  costs: number;        // Σ (challenge_cost + reset_fee + monthly_fee + fee) como magnitude
  rebates: number;      // Σ rebate
  fees: number;         // Σ (commission + swap) como magnitude
  profit: number;       // payouts - costs + rebates - fees
}

/**
 * Firm P&L = Σ payout_in - Σ(challenge+reset+monthly+fee) + Σ rebate - Σ(commission+swap).
 * Só considera transactions com `firmId` igual ao informado.
 */
export function computeFirmPnl(transactions: Transaction[], firmId: string): FirmPnlResult {
  let payouts = 0;
  let costs = 0;
  let rebates = 0;
  let fees = 0;
  for (const t of transactions) {
    if (t.firmId !== firmId) continue;
    switch (t.kind) {
      case 'payout_in':
        payouts += t.amount;
        break;
      case 'challenge_cost':
      case 'reset_fee':
      case 'monthly_fee':
      case 'fee':
        costs += Math.abs(t.amount);
        break;
      case 'rebate':
        rebates += t.amount;
        break;
      case 'commission':
      case 'swap':
        fees += Math.abs(t.amount);
        break;
      default:
        break;
    }
  }
  const profit = r2(payouts - costs + rebates - fees);
  return { firmId, payouts: r2(payouts), costs: r2(costs), rebates: r2(rebates), fees: r2(fees), profit };
}

/**
 * Firm P&L por conta (dentro de um firm). Útil pra `Accounts.jsx` mostrar
 * `recebido - gasto - fees + rebates` por conta, não só `currentFunding`.
 */
export function computeFirmPnlByAccount(
  transactions: Transaction[],
  firmId: string,
): Record<string, FirmPnlResult> {
  const out: Record<string, FirmPnlResult> = {};
  for (const t of transactions) {
    if (t.firmId !== firmId) continue;
    const accountId = t.accountId || '__none__';
    const acc = out[accountId] ?? {
      firmId,
      payouts: 0,
      costs: 0,
      rebates: 0,
      fees: 0,
      profit: 0,
    };
    switch (t.kind) {
      case 'payout_in':
        acc.payouts += t.amount;
        break;
      case 'challenge_cost':
      case 'reset_fee':
      case 'monthly_fee':
      case 'fee':
        acc.costs += Math.abs(t.amount);
        break;
      case 'rebate':
        acc.rebates += t.amount;
        break;
      case 'commission':
      case 'swap':
        acc.fees += Math.abs(t.amount);
        break;
      default:
        break;
    }
    acc.profit = r2(acc.payouts - acc.costs + acc.rebates - acc.fees);
    out[accountId] = acc;
  }
  // Round os números finais de cada conta.
  for (const k of Object.keys(out)) {
    const a = out[k];
    a.payouts = r2(a.payouts);
    a.costs = r2(a.costs);
    a.rebates = r2(a.rebates);
    a.fees = r2(a.fees);
    a.profit = r2(a.profit);
  }
  return out;
}

export interface FirmReportRow {
  firmId: string;
  accountId: string | null; // null = total da firm
  accountName: string;
  payouts: number;
  costs: number;
  fees: number;
  rebates: number;
  profit: number;
  brlProfit: number;
  txCount: number;
}

/**
 * A4 — linhas do relatório da firm (contador/IR): por (firm, conta) + total da firm.
 * Conversão BRL pela regra do Tax: `rate` guardado na transação (PTAX do recebimento);
 * sem rate, usa 1 e o relatório mostra valor original (nunca inventa câmbio).
 */
export function firmPnlReport(
  transactions: Transaction[],
  accounts: Array<{ id: string; name: string }> = [],
): FirmReportRow[] {
  const names = new Map(accounts.map((a) => [a.id, a.name]));
  const acc = new Map<string, FirmReportRow>();
  const key = (firmId: string, accountId: string | null) => `${firmId}|${accountId ?? ''}`;
  const cell = (firmId: string, accountId: string | null): FirmReportRow => {
    const k = key(firmId, accountId);
    let row = acc.get(k);
    if (!row) {
      row = {
        firmId,
        accountId,
        accountName: accountId ? (names.get(accountId) ?? accountId) : 'TOTAL',
        payouts: 0, costs: 0, fees: 0, rebates: 0, profit: 0, brlProfit: 0, txCount: 0,
      };
      acc.set(k, row);
    }
    return row;
  };
  for (const t of transactions) {
    if (!t.firmId) continue;
    const rate = t.rate != null && t.rate > 0 ? t.rate : 1;
    const targets: Array<string | null> = [t.accountId || '__none__', null];
    for (const accountId of targets) {
      const row = cell(t.firmId, accountId);
      row.txCount += 1;
      const signed = t.amount;
      const brl = r2(signed * rate);
      if (t.kind === 'payout_in') {
        row.payouts = r2(row.payouts + signed);
      } else if (t.kind === 'challenge_cost' || t.kind === 'reset_fee' || t.kind === 'monthly_fee' || t.kind === 'fee') {
        row.costs = r2(row.costs + Math.abs(signed));
      } else if (t.kind === 'rebate') {
        row.rebates = r2(row.rebates + signed);
      } else if (t.kind === 'commission' || t.kind === 'swap') {
        row.fees = r2(row.fees + Math.abs(signed));
      } else {
        continue;
      }
      row.profit = r2(row.payouts - row.costs + row.rebates - row.fees);
      row.brlProfit = r2(row.brlProfit + (t.kind === 'payout_in' || t.kind === 'rebate' ? brl : -Math.abs(brl)));
    }
  }
  const rows = [...acc.values()];
  const firmRank = new Map<string, number>();
  rows.filter((r) => r.accountId === null).sort((a, b) => b.profit - a.profit).forEach((r, i) => firmRank.set(r.firmId, i));
  return rows.sort((a, b) => {
    const fa = firmRank.get(a.firmId) ?? 0;
    const fb = firmRank.get(b.firmId) ?? 0;
    if (fa !== fb) return fa - fb;
    if (a.accountId === null) return -1;
    if (b.accountId === null) return 1;
    return b.profit - a.profit;
  });
}

export interface FirmHistory {
  months: string[];
  firms: string[];
  rows: Array<Record<string, number | string>>; // { ym, [firmId]: profit }
}

/** B1 — lucro por firm por mês (últimos `months`, terminando em `refYm`). */
export function firmPnlHistory(
  transactions: Transaction[],
  months: number,
  refYm?: string,
): FirmHistory {
  const now = new Date();
  const ref = refYm ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [ry, rm] = ref.split('-').map(Number);
  const monthList: string[] = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(ry, rm - 1 - i, 1);
    monthList.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const inRange = new Set(monthList);
  // firmId -> ym -> profit
  const grid = new Map<string, Map<string, number>>();
  const signed = (t: Transaction): number | null => {
    if (t.kind === 'payout_in' || t.kind === 'rebate') return t.amount;
    if (
      t.kind === 'challenge_cost' || t.kind === 'reset_fee' || t.kind === 'monthly_fee' ||
      t.kind === 'fee' || t.kind === 'commission' || t.kind === 'swap'
    ) {
      return -Math.abs(t.amount);
    }
    return null;
  };
  for (const t of transactions) {
    if (!t.firmId) continue;
    const ym = t.date.slice(0, 7);
    if (!inRange.has(ym)) continue;
    const v = signed(t);
    if (v == null) continue;
    let row = grid.get(t.firmId);
    if (!row) {
      row = new Map();
      grid.set(t.firmId, row);
    }
    row.set(ym, r2((row.get(ym) ?? 0) + v));
  }
  const firms = [...grid.keys()].sort();
  const rows = monthList.map((ym) => {
    const row: Record<string, number | string> = { ym };
    for (const f of firms) row[f] = grid.get(f)?.get(ym) ?? 0;
    return row;
  });
  return { months: monthList, firms, rows };
}

export interface ChallengeEv {
  attempts: number;
  approved: number;
  approvalRate: number | null;
  totalCost: number;
  avgCost: number | null;
  avgPayout: number | null;
  ev: number | null;
  sampleOk: boolean; // attempts >= 5
}

/**
 * F7 — Challenge como decisão de EV (aposta ousada).
 * attempts = nº de `challenge_cost` pagos; approved = contas distintas pagantes que
 * chegaram a `funded`; avgPayout = média dos `payout_in` líquidos;
 * EV = approvalRate × avgPayout − avgCost. `sampleOk` exige attempts >= 5 —
 * abaixo disso, sempre "sem amostra" (nunca um sinal).
 * Com `firmId`, filtra custos/payouts da firm; aprovadas = funded entre as pagantes.
 */
export function challengeEv(
  transactions: Transaction[],
  props: Array<{ accountId: string; phase: string }>,
  firmId?: string,
): ChallengeEv {
  const inFirm = (t: Transaction) => !firmId || t.firmId === firmId;
  const costs = transactions.filter((t) => t.kind === 'challenge_cost' && inFirm(t));
  const allCostKinds = transactions.filter(
    (t) => (t.kind === 'challenge_cost' || t.kind === 'reset_fee' || t.kind === 'monthly_fee') && inFirm(t),
  );
  const payouts = transactions.filter((t) => t.kind === 'payout_in' && inFirm(t));
  const attempts = costs.length;
  const payerIds = new Set(costs.map((t) => t.accountId).filter(Boolean));
  const fundedIds = new Set(props.filter((p) => p.phase === 'funded' || p.phase === 'live').map((p) => p.accountId));
  const approved = [...payerIds].filter((id) => fundedIds.has(id)).length;
  const totalCost = r2(allCostKinds.reduce((s, t) => s + Math.abs(t.amount), 0));
  const avgCost = attempts > 0 ? r2(totalCost / attempts) : null;
  const avgPayout = payouts.length > 0 ? r2(payouts.reduce((s, t) => s + t.amount, 0) / payouts.length) : null;
  const approvalRate = attempts > 0 ? Number((approved / attempts).toFixed(4)) : null;
  const sampleOk = attempts >= 5;
  const ev = sampleOk && approvalRate != null && avgPayout != null && avgCost != null
    ? r2(approvalRate * avgPayout - avgCost)
    : null;
  return { attempts, approved, approvalRate, totalCost, avgCost, avgPayout, ev, sampleOk };
}

// ---------------------------------------------------------------------------
// Wallet / cash flow (puro)
// ---------------------------------------------------------------------------

/** Saldo de uma conta = Σ (amount assinado) das transactions da conta. */
export function computeAccountBalance(transactions: Transaction[], accountId: string): number {
  let bal = 0;
  for (const t of transactions) {
    if (t.accountId === accountId) bal += t.amount;
  }
  return r2(bal);
}

export interface WalletSummaryRow {
  account: Account;
  currency: string;
  balance: number;
  inflows: number;
  outflows: number;
}

/**
 * Cash flow unificado por conta/carteira. `inflows` = entradas de caixa;
 * `outflows` = saídas (magnitude). Neutral (transfer/buy/sell) NÃO é contado como
 * inflow/outflow de consumo (é movimentação de ativo).
 */
export function computeWalletSummary(
  accounts: Account[],
  transactions: Transaction[],
  opts?: { walletKinds?: Account['kind'][] },
): WalletSummaryRow[] {
  const kinds = opts?.walletKinds ?? ['wallet', 'bank', 'cash', 'crypto'];
  const rows: WalletSummaryRow[] = [];
  for (const account of accounts) {
    if (!kinds.includes(account.kind)) continue;
    let balance = 0;
    let inflows = 0;
    let outflows = 0;
    for (const t of transactions) {
      if (t.accountId !== account.id) continue;
      balance += t.amount;
      if (INCOME_KINDS.has(t.kind)) inflows += t.amount;
      else if (COST_KINDS.has(t.kind)) outflows += Math.abs(t.amount);
    }
    // BALANCE da conta: o saldo da PLATAFORMA (bridge) manda quando existe — é o que a
    // corretora reporta (já inclui fees/resultado). O ledger é fallback.
    const platform = Number(account.platformBalance);
    if (account.platformAccountId && Number.isFinite(platform)) {
      balance = platform;
    }
    rows.push({ account, currency: account.currency, balance: r2(balance), inflows: r2(inflows), outflows: r2(outflows) });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Free Cash mensal (trader-first)
// ---------------------------------------------------------------------------

export interface FreeCashResult {
  income: number;   // payouts + rebates
  expenses: number; // expenses + tax + fees + custos
  freeCash: number;
}

/**
 * Free Cash = Income - Expenses, restrito ao DINHEIRO PESSOAL (PERSONAL_*_KINDS):
 * Income = income + payout_in + dividend; Expenses = expense.
 * Comissões/swaps/fees/rebates e custos de firm (challenge/reset/monthly) NÃO entram —
 * são dinheiro da plataforma, não o caixa pessoal (evita card ≠ gráfico ≠ lista).
 * Transfer/buy/sell são neutros (movimentação de ativo, não consumo).
 * D1 — títulos ainda NÃO pagos (`paid === false`) ficam fora do caixa (são "a pagar");
 * entram quando quitados. Legado sem o campo continua contando (pago).
 */
export function computeFreeCash(transactions: Transaction[], yearMonth: string): FreeCashResult {
  let income = 0;
  let expenses = 0;
  for (const t of transactions) {
    const ym = t.date.slice(0, 7);
    if (ym !== yearMonth) continue;
    if (t.paid === false) continue;
    if (PERSONAL_INCOME_KINDS.has(t.kind)) income += t.amount;
    else if (PERSONAL_EXPENSE_KINDS.has(t.kind)) expenses += Math.abs(t.amount);
  }
  return { income: r2(income), expenses: r2(expenses), freeCash: r2(income - expenses) };
}

// ---------------------------------------------------------------------------
// H8 — Extrato: saldo acumulado por dia (derivado, sem fórmula nova)
// ---------------------------------------------------------------------------

export interface DailyBalanceRow {
  /** 'YYYY-MM-DD' */
  day: string;
  income: number;
  expenses: number;
  /** income - expenses do dia. */
  net: number;
  /** Saldo acumulado (opening + Σ net até o dia, inclusive). */
  balance: number;
}

/** H8 — saldo pessoal acumulado ANTES de `beforeYm` (meses anteriores). */
export function openingBalance(transactions: Transaction[], beforeYm: string): number {
  let bal = 0;
  for (const t of transactions) {
    if (t.paid === false) continue;
    const ym = (t.date || '').slice(0, 7);
    if (!ym || ym >= beforeYm) continue;
    if (PERSONAL_INCOME_KINDS.has(t.kind)) bal += t.amount;
    else if (PERSONAL_EXPENSE_KINDS.has(t.kind)) bal -= Math.abs(t.amount);
  }
  return r2(bal);
}

/**
 * H8 — saldo acumulado dia a dia nos meses de `months`, partindo de `opening`.
 * Só inclui dias com movimento (pagos). O saldo do último dia = `opening` +
 * `computeFreeCash` do período (fecha por construção).
 */
export function dailyBalance(
  transactions: Transaction[],
  months: string[],
  opening = 0,
): DailyBalanceRow[] {
  const set = new Set(months);
  const map = new Map<string, { income: number; expenses: number }>();
  for (const t of transactions) {
    if (t.paid === false) continue;
    const day = (t.date || '').slice(0, 10);
    if (!day) continue;
    if (!set.has(day.slice(0, 7))) continue;
    const e = map.get(day) ?? { income: 0, expenses: 0 };
    if (PERSONAL_INCOME_KINDS.has(t.kind)) e.income = r2(e.income + t.amount);
    else if (PERSONAL_EXPENSE_KINDS.has(t.kind)) e.expenses = r2(e.expenses + Math.abs(t.amount));
    map.set(day, e);
  }
  let bal = r2(opening);
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, v]) => {
      const net = r2(v.income - v.expenses);
      bal = r2(bal + net);
      return { day, income: v.income, expenses: v.expenses, net, balance: bal };
    });
}

// ---------------------------------------------------------------------------
// D1 — Contas a pagar/receber (títulos pendentes)
// ---------------------------------------------------------------------------

export interface PendingBill {
  tx: Transaction;
  dueDate: string;
  overdue: boolean;
}

/** D1 — títulos pendentes (expense ou ganho com `paid === false`), por vencimento. */
export function pendingBills(transactions: Transaction[], refIso?: string): PendingBill[] {
  const today = (refIso ?? nowIso()).slice(0, 10);
  return transactions
    .filter((t) => t.paid === false && (t.kind === 'expense' || INCOME_KINDS.has(t.kind)))
    .map((t) => {
      const due = (t.dueDate ?? t.date ?? '').slice(0, 10);
      return { tx: t, dueDate: due, overdue: due !== '' && due < today };
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/** D1 — soma a pagar × a receber dos títulos pendentes. */
export function pendingSummary(
  transactions: Transaction[],
  refIso?: string,
): { payable: number; receivable: number; count: number; overdue: number } {
  let payable = 0;
  let receivable = 0;
  let overdue = 0;
  for (const b of pendingBills(transactions, refIso)) {
    if (b.tx.kind === 'expense') payable += Math.abs(b.tx.amount);
    else receivable += b.tx.amount;
    if (b.overdue) overdue += 1;
  }
  return { payable: r2(payable), receivable: r2(receivable), count: pendingBills(transactions, refIso).length, overdue };
}

export interface UpcomingBill {
  tx: Transaction;
  dueDate: string;
  overdue: boolean;
  /** Dias até o vencimento (negativo = atrasado). */
  days: number;
  source: 'pending' | 'recurring';
}

/**
 * H9 — próximos vencimentos (janela de `days`) = títulos pendentes com vencimento até
 * `refIso + days` (inclui atrasados) + templates recorrentes do mês ainda não gerados
 * cujo dia cai na janela. Ordenado por vencimento. Base para "o que vence em N dias".
 */
export function upcomingBills(transactions: Transaction[], refIso?: string, days = 15): UpcomingBill[] {
  const today = (refIso ?? nowIso()).slice(0, 10);
  const horizon = addDaysIso(`${today}T12:00:00.000Z`, days).slice(0, 10);
  const out: UpcomingBill[] = [];
  for (const b of pendingBills(transactions, refIso)) {
    if (b.dueDate && b.dueDate <= horizon) {
      out.push({ tx: b.tx, dueDate: b.dueDate, overdue: b.overdue, days: daysBetween(today, b.dueDate), source: 'pending' });
    }
  }
  const ym = today.slice(0, 7);
  for (const tpl of recurringDue(transactions, ym)) {
    const day = Math.min(28, Math.max(1, tpl.recurrence?.day ?? 1));
    const due = `${ym}-${String(day).padStart(2, '0')}`;
    if (due <= horizon) {
      out.push({ tx: tpl, dueDate: due, overdue: due < today, days: daysBetween(today, due), source: 'recurring' });
    }
  }
  return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/** H9 — totais da janela de próximos vencimentos. */
export function upcomingSummary(
  transactions: Transaction[],
  refIso?: string,
  days = 15,
): { payable: number; receivable: number; count: number; overdue: number } {
  let payable = 0;
  let receivable = 0;
  let overdue = 0;
  const rows = upcomingBills(transactions, refIso, days);
  for (const b of rows) {
    if (b.tx.kind === 'expense') payable += Math.abs(b.tx.amount);
    else receivable += b.tx.amount;
    if (b.overdue) overdue += 1;
  }
  return { payable: r2(payable), receivable: r2(receivable), count: rows.length, overdue };
}

// ---------------------------------------------------------------------------
// D4 — Ranking por estabelecimento (derivado da note; sem campo novo)
// ---------------------------------------------------------------------------

export interface MerchantRank {
  name: string;
  total: number;
  count: number;
}

/** D4 — despesas do mês agrupadas por descrição normalizada (estabelecimento). */
export function merchantRanking(
  transactions: Transaction[],
  yearMonth: string,
  limit = 8,
): MerchantRank[] {
  const acc = new Map<string, MerchantRank>();
  for (const t of transactions) {
    if (t.kind !== 'expense') continue;
    if (t.date.slice(0, 7) !== yearMonth) continue;
    if (t.paid === false) continue;
    const name = (t.note ?? '').trim().replace(/\s+/g, ' ');
    if (!name) continue;
    const key = name.toLowerCase();
    const cur = acc.get(key) ?? { name, total: 0, count: 0 };
    cur.total = r2(cur.total + Math.abs(t.amount));
    cur.count += 1;
    acc.set(key, cur);
  }
  return [...acc.values()].sort((a, b) => b.total - a.total).slice(0, limit);
}

// ---------------------------------------------------------------------------
// Módulo Gastos/Mobills (G1–G9). Agregações puras + categorias + orçamento.
// Fonte: DOCS/10_MODULES/gastos/00-spec.md
// ---------------------------------------------------------------------------

/** Categoria: id estável + nome + ícone lucide (nome) + token de cor (variável CSS). */
export interface CategoryDef {
  id: string;
  name: string;
  icon: string; // nome do componente lucide-react (ex.: 'House')
  color: string; // token: 'blue'|'green'|'yellow'|'red'|'brand'|'gray'
  /** Agrupamento opcional. `imposto` = entra no widget de Impostos. */
  group?: string;
  /** H6 — categoria-pai (1 nível). Ausente = categoria raiz. Aditivo. */
  parent?: string;
}

/** Categoria de imposto (usado pelo widget de Impostos). */
export const TAX_CATEGORY_GROUP = 'imposto';

export const DEFAULT_CATEGORIES: CategoryDef[] = [
  { id: 'moradia', name: 'Moradia', icon: 'House', color: 'blue' },
  { id: 'alimentacao', name: 'Alimentação', icon: 'UtensilsCrossed', color: 'green' },
  { id: 'transporte', name: 'Transporte', icon: 'Car', color: 'yellow' },
  { id: 'saude', name: 'Saúde', icon: 'HeartPulse', color: 'red' },
  { id: 'lazer', name: 'Lazer', icon: 'Gamepad2', color: 'brand' },
  { id: 'impostos', name: 'Impostos', icon: 'Landmark', color: 'gray', group: TAX_CATEGORY_GROUP },
  { id: 'trading', name: 'Trading', icon: 'TrendingUp', color: 'green' },
  { id: 'invest', name: 'Invest', icon: 'Briefcase', color: 'blue' },
  { id: 'educacao', name: 'Educação', icon: 'GraduationCap', color: 'yellow' },
  // Tipos de imposto (todos com group=imposto) — separação p/ visualizar o que é pago.
  { id: 'imposto-ir', name: 'IR', icon: 'Receipt', color: 'red', group: TAX_CATEGORY_GROUP },
  { id: 'imposto-darf', name: 'DARF', icon: 'Receipt', color: 'red', group: TAX_CATEGORY_GROUP },
  { id: 'imposto-itbi', name: 'ITBI', icon: 'Landmark', color: 'blue', group: TAX_CATEGORY_GROUP },
  { id: 'imposto-iptu', name: 'IPTU', icon: 'House', color: 'blue', group: TAX_CATEGORY_GROUP },
  { id: 'imposto-iof', name: 'IOF', icon: 'Coins', color: 'yellow', group: TAX_CATEGORY_GROUP },
  { id: 'imposto-cripto', name: 'Cripto', icon: 'Coins', color: 'yellow', group: TAX_CATEGORY_GROUP },
  { id: 'imposto-exterior', name: 'Exterior', icon: 'Landmark', color: 'gray', group: TAX_CATEGORY_GROUP },
];

const CATEGORY_META_KEY = 'expense:categories';
const BUDGET_META_KEY = 'expense:budgets';
const ROLLOVER_META_KEY = 'expense:rollover';
const HIDDEN_CATEGORY_META_KEY = 'expense:categories:hidden';
const CATEGORY_ORDER_META_KEY = 'expense:categories:order';

/** H12 — categorias ocultas/removidas (defaults não podem sair do código; ficam ocultas). */
async function readHiddenCats(ds: DataService): Promise<string[]> {
  const rec = await ds.meta.getKey(HIDDEN_CATEGORY_META_KEY);
  const v = rec?.value;
  return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
}

/** H12 — ordem customizada das categorias. */
export async function getCategoryOrder(ds: DataService): Promise<string[]> {
  const rec = await ds.meta.getKey(CATEGORY_ORDER_META_KEY);
  const v = rec?.value;
  return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
}

export async function setCategoryOrder(ds: DataService, ids: string[]): Promise<string[]> {
  const clean = [...new Set(ids.filter((x) => typeof x === 'string' && x))];
  await ds.meta.setKey(CATEGORY_ORDER_META_KEY, clean);
  return getCategoryOrder(ds);
}

/** Lista categorias (custom salvas em meta + defaults). Custom sobrescreve default de mesmo id.
 * H12: filtra as ocultas e aplica a ordem customizada (quando existir). */
export async function listCategories(ds: DataService): Promise<CategoryDef[]> {
  const [rec, hidden, order] = await Promise.all([
    ds.meta.getKey(CATEGORY_META_KEY),
    readHiddenCats(ds),
    getCategoryOrder(ds),
  ]);
  const custom = Array.isArray(rec?.value) ? (rec.value as CategoryDef[]) : [];
  const byId = new Map<string, CategoryDef>();
  for (const c of DEFAULT_CATEGORIES) byId.set(c.id, c);
  for (const c of custom) {
    if (c && typeof c.id === 'string' && typeof c.name === 'string') {
      byId.set(c.id, {
        id: c.id,
        name: c.name,
        icon: typeof c.icon === 'string' && c.icon ? c.icon : 'Tag',
        color: typeof c.color === 'string' && c.color ? c.color : 'gray',
        group: typeof c.group === 'string' ? c.group : undefined,
        parent: typeof c.parent === 'string' && c.parent ? c.parent : undefined,
      });
    }
  }
  const hiddenSet = new Set(hidden);
  const list = [...byId.values()].filter((c) => !hiddenSet.has(c.id));
  if (order.length) {
    const idx = new Map(order.map((id, i) => [id, i]));
    list.sort((a, b) => (idx.get(a.id) ?? 9999) - (idx.get(b.id) ?? 9999));
  }
  return list;
}

/** Salva categoria custom (upsert por id). */
export async function saveCategory(ds: DataService, cat: CategoryDef): Promise<CategoryDef[]> {
  const rec = await ds.meta.getKey(CATEGORY_META_KEY);
  const custom = Array.isArray(rec?.value) ? (rec.value as CategoryDef[]) : [];
  const next = custom.filter((c) => c?.id !== cat.id).concat([cat]);
  await ds.meta.setKey(CATEGORY_META_KEY, next);
  return listCategories(ds);
}

/**
 * H12 — move TODOS os lançamentos de `fromId` para `toId` (campo estruturado + legado
 * por prefixo na note). Retorna quantos foram movidos. Nunca deixa órfão.
 */
export async function reassignCategory(
  ds: DataService,
  fromId: string,
  toId: string,
  cats: CategoryDef[] = DEFAULT_CATEGORIES,
): Promise<number> {
  if (!fromId || !toId || fromId === toId) return 0;
  const from = cats.find((c) => c.id === fromId);
  const txs = await ds.transactions.list();
  const updates: Transaction[] = [];
  for (const t of txs) {
    if (t.kind !== 'expense') continue;
    let changed = false;
    let note = t.note;
    let category = t.category;
    if (t.category === fromId) {
      category = toId;
      changed = true;
    } else if (!t.category && from && note) {
      const p1 = `${from.name} — `;
      const p2 = `${from.name} - `;
      if (note === from.name) { note = undefined; category = toId; changed = true; }
      else if (note.startsWith(p1)) { note = note.slice(p1.length); category = toId; changed = true; }
      else if (note.startsWith(p2)) { note = note.slice(p2.length); category = toId; changed = true; }
    }
    if (changed) updates.push({ ...t, category, note, updatedAt: nowIso(), version: (t.version ?? 0) + 1 });
  }
  if (updates.length) await ds.transactions.bulkPut(updates, { source: 'local' });
  return updates.length;
}

async function hideCategory(ds: DataService, id: string): Promise<void> {
  const rec = await ds.meta.getKey(CATEGORY_META_KEY);
  const custom = Array.isArray(rec?.value) ? (rec.value as CategoryDef[]) : [];
  await ds.meta.setKey(CATEGORY_META_KEY, custom.filter((c) => c?.id !== id));
  const hidden = await readHiddenCats(ds);
  if (!hidden.includes(id)) await ds.meta.setKey(HIDDEN_CATEGORY_META_KEY, [...hidden, id]);
}

/** H12 — mescla `fromId` em `toId`: move lançamentos e oculta a origem. */
export async function mergeCategories(
  ds: DataService,
  fromId: string,
  toId: string,
  cats: CategoryDef[] = DEFAULT_CATEGORIES,
): Promise<number> {
  if (!fromId || !toId || fromId === toId) return 0;
  const moved = await reassignCategory(ds, fromId, toId, cats);
  await hideCategory(ds, fromId);
  return moved;
}

/** H12 — remove `id`, reatribuindo os lançamentos a `reassignTo` (nunca órfão). */
export async function removeCategory(
  ds: DataService,
  id: string,
  reassignTo: string,
  cats: CategoryDef[] = DEFAULT_CATEGORIES,
): Promise<number> {
  if (!id || !reassignTo || id === reassignTo) return 0;
  const moved = await reassignCategory(ds, id, reassignTo, cats);
  await hideCategory(ds, id);
  return moved;
}

/** H12 — uso por categoria (para preview de impacto no donut). */
export async function categoryUsage(
  ds: DataService,
  cats: CategoryDef[] = DEFAULT_CATEGORIES,
): Promise<CategoryTotal[]> {
  const txs = await ds.transactions.list();
  const map = new Map<string, { total: number; count: number }>();
  for (const t of txs) {
    if (t.kind !== 'expense') continue;
    const id = categoryOf(t, cats) ?? 'outros';
    const e = map.get(id) ?? { total: 0, count: 0 };
    e.total = r2(e.total + Math.abs(t.amount));
    e.count += 1;
    map.set(id, e);
  }
  return [...map.entries()]
    .map(([categoryId, v]) => ({ categoryId, ...v }))
    .sort((a, b) => b.total - a.total);
}

/**
 * G1 — categoria de uma transação. Campo estruturado primeiro; legado (note com
 * prefixo "Categoria — resto", como `recordExpense` antigo gravava) por parse.
 */
export function categoryOf(t: Transaction, cats: CategoryDef[] = DEFAULT_CATEGORIES): string | null {
  if (t.category) return t.category;
  const note = t.note ?? '';
  for (const c of cats) {
    if (note === c.name || note.startsWith(`${c.name} — `) || note.startsWith(`${c.name} - `)) return c.id;
  }
  return null;
}

export interface CategoryTotal {
  categoryId: string;
  total: number;
  count: number;
}

/** G3 — despesas do mês agrupadas por categoria (ordenado por total desc). */
export function expensesByCategory(
  transactions: Transaction[],
  yearMonth: string,
  cats: CategoryDef[] = DEFAULT_CATEGORIES,
): CategoryTotal[] {
  const map = new Map<string, { total: number; count: number }>();
  for (const t of transactions) {
    if (t.kind !== 'expense' || t.date.slice(0, 7) !== yearMonth) continue;
    const id = categoryOf(t, cats) ?? 'outros';
    const e = map.get(id) ?? { total: 0, count: 0 };
    e.total = r2(e.total + Math.abs(t.amount));
    e.count += 1;
    map.set(id, e);
  }
  return [...map.entries()]
    .map(([categoryId, v]) => ({ categoryId, ...v }))
    .sort((a, b) => b.total - a.total);
}

/** H6 — subcategorias (filhas diretas) de uma categoria-pai. */
export function subcategoriesOf(cats: CategoryDef[], parentId: string): CategoryDef[] {
  return cats.filter((c) => c.parent === parentId);
}

/**
 * H6 — consolida totais de categoria pelo PAI (1 nível). Filhas viram o total do pai;
 * categorias sem `parent` (ou com pai inexistente) ficam como estão. Soma por pai =
 * soma das filhas; legado sem `parent` fica intacto. Ordenado por total desc.
 */
export function rollupByParent(rows: CategoryTotal[], cats: CategoryDef[] = DEFAULT_CATEGORIES): CategoryTotal[] {
  const byId = new Map(cats.map((c) => [c.id, c]));
  const acc = new Map<string, { total: number; count: number }>();
  for (const row of rows) {
    const cat = byId.get(row.categoryId);
    const target = cat?.parent && byId.has(cat.parent) ? cat.parent : row.categoryId;
    const cur = acc.get(target) ?? { total: 0, count: 0 };
    cur.total = r2(cur.total + row.total);
    cur.count += row.count;
    acc.set(target, cur);
  }
  return [...acc.entries()]
    .map(([categoryId, v]) => ({ categoryId, ...v }))
    .sort((a, b) => b.total - a.total);
}

export interface IncomeGroup {
  kind: TransactionKind;
  total: number;
  count: number;
}

/** G3 — ganhos do mês agrupados por kind (payout_in, rebate, income). */
export function incomeByKind(transactions: Transaction[], yearMonth: string): IncomeGroup[] {
  const map = new Map<string, { total: number; count: number }>();
  for (const t of transactions) {
    if (!PERSONAL_INCOME_KINDS.has(t.kind) || t.date.slice(0, 7) !== yearMonth) continue;
    const e = map.get(t.kind) ?? { total: 0, count: 0 };
    e.total = r2(e.total + t.amount);
    e.count += 1;
    map.set(t.kind, e);
  }
  return [...map.entries()]
    .map(([kind, v]) => ({ kind: kind as TransactionKind, ...v }))
    .sort((a, b) => b.total - a.total);
}

export interface MonthPoint {
  ym: string;
  income: number;
  expenses: number;
  balance: number;
}

/** G4 — série mensal (últimos `months`, terminando no mês de `refYm`). */
export function monthlySeries(transactions: Transaction[], months: number, refYm?: string): MonthPoint[] {
  const now = new Date();
  const ref = refYm ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [ry, rm] = ref.split('-').map(Number);
  const out: MonthPoint[] = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(ry, rm - 1 - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const fc = computeFreeCash(transactions, ym);
    out.push({ ym, income: fc.income, expenses: fc.expenses, balance: fc.freeCash });
  }
  return out;
}

/** G5 — orçamentos: meta key `expense:budgets` = { [ym]: { [categoryId]: amount } }. */
export async function getBudgets(ds: DataService): Promise<Record<string, Record<string, number>>> {
  const rec = await ds.meta.getKey(BUDGET_META_KEY);
  return rec?.value && typeof rec.value === 'object' ? (rec.value as Record<string, Record<string, number>>) : {};
}

export async function saveBudget(
  ds: DataService,
  yearMonth: string,
  categoryId: string,
  amount: number,
): Promise<Record<string, Record<string, number>>> {
  const all = await getBudgets(ds);
  const month = { ...(all[yearMonth] || {}) };
  if (amount > 0) month[categoryId] = r2(amount);
  else delete month[categoryId];
  await ds.meta.setKey(BUDGET_META_KEY, { ...all, [yearMonth]: month });
  return getBudgets(ds);
}

/** B1 — categorias com rollover opt-in (sobra do mês anterior soma na meta). */
export async function getRolloverCats(ds: DataService): Promise<string[]> {
  const rec = await ds.meta.getKey(ROLLOVER_META_KEY);
  const v = rec?.value;
  return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
}

export async function setRolloverCats(ds: DataService, ids: string[]): Promise<string[]> {
  const clean = [...new Set(ids.filter((x) => typeof x === 'string' && x))];
  await ds.meta.setKey(ROLLOVER_META_KEY, clean);
  return getRolloverCats(ds);
}

export interface RolloverInfo {
  categoryId: string;
  rollover: number; // sobra do mês anterior (0 se estourou/sem meta)
  base: number; // meta do mês atual
  effective: number; // base + rollover
}

/**
 * B1 — rollover: para cada categoria opt-in, sobra = max(0, meta − gasto) do mês
 * anterior. Opt-out volta ao comportamento atual (sem somar nada).
 */
export function rolloverAmount(
  transactions: Transaction[],
  budgets: Record<string, Record<string, number>>,
  rolloverCats: string[],
  yearMonth: string,
  cats: CategoryDef[] = DEFAULT_CATEGORIES,
): RolloverInfo[] {
  const [y, m] = yearMonth.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  const prevYm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const prev = budgets[prevYm] ?? {};
  const cur = budgets[yearMonth] ?? {};
  const spentPrev = new Map<string, number>();
  for (const t of transactions) {
    if (t.kind !== 'expense' || t.date.slice(0, 7) !== prevYm) continue;
    const id = categoryOf(t, cats) ?? 'outros';
    spentPrev.set(id, r2((spentPrev.get(id) ?? 0) + Math.abs(t.amount)));
  }
  return rolloverCats.map((categoryId) => {
    const base = cur[categoryId] ?? 0;
    const prevBudget = prev[categoryId] ?? 0;
    const rollover = prevBudget > 0 ? Math.max(0, r2(prevBudget - (spentPrev.get(categoryId) ?? 0))) : 0;
    return { categoryId, rollover, base: r2(base), effective: r2(base + rollover) };
  });
}

export interface BudgetStatus {
  categoryId: string;
  budget: number;
  spent: number;
  pct: number;
  over: boolean;
}

/** G5 — gasto vs orçamento por categoria no mês. */
export function budgetStatus(
  transactions: Transaction[],
  budgets: Record<string, number>,
  yearMonth: string,
  cats: CategoryDef[] = DEFAULT_CATEGORIES,
): BudgetStatus[] {
  const spentByCat = new Map<string, number>();
  for (const t of transactions) {
    if (t.kind !== 'expense' || t.date.slice(0, 7) !== yearMonth) continue;
    const id = categoryOf(t, cats) ?? 'outros';
    spentByCat.set(id, r2((spentByCat.get(id) ?? 0) + Math.abs(t.amount)));
  }
  return Object.entries(budgets)
    .filter(([, b]) => b > 0)
    .map(([categoryId, budget]) => {
      const spent = spentByCat.get(categoryId) ?? 0;
      return {
        categoryId,
        budget: r2(budget),
        spent,
        pct: budget > 0 ? Number(((spent / budget) * 100).toFixed(1)) : 0,
        over: spent > budget,
      };
    })
    .sort((a, b) => b.pct - a.pct);
}

export interface BudgetSuggestion {
  categoryId: string;
  /** Média real dos últimos `months` meses (meses sem gasto contam como 0). */
  average: number;
  months: number;
}

/**
 * H11 — sugere meta por categoria a partir da média dos últimos `months` meses
 * (antes de `refYm`). Reusa `categoryOf`; ignora pendentes. Sem fórmula nova —
 * só média dos totais mensais.
 */
export function suggestBudget(
  transactions: Transaction[],
  refYm: string,
  months = 3,
  cats: CategoryDef[] = DEFAULT_CATEGORIES,
): BudgetSuggestion[] {
  const [y, m] = refYm.split('-').map(Number);
  const window = new Set<string>();
  for (let i = 1; i <= months; i += 1) {
    const d = new Date(y, m - 1 - i, 1);
    window.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const acc = new Map<string, number>();
  for (const t of transactions) {
    if (t.kind !== 'expense' || t.paid === false) continue;
    const ym = (t.date || '').slice(0, 7);
    if (!window.has(ym)) continue;
    const id = categoryOf(t, cats) ?? 'outros';
    acc.set(id, r2((acc.get(id) ?? 0) + Math.abs(t.amount)));
  }
  return [...acc.entries()]
    .map(([categoryId, total]) => ({ categoryId, average: r2(total / Math.max(1, months)), months }))
    .sort((a, b) => b.average - a.average);
}

/** G6 — templates recorrentes (expense com `recurrence`). */
export function recurringTemplates(transactions: Transaction[]): Transaction[] {
  return transactions.filter((t) => t.kind === 'expense' && t.recurrence?.freq === 'monthly');
}

/**
 * G6 — templates com parcela do mês `ym` ainda NÃO gerada (sem cópia com
 * `ref: { type:'recurrence', id: templateId }` naquele mês).
 */
export function recurringDue(transactions: Transaction[], yearMonth: string): Transaction[] {
  const generated = new Set(
    transactions
      .filter((t) => t.ref?.type === 'recurrence' && t.date.slice(0, 7) === yearMonth)
      .map((t) => t.ref?.id),
  );
  return recurringTemplates(transactions).filter((t) => !generated.has(t.id));
}

export interface RecurringCandidate {
  categoryId: string;
  amount: number;
  months: string[];
  count: number;
  day: number; // dia sugerido (moda dos dias)
  sampleId: string; // id de uma ocorrência (para "tornar recorrente")
}

/**
 * A1 — detecta candidatas a recorrente: mesma categoria + mesmo valor em 3+
 * meses distintos. Ignora templates, cópias geradas e ganhos. Não cria nada —
 * a UI oferece "tornar recorrente" (update com `recurrence`).
 */
export function detectRecurringCandidates(
  transactions: Transaction[],
  cats: CategoryDef[] = DEFAULT_CATEGORIES,
  minMonths = 3,
): RecurringCandidate[] {
  const groups = new Map<string, { months: Set<string>; days: number[]; sampleId: string; firstDate: string }>();
  for (const t of transactions) {
    if (t.kind !== 'expense') continue;
    if (t.recurrence?.freq === 'monthly') continue;
    if (t.ref?.type === 'recurrence') continue;
    const cat = categoryOf(t, cats) ?? 'outros';
    const amt = Math.abs(t.amount ?? 0);
    if (!(amt > 0)) continue;
    const ym = (t.date || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(ym)) continue;
    const key = `${cat}|${amt.toFixed(2)}`;
    let g = groups.get(key);
    if (!g) {
      g = { months: new Set(), days: [], sampleId: t.id, firstDate: t.date };
      groups.set(key, g);
    }
    g.months.add(ym);
    const day = Number((t.date || '').slice(8, 10));
    if (day >= 1 && day <= 28) g.days.push(day);
    if (t.date < g.firstDate) {
      g.firstDate = t.date;
      g.sampleId = t.id;
    }
  }
  const out: RecurringCandidate[] = [];
  for (const [key, g] of groups) {
    if (g.months.size < minMonths) continue;
    const [categoryId, amountStr] = key.split('|');
    const dayCounts = new Map<number, number>();
    for (const d of g.days) dayCounts.set(d, (dayCounts.get(d) ?? 0) + 1);
    let day = 1;
    let best = -1;
    for (const [d, n] of dayCounts) {
      if (n > best) {
        best = n;
        day = d;
      }
    }
    out.push({
      categoryId,
      amount: Number(amountStr),
      months: [...g.months].sort(),
      count: g.months.size,
      day,
      sampleId: g.sampleId,
    });
  }
  return out.sort((a, b) => b.count - a.count);
}

const SAVINGS_GOAL_KEY = 'expense:savings-goal';

/** A4 — meta de economia mensal ({ [ym]: amount }). */
export async function getSavingsGoal(ds: DataService): Promise<Record<string, number>> {
  const rec = await ds.meta.getKey(SAVINGS_GOAL_KEY);
  const v = rec?.value;
  return v && typeof v === 'object' ? (v as Record<string, number>) : {};
}

export async function saveSavingsGoal(ds: DataService, yearMonth: string, amount: number): Promise<Record<string, number>> {
  const all = await getSavingsGoal(ds);
  if (amount > 0) all[yearMonth] = r2(amount);
  else delete all[yearMonth];
  await ds.meta.setKey(SAVINGS_GOAL_KEY, all);
  return getSavingsGoal(ds);
}

export interface MonthCompare {
  categoryId: string;
  cur: number;
  prev: number;
  deltaPct: number | null; // null = sem base anterior
}

/**
 * A4 — este mês vs mês passado por categoria (despesas). Δ% com seta na UI.
 * Correto na virada de ano (dez→jan) via aritmética de mês.
 */
export function compareMonths(
  transactions: Transaction[],
  yearMonth: string,
  cats: CategoryDef[] = DEFAULT_CATEGORIES,
): MonthCompare[] {
  const [y, m] = yearMonth.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  const prevYm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const sumByCat = (ym: string): Map<string, number> => {
    const map = new Map<string, number>();
    for (const t of transactions) {
      if (t.kind !== 'expense' || t.date.slice(0, 7) !== ym) continue;
      const id = categoryOf(t, cats) ?? 'outros';
      map.set(id, r2((map.get(id) ?? 0) + Math.abs(t.amount)));
    }
    return map;
  };
  const cur = sumByCat(yearMonth);
  const prev = sumByCat(prevYm);
  const ids = new Set([...cur.keys(), ...prev.keys()]);
  const out: MonthCompare[] = [];
  for (const id of ids) {
    const c = cur.get(id) ?? 0;
    const p = prev.get(id) ?? 0;
    out.push({
      categoryId: id,
      cur: c,
      prev: p,
      deltaPct: p > 0 ? Number((((c - p) / p) * 100).toFixed(1)) : null,
    });
  }
  return out.sort((a, b) => b.cur - a.cur);
}

// ---------------------------------------------------------------------------
// Tax Cockpit (puro) — cockpit, não ERP
// ---------------------------------------------------------------------------

export interface TaxCockpitInput {
  /** Net de trades day-trade do mês (BRL). Pode ser negativo (prejuízo). */
  dayNet: number;
  /** Net de trades swing do mês (BRL). Pode ser negativo (prejuízo). */
  swingNet: number;
  /** Fees/informativas do mês (BRL) — exibidas, não duplamente deduzidas. */
  fees: number;
  /** Prejuízo de day-trade acumulado até o mês anterior (magnitude positiva). */
  dayCarry: number;
  /** Prejuízo de swing acumulado até o mês anterior (magnitude positiva). */
  swingCarry: number;
  /** Mês dos trades ("YYYY-MM") — usado pro prazo do DARF. */
  yearMonth: string;
  dayRate?: number;
  swingRate?: number;
}

export interface TaxCockpitResult {
  dayNet: number;
  swingNet: number;
  fees: number;
  dayTaxable: number;
  swingTaxable: number;
  dayTax: number;
  swingTax: number;
  estTax: number;
  /** Prejuízo que sobra pra compensar no próximo mês. */
  carryAfter: { day: number; swing: number };
  darfDeadline?: string;
  prepareDarf: boolean;
}

/**
 * Tax Cockpit: day 20% / swing 15%, carry prejuízo por modalidade, DARF prazo.
 * Prejuízo (net<0) soma ao carry; ganho usa o carry pra reduzir a base tributável.
 */
export function computeTaxCockpit(input: TaxCockpitInput): TaxCockpitResult {
  const dayRate = input.dayRate ?? TAX_RATE_DAY;
  const swingRate = input.swingRate ?? TAX_RATE_SWING;

  // Day
  let dayCarry = input.dayCarry;
  let dayTaxable = 0;
  let dayTax = 0;
  if (input.dayNet > 0) {
    dayTaxable = Math.max(0, input.dayNet - dayCarry);
    dayCarry = Math.max(0, dayCarry - input.dayNet);
    dayTax = r2(dayTaxable * dayRate);
  } else {
    dayCarry = dayCarry + Math.abs(input.dayNet);
  }

  // Swing
  let swingCarry = input.swingCarry;
  let swingTaxable = 0;
  let swingTax = 0;
  if (input.swingNet > 0) {
    swingTaxable = Math.max(0, input.swingNet - swingCarry);
    swingCarry = Math.max(0, swingCarry - input.swingNet);
    swingTax = r2(swingTaxable * swingRate);
  } else {
    swingCarry = swingCarry + Math.abs(input.swingNet);
  }

  const estTax = r2(dayTax + swingTax);
  const hasTaxable = estTax > 0;

  return {
    dayNet: r2(input.dayNet),
    swingNet: r2(input.swingNet),
    fees: r2(input.fees),
    dayTaxable: r2(dayTaxable),
    swingTaxable: r2(swingTaxable),
    dayTax,
    swingTax,
    estTax,
    carryAfter: { day: r2(dayCarry), swing: r2(swingCarry) },
    darfDeadline: hasTaxable ? darfDeadline(input.yearMonth) : undefined,
    prepareDarf: hasTaxable,
  };
}

// ---------------------------------------------------------------------------
// Payout Allocation (wizard) — o net de um payout é alocado por peso
// ---------------------------------------------------------------------------

export type AllocationBucketKind = 'tax_reserve' | 'expense' | 'invest' | 'cash';

export interface AllocationBucket {
  kind: AllocationBucketKind;
  /** Conta de destino (para invest/expense) ou a própria wallet de origem (tax/cash). */
  accountId: string;
  /** Peso relativo entre os buckets (nunca amount/n). */
  weight: number;
  note?: string;
}

export interface PayoutAllocationPlan {
  /** Payout que originou o dinheiro (ref.type=payoutId). */
  payoutId: string;
  /** Wallet que recebeu o net (origem). */
  destinationAccountId: string;
  currency: string;
  date: string;
  /** PTAX de venda do dia do recebimento (rate=0 proibido). */
  rate?: number;
  rateTimestamp?: string;
  /** Fração do net reservada pra imposto (ex.: 0.15). */
  taxReservePct?: number;
  /** Destino do restante (net - taxReserve), por peso. */
  buckets: AllocationBucket[];
}

export interface AllocationComputed {
  taxReserve: number;
  netAfterTax: number;
  /** Saídas de dinheiro da wallet de origem (kind, accountId, amountNEG, note). */
  outflows: Array<{ kind: 'tax_reserve' | 'expense' | 'transfer'; accountId: string; amount: number; note?: string }>;
  /** Entradas complementares (ex.: transfer IN na conta de investimento). */
  inflows: Array<{ kind: 'transfer'; accountId: string; amount: number; note?: string }>;
  /** O que sobra líquido na wallet (cash) — sem transaction extra. */
  cashRemaining: number;
}

/**
 * Calcula a alocação do net de um payout. Tax reserve primeiro (frações), o restante
 * é dividido por peso entre os buckets (expense/invest/cash). Nunca `amount/n`.
 * `cash` fica na wallet; `expense` sai da wallet; `invest` sai da wallet e entra na
 * conta de destino (transfer in).
 */
export function computePayoutAllocation(
  net: number,
  plan: PayoutAllocationPlan,
): AllocationComputed {
  const taxPct = plan.taxReservePct ?? 0.15;
  const taxReserve = r2(net * Math.max(0, taxPct));
  const netAfterTax = r2(net - taxReserve);

  // Buckets "reais" que movem dinheiro (expense/invest/cash). O bucket `cash` fica
  // líquido na wallet (não gera transaction); expense/invest geram saída.
  const spendable = plan.buckets.filter((b) => b.kind !== 'tax_reserve');
  const totalWeight = spendable.reduce((s, b) => s + Math.max(0, b.weight), 0);

  const outflows: AllocationComputed['outflows'] = [];
  const inflows: AllocationComputed['inflows'] = [];

  // Tax reserve sempre gera saída (reserva de imposto).
  outflows.push({
    kind: 'tax_reserve',
    accountId: plan.destinationAccountId,
    amount: -taxReserve,
    note: 'reserva de imposto',
  });

  let cashRemaining = 0;
  if (totalWeight > 0) {
    for (const b of spendable) {
      const amount = r2(netAfterTax * (Math.max(0, b.weight) / totalWeight));
      if (amount === 0) continue;
      if (b.kind === 'cash') {
        cashRemaining += amount; // fica na wallet, sem transaction
      } else if (b.kind === 'invest') {
        // Sai da wallet e entra na conta de destino.
        outflows.push({ kind: 'transfer', accountId: plan.destinationAccountId, amount: -amount, note: b.note });
        inflows.push({ kind: 'transfer', accountId: b.accountId, amount, note: b.note });
      } else {
        outflows.push({ kind: b.kind, accountId: plan.destinationAccountId, amount: -amount, note: b.note });
      }
    }
  }

  return { taxReserve, netAfterTax, outflows, inflows, cashRemaining };
}

/** Mapeia um bucket kind pra TransactionKind. */
export function allocationKindToTransactionKind(kind: 'tax_reserve' | 'expense' | 'transfer'): TransactionKind {
  switch (kind) {
    case 'tax_reserve':
      return 'tax_reserve';
    case 'expense':
      return 'expense';
    case 'transfer':
      return 'transfer';
    default:
      return 'transfer';
  }
}

// ---------------------------------------------------------------------------
// MoneyService — orquestra leitura + escrita no DataService
// ---------------------------------------------------------------------------

export interface MoneyServiceOptions {
  /** Taxa BRL padrão quando a Transaction não tem rate (ex.: demo). rate<=0 ignorado. */
  defaultBRLRate?: number;
}

export class MoneyService {
  constructor(
    private readonly ds: DataService,
    private readonly chain?: DataChainEngine,
    private readonly opts: MoneyServiceOptions = {},
  ) {}

  // -------- escrita de ledger (Transaction) --------

  /**
   * Registra uma transaction genérica no ledger. Único caminho de escrita de
   * money; nunca escreve saldo direto. Se `rate` for informado, guarda o PTAX.
   */
  async addTransaction(input: {
    accountId: string;
    firmId?: string;
    kind: TransactionKind;
    amount: number;
    currency: string;
    date?: string;
    rate?: number;
    rateTimestamp?: string;
    ref?: TransactionRef;
    note?: string;
    category?: string;
    recurrence?: { freq: 'monthly'; day: number };
    asset?: { symbol: string; qty: number; price: number };
    attachments?: Record<string, object>;
    paid?: boolean;
    dueDate?: string;
    installments?: { n: number; of: number; groupId: string };
    card?: string;
    cardId?: string;
    tags?: string[];
    invoice?: { cardId: string; competencia: string };
    externalId?: string;
  }): Promise<Transaction> {
    if (input.rate != null && input.rate <= 0) {
      throw new Error(`rate=0 PROIBIDO para ${input.kind} (zera cálculo silenciosamente)`);
    }
    const tx: Transaction = {
      id: `tx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      accountId: input.accountId,
      firmId: input.firmId,
      kind: input.kind,
      amount: r2(input.amount),
      currency: input.currency,
      rate: input.rate,
      rateTimestamp: input.rateTimestamp,
      date: input.date ?? nowIso(),
      ref: input.ref,
      note: input.note,
      category: input.category,
      recurrence: input.recurrence,
      asset: input.asset,
      attachments: input.attachments,
      paid: input.paid,
      dueDate: input.dueDate,
      installments: input.installments,
      card: input.card,
      cardId: input.cardId,
      tags: input.tags,
      invoice: input.invoice,
      externalId: input.externalId,
      updatedAt: nowIso(),
      deviceId: this.ds.deviceId,
      version: 0,
    };
    return this.ds.transactions.put(tx, { source: 'local' });
  }

  /** Registra um custo de challenge/reset/mensalidade (kind: challenge_cost|reset_fee|monthly_fee). */
  async recordCost(
    kind: 'challenge_cost' | 'reset_fee' | 'monthly_fee',
    input: { accountId: string; firmId?: string; amount: number; currency: string; date?: string; note?: string },
  ): Promise<Transaction> {
    return this.addTransaction({ ...input, kind, amount: -Math.abs(input.amount) });
  }

  /** Registra uma despesa (living) com categoria. */
  async recordExpense(input: {
    accountId: string;
    amount: number;
    currency: string;
    category?: string;
    date?: string;
    note?: string;
    recurrence?: { freq: 'monthly'; day: number };
    attachments?: Record<string, object>;
    paid?: boolean;
    dueDate?: string;
    card?: string;
    cardId?: string;
    tags?: string[];
    installments?: { n: number; of: number; groupId: string };
    externalId?: string;
  }): Promise<Transaction> {
    // G1 — categoria em campo estruturado (note fica limpa; legado lia prefixo).
    return this.addTransaction({
      ...input,
      kind: 'expense',
      amount: -Math.abs(input.amount),
      category: input.category,
      recurrence: input.recurrence,
      attachments: input.attachments,
      paid: input.paid,
      dueDate: input.dueDate,
      card: input.card,
      cardId: input.cardId,
      tags: input.tags,
      installments: input.installments,
    });
  }

  /**
   * D2 — registra uma compra parcelada: cria `count` despesas mensais (a partir de
   * `firstDate`), cada uma com `installments {n, of, groupId}` e `paid=false` (são
   * contas a pagar até serem quitadas). O total é dividido; a sobra de arredondamento
   * vai na última parcela (nunca inventa centavo).
   */
  async recordInstallments(input: {
    accountId: string;
    currency: string;
    totalAmount: number;
    count: number;
    category?: string;
    card?: string;
    cardId?: string;
    firstDate?: string;
    note?: string;
  }): Promise<Transaction[]> {
    const count = Math.max(2, Math.min(48, Math.floor(input.count)));
    const total = Math.abs(input.totalAmount);
    if (!(total > 0)) throw new Error('parcelamento precisa de total > 0');
    const per = r2(total / count);
    const groupId = `inst-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const base = input.firstDate ? new Date(input.firstDate) : new Date();
    const out: Transaction[] = [];
    for (let i = 0; i < count; i += 1) {
      const isLast = i === count - 1;
      const amount = isLast ? r2(total - per * (count - 1)) : per;
      const d = new Date(base.getFullYear(), base.getMonth() + i, base.getDate());
      out.push(await this.recordExpense({
        accountId: input.accountId,
        amount,
        currency: input.currency,
        category: input.category,
        card: input.card,
        cardId: input.cardId,
        note: input.note,
        date: d.toISOString(),
        dueDate: d.toISOString(),
        paid: false,
        installments: { n: i + 1, of: count, groupId },
      }));
    }
    return out;
  }

  /** G6 — gera a parcela do mês para um template recorrente (cópia SEM recurrence). */
  async generateRecurring(templateId: string, yearMonth: string): Promise<Transaction | null> {
    const all = await this.allTransactions();
    const tpl = all.find((t) => t.id === templateId);
    if (!tpl || tpl.kind !== 'expense' || tpl.recurrence?.freq !== 'monthly') return null;
    const already = all.some(
      (t) => t.ref?.type === 'recurrence' && t.ref?.id === templateId && t.date.slice(0, 7) === yearMonth,
    );
    if (already) return null;
    const [y, m] = yearMonth.split('-').map(Number);
    const day = Math.min(tpl.recurrence.day, new Date(y, m, 0).getDate());
    return this.addTransaction({
      accountId: tpl.accountId,
      kind: 'expense',
      amount: -Math.abs(tpl.amount),
      currency: tpl.currency,
      category: tpl.category,
      date: `${yearMonth}-${String(day).padStart(2, '0')}T12:00:00.000Z`,
      note: tpl.note,
      ref: { type: 'recurrence', id: templateId },
    });
  }

  /** G8 — edita transação (valida rate como no add). */
  async updateTransaction(id: string, patch: Partial<Transaction>): Promise<Transaction | null> {
    const all = await this.allTransactions();
    const cur = all.find((t) => t.id === id);
    if (!cur) return null;
    if (patch.rate != null && patch.rate <= 0) {
      throw new Error(`rate=0 PROIBIDO para ${cur.kind} (zera cálculo silenciosamente)`);
    }
    const next: Transaction = {
      ...cur,
      ...patch,
      id: cur.id,
      amount: patch.amount != null ? r2(patch.amount) : cur.amount,
      updatedAt: nowIso(),
      version: (cur.version ?? 0) + 1,
    };
    return this.ds.transactions.put(next, { source: 'local' });
  }

  /** G8 — remove transação. */
  async removeTransaction(id: string): Promise<void> {
    await this.ds.transactions.remove(id);
  }

  /** G3 — ganho manual (salário, outros). Sempre positivo. */
  async recordIncome(input: {
    accountId: string;
    amount: number;
    currency: string;
    date?: string;
    note?: string;
    externalId?: string;
  }): Promise<Transaction> {
    return this.addTransaction({ ...input, kind: 'income', amount: Math.abs(input.amount) });
  }

  /** A1 — provento (dividendo/JCP) ligado a uma posição. Sempre positivo. */
  async recordDividend(input: {
    accountId: string;
    positionId: string;
    amount: number;
    currency: string;
    date?: string;
    note?: string;
  }): Promise<Transaction> {
    if (!(input.amount > 0)) throw new Error('provento precisa de valor > 0');
    return this.addTransaction({
      accountId: input.accountId,
      kind: 'dividend',
      amount: Math.abs(input.amount),
      currency: input.currency,
      date: input.date,
      note: input.note,
      ref: { type: 'investmentId', id: input.positionId },
    });
  }

  /** Reserva de imposto (kind=tax_reserve). */
  async recordTaxReserve(input: {
    accountId: string;
    amount: number;
    currency: string;
    date?: string;
    note?: string;
  }): Promise<Transaction> {
    return this.addTransaction({ ...input, kind: 'tax_reserve', amount: -Math.abs(input.amount) });
  }

  /** Transferência entre contas (kind=transfer). */
  async recordTransfer(input: {
    accountId: string;
    amount: number;
    currency: string;
    date?: string;
    note?: string;
  }): Promise<Transaction> {
    return this.addTransaction({ ...input, kind: 'transfer' });
  }

  /**
   * D5 — transferência entre duas carteiras (dupla entrada): débito na origem +
   * crédito no destino, ligados por `ref: transfer`. Neutro no cash flow; move saldo
   * sem perder patrimônio. Retorna [saída, entrada].
   */
  async recordTransferBetween(input: {
    fromAccountId: string;
    toAccountId: string;
    amount: number;
    currency: string;
    date?: string;
    note?: string;
  }): Promise<[Transaction, Transaction]> {
    const amt = Math.abs(input.amount);
    if (!(amt > 0)) throw new Error('transferência precisa de valor > 0');
    if (input.fromAccountId === input.toAccountId) throw new Error('origem e destino iguais');
    const id = `tr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const out = await this.addTransaction({
      accountId: input.fromAccountId, kind: 'transfer', amount: -amt,
      currency: input.currency, date: input.date, note: input.note, ref: { type: 'transfer', id },
    });
    const inn = await this.addTransaction({
      accountId: input.toAccountId, kind: 'transfer', amount: amt,
      currency: input.currency, date: input.date, note: input.note, ref: { type: 'transfer', id },
    });
    return [out, inn];
  }

  /**
   * H5 — baixa (total ou parcial) da fatura de um cartão. Cria `transfer` (neutro no
   * caixa) marcado com `invoice {cardId, competencia}`; com `toAccountId` faz dupla
   * entrada (banco → conta do cartão) e sem ele só debita a origem. NUNCA chamado
   * sozinho: a UI confirma (sugere, não cria).
   */
  async payCardInvoice(input: {
    cardId: string;
    competencia: string;
    accountId: string;
    toAccountId?: string;
    amount: number;
    currency: string;
    date?: string;
    note?: string;
  }): Promise<Transaction[]> {
    const amt = r2(Math.abs(input.amount));
    if (!(amt > 0)) throw new Error('pagamento da fatura precisa de valor > 0');
    if (!input.cardId || !input.competencia) throw new Error('pagamento da fatura precisa de cartão e competência');
    const invoice = { cardId: input.cardId, competencia: input.competencia };
    const ref: TransactionRef = { type: 'transfer', id: `inv-${input.cardId}-${input.competencia}-${Date.now().toString(36)}` };
    const note = input.note ?? `Fatura ${input.competencia}`;
    const out = await this.addTransaction({
      accountId: input.accountId, kind: 'transfer', amount: -amt,
      currency: input.currency, date: input.date, note, ref, invoice,
    });
    if (input.toAccountId && input.toAccountId !== input.accountId) {
      const inn = await this.addTransaction({
        accountId: input.toAccountId, kind: 'transfer', amount: amt,
        currency: input.currency, date: input.date, note, ref, invoice,
      });
      return [out, inn];
    }
    return [out];
  }

  /** Compra/venda de ativo (kind=buy|sell). `asset` alimenta o FIFO de IR (A4). */
  async recordTradeAsset(
    kind: 'buy' | 'sell',
    input: {
      accountId: string;
      amount: number;
      currency: string;
      date?: string;
      ref?: TransactionRef;
      note?: string;
      asset?: { symbol: string; qty: number; price: number };
    },
  ): Promise<Transaction> {
    return this.addTransaction({ ...input, kind, amount: kind === 'buy' ? -Math.abs(input.amount) : input.amount });
  }

  // -------- Payout Center --------

  /**
   * Aplica a alocação de um payout no ledger. Assume que o `payout_in` (+net) e
   * `fee` já foram criados via `DataChainEngine.applyPayout`. Cria as transactions
   * de saída (tax_reserve/expense/transfer).
   */
  async applyPayoutAllocation(payout: Payout, plan: PayoutAllocationPlan): Promise<AllocationComputed> {
    const computed = computePayoutAllocation(payout.net, plan);
    const records: Transaction[] = [];

    const mk = (kind: 'tax_reserve' | 'expense' | 'transfer', accountId: string, amount: number, note?: string): Transaction => ({
      id: `${payout.id}:alloc:${kind}:${accountId}:${Math.abs(amount)}`,
      accountId,
      firmId: payout.accountIds[0],
      kind: allocationKindToTransactionKind(kind),
      amount: r2(amount),
      currency: plan.currency,
      rate: plan.rate,
      rateTimestamp: plan.rateTimestamp,
      date: plan.date,
      ref: { type: 'payoutId', id: payout.id },
      note: note ?? `alocação payout ${payout.id}`,
      updatedAt: nowIso(),
      deviceId: this.ds.deviceId,
      version: 0,
    });

    for (const o of computed.outflows) {
      records.push(mk(o.kind, o.accountId, o.amount, o.note));
    }
    for (const i of computed.inflows) {
      records.push(mk(i.kind, i.accountId, i.amount, i.note));
    }

    if (records.length > 0) {
      await this.ds.transactions.bulkPut(records, { source: 'local' });
    }
    return computed;
  }

  // -------- leitura derivada --------

  async allTransactions(): Promise<Transaction[]> {
    return this.ds.transactions.list();
  }

  /** Saldo de uma conta = Σ transactions (derivado, nunca escrito). */
  async accountBalance(accountId: string): Promise<number> {
    const txs = await this.ds.transactions.list();
    return computeAccountBalance(txs, accountId);
  }

  /** Cash flow unificado das wallets/bank/cash/crypto. */
  async walletSummary(): Promise<WalletSummaryRow[]> {
    const [accounts, txs] = await Promise.all([this.ds.accounts.list(), this.ds.transactions.list()]);
    return computeWalletSummary(accounts, txs);
  }

  /** Firm P&L de um firm. */
  async firmPnl(firmId: string): Promise<FirmPnlResult> {
    const txs = await this.ds.transactions.list();
    return computeFirmPnl(txs, firmId);
  }

  /** Firm P&L por conta. */
  async firmPnlByAccount(firmId: string): Promise<Record<string, FirmPnlResult>> {
    const txs = await this.ds.transactions.list();
    return computeFirmPnlByAccount(txs, firmId);
  }

  /** Free Cash mensal. */
  async freeCash(yearMonth: string): Promise<FreeCashResult> {
    const txs = await this.ds.transactions.list();
    return computeFreeCash(txs, yearMonth);
  }

  /**
   * Tax Cockpit de um mês. Agrega trades (day/swing), converte pra BRL usando a taxa
   * PTAX guardada nas transactions do mês (ou `defaultBRLRate`), e aplica carry.
   */
  async taxCockpit(yearMonth: string): Promise<TaxCockpitResult> {
    const [trades, txs] = await Promise.all([this.ds.trades.list(), this.ds.transactions.list()]);

    // Taxa PTAX do mês: usa a última transaction de payout_in do mês que tenha rate.
    const monthTxs = txs.filter((t) => t.date.slice(0, 7) === yearMonth);
    const rateTx = monthTxs.find((t) => t.kind === 'payout_in' && t.rate != null && t.rate > 0);
    const rate = rateTx?.rate ?? this.opts.defaultBRLRate ?? null;

    // Classifica os trades do mês em day/swing. Usa `resultNet` (PnL líquido já
    // consolidado no trade — comissões/swap/fees já netadas).
    let dayNet = 0;
    let swingNet = 0;
    for (const t of trades) {
      const ym = (t.exitDatetime ?? t.entryDatetime).slice(0, 7);
      if (ym !== yearMonth) continue;
      const pnl = tradeNetPnl(t);
      if (isDayTrade(t)) dayNet += pnl;
      else swingNet += pnl;
    }

    // Carries acumulados até o mês anterior (por modalidade).
    const dayCarry = this.carryBefore(trades, yearMonth, 'day');
    const swingCarry = this.carryBefore(trades, yearMonth, 'swing');

    // Converte pra BRL.
    const toBrl = (v: number): number => (rate != null ? v * rate : v);

    // Fees informativas (comissão/swap/fee do mês, convertidas).
    const fees = r2(
      monthTxs
        .filter((t) => t.kind === 'commission' || t.kind === 'swap' || t.kind === 'fee')
        .reduce((s, t) => s + Math.abs(t.amount) * (rate ?? 1), 0),
    );

    return computeTaxCockpit({
      dayNet: toBrl(dayNet),
      swingNet: toBrl(swingNet),
      fees,
      dayCarry: toBrl(dayCarry),
      swingCarry: toBrl(swingCarry),
      yearMonth,
    });
  }

  /** Carry acumulado de uma modalidade até (exclusive) o mês alvo. */
  private carryBefore(trades: Trade[], yearMonth: string, modality: 'day' | 'swing'): number {
    let cumulative = 0;
    for (const t of trades) {
      const ym = (t.exitDatetime ?? t.entryDatetime).slice(0, 7);
      if (compareIso(`${ym}-01T00:00:00Z`, `${yearMonth}-01T00:00:00Z`) >= 0) continue;
      const pnl = tradeNetPnl(t);
      if (modality === 'day' ? isDayTrade(t) : !isDayTrade(t)) cumulative += pnl;
    }
    return Math.max(0, -cumulative);
  }
}
