// A3 — Import OFX/CSV do banco. Parser + preview + mapeamento de coluna +
// categoria sugerida por palavra-chave + dedup por (data+valor+descrição).
// Puro (sem DataService): a página cria via MoneyService. Nunca importa duplicata.

import type { TransactionKind } from './types';

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
  key: string; // dedup: date|amount|description
}

export interface BankImportResult {
  entries: BankEntry[];
  skippedDupes: number;
  errors: string[];
}

/** Palavras-chave -> categoria (uppercase, substring). Editável no preview. */
const KEYWORD_CATEGORY: Array<[string, string]> = [
  ['UBER', 'transporte'],
  ['99TAXI', 'transporte'],
  ['99 ', 'transporte'],
  ['IFOOD', 'alimentacao'],
  ['RAPPI', 'alimentacao'],
  ['RESTAURANTE', 'alimentacao'],
  ['MERCADO', 'alimentacao'],
  ['SUPERMERCADO', 'alimentacao'],
  ['PADARIA', 'alimentacao'],
  ['ALUGUEL', 'moradia'],
  ['CONDOMINIO', 'moradia'],
  ['ENERGIA', 'moradia'],
  ['AGUA', 'moradia'],
  ['INTERNET', 'moradia'],
  ['FARMACIA', 'saude'],
  ['DROGARIA', 'saude'],
  ['HOSPITAL', 'saude'],
  ['LABORATORIO', 'saude'],
  ['CINEMA', 'lazer'],
  ['NETFLIX', 'lazer'],
  ['SPOTIFY', 'lazer'],
  ['STEAM', 'lazer'],
  ['DARF', 'impostos'],
  ['IMPOSTO', 'impostos'],
  ['CORRETORA', 'trading'],
  ['CORRETAGEM', 'trading'],
  ['APORTE', 'invest'],
  ['INVESTIMENTO', 'invest'],
  ['ESCOLA', 'educacao'],
  ['CURSO', 'educacao'],
  ['UNIVERSIDADE', 'educacao'],
  ['SALARIO', null],
  ['PAGAMENTO', null],
];

export function suggestCategory(description: string): string | null {
  const d = ` ${(description || '').toUpperCase()} `;
  for (const [kw, cat] of KEYWORD_CATEGORY) {
    if (d.includes(kw)) return cat;
  }
  return null;
}

function entryKey(date: string, amount: number, description: string): string {
  return `${date.slice(0, 10)}|${Number(amount.toFixed(2))}|${description.trim().toUpperCase().slice(0, 60)}`;
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

/** Parser OFX mínimo: blocos <STMTTRN> com TRNTYPE/DTPOSTED/TRNAMT/MEMO|NAME. */
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
    if (date == null || amount == null) continue;
    if (type === 'DEBIT' && amount > 0) amount = -amount;
    if (type === 'CREDIT' && amount < 0) amount = -amount;
    entries.push({
      date,
      amount: Number(amount.toFixed(2)),
      description,
      suggestedCategory: suggestCategory(description),
      key: entryKey(date, amount, description),
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
    .replace(/[̀-ͯ]/g, '')
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

/** Parser CSV genérico de extrato: header com data/descrição/valor (aliases PT/EN). */
export function parseBankCsv(text: string): BankEntry[] {
  const rows = parseDelimited(text).filter((r) => r.some((c) => String(c ?? '').trim() !== ''));
  if (!rows.length) return [];
  const headers = rows[0].map((h) => normHeader(String(h ?? '')));
  const col = (aliases: string[]): number =>
    headers.findIndex((h) => aliases.some((a) => h === a || h.startsWith(a)));
  const iDate = col(CSV_ALIASES.date);
  const iDesc = col(CSV_ALIASES.desc);
  const iAmt = col(CSV_ALIASES.amount);
  if (iDate < 0 || iDesc < 0 || iAmt < 0) return [];
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

export interface ExistingLite {
  date: string;
  amount: number;
  note?: string;
}

/**
 * Dedup por (data+valor+descrição): contra o ledger (note/MEMO) e dentro do arquivo.
 * Ganhos (amount>0) viram kind `income`; gastos, `expense`.
 */
export function buildBankImport(
  entries: BankEntry[],
  existing: ExistingLite[],
): { result: BankImportResult; kinds: Map<string, TransactionKind> } {
  const seen = new Set(
    existing.map((t) =>
      entryKey(t.date, t.amount, t.note ?? ''),
    ),
  );
  const out: BankEntry[] = [];
  const kinds = new Map<string, TransactionKind>();
  let skippedDupes = 0;
  const errors: string[] = [];
  for (const e of entries) {
    if (seen.has(e.key)) {
      skippedDupes += 1;
      continue;
    }
    seen.add(e.key);
    out.push(e);
    kinds.set(e.key, e.amount >= 0 ? 'income' : 'expense');
  }
  return { result: { entries: out, skippedDupes, errors }, kinds };
}

/** Ponto de entrada: detecta OFX (<OFX>/<STMTTRN>) ou CSV pelo conteúdo. */
export function parseBankFile(text: string): BankEntry[] {
  if (/<OFX>|<STMTTRN>/i.test(text || '')) return parseOfx(text);
  return parseBankCsv(text);
}
