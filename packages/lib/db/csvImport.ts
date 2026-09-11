// STAGE 3 — CSV universal. Importa trades de qualquer corretora (MT5/cTrader/Apex/
// Rithmic) com mapeamento de colunas + preview + dedup por `brokerId+openTime`.
// Elimina a digitação massiva (gate: 20 scalps/dia sem digitar).

import type { Trade, TradeDirection, TradeSource } from './types';
import { nowIso } from './dateUtils';
import { isEntryFill } from './isEntryFill';
import { realizedPnl, tradePnl, tradeR } from './financialFormulas';

// ---------------------------------------------------------------------------
// Parser de CSV (suporta aspas, vírgulas em campo, quebra de linha em aspas).
// ---------------------------------------------------------------------------

export interface CsvRow {
  columns: string[];
}

/** Parseia texto CSV em linhas de células, respeitando aspas duplas. */
export interface CsvPosition {
  symbol: string;
  qty: number;
  avgPrice: number;
}

export interface CsvPositionsResult {
  positions: CsvPosition[];
  errors: string[];
}

const POSITION_ALIASES: Record<'symbol' | 'qty' | 'avgPrice', string[]> = {
  symbol: ['symbol', 'simbolo', 'ativo', 'ticker', 'codigo', 'código'],
  qty: ['qty', 'quantity', 'quantidade', 'qtd'],
  avgPrice: ['avgprice', 'avg', 'precomedio', 'preço medio', 'precomédio', 'pm', 'custo'],
};

function normHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * P7 — Import de posições (CSV da corretora/banco).
 * Header: symbol,qty,avgPrice (aceita aliases PT). Linhas inválidas vão para
 * `errors` com o número da linha — nunca derrubam o lote.
 */
export function csvToPositions(text: string): CsvPositionsResult {
  const rows = parseCsv(text).filter((r) => r.some((c) => String(c ?? '').trim() !== ''));
  const positions: CsvPosition[] = [];
  const errors: string[] = [];
  if (!rows.length) return { positions, errors: ['CSV vazio'] };
  const headers = rows[0].map((h) => normHeader(String(h ?? '')));
  const col = (aliases: string[]): number =>
    headers.findIndex((h) => aliases.some((a) => h === a || h.startsWith(a)));
  const iSym = col(POSITION_ALIASES.symbol);
  const iQty = col(POSITION_ALIASES.qty);
  const iAvg = col(POSITION_ALIASES.avgPrice);
  if (iSym < 0 || iQty < 0 || iAvg < 0) {
    return { positions, errors: ['Header precisa de symbol, qty e avgPrice (ou aliases: ativo, quantidade, precomedio)'] };
  }
  rows.slice(1).forEach((cells, i) => {
    const line = i + 2;
    const symbol = String(cells[iSym] ?? '').trim().toUpperCase();
    const qty = Number(String(cells[iQty] ?? '').replace(',', '.'));
    const avgPrice = Number(String(cells[iAvg] ?? '').replace(',', '.'));
    if (!symbol) {
      errors.push(`linha ${line}: símbolo vazio`);
      return;
    }
    if (!(qty > 0)) {
      errors.push(`linha ${line} (${symbol}): qty inválida`);
      return;
    }
    if (!(avgPrice > 0)) {
      errors.push(`linha ${line} (${symbol}): avgPrice inválido`);
      return;
    }
    positions.push({ symbol, qty, avgPrice });
  });
  return { positions, errors };
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let i = 0;

  const pushCell = () => {
    row.push(cell);
    cell = '';
  };
  const pushRow = () => {
    pushCell();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      pushCell();
      i += 1;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      pushRow();
      i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }
  // Última linha sem quebra final.
  if (cell.length > 0 || row.length > 0) pushRow();
  // Remove linhas totalmente vazias.
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

// ---------------------------------------------------------------------------
// Mapeamento de colunas
// ---------------------------------------------------------------------------

export type TradeField =
  | 'symbol'
  | 'direction'
  | 'qty'
  | 'entryPrice'
  | 'exitPrice'
  | 'entryDatetime'
  | 'exitDatetime'
  | 'commission'
  | 'fees'
  | 'swap'
  | 'rebate'
  | 'brokerId'
  | 'accountId';

export type ColumnMap = Partial<Record<TradeField, string>>;

export const DEFAULT_COLUMN_ALIASES: Record<TradeField, string[]> = {
  symbol: ['symbol', 'instrument', 'ticker', 'asset', 'simbolo', 'ativo'],
  direction: ['side', 'direction', 'type', 'acao', 'direcao', 'dir'],
  qty: ['qty', 'volume', 'quantity', 'lots', 'size', 'lote', 'vol', 'contratos'],
  entryPrice: ['entryprice', 'openprice', 'entry', 'open', 'precoentrada', 'preco'],
  exitPrice: ['exitprice', 'closeprice', 'exit', 'close', 'precosaida', 'fechamento'],
  entryDatetime: ['entrydatetime', 'opendatetime', 'opentime', 'entrytime', 'open', 'dataentrada', 'opendate'],
  exitDatetime: ['exitdatetime', 'closedatetime', 'closetime', 'exittime', 'datasaida', 'closedate'],
  commission: ['commission', 'comissao', 'comiss'],
  fees: ['fees', 'fee', 'tax', 'tarifa'],
  swap: ['swap', 'swaps', 'overnight', 'rolagem'],
  rebate: ['rebate', 'rebates', 'cashback'],
  brokerId: ['brokerid', 'tradeid', 'id', 'ticket', 'ordernumber', 'platformtradeid', 'positionid'],
  accountId: ['accountid', 'account', 'conta', 'login'],
};

/** Infere o mapeamento de colunas a partir dos headers do CSV. */
export function inferColumnMap(headers: string[]): ColumnMap {
  const map: ColumnMap = {};
  const normalized = headers.map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]/g, ''));
  for (const field of Object.keys(DEFAULT_COLUMN_ALIASES) as TradeField[]) {
    for (const alias of DEFAULT_COLUMN_ALIASES[field]) {
      const idx = normalized.indexOf(alias);
      if (idx >= 0) {
        map[field] = headers[idx];
        break;
      }
    }
  }
  return map;
}

export interface NormalizeOptions {
  map?: ColumnMap;
  /** A conta de destino quando o CSV não traz accountId. */
  defaultAccountId?: string;
  /** Multiplicador/contrato (contract size). Default 1. */
  multiplier?: number;
  /** Cria a Trade e NÃO dedup se já existir `brokerId` igual. */
  dedup?: boolean;
}

export interface NormalizedTrade {
  trade: Trade;
  /** Chave de dedup: brokerId + entryDatetime. */
  dedupKey: string;
}

// ---------------------------------------------------------------------------
// Normalização de um CSV em Trades
// ---------------------------------------------------------------------------

/** Converte uma linha (headers + cells) em Trade. Retorna null se inválida/sem dados. */
export function rowToTrade(
  headers: string[],
  cells: string[],
  opts: NormalizeOptions = {},
): NormalizedTrade | null {
  const map = opts.map ?? inferColumnMap(headers);
  const get = (field: TradeField): string | undefined => {
    const header = map[field];
    if (!header) return undefined;
    const idx = headers.indexOf(header);
    if (idx < 0) return undefined;
    return (cells[idx] ?? '').trim();
  };

  const symbol = get('symbol');
  const qty = toNumber(get('qty'));
  const entryPrice = toNumber(get('entryPrice'));
  if (!symbol || qty == null || qty === 0 || entryPrice == null || entryPrice === 0) {
    return null;
  }

  const dirRaw = get('direction');
  const direction = normalizeDirection(dirRaw);

  const entryDatetimeRaw = get('entryDatetime');
  const exitDatetimeRaw = get('exitDatetime');
  const entryDatetime = normalizeIso(entryDatetimeRaw);
  const exitDatetime = normalizeIso(exitDatetimeRaw) ?? entryDatetime;

  const brokerId = get('brokerId') ?? '';
  const commission = toNumber(get('commission')) ?? 0;
  const fees = toNumber(get('fees')) ?? 0;
  const swap = toNumber(get('swap')) ?? 0;
  const rebate = toNumber(get('rebate')) ?? 0;
  const accountId = get('accountId') ?? opts.defaultAccountId ?? '';
  const multiplier = opts.multiplier ?? 1;

  const exitPrice = toNumber(get('exitPrice'));
  const resultNet = exitPrice != null
    ? realizedPnl({
        entryPrice,
        exitPrice,
        direction,
        qty,
        commission,
        fees,
        swap,
        multiplier,
      })
    : 0;
  const stopPrice = undefined; // CSV não traz stop
  const resultR = exitPrice != null ? tradeR(
    {
      symbol,
      direction,
      entryDatetime,
      exitDatetime,
      qty,
      entryPrice,
      exitPrice,
      commission,
      fees,
      swap,
      rebate,
      resultNet,
      resultR: null,
      source: 'csv',
    } as Trade,
    { multiplier },
  ) : null;

  const trade: Trade = {
    id: brokerId ? `csv_${brokerId}` : `csv_${nowIso()}_${Math.random().toString(36).slice(2, 8)}`,
    accountId: accountId || undefined,
    symbol,
    direction,
    entryDatetime,
    exitDatetime,
    qty,
    entryPrice,
    exitPrice,
    commission,
    swap,
    rebate,
    fees,
    slippage: 0,
    stopPrice,
    multiplier,
    source: 'csv' as TradeSource,
    quantowerId: brokerId ? `csv_${brokerId}` : undefined,
    resultNet: Number(resultNet.toFixed(2)),
    resultR,
    notes: '',
    updatedAt: nowIso(),
    deviceId: '',
    version: 0,
  };

  const dedupKey = trade.quantowerId
    ? `${trade.quantowerId}|${entryDatetime}`
    : `${brokerId}|${entryDatetime}`;
  return { trade, dedupKey };
}

/** Converte um CSV (texto) em Trades normalizados + preview. */
export function csvToTrades(text: string, opts: NormalizeOptions = {}): NormalizedTrade[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const headers = rows[0];
  const dataRows = rows.slice(1);
  const out: NormalizedTrade[] = [];
  for (const cells of dataRows) {
    const normalized = rowToTrade(headers, cells, opts);
    if (normalized) out.push(normalized);
  }
  return out;
}

/** Preview do import: quantas linhas válidas, inválidas e os primeiros N trades. */
export function previewCsv(
  text: string,
  opts: NormalizeOptions = {},
  sampleSize = 8,
): { totalRows: number; valid: number; invalid: number; sample: NormalizedTrade[] } {
  const rows = parseCsv(text);
  const totalRows = Math.max(0, rows.length - 1);
  const parsed = csvToTrades(text, opts);
  return {
    totalRows,
    valid: parsed.length,
    invalid: Math.max(0, totalRows - parsed.length),
    sample: parsed.slice(0, sampleSize),
  };
}

// ---------------------------------------------------------------------------
// Dedup: brokerId + openTime (entryDatetime)
// ---------------------------------------------------------------------------

/**
 * Filtra trades que já existem no banco (mesma `quantowerId`/`brokerId` + mesma
 * data de entrada) ou duplicados dentro do próprio lote.
 */
export function dedupTrades(
  incoming: NormalizedTrade[],
  existing: Trade[],
): { newTrades: NormalizedTrade[]; skipped: NormalizedTrade[] } {
  const existingKeys = new Set<string>();
  for (const t of existing) {
    if (t.quantowerId) existingKeys.add(`${t.quantowerId}|${t.entryDatetime}`);
    else if (t.id) existingKeys.add(`${t.id}|${t.entryDatetime}`);
  }
  const seen = new Set<string>();
  const newTrades: NormalizedTrade[] = [];
  const skipped: NormalizedTrade[] = [];
  for (const n of incoming) {
    const key = n.dedupKey || `${n.trade.quantowerId}|${n.trade.entryDatetime}`;
    if (existingKeys.has(key) || seen.has(key)) {
      skipped.push(n);
      continue;
    }
    seen.add(key);
    newTrades.push(n);
  }
  return { newTrades, skipped };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toNumber(v: string | undefined): number | null {
  if (v == null || v === '') return null;
  const cleaned = v.replace(/[^0-9.\-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
  const n = Number(cleaned);
  return Number.isNaN(n) ? null : n;
}

function normalizeDirection(raw?: string): TradeDirection {
  const r = (raw ?? '').toLowerCase();
  if (['short', 'sell', 'venda', 'sell-side', 's'].includes(r)) return 'short';
  return 'long';
}

function normalizeIso(raw?: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Aceita "2024-01-15 09:30", "2024-01-15T09:30:00Z", "15/01/2024 09:30" (BR).
  const d = parseFlexibleDate(trimmed);
  if (!d) return null;
  return d.toISOString();
}

function parseFlexibleDate(value: string): Date | null {
  // ISO com T ou espaço.
  const iso = new Date(value.replace(' ', 'T'));
  if (!Number.isNaN(iso.getTime())) return iso;
  // dd/MM/yyyy HH:mm (pt-BR) ou MM/dd/yyyy HH:mm (en-US).
  const br = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(value);
  if (br) {
    const day = Number(br[1]);
    const month = Number(br[2]);
    const year = Number(br[3]);
    const hour = Number(br[4] ?? 0);
    const min = Number(br[5] ?? 0);
    const sec = Number(br[6] ?? 0);
    const d = new Date(year, month - 1, day, hour, min, sec);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}
