// Import CSV de opções (melhoria A6). Dois formatos genéricos — o parser aceita `,` ou `;`,
// decimal com ponto ou vírgula (BR) e cabeçalhos em PT/EN. Linhas inválidas vão para
// `errors` com o número da linha: nunca derrubam o lote. Sem fórmula financeira aqui.
//
// Cadeia  : underlying, expiry, strike, right, bid, ask, last, iv, oi, volume, multiplier, symbol
// Pernas  : underlying, right, strike, expiry, qty (ou side + qty), price, date, fees, multiplier, symbol
//
// `multiplier` é OBRIGATÓRIO por linha (ou via `defaultMultiplier` informado pelo usuário):
// nunca é assumido como 100.
//
// Fonte: DOCS/10_MODULES/options/melhorias.md (A6) e 00-spec.md.

import type { OptionChainQuote, OptionLeg, OptionRight } from './types';
import { optionQuoteId } from './options';

export interface OptionImportError {
  line: number;
  message: string;
}

export interface OptionChainImportResult {
  quotes: OptionChainQuote[];
  errors: OptionImportError[];
}

export interface OptionLegsImportResult {
  legs: OptionLeg[];
  errors: OptionImportError[];
}

// ---------------------------------------------------------------------------
// Utilidades (privadas)
// ---------------------------------------------------------------------------

function norm(h: string): string {
  return h.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

function detectDelimiter(text: string): ',' | ';' | '\t' {
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  const counts: Array<[',' | ';' | '\t', number]> = [
    [',', (first.match(/,/g) ?? []).length],
    [';', (first.match(/;/g) ?? []).length],
    ['\t', (first.match(/\t/g) ?? []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ',';
}

function splitRows(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 1; } else q = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell); cell = '';
      rows.push(row); row = [];
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/** "1.234,56" / "1234.56" / "1,5" / "29%" → número. Vazio/ilegível → null. */
function num(raw: string | undefined): number | null {
  if (raw == null) return null;
  let v = raw.trim().replace(/[%\s$R]/g, '');
  if (v === '' || v === '-' || v === '—') return null;
  const hasComma = v.includes(',');
  const hasDot = v.includes('.');
  if (hasComma && hasDot) {
    // o separador decimal é o que aparece por último
    v = v.lastIndexOf(',') > v.lastIndexOf('.') ? v.replace(/\./g, '').replace(',', '.') : v.replace(/,/g, '');
  } else if (hasComma) v = v.replace(',', '.');
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** IV: aceita 0.29, 29 e "29%". Acima de 3 (300%) é lido como percentual. */
function ivNum(raw: string | undefined): number | null {
  const n = num(raw);
  if (n == null || n <= 0) return null;
  return n > 3 ? Number((n / 100).toFixed(6)) : n;
}

function parseRight(raw: string | undefined): OptionRight | null {
  const r = norm(raw ?? '');
  if (['call', 'c', 'compra'].includes(r)) return 'call';
  if (['put', 'p', 'venda'].includes(r)) return 'put';
  return null;
}

/** Data de vencimento como `YYYY-MM-DD`. Aceita ISO e DD/MM/YYYY (pt-BR). */
function parseExpiry(raw: string | undefined): string | null {
  const v = (raw ?? '').trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(v);
  if (br) return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
  return null;
}

function parseDateTime(raw: string | undefined): string | null {
  const v = (raw ?? '').trim();
  if (!v) return null;
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(v);
  if (br) {
    const d = new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]), Number(br[4] ?? 0), Number(br[5] ?? 0), Number(br[6] ?? 0));
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(v.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const ALIASES: Record<string, string[]> = {
  underlying: ['underlying', 'subjacente', 'ativo', 'ativoobjeto', 'ticker'],
  symbol: ['symbol', 'simbolo', 'codigo', 'serie', 'contrato'],
  expiry: ['expiry', 'expiration', 'vencimento', 'venc', 'exp'],
  strike: ['strike', 'exercicio', 'precoexercicio'],
  right: ['right', 'tipo', 'type', 'callput', 'cp'],
  bid: ['bid', 'compra', 'melhorcompra'],
  ask: ['ask', 'venda', 'melhorvenda', 'offer'],
  last: ['last', 'ultimo', 'ultimopreco', 'preco'],
  iv: ['iv', 'volimpl', 'volimplicita', 'volatilidadeimplicita', 'impliedvol'],
  oi: ['oi', 'openinterest', 'contratosemaberto', 'interesseaberto'],
  volume: ['volume', 'vol'],
  multiplier: ['multiplier', 'multiplicador', 'contractsize', 'lote', 'tamanhocontrato'],
  qty: ['qty', 'quantity', 'quantidade', 'qtd', 'contratos'],
  side: ['side', 'lado', 'operacao', 'cv'],
  price: ['price', 'premio', 'preco', 'precomedio', 'entryprice'],
  date: ['date', 'data', 'datetime', 'datahora', 'entrada'],
  fees: ['fees', 'taxas', 'custos', 'comissao', 'corretagem'],
};

function mapHeaders(headers: string[]): Record<string, number> {
  const idx: Record<string, number> = {};
  const normalized = headers.map(norm);
  for (const [key, names] of Object.entries(ALIASES)) {
    // 1º alias da lista que existir no cabeçalho (ordem = prioridade)
    for (const n of names) {
      const at = normalized.indexOf(n);
      if (at >= 0) { idx[key] = at; break; }
    }
  }
  return idx;
}

function cell(row: string[], idx: Record<string, number>, key: string): string | undefined {
  const i = idx[key];
  return i == null ? undefined : row[i];
}

function hash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i += 1) h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// ---------------------------------------------------------------------------
// Cadeia
// ---------------------------------------------------------------------------

/** CSV de cotações → `OptionChainQuote[]` (source 'manual', id determinístico: reimportar atualiza). */
export function parseOptionChainCsv(
  text: string,
  opts?: { defaultUnderlying?: string; defaultExpiry?: string; defaultMultiplier?: number },
): OptionChainImportResult {
  const quotes: OptionChainQuote[] = [];
  const errors: OptionImportError[] = [];
  const clean = text.replace(/^\uFEFF/, '').trim();
  if (!clean) return { quotes, errors: [{ line: 1, message: 'Arquivo vazio.' }] };
  const rows = splitRows(clean, detectDelimiter(clean));
  const idx = mapHeaders(rows[0] ?? []);
  if (idx.strike == null || idx.right == null) {
    return { quotes, errors: [{ line: 1, message: 'Cabeçalho precisa de "strike" e "right/tipo" (call/put).' }] };
  }
  const at = new Date().toISOString();
  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r];
    if (row.every((c) => c.trim() === '')) continue;
    const line = r + 1;
    const underlying = (cell(row, idx, 'underlying') ?? opts?.defaultUnderlying ?? '').trim().toUpperCase();
    const expiry = parseExpiry(cell(row, idx, 'expiry') ?? opts?.defaultExpiry);
    const strike = num(cell(row, idx, 'strike'));
    const right = parseRight(cell(row, idx, 'right'));
    const multiplier = num(cell(row, idx, 'multiplier')) ?? opts?.defaultMultiplier ?? null;
    if (!underlying) { errors.push({ line, message: 'Subjacente ausente.' }); continue; }
    if (!expiry) { errors.push({ line, message: 'Vencimento inválido/ausente.' }); continue; }
    if (strike == null || !(strike > 0)) { errors.push({ line, message: 'Strike inválido.' }); continue; }
    if (!right) { errors.push({ line, message: 'Tipo deve ser call ou put.' }); continue; }
    if (multiplier == null || !(multiplier > 0)) { errors.push({ line, message: 'Multiplicador do contrato ausente.' }); continue; }
    const bid = num(cell(row, idx, 'bid'));
    const ask = num(cell(row, idx, 'ask'));
    const last = num(cell(row, idx, 'last'));
    if (bid != null && ask != null && bid > ask) { errors.push({ line, message: 'Bid maior que ask.' }); continue; }
    quotes.push({
      id: optionQuoteId(underlying, expiry, strike, right),
      underlying,
      expiry,
      strike,
      right,
      symbol: (cell(row, idx, 'symbol') ?? '').trim() || `${underlying}${right[0].toUpperCase()}${strike}`,
      bid,
      ask,
      last,
      iv: ivNum(cell(row, idx, 'iv')),
      oi: num(cell(row, idx, 'oi')),
      volume: num(cell(row, idx, 'volume')),
      greeks: null,
      multiplier,
      at,
      source: 'manual',
    });
  }
  return { quotes, errors };
}

// ---------------------------------------------------------------------------
// Pernas (extrato)
// ---------------------------------------------------------------------------

/**
 * CSV de operações → `OptionLeg[]`. Id = `optcsv:<fingerprint>:<n>` onde n é a ocorrência
 * da mesma linha no arquivo: reimportar o MESMO extrato gera os MESMOS ids (idempotente),
 * mas duas execuções idênticas dentro do arquivo continuam sendo duas pernas.
 * `qty` pode vir com sinal, ou positivo + coluna `side` (compra/venda, buy/sell, C/V).
 */
export function parseOptionLegsCsv(
  text: string,
  opts: { accountId: string; defaultMultiplier?: number },
): OptionLegsImportResult {
  const legs: OptionLeg[] = [];
  const errors: OptionImportError[] = [];
  const clean = text.replace(/^\uFEFF/, '').trim();
  if (!clean) return { legs, errors: [{ line: 1, message: 'Arquivo vazio.' }] };
  const rows = splitRows(clean, detectDelimiter(clean));
  const idx = mapHeaders(rows[0] ?? []);
  const required = ['underlying', 'right', 'strike', 'expiry', 'qty', 'price'];
  const missing = required.filter((k) => idx[k] == null);
  if (missing.length) {
    return { legs, errors: [{ line: 1, message: `Cabeçalho sem coluna(s): ${missing.join(', ')}.` }] };
  }
  const seen = new Map<string, number>();
  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r];
    if (row.every((c) => c.trim() === '')) continue;
    const line = r + 1;
    const underlying = (cell(row, idx, 'underlying') ?? '').trim().toUpperCase();
    const right = parseRight(cell(row, idx, 'right'));
    const strike = num(cell(row, idx, 'strike'));
    const expiry = parseExpiry(cell(row, idx, 'expiry'));
    let qty = num(cell(row, idx, 'qty'));
    const price = num(cell(row, idx, 'price'));
    const multiplier = num(cell(row, idx, 'multiplier')) ?? opts.defaultMultiplier ?? null;
    const when = parseDateTime(cell(row, idx, 'date'));
    if (!underlying) { errors.push({ line, message: 'Subjacente ausente.' }); continue; }
    if (!right) { errors.push({ line, message: 'Tipo deve ser call ou put.' }); continue; }
    if (strike == null || !(strike > 0)) { errors.push({ line, message: 'Strike inválido.' }); continue; }
    if (!expiry) { errors.push({ line, message: 'Vencimento inválido.' }); continue; }
    if (qty == null || qty === 0) { errors.push({ line, message: 'Quantidade inválida.' }); continue; }
    if (price == null || price < 0) { errors.push({ line, message: 'Preço/prêmio inválido.' }); continue; }
    if (multiplier == null || !(multiplier > 0)) { errors.push({ line, message: 'Multiplicador do contrato ausente.' }); continue; }
    if (!when) { errors.push({ line, message: 'Data da operação inválida/ausente.' }); continue; }
    const side = norm(cell(row, idx, 'side') ?? '');
    if (side) {
      const isSell = ['venda', 'sell', 'sold', 'v', 's', 'short'].includes(side);
      const isBuy = ['compra', 'buy', 'bought', 'c', 'b', 'long'].includes(side);
      if (!isSell && !isBuy) { errors.push({ line, message: `Lado desconhecido: "${side}".` }); continue; }
      qty = isSell ? -Math.abs(qty) : Math.abs(qty);
    }
    const fees = num(cell(row, idx, 'fees')) ?? 0;
    const base = [underlying, right, strike, expiry, qty, price, when, fees, multiplier].join('|');
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    legs.push({
      id: `optcsv:${hash(base)}:${n}`,
      accountId: opts.accountId,
      underlying,
      symbol: (cell(row, idx, 'symbol') ?? '').trim() || `${underlying}${right[0].toUpperCase()}${strike}`,
      right,
      strike,
      expiry,
      qty,
      multiplier,
      entryPrice: price,
      entryDatetime: when,
      fees,
      source: 'manual',
      updatedAt: new Date().toISOString(),
      deviceId: '',
      version: 0,
    });
  }
  return { legs, errors };
}
