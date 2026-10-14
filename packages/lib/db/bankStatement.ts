// Fase 1 do import PDF/foto — motor PURO (sem DOM/PDF): perfis de banco, parser de
// extrato/fatura a partir de LINHAS de texto e reconciliação com os totais do documento.
// A extração de texto do PDF vive em `pdfText.ts` (lazy, Vite). O OCR (foto) é a Fase 2.
//
// Por que funciona sem IA: fatura/extrato é estruturado. O perfil diz onde estão data/
// valor/sinal; a reconciliação usa os TOTAIS do próprio documento como checksum.

import type { DataService } from './DataService';
import { parseNumberToken } from './amount';

// ---------------------------------------------------------------------------
// Perfis de banco
// ---------------------------------------------------------------------------

export type StatementKind = 'checking' | 'credit' | 'auto';
export type DateFormat = 'DMY' | 'YMD' | 'DM';

export interface BankProfile {
  id: string;
  name: string;
  /** checking = extrato (débito/crédito); credit = fatura (compras); auto = detectar. */
  kind: StatementKind;
  dateFormat: DateFormat;
  decimal: 'BR' | 'US';
  /** Linhas que NÃO são lançamento (saldo, totais, cabeçalho). Regex (fonte). */
  ignorePatterns: string[];
  /** Palavras que indicam CRÉDITO/entrada (reduzem/positivam). */
  creditMarkers: string[];
  /** Palavras que indicam DÉBITO/saída. */
  debitMarkers: string[];
}

export const DEFAULT_BANK_PROFILES: BankProfile[] = [
  {
    id: 'generic-checking', name: 'Extrato (genérico)', kind: 'checking', dateFormat: 'DMY', decimal: 'BR',
    ignorePatterns: ['^\\s*saldo', 'total\\s+de\\s+', 'saldo\\s+(anterior|final|do\\s+dia)', '^\\(?\\d+[.,]?\\d*\\)?\\s*$'],
    creditMarkers: ['crédito', 'credito', 'entrada', 'recebimento', 'depósito', 'deposito', 'estorno', 'resgate', ' pix recebido'],
    debitMarkers: ['débito', 'debito', 'saída', 'saida', 'pagamento', 'compra', 'saque', 'tarifa', 'transferência enviada'],
  },
  {
    id: 'generic-credit', name: 'Fatura de cartão (genérico)', kind: 'credit', dateFormat: 'DMY', decimal: 'BR',
    ignorePatterns: ['^\\s*(total|valor|fatura|limite|vencimento|fechamento|encargos|juros de)', 'pagamento\\s+mínimo', '^\\s*R\\$?\\s*$'],
    creditMarkers: ['crédito', 'credito', 'estorno', 'pagamento recebido', 'pagamento efetuado', 'devolução', 'devolucao'],
    debitMarkers: [],
  },
  { id: 'nubank', name: 'Nubank', kind: 'auto', dateFormat: 'DMY', decimal: 'BR', ignorePatterns: ['^\\s*(total|saldo)', 'fatura'], creditMarkers: ['crédito', 'estorno', 'pagamento recebido'], debitMarkers: [] },
  { id: 'itau', name: 'Itaú', kind: 'auto', dateFormat: 'DMY', decimal: 'BR', ignorePatterns: ['^\\s*(saldo|total)', 'lançamentos'], creditMarkers: ['crédito', 'entrada', 'estorno'], debitMarkers: ['débito', 'saída'] },
  { id: 'bradesco', name: 'Bradesco', kind: 'auto', dateFormat: 'DMY', decimal: 'BR', ignorePatterns: ['^\\s*(saldo|total)', 'extrato'], creditMarkers: ['crédito', 'entrada'], debitMarkers: ['débito', 'saída'] },
  { id: 'bb', name: 'Banco do Brasil', kind: 'auto', dateFormat: 'DMY', decimal: 'BR', ignorePatterns: ['^\\s*(saldo|total)', 'lançamento'], creditMarkers: ['crédito', 'entrada'], debitMarkers: ['débito', 'saída'] },
  { id: 'caixa', name: 'Caixa', kind: 'auto', dateFormat: 'DMY', decimal: 'BR', ignorePatterns: ['^\\s*(saldo|total)', 'extrato'], creditMarkers: ['crédito', 'entrada'], debitMarkers: ['débito', 'saída'] },
  { id: 'inter', name: 'Inter', kind: 'auto', dateFormat: 'DMY', decimal: 'BR', ignorePatterns: ['^\\s*(saldo|total)', 'fatura'], creditMarkers: ['crédito', 'estorno'], debitMarkers: [] },
  { id: 'c6', name: 'C6 Bank', kind: 'auto', dateFormat: 'DMY', decimal: 'BR', ignorePatterns: ['^\\s*(saldo|total)', 'fatura'], creditMarkers: ['crédito', 'estorno'], debitMarkers: [] },
  { id: 'xp', name: 'XP', kind: 'auto', dateFormat: 'DMY', decimal: 'BR', ignorePatterns: ['^\\s*(saldo|total)', 'extrato'], creditMarkers: ['crédito', 'entrada'], debitMarkers: ['débito', 'saída'] },
];

const BANK_PROFILES_KEY = 'expense:import-profiles';

export async function getBankProfiles(ds: DataService): Promise<BankProfile[]> {
  const rec = await ds.meta.getKey(BANK_PROFILES_KEY);
  const v = rec?.value;
  if (Array.isArray(v)) {
    const custom = v.filter((p) => p && typeof p.id === 'string' && typeof p.name === 'string');
    if (custom.length) {
      // defaults primeiro, custom sobrescreve por id
      const byId = new Map(DEFAULT_BANK_PROFILES.map((p) => [p.id, p]));
      for (const p of custom) byId.set(p.id, p as BankProfile);
      return [...byId.values()];
    }
  }
  return DEFAULT_BANK_PROFILES;
}

export async function saveBankProfile(ds: DataService, profile: BankProfile): Promise<BankProfile[]> {
  const rec = await ds.meta.getKey(BANK_PROFILES_KEY);
  const custom = Array.isArray(rec?.value) ? (rec.value as BankProfile[]) : [];
  const next = custom.filter((p) => p?.id !== profile.id).concat([profile]);
  await ds.meta.setKey(BANK_PROFILES_KEY, next);
  return getBankProfiles(ds);
}

export async function removeBankProfile(ds: DataService, id: string): Promise<BankProfile[]> {
  const rec = await ds.meta.getKey(BANK_PROFILES_KEY);
  const custom = Array.isArray(rec?.value) ? (rec.value as BankProfile[]) : [];
  await ds.meta.setKey(BANK_PROFILES_KEY, custom.filter((p) => p?.id !== id));
  return getBankProfiles(ds);
}

/** Detecta o banco pelas palavras-chave no texto. Retorna o perfil (ou null). */
export function detectBankProfile(text: string, profiles: BankProfile[] = DEFAULT_BANK_PROFILES): BankProfile | null {
  const t = (text || '').toLowerCase();
  for (const p of profiles) {
    if (p.id.startsWith('generic')) continue;
    if (t.includes(p.name.toLowerCase())) return p;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Parser de linhas → lançamentos
// ---------------------------------------------------------------------------

export type StatementConfidence = 'high' | 'medium' | 'low';

export interface StatementEntry {
  date: string; // ISO
  amount: number; // negativo = despesa; positivo = ganho
  description: string;
  raw: string;
  confidence: StatementConfidence;
}

export interface StatementTotals {
  declaredDebits?: number;
  declaredCredits?: number;
  declaredTotal?: number;
  openingBalance?: number;
  closingBalance?: number;
}

export interface ParsedStatement {
  entries: StatementEntry[];
  totals: StatementTotals;
  warnings: string[];
  profileId?: string;
  kind: StatementKind;
}

const MONEY_RE = /-?\(?\s*\d[\d.,]*\s*\)?/g;

/** Extrai a data do INÍCIO da linha (padrão do perfil). Retorna ISO ou null. */
export function parseStatementDate(line: string, format: DateFormat = 'DMY'): { iso: string; rest: string } | null {
  let m: RegExpExecArray | null = null;
  if (format === 'YMD') {
    m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(line);
    if (m) return { iso: isoAt(Number(m[1]), Number(m[2]), Number(m[3])), rest: line.slice(m[0].length) };
  }
  m = /^(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2,4}))?/.exec(line);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  let y = m[3] ? Number(m[3]) : new Date().getUTCFullYear();
  if (y < 100) y += 2000;
  if (!(d >= 1 && d <= 31 && mo >= 1 && mo <= 12)) return null;
  return { iso: isoAt(y, mo, d), rest: line.slice(m[0].length) };
}

function isoAt(y: number, m: number, d: number): string {
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).toISOString();
}

/** Converte "1.234,56" (BR) ou "1,234.56" (US) via parser compartilhado. */
function moneyValue(raw: string): number | null {
  return parseNumberToken(raw.replace(/[()\s]/g, ''));
}

/** Marcadores de crédito/débito no texto (case-insensitive). */
function hasMarker(text: string, markers: string[]): boolean {
  const t = ` ${text.toLowerCase()} `;
  return markers.some((mk) => mk && t.includes(mk.toLowerCase()));
}

/** O token de valor tem sinal explícito (menos ou parênteses)? */
function tokenIsNegative(token: string): boolean {
  const s = token.trim();
  return s.startsWith('-') || (s.startsWith('(') && s.endsWith(')'));
}

/**
 * Parseia as linhas (de PDF/CSV/OCR) em lançamentos. Heurística:
 *  - data no início (perfil);
 *  - último token monetário da linha = valor;
 *  - sinal: marcador de crédito/débito, menos/parênteses, ou tipo do perfil;
 *  - linha sem data que parece continuação → concatena na descrição anterior.
 */
export function parseStatementLines(lines: string[], profile?: BankProfile): ParsedStatement {
  const prof = profile ?? DEFAULT_BANK_PROFILES[0];
  const warnings: string[] = [];
  const entries: StatementEntry[] = [];
  const ignore = prof.ignorePatterns.map((p) => { try { return new RegExp(p, 'i'); } catch { return null; } }).filter(Boolean) as RegExp[];
  const isIgnored = (line: string) => ignore.some((re) => re.test(line));

  // `pending` = linha com data mas sem valor (descrição quebrada); é mesclada com a
  // próxima linha sem data (valor vem embaixo) — comum em PDF de banco.
  let pending: { iso: string; rest: string } | null = null;
  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+/g, ' ').trim();
    if (!line) continue;
    if (isIgnored(line)) continue;

    let dateInfo = parseStatementDate(line, prof.dateFormat);
    if (!dateInfo && pending) {
      // mescla a data pendente com o texto desta linha e segue o parse normal.
      dateInfo = { iso: pending.iso, rest: `${pending.rest} ${line}` };
      pending = null;
    }
    // Continuation: sem data, mas com valor e já temos um lançamento anterior.
    if (!dateInfo) {
      const tokens = line.match(MONEY_RE) || [];
      const val = tokens.length ? moneyValue(tokens[tokens.length - 1]) : null;
      if (val != null && entries.length && !/\d{2}[-/.]\d{2}/.test(line)) {
        entries[entries.length - 1].description = `${entries[entries.length - 1].description} ${line}`.trim();
      }
      continue;
    }

    const moneyTokens = dateInfo.rest.match(MONEY_RE) || [];
    if (!moneyTokens.length) { pending = dateInfo; continue; } // data sem valor: guarda p/ mesclar
    const lastToken = moneyTokens[moneyTokens.length - 1];
    const value = moneyValue(lastToken);
    if (value == null) continue;

    // Sinal.
    const isCreditWord = hasMarker(line, prof.creditMarkers);
    const isDebitWord = hasMarker(line, prof.debitMarkers);
    const explicitNeg = tokenIsNegative(lastToken);
    let signed: number;
    let confidence: StatementConfidence;
    if (explicitNeg || isDebitWord) {
      signed = -Math.abs(value);
      confidence = (explicitNeg || isDebitWord) ? 'high' : 'medium';
    } else if (isCreditWord) {
      signed = Math.abs(value);
      confidence = 'high';
    } else if (prof.kind === 'credit') {
      signed = -Math.abs(value); // fatura: compra é despesa
      confidence = 'medium';
    } else {
      // extrato sem marcador: assume crédito (positivo) — conservador para não inflar gasto.
      signed = Math.abs(value);
      confidence = 'medium';
    }

    // Descrição = linha sem data e sem o valor (tira o último token monetário).
    let desc = dateInfo.rest;
    const lastIdx = desc.lastIndexOf(lastToken);
    if (lastIdx >= 0) desc = `${desc.slice(0, lastIdx)} ${desc.slice(lastIdx + lastToken.length)}`;
    desc = desc.replace(/\b(débito|debito|crédito|credito|entrada|saída|saida)\b/gi, ' ').replace(/\s+[CD]\s*$/i, '').replace(/\s+/g, ' ').trim();
    if (!desc) desc = 'Lançamento';

    entries.push({ date: dateInfo.iso, amount: Number(signed.toFixed(2)), description: desc, raw: line, confidence });
  }

  if (entries.length === 0) warnings.push('Nenhum lançamento reconhecido — ajuste o perfil do banco.');
  return { entries, totals: detectStatementTotals(lines), warnings, profileId: prof.id, kind: prof.kind };
}

// ---------------------------------------------------------------------------
// Totais declarados (checksum)
// ---------------------------------------------------------------------------

function lastMoney(line: string): number | null {
  const tokens = line.match(MONEY_RE) || [];
  if (!tokens.length) return null;
  return moneyValue(tokens[tokens.length - 1]);
}

/** Lê os totais/saldos declarados no documento (para reconciliar). */
export function detectStatementTotals(lines: string[]): StatementTotals {
  const totals: StatementTotals = {};
  for (const raw of lines) {
    const line = raw.toLowerCase();
    const v = lastMoney(raw);
    if (v == null) continue;
    if (/(total\s+de\s+d[eé]bitos?|total\s+d[eé]bito)/.test(line)) totals.declaredDebits = Math.abs(v);
    else if (/(total\s+de\s+cr[eé]ditos?|total\s+cr[eé]dito)/.test(line)) totals.declaredCredits = Math.abs(v);
    else if (/(total\s+da\s+fatura|valor\s+total\s+da\s+fatura|total\s+a\s+pagar)/.test(line)) totals.declaredTotal = Math.abs(v);
    else if (/saldo\s+(anterior|inicial)/.test(line)) totals.openingBalance = v;
    else if (/saldo\s+(final|atual|do\s+dia)/.test(line)) totals.closingBalance = v;
  }
  return totals;
}

// ---------------------------------------------------------------------------
// Reconciliação
// ---------------------------------------------------------------------------

export interface ReconcileCheck { label: string; expected: number; actual: number; ok: boolean; }
export interface Reconciliation { checks: ReconcileCheck[]; ok: boolean; }

/**
 * Confere o que foi parseado contra os totais do documento. Cada check só entra se o
 * documento declarar o valor. `ok` = nenhum check falhou (e há ao menos um).
 */
export function reconcileStatement(parsed: ParsedStatement): Reconciliation {
  const checks: ReconcileCheck[] = [];
  const debits = r2(parsed.entries.filter((e) => e.amount < 0).reduce((s, e) => s + Math.abs(e.amount), 0));
  const credits = r2(parsed.entries.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0));
  const net = r2(debits - credits);
  const t = parsed.totals;
  const near = (a: number, b: number) => Math.abs(a - b) <= 0.05;
  if (t.declaredDebits != null) checks.push({ label: 'Total de débitos', expected: t.declaredDebits, actual: debits, ok: near(debits, t.declaredDebits) });
  if (t.declaredCredits != null) checks.push({ label: 'Total de créditos', expected: t.declaredCredits, actual: credits, ok: near(credits, t.declaredCredits) });
  if (t.declaredTotal != null) checks.push({ label: 'Total da fatura', expected: t.declaredTotal, actual: net, ok: near(net, t.declaredTotal) });
  if (t.openingBalance != null && t.closingBalance != null) {
    const expected = r2(t.openingBalance + credits - debits);
    checks.push({ label: 'Saldo final', expected, actual: t.closingBalance, ok: near(expected, t.closingBalance) });
  }
  return { checks, ok: checks.length > 0 && checks.every((c) => c.ok) };
}

function r2(v: number): number {
  return Number(v.toFixed(2));
}
