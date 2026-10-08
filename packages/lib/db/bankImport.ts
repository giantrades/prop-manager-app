// A3 + H10 — Import OFX/CSV/QIF do banco. Parser + preview + mapeamento de coluna +
// categoria sugerida por regras (editáveis em meta) + dedup forte (FITID do OFX /
// descrição normalizada + valor com tolerância). Puro (sem DataService), exceto os
// helpers de regras que leem/escrevem `meta`. Nunca importa duplicata.

import type { DataService } from './DataService';
import type { TransactionKind } from './types';
import { parseAmount } from './amount';

/** Split de linha CSV com delimitador `,` ou `;` (detectado no header) e aspas. */
function splitLine(line: string, delim: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
        continue;
      }
      cell += ch;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === delim) {
      cells.push(cell);
      cell = '';
      continue;
    }
    cell += ch;
  }
  cells.push(cell);
  return cells;
}

function parseDelimited(text: string): string[][] {
  const lines = String(text || '').split(/\r?\n/);
  const header = lines.find((l) => l.trim() !== '') ?? '';
  const delim = header.includes(';') ? ';' : ',';
  return lines.map((l) => splitLine(l, delim));
}

export interface BankEntry {
  date: string; // ISO
  amount: number; // +ganho / -gasto
  description: string;
  suggestedCategory: string | null; // id da categoria ou null
  key: string; // dedup: date|amount|descrição normalizada
  /** H10 — <FITID> do OFX (dedup forte entre reimportações). */
  fitid?: string;
  /** H10 — moeda original do extrato (quando != USD). */
  currency?: string;
}

export interface BankImportResult {
  entries: BankEntry[];
  skippedDupes: number;
  errors: string[];
}

/** H10 — regra editável: se a descrição contém `keyword` → categoria `categoryId`. */
export interface ImportRule {
  keyword: string;
  categoryId: string | null;
}

/** Regras padrão (antes hardcoded). Agora vivem em meta e podem ser editadas/aprendidas. */
export const DEFAULT_IMPORT_RULES: ImportRule[] = [
  { keyword: 'UBER', categoryId: 'transporte' },
  { keyword: '99TAXI', categoryId: 'transporte' },
  { keyword: '99 ', categoryId: 'transporte' },
  { keyword: 'IFOOD', categoryId: 'alimentacao' },
  { keyword: 'RAPPI', categoryId: 'alimentacao' },
  { keyword: 'RESTAURANTE', categoryId: 'alimentacao' },
  { keyword: 'MERCADO', categoryId: 'alimentacao' },
  { keyword: 'SUPERMERCADO', categoryId: 'alimentacao' },
  { keyword: 'PADARIA', categoryId: 'alimentacao' },
  { keyword: 'ALUGUEL', categoryId: 'moradia' },
  { keyword: 'CONDOMINIO', categoryId: 'moradia' },
  { keyword: 'ENERGIA', categoryId: 'moradia' },
  { keyword: 'AGUA', categoryId: 'moradia' },
  { keyword: 'INTERNET', categoryId: 'moradia' },
  { keyword: 'FARMACIA', categoryId: 'saude' },
  { keyword: 'DROGARIA', categoryId: 'saude' },
  { keyword: 'HOSPITAL', categoryId: 'saude' },
  { keyword: 'LABORATORIO', categoryId: 'saude' },
  { keyword: 'CINEMA', categoryId: 'lazer' },
  { keyword: 'NETFLIX', categoryId: 'lazer' },
  { keyword: 'SPOTIFY', categoryId: 'lazer' },
  { keyword: 'STEAM', categoryId: 'lazer' },
  { keyword: 'DARF', categoryId: 'impostos' },
  { keyword: 'IMPOSTO', categoryId: 'impostos' },
  { keyword: 'CORRETORA', categoryId: 'trading' },
  { keyword: 'CORRETAGEM', categoryId: 'trading' },
  { keyword: 'APORTE', categoryId: 'invest' },
  { keyword: 'INVESTIMENTO', categoryId: 'invest' },
  { keyword: 'ESCOLA', categoryId: 'educacao' },
  { keyword: 'CURSO', categoryId: 'educacao' },
  { keyword: 'UNIVERSIDADE', categoryId: 'educacao' },
  { keyword: 'SALARIO', categoryId: null },
  { keyword: 'PAGAMENTO', categoryId: null },
];

/** H10 — sugestão por regra (case-insensitive, substring). */
export function suggestCategory(description: string, rules: ImportRule[] = DEFAULT_IMPORT_RULES): string | null {
  const d = ` ${(description || '').toUpperCase()} `;
  for (const r of rules) {
    const kw = String(r.keyword || '').toUpperCase();
    if (kw && d.includes(kw)) return r.categoryId;
  }
  return null;
}

/** Normaliza a descrição para o dedup (minúscula, sem acento/pontuação). */
function normDesc(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .slice(0, 60);
}

function entryKey(date: string, amount: number, description: string): string {
  return `${date.slice(0, 10)}|${Number(amount.toFixed(2))}|${normDesc(description)}`;
}

function parseOfxDate(raw: string): string | null {
  // OFX: YYYYMMDDHHMMSS[.xxx][TZ] — pega só a data, meio-dia UTC.
  const m = /^(\d{4})(\d{2})(\d{2})/.exec((raw || '').trim());
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}T12:00:00.000Z`;
}

function parseOfxAmount(raw: string): number | null {
  // OFX usa ponto decimal; alguns bancos BR exportam vírgula.
  const s = String(raw || '').trim();
  const v = s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s);
  return Number.isNaN(v) ? null : v;
}

/** Parser OFX mínimo: blocos <STMTTRN> com TRNTYPE/DTPOSTED/TRNAMT/MEMO|NAME/FITID. */
export function parseOfx(text: string): BankEntry[] {
  const entries: BankEntry[] = [];
  const blocks = String(text || '').split(/<STMTTRN>/i).slice(1);
  for (const b of blocks) {
    const get = (tag: string): string => {
      const m = new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i').exec(b);
      return (m?.[1] || '').trim();
    };
    const type = get('TRNTYPE').toUpperCase();
    const date = parseOfxDate(get('DTPOSTED'));
    let amount = parseOfxAmount(get('TRNAMT'));
    const description = get('MEMO') || get('NAME') || type || 'OFX';
    const fitid = get('FITID');
    if (date == null || amount == null) continue;
    if (type === 'DEBIT' && amount > 0) amount = -amount;
    if (type === 'CREDIT' && amount < 0) amount = -amount;
    entries.push({
      date,
      amount: Number(amount.toFixed(2)),
      description,
      suggestedCategory: suggestCategory(description),
      key: entryKey(date, amount, description),
      fitid: fitid || undefined,
    });
  }
  return entries;
}

const CSV_ALIASES: Record<'date' | 'desc' | 'amount', string[]> = {
  date: ['data', 'date', 'dtposted', 'dt', 'datamovimento'],
  desc: ['descricao', 'descrição', 'description', 'memo', 'name', 'historico', 'histórico', 'lancamento', 'lançamento'],
  amount: ['valor', 'value', 'amount', 'trnamt', 'total'],
};

function normHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function parseCsvDate(raw: string): string | null {
  const s = String(raw || '').trim();
  // ISO, DD/MM/YYYY (+hora opcional), YYYYMMDD
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}T12:00:00.000Z`;
  m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}T12:00:00.000Z`;
  m = /^(\d{4})(\d{2})(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}T12:00:00.000Z`;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  return null;
}

export interface CsvMapping {
  date: number;
  desc: number;
  amount: number;
}

/** H10 — lê o header e auto-detecta as colunas; `mapping=null` quando falha. */
export function detectCsvColumns(text: string): { headers: string[]; mapping: CsvMapping | null } {
  const rows = parseDelimited(text).filter((r) => r.some((c) => String(c ?? '').trim() !== ''));
  if (!rows.length) return { headers: [], mapping: null };
  const headers = rows[0].map((h) => String(h ?? '').trim());
  const norm = headers.map(normHeader);
  const col = (aliases: string[]): number => norm.findIndex((h) => aliases.some((a) => h === a || h.startsWith(a)));
  const date = col(CSV_ALIASES.date);
  const desc = col(CSV_ALIASES.desc);
  const amount = col(CSV_ALIASES.amount);
  return {
    headers,
    mapping: date >= 0 && desc >= 0 && amount >= 0 ? { date, desc, amount } : null,
  };
}

/**
 * Parser CSV genérico de extrato: header com data/descrição/valor (aliases PT/EN) ou
 * `mapping` explícito (H10 — quando a auto-detecção falha o usuário escolhe as colunas).
 */
export function parseBankCsv(text: string, mapping?: CsvMapping): BankEntry[] {
  const rows = parseDelimited(text).filter((r) => r.some((c) => String(c ?? '').trim() !== ''));
  if (!rows.length) return [];
  const map = mapping ?? detectCsvColumns(text).mapping;
  if (!map) return [];
  const { date: iDate, desc: iDesc, amount: iAmt } = map;
  const out: BankEntry[] = [];
  for (const cells of rows.slice(1)) {
    const date = parseCsvDate(cells[iDate] ?? '');
    const raw = String(cells[iAmt] ?? '').trim();
    // "1.234,56" (BR) ou "1234.56" (EN): vírgula presente => ponto é milhar.
    const amount = raw.includes(',') ? Number(raw.replace(/\./g, '').replace(',', '.')) : Number(raw);
    const description = String(cells[iDesc] ?? '').trim() || 'CSV';
    if (date == null || Number.isNaN(amount)) continue;
    out.push({
      date,
      amount: Number(amount.toFixed(2)),
      description,
      suggestedCategory: suggestCategory(description),
      key: entryKey(date, amount, description),
    });
  }
  return out;
}

function parseQifDate(raw: string): string | null {
  const s = String(raw || '').trim();
  // QIF: MM/DD/YYYY ou MM/DD'YYYY
  const m = /^(\d{1,2})[/\-'](\d{1,2})[/\-'](\d{2,4})/.exec(s);
  if (m) {
    const mm = String(m[1]).padStart(2, '0');
    const dd = String(m[2]).padStart(2, '0');
    const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${yyyy}-${mm}-${dd}T12:00:00.000Z`;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * H10 — parser QIF mínimo: registros separados por `^`, com D (data), T (valor),
 * P (payee) e M (memo). `!Type` e comentários são ignorados.
 */
export function parseQif(text: string): BankEntry[] {
  const out: BankEntry[] = [];
  let cur: { date?: string; amount?: number; payee?: string; memo?: string } = {};
  const flush = (): void => {
    if (cur.date && cur.amount != null) {
      const description = cur.payee || cur.memo || 'QIF';
      out.push({
        date: cur.date,
        amount: Number(cur.amount.toFixed(2)),
        description,
        suggestedCategory: suggestCategory(description),
        key: entryKey(cur.date, cur.amount, description),
      });
    }
    cur = {};
  };
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('!')) { flush(); continue; }
    const code = line[0];
    const val = line.slice(1).trim();
    if (code === '^') { flush(); continue; }
    if (code === 'D') cur.date = parseQifDate(val);
    else if (code === 'T') {
      const neg = /^[-+]/.test(val) && val.startsWith('-');
      const n = parseAmount(val.replace(/^[-+]/, ''));
      if (n != null) cur.amount = neg ? -n : n;
    }
    else if (code === 'P') cur.payee = val;
    else if (code === 'M') cur.memo = val;
  }
  flush();
  return out;
}

export interface ExistingLite {
  date: string;
  amount: number;
  note?: string;
  /** H10 — id externo já guardado (FITID) para dedup forte. */
  externalId?: string;
}

interface SeenIndex {
  fitids: Set<string>;
  byKey: Set<string>;
  byDayDesc: Map<string, number[]>;
}

function makeSeen(existing: ExistingLite[]): SeenIndex {
  const fitids = new Set<string>();
  const byKey = new Set<string>();
  const byDayDesc = new Map<string, number[]>();
  for (const t of existing) {
    if (t.externalId) fitids.add(t.externalId);
    byKey.add(entryKey(t.date, t.amount, t.note ?? ''));
    const dk = `${t.date.slice(0, 10)}|${normDesc(t.note ?? '')}`;
    const arr = byDayDesc.get(dk) ?? [];
    arr.push(t.amount);
    byDayDesc.set(dk, arr);
  }
  return { fitids, byKey, byDayDesc };
}

function seenHas(seen: SeenIndex, e: BankEntry): boolean {
  if (e.fitid && seen.fitids.has(e.fitid)) return true;
  if (seen.byKey.has(e.key)) return true;
  const dk = `${e.date.slice(0, 10)}|${normDesc(e.description)}`;
  const arr = seen.byDayDesc.get(dk);
  return !!arr && arr.some((a) => Math.abs(a - e.amount) <= 0.011);
}

function seenAdd(seen: SeenIndex, e: BankEntry): void {
  if (e.fitid) seen.fitids.add(e.fitid);
  seen.byKey.add(e.key);
  const dk = `${e.date.slice(0, 10)}|${normDesc(e.description)}`;
  const arr = seen.byDayDesc.get(dk) ?? [];
  arr.push(e.amount);
  seen.byDayDesc.set(dk, arr);
}

/**
 * Dedup (FITID > data+valor+descrição normalizada, com tolerância ±0,01) contra o
 * ledger e dentro do arquivo. Ganhos (amount>0) viram `income`; gastos, `expense`.
 */
export function buildBankImport(
  entries: BankEntry[],
  existing: ExistingLite[],
  rules: ImportRule[] = DEFAULT_IMPORT_RULES,
): { result: BankImportResult; kinds: Map<string, TransactionKind> } {
  const seen = makeSeen(existing);
  const out: BankEntry[] = [];
  const kinds = new Map<string, TransactionKind>();
  let skippedDupes = 0;
  const errors: string[] = [];
  for (const e of entries) {
    const enriched: BankEntry = { ...e, suggestedCategory: e.suggestedCategory ?? suggestCategory(e.description, rules) };
    if (seenHas(seen, enriched)) {
      skippedDupes += 1;
      continue;
    }
    seenAdd(seen, enriched);
    out.push(enriched);
    kinds.set(enriched.key, enriched.amount >= 0 ? 'income' : 'expense');
  }
  return { result: { entries: out, skippedDupes, errors }, kinds };
}

/** Ponto de entrada: detecta OFX, QIF ou CSV pelo conteúdo. */
export function parseBankFile(text: string, mapping?: CsvMapping): BankEntry[] {
  if (/<OFX>|<STMTTRN>/i.test(text || '')) return parseOfx(text);
  if (/(^|\n)!Type:/i.test(text || '') || /(^|\n)\^/m.test(text || '')) return parseQif(text);
  return parseBankCsv(text, mapping);
}

// ---------------------------------------------------------------------------
// H10 — regras editáveis em meta (expense:import-rules) + aprendizado
// ---------------------------------------------------------------------------

const IMPORT_RULES_KEY = 'expense:import-rules';

function isRule(x: unknown): x is ImportRule {
  return !!x && typeof x === 'object' && typeof (x as ImportRule).keyword === 'string';
}

export async function getImportRules(ds: DataService): Promise<ImportRule[]> {
  const rec = await ds.meta.getKey(IMPORT_RULES_KEY);
  const v = rec?.value;
  if (Array.isArray(v)) {
    const clean = v.filter(isRule).map((r) => ({ keyword: r.keyword, categoryId: r.categoryId ?? null }));
    if (clean.length) return clean;
  }
  return DEFAULT_IMPORT_RULES;
}

export async function saveImportRules(ds: DataService, rules: ImportRule[]): Promise<ImportRule[]> {
  const clean = rules
    .filter(isRule)
    .map((r) => ({ keyword: String(r.keyword).trim(), categoryId: r.categoryId ?? null }))
    .filter((r) => r.keyword);
  await ds.meta.setKey(IMPORT_RULES_KEY, clean);
  return getImportRules(ds);
}

/**
 * Aprende uma regra a partir de uma descrição confirmada: usa o token mais longo
 * (>= 3 letras) como palavra-chave e associa a categoria escolhida. Idempotente.
 */
export async function learnImportRule(
  ds: DataService,
  description: string,
  categoryId: string | null,
): Promise<ImportRule[]> {
  const tokens = normDesc(description).split(' ').filter((t) => t.length >= 3);
  if (!tokens.length) return getImportRules(ds);
  const keyword = tokens.reduce((a, b) => (b.length > a.length ? b : a));
  const rules = await getImportRules(ds);
  const kw = keyword.toUpperCase();
  const next = rules.filter((r) => r.keyword.toUpperCase() !== kw).concat([{ keyword: kw, categoryId }]);
  return saveImportRules(ds, next);
}
