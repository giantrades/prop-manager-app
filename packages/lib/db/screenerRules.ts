// SCANNER — linguagem de regras (DSL) para o screener.
// Você escreve a condição em texto; o parser monta uma AST e o avaliador filtra as linhas.
//
// Ex.: `change > 2% AND volume > 1M`
//      `sector = tech AND absChange > 3%`
//      `offHigh < 1% AND change > 0`
//      `symbol in (NVDA, AMD, MU) AND price between 10 and 500`
//
// Campos percentuais são expostos em PONTOS PERCENTUAIS (`change > 2` = +2%).
// Campos EXTRAS (fundamentos e campos personalizados) são numéricos e vêm em `row.extra`.
//
// Documentação viva: `RULE_FIELDS`/`RULE_EXAMPLES` (a UI renderiza o guia a partir daqui)
// + `DOCS/10_MODULES/market/01-scanner-rules.md`.
//
// Puro (sem I/O), testado em `__tests__/screenerRules.test.ts`.

export type RuleField =
  | 'price'
  | 'change'
  | 'change5d'
  | 'absChange'
  | 'volume'
  | 'high5d'
  | 'low5d'
  | 'range5d'
  | 'offHigh'
  | 'offLow'
  | 'sector'
  | 'symbol'
  | 'name';

export type RuleCompOp = '>' | '>=' | '<' | '<=' | '=' | '!=';

export interface RuleValue {
  raw: string;
  num: number | null;
}

export type RuleNode =
  | { kind: 'and'; left: RuleNode; right: RuleNode }
  | { kind: 'or'; left: RuleNode; right: RuleNode }
  | { kind: 'not'; node: RuleNode }
  | { kind: 'compare'; field: string; numeric: boolean; op: RuleCompOp; value: RuleValue }
  | { kind: 'between'; field: string; numeric: boolean; lo: RuleValue; hi: RuleValue }
  | { kind: 'contains'; field: string; value: string }
  | { kind: 'in'; field: string; numeric: boolean; values: RuleValue[] };

export interface RuleParseResult {
  ast: RuleNode | null;
  error: string | null;
}

export interface RuleParseOptions {
  /** Campos numéricos extras (fundamentos/custom), ids canônicos em minúsculo. */
  extraNumericFields?: string[];
}

// ---------------------------------------------------------------------------
// Metadados (guia no app)
// ---------------------------------------------------------------------------

export interface RuleFieldDoc {
  key: RuleField;
  label: string;
  aliases: string[];
  numeric: boolean;
  unit?: string;
}

export const RULE_FIELDS: RuleFieldDoc[] = [
  { key: 'price', label: 'Preço', aliases: ['price', 'preco'], numeric: true },
  { key: 'change', label: 'Variação do dia', aliases: ['change', 'chg', 'var'], numeric: true, unit: '%' },
  { key: 'change5d', label: 'Variação 5d', aliases: ['change5d', 'chg5d', 'var5d'], numeric: true, unit: '%' },
  { key: 'absChange', label: 'Variação absoluta (dia)', aliases: ['absChange', 'abs', 'mover'], numeric: true, unit: '%' },
  { key: 'volume', label: 'Volume', aliases: ['volume', 'vol'], numeric: true },
  { key: 'high5d', label: 'Máxima de 5d', aliases: ['high5d', 'max5d', 'high5'], numeric: true },
  { key: 'low5d', label: 'Mínima de 5d', aliases: ['low5d', 'min5d', 'low5'], numeric: true },
  { key: 'range5d', label: 'Amplitude 5d (topo/fundo)', aliases: ['range5d', 'range', 'amplitude'], numeric: true, unit: '%' },
  { key: 'offHigh', label: 'Distância do topo 5d', aliases: ['offHigh', 'fromHigh', 'distHigh'], numeric: true, unit: '%' },
  { key: 'offLow', label: 'Distância do fundo 5d', aliases: ['offLow', 'fromLow', 'distLow'], numeric: true, unit: '%' },
  { key: 'sector', label: 'Setor (id ou nome)', aliases: ['sector', 'setor'], numeric: false },
  { key: 'symbol', label: 'Símbolo', aliases: ['symbol', 'simbolo', 'ticker'], numeric: false },
  { key: 'name', label: 'Nome', aliases: ['name', 'nome'], numeric: false },
];

export const RULE_EXAMPLES: string[] = [
  'change > 2% AND volume > 1M',
  'change < -2% AND price > 10',
  'sector = tech AND absChange > 3%',
  'offHigh < 1% AND change > 0',
  'offLow < 1% AND change < 0',
  'symbol in (NVDA, AMD, MU) AND price between 10 and 500',
  'name contains "apple"',
  'NOT sector = utilities AND volume > 2M',
];

const NUMERIC_FIELDS = new Set<RuleField>([
  'price', 'change', 'change5d', 'absChange', 'volume', 'high5d', 'low5d', 'range5d', 'offHigh', 'offLow',
]);

export function isBuiltinNumericField(field: string): boolean {
  return NUMERIC_FIELDS.has(field as RuleField);
}

export function normalizeWord(word: string): string {
  return word
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

const FIELD_ALIASES: Record<string, RuleField> = (() => {
  const map: Record<string, RuleField> = {};
  for (const f of RULE_FIELDS) {
    for (const a of [f.key, ...f.aliases]) map[normalizeWord(a)] = f.key;
  }
  return map;
})();

export function resolveField(raw: string): RuleField | null {
  return FIELD_ALIASES[normalizeWord(raw)] ?? null;
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

type Token =
  | { t: 'num'; v: number; pos: number }
  | { t: 'str'; v: string; pos: number }
  | { t: 'ident'; v: string; pos: number }
  | { t: 'punct'; v: string; pos: number };

const MULTIPLIER: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9 };

function tokenize(input: string): { tokens: Token[]; error: string | null } {
  const tokens: Token[] = [];
  let i = 0;
  const n = input.length;
  while (i < n) {
    const ch = input[i];
    if (/\s/.test(ch)) { i += 1; continue; }

    if (ch === '(' || ch === ')' || ch === ',') {
      tokens.push({ t: 'punct', v: ch, pos: i });
      i += 1;
      continue;
    }

    if (ch === '>' || ch === '<' || ch === '=' || ch === '!') {
      const two = input.slice(i, i + 2);
      if (two === '>=' || two === '<=' || two === '!=' || two === '==') {
        tokens.push({ t: 'punct', v: two === '==' ? '=' : two, pos: i });
        i += 2;
      } else {
        tokens.push({ t: 'punct', v: ch, pos: i });
        i += 1;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      let v = '';
      while (j < n && input[j] !== quote) { v += input[j]; j += 1; }
      if (j >= n) return { tokens: [], error: `Aspas não fechadas na posição ${i}.` };
      tokens.push({ t: 'str', v, pos: i });
      i = j + 1;
      continue;
    }

    if (/[0-9]/.test(ch) || ((ch === '-' || ch === '.') && /[0-9]/.test(input[i + 1] ?? ''))) {
      let j = i;
      if (input[j] === '-') j += 1;
      while (j < n && /[0-9]/.test(input[j])) j += 1;
      if (input[j] === '.') { j += 1; while (j < n && /[0-9]/.test(input[j])) j += 1; }
      const raw = input.slice(i, j);
      let value = Number(raw);
      if (Number.isNaN(value)) return { tokens: [], error: `Número inválido "${raw}" na posição ${i}.` };
      const suffix = input[j]?.toLowerCase();
      if (suffix && MULTIPLIER[suffix]) { value *= MULTIPLIER[suffix]; j += 1; }
      if (input[j] === '%') j += 1;
      tokens.push({ t: 'num', v: value, pos: i });
      i = j;
      continue;
    }

    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_]/.test(input[j])) j += 1;
      tokens.push({ t: 'ident', v: input.slice(i, j), pos: i });
      i = j;
      continue;
    }

    return { tokens: [], error: `Caractere inesperado "${ch}" na posição ${i}.` };
  }
  return { tokens, error: null };
}

// ---------------------------------------------------------------------------
// Parser (recursivo descendente)
// ---------------------------------------------------------------------------

class Parser {
  private i = 0;
  error: string | null = null;

  constructor(
    private readonly tokens: Token[],
    private readonly extras: Set<string>,
  ) {}

  private peek(): Token | undefined { return this.tokens[this.i]; }

  private next(): Token | undefined { return this.tokens[this.i++]; }

  private isIdent(tok: Token | undefined, kw: string): boolean {
    return !!tok && tok.t === 'ident' && tok.v.toLowerCase() === kw;
  }

  private fail(msg: string): void {
    if (!this.error) this.error = msg;
  }

  parse(): RuleNode | null {
    if (this.tokens.length === 0) { this.fail('Regra vazia.'); return null; }
    const node = this.parseOr();
    if (this.error) return null;
    if (this.i < this.tokens.length) {
      const tok = this.tokens[this.i];
      this.fail(`Sobrou conteúdo não interpretado perto da posição ${tok.pos}.`);
      return null;
    }
    return node;
  }

  private parseOr(): RuleNode | null {
    let left = this.parseAnd();
    if (this.error) return null;
    while (this.isIdent(this.peek(), 'or')) {
      this.next();
      const right = this.parseAnd();
      if (this.error || !right) return null;
      left = { kind: 'or', left: left as RuleNode, right };
    }
    return left;
  }

  private parseAnd(): RuleNode | null {
    let left = this.parseNot();
    if (this.error) return null;
    while (this.isIdent(this.peek(), 'and')) {
      this.next();
      const right = this.parseNot();
      if (this.error || !right) return null;
      left = { kind: 'and', left: left as RuleNode, right };
    }
    return left;
  }

  private parseNot(): RuleNode | null {
    if (this.isIdent(this.peek(), 'not')) {
      this.next();
      const node = this.parseNot();
      return node ? { kind: 'not', node } : null;
    }
    return this.parsePrimary();
  }

  private parsePrimary(): RuleNode | null {
    const tok = this.peek();
    if (tok?.t === 'punct' && tok.v === '(') {
      this.next();
      const node = this.parseOr();
      const close = this.peek();
      if (!close || close.t !== 'punct' || close.v !== ')') {
        this.fail('Parêntese não fechado.');
        return null;
      }
      this.next();
      return node;
    }
    return this.parseCondition();
  }

  private parseCondition(): RuleNode | null {
    const tok = this.next();
    if (!tok || tok.t !== 'ident') {
      const pos = tok?.pos ?? 0;
      this.fail(`Esperava um campo na posição ${pos} (ex.: change, volume, price).`);
      return null;
    }

    const builtin = resolveField(tok.v);
    let field: string;
    let numeric: boolean;
    if (builtin) {
      field = builtin;
      numeric = NUMERIC_FIELDS.has(builtin);
    } else {
      const norm = normalizeWord(tok.v);
      if (this.extras.has(norm)) {
        field = norm;
        numeric = true;
      } else {
        this.fail(`Campo desconhecido "${tok.v}". Use: ${RULE_FIELDS.map((f) => f.key).join(', ')}.`);
        return null;
      }
    }

    const nextTok = this.peek();

    if (this.isIdent(nextTok, 'between')) {
      if (!numeric) { this.fail(`"between" exige um campo numérico (${field} é texto).`); return null; }
      this.next();
      const lo = this.parseValue();
      if (!lo) return null;
      if (!this.isIdent(this.peek(), 'and')) { this.fail('Esperava "and" em "between X and Y".'); return null; }
      this.next();
      const hi = this.parseValue();
      if (!hi) return null;
      if (lo.num == null || hi.num == null) { this.fail(`"between" exige números para o campo ${field}.`); return null; }
      return { kind: 'between', field, numeric, lo, hi };
    }

    if (this.isIdent(nextTok, 'in')) {
      this.next();
      const open = this.peek();
      if (!open || open.t !== 'punct' || open.v !== '(') { this.fail('Esperava "(" depois de "in".'); return null; }
      this.next();
      const empty = this.peek();
      if (empty?.t === 'punct' && empty.v === ')') { this.fail('"in (...)" exige ao menos um valor.'); return null; }
      const values: RuleValue[] = [];
      for (;;) {
        const v = this.parseValue();
        if (!v) return null;
        values.push(v);
        const sep = this.peek();
        if (sep?.t === 'punct' && sep.v === ',') { this.next(); continue; }
        if (sep?.t === 'punct' && sep.v === ')') { this.next(); break; }
        this.fail('Esperava "," ou ")" em "in (...)".');
        return null;
      }
      return { kind: 'in', field, numeric, values };
    }

    if (this.isIdent(nextTok, 'contains')) {
      if (numeric) { this.fail(`"contains" só vale para texto (campo ${field} é numérico).`); return null; }
      this.next();
      const v = this.parseValue();
      if (!v) return null;
      return { kind: 'contains', field, value: v.raw };
    }

    if (nextTok?.t === 'punct' && [">", ">=", "<", "<=", "=", "!="].includes(nextTok.v)) {
      const op = nextTok.v as RuleCompOp;
      if (!numeric && op !== '=' && op !== '!=') {
        this.fail(`Para texto (${field}) use apenas "=" ou "!=".`);
        return null;
      }
      this.next();
      const value = this.parseValue();
      if (!value) return null;
      if (numeric && value.num == null) {
        this.fail(`O campo ${field} exige um valor numérico.`);
        return null;
      }
      return { kind: 'compare', field, numeric, op, value };
    }

    this.fail(`Esperava um operador (>, >=, <, <=, =, !=, between, in, contains) depois de "${tok.v}".`);
    return null;
  }

  private parseValue(): RuleValue | null {
    const tok = this.next();
    if (!tok) { this.fail('Esperava um valor.'); return null; }
    if (tok.t === 'num') return { raw: String(tok.v), num: tok.v };
    if (tok.t === 'str') {
      const num = tok.v.trim() === '' ? null : Number(tok.v);
      return { raw: tok.v, num: Number.isNaN(num) ? null : num };
    }
    if (tok.t === 'ident') {
      const num = Number(tok.v);
      return { raw: tok.v, num: Number.isNaN(num) ? null : num };
    }
    this.fail(`Esperava um valor na posição ${tok.pos}.`);
    return null;
  }
}

/** Compila o texto da regra. `error` é uma mensagem amigável quando inválido. */
export function parseRule(input: string, opts: RuleParseOptions = {}): RuleParseResult {
  const { tokens, error } = tokenize(input ?? '');
  if (error) return { ast: null, error };
  const extras = new Set((opts.extraNumericFields ?? []).map((f) => normalizeWord(f)));
  const parser = new Parser(tokens, extras);
  const ast = parser.parse();
  if (parser.error || !ast) return { ast: null, error: parser.error ?? 'Regra inválida.' };
  return { ast, error: null };
}

// ---------------------------------------------------------------------------
// Avaliador
// ---------------------------------------------------------------------------

/** Linha mínima avaliável (ScreenerRow é compatível). */
export interface RuleRow {
  price: number;
  changePct: number;
  change5d: number | null;
  high5d?: number | null;
  low5d?: number | null;
  volume: number | null;
  offHigh5d: number | null;
  offLow5d: number | null;
  sector: string;
  sectorId?: string;
  symbol: string;
  name: string;
  /** Campos numéricos extras (fundamentos/custom), chaves canônicas em minúsculo. */
  extra?: Record<string, number | null>;
}

function builtinNumericValue(row: RuleRow, field: RuleField): number | null {
  switch (field) {
    case 'price': return row.price;
    case 'change': return row.changePct * 100;
    case 'change5d': return row.change5d == null ? null : row.change5d * 100;
    case 'absChange': return Math.abs(row.changePct * 100);
    case 'volume': return row.volume;
    case 'high5d': return row.high5d ?? null;
    case 'low5d': return row.low5d ?? null;
    case 'range5d': {
      const hi = row.high5d ?? null;
      const lo = row.low5d ?? null;
      return hi != null && lo != null && lo !== 0 ? ((hi - lo) / lo) * 100 : null;
    }
    case 'offHigh': return row.offHigh5d == null ? null : row.offHigh5d * 100;
    case 'offLow': return row.offLow5d == null ? null : row.offLow5d * 100;
    default: return null;
  }
}

/** Valor numérico de um campo (built-in ou extra). Usado também por campos custom. */
export function numericFieldValue(row: RuleRow, field: string): number | null {
  if (NUMERIC_FIELDS.has(field as RuleField)) return builtinNumericValue(row, field as RuleField);
  return row.extra?.[field] ?? null;
}

function stringValue(row: RuleRow, field: string): string | null {
  if (field === 'symbol') return row.symbol;
  if (field === 'name') return row.name;
  if (field === 'sector') return row.sector;
  return null;
}

function matchesText(row: RuleRow, field: string, raw: string, mode: 'eq' | 'neq'): boolean {
  const needle = raw.trim().toLowerCase();
  if (field === 'sector') {
    const label = row.sector.toLowerCase();
    const id = (row.sectorId ?? '').toLowerCase();
    const hit = label === needle || id === needle;
    return mode === 'eq' ? hit : !hit;
  }
  const value = (stringValue(row, field) ?? '').toLowerCase();
  return mode === 'eq' ? value === needle : value !== needle;
}

function compareNumeric(actual: number, op: RuleCompOp, expected: number): boolean {
  switch (op) {
    case '>': return actual > expected;
    case '>=': return actual >= expected;
    case '<': return actual < expected;
    case '<=': return actual <= expected;
    case '=': return actual === expected;
    case '!=': return actual !== expected;
    default: return false;
  }
}

export function evaluateRule(node: RuleNode, row: RuleRow): boolean {
  switch (node.kind) {
    case 'and': return evaluateRule(node.left, row) && evaluateRule(node.right, row);
    case 'or': return evaluateRule(node.left, row) || evaluateRule(node.right, row);
    case 'not': return !evaluateRule(node.node, row);
    case 'compare': {
      if (node.numeric) {
        const actual = numericFieldValue(row, node.field);
        if (actual == null || node.value.num == null) return false;
        return compareNumeric(actual, node.op, node.value.num);
      }
      if (node.op === '=' || node.op === '!=') {
        return matchesText(row, node.field, node.value.raw, node.op === '=' ? 'eq' : 'neq');
      }
      return false;
    }
    case 'between': {
      const actual = numericFieldValue(row, node.field);
      if (actual == null || node.lo.num == null || node.hi.num == null) return false;
      const lo = Math.min(node.lo.num, node.hi.num);
      const hi = Math.max(node.lo.num, node.hi.num);
      return actual >= lo && actual <= hi;
    }
    case 'contains': {
      const value = stringValue(row, node.field);
      if (value == null) return false;
      return value.toLowerCase().includes(node.value.trim().toLowerCase());
    }
    case 'in': {
      if (node.numeric) {
        const actual = numericFieldValue(row, node.field);
        if (actual == null) return false;
        return node.values.some((v) => v.num != null && actual === v.num);
      }
      return node.values.some((v) => matchesText(row, node.field, v.raw, 'eq'));
    }
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Lexer de DESTAQUE (sintaxe colorida no editor) — preserva o texto exato.
// ---------------------------------------------------------------------------

export type RuleHighlightKind =
  | 'field'
  | 'keyword'
  | 'operator'
  | 'number'
  | 'string'
  | 'punct'
  | 'value'
  | 'space';

export interface RuleHighlightPart {
  text: string;
  kind: RuleHighlightKind;
}

const RULE_KEYWORDS = new Set(['and', 'or', 'not', 'between', 'in', 'contains']);

/**
 * Quebra o texto em partes classificadas para o editor destacar campos, conectores
 * (AND/OR/NOT/between/in/contains), operadores, números, strings e pontuação.
 * Nunca lança; preserva todos os caracteres (inclusive espaços/quebras de linha).
 */
export function highlightRule(input: string, opts: RuleParseOptions = {}): RuleHighlightPart[] {
  const extras = new Set((opts.extraNumericFields ?? []).map((f) => normalizeWord(f)));
  const parts: RuleHighlightPart[] = [];
  const push = (text: string, kind: RuleHighlightKind) => parts.push({ text, kind });
  const src = input ?? '';
  const n = src.length;
  let i = 0;

  while (i < n) {
    const ch = src[i];

    if (/\s/.test(ch)) {
      let j = i;
      while (j < n && /\s/.test(src[j])) j += 1;
      push(src.slice(i, j), 'space');
      i = j;
      continue;
    }

    if (ch === '(' || ch === ')' || ch === ',') {
      push(ch, 'punct');
      i += 1;
      continue;
    }

    if (ch === '>' || ch === '<' || ch === '=' || ch === '!') {
      const two = src.slice(i, i + 2);
      if (two === '>=' || two === '<=' || two === '!=' || two === '==') {
        push(two, 'operator');
        i += 2;
      } else {
        push(ch, 'operator');
        i += 1;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      while (j < n && src[j] !== quote) j += 1;
      if (j < n) j += 1;
      push(src.slice(i, j), 'string');
      i = j;
      continue;
    }

    if (/[0-9]/.test(ch) || ((ch === '-' || ch === '.') && /[0-9]/.test(src[i + 1] ?? ''))) {
      let j = i;
      if (src[j] === '-') j += 1;
      while (j < n && /[0-9]/.test(src[j])) j += 1;
      if (src[j] === '.') { j += 1; while (j < n && /[0-9]/.test(src[j])) j += 1; }
      const suffix = src[j]?.toLowerCase();
      if (suffix && (suffix === 'k' || suffix === 'm' || suffix === 'b')) j += 1;
      if (src[j] === '%') j += 1;
      push(src.slice(i, j), 'number');
      i = j;
      continue;
    }

    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_]/.test(src[j])) j += 1;
      const word = src.slice(i, j);
      const norm = normalizeWord(word);
      const kind: RuleHighlightKind = RULE_KEYWORDS.has(norm)
        ? 'keyword'
        : resolveField(word) || extras.has(norm)
          ? 'field'
          : 'value';
      push(word, kind);
      i = j;
      continue;
    }

    push(ch, 'value');
    i += 1;
  }

  return parts;
}
