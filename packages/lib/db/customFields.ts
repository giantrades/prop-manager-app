// SCANNER — campos personalizados: expressões numéricas que você define e usa nas regras.
//
// Ex.: id `forca`, expressão `change5d - change`
//      id `amplitude`, expressão `high5d - low5d`
//      id `score`, expressão `abs(change) * 2 + change5d`
//
// Operadores: + - * / e parênteses. Funções: abs(x), min(a,b), max(a,b), round(x).
// Só podem referenciar campos numéricos já existentes (built-in, fundamentos e campos
// personalizados definidos ANTES dele) — evita ciclos.
//
// Puro e testado em `__tests__/customFields.test.ts`.

import {
  RULE_FIELDS,
  isBuiltinNumericField,
  normalizeWord,
  resolveField,
  type RuleRow,
} from './screenerRules';

export interface CustomFieldDef {
  id: string;
  label?: string;
  expression: string;
}

export type ExprNode =
  | { kind: 'num'; value: number }
  | { kind: 'field'; field: string }
  | { kind: 'unary'; op: '-' | '+'; node: ExprNode }
  | { kind: 'binary'; op: '+' | '-' | '*' | '/'; left: ExprNode; right: ExprNode }
  | { kind: 'call'; name: 'abs' | 'min' | 'max' | 'round'; args: ExprNode[] };

export interface CustomFieldCompiled {
  id: string;
  label: string;
  expression: string;
  ast: ExprNode | null;
  error: string | null;
}

export interface CompileOptions {
  /** Campos extras permitidos (ex.: chaves de fundamentos), normalizados. */
  allowedFields?: string[];
  /** Ids reservados (built-ins/fundamentos/keywords) que não podem ser usados. */
  reservedFields?: string[];
}

export const CUSTOM_FIELD_ID_RE = /^[a-z_][a-z0-9_]*$/;

const KEYWORDS = new Set(['and', 'or', 'not', 'between', 'in', 'contains']);
const FUNCTIONS = new Set(['abs', 'min', 'max', 'round']);

export const CUSTOM_FIELD_EXAMPLES: CustomFieldDef[] = [
  { id: 'forca', label: 'Força (5d − 1d)', expression: 'change5d - change' },
  { id: 'amplitude', label: 'Amplitude', expression: 'high5d - low5d' },
  { id: 'score', label: 'Score', expression: 'absChange * 2 + change5d' },
];

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

type Tok =
  | { t: 'num'; v: number; pos: number }
  | { t: 'ident'; v: string; pos: number }
  | { t: 'punct'; v: string; pos: number };

function tokenize(input: string): { tokens: Tok[]; error: string | null } {
  const tokens: Tok[] = [];
  const n = input.length;
  let i = 0;
  while (i < n) {
    const ch = input[i];
    if (/\s/.test(ch)) { i += 1; continue; }
    if (ch === '(' || ch === ')' || ch === ',' || ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      tokens.push({ t: 'punct', v: ch, pos: i });
      i += 1;
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(input[i + 1] ?? ''))) {
      let j = i;
      while (j < n && /[0-9]/.test(input[j])) j += 1;
      if (input[j] === '.') { j += 1; while (j < n && /[0-9]/.test(input[j])) j += 1; }
      const raw = input.slice(i, j);
      let value = Number(raw);
      if (Number.isNaN(value)) return { tokens: [], error: `Número inválido "${raw}" na posição ${i}.` };
      const suffix = input[j]?.toLowerCase();
      if (suffix === 'k') { value *= 1e3; j += 1; }
      else if (suffix === 'm') { value *= 1e6; j += 1; }
      else if (suffix === 'b') { value *= 1e9; j += 1; }
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
// Parser de expressão
// ---------------------------------------------------------------------------

class ExprParser {
  private i = 0;
  error: string | null = null;

  constructor(
    private readonly tokens: Tok[],
    private readonly allowed: Set<string>,
  ) {}

  private peek(): Tok | undefined { return this.tokens[this.i]; }
  private next(): Tok | undefined { return this.tokens[this.i++]; }
  private fail(msg: string): void { if (!this.error) this.error = msg; }
  private isPunct(tok: Tok | undefined, v: string): boolean { return !!tok && tok.t === 'punct' && tok.v === v; }

  parse(): ExprNode | null {
    if (this.tokens.length === 0) { this.fail('Expressão vazia.'); return null; }
    const node = this.parseAddSub();
    if (this.error) return null;
    if (this.i < this.tokens.length) {
      this.fail(`Sobrou conteúdo não interpretado perto da posição ${this.tokens[this.i].pos}.`);
      return null;
    }
    return node;
  }

  private parseAddSub(): ExprNode | null {
    let left = this.parseMulDiv();
    if (this.error) return null;
    while (this.isPunct(this.peek(), '+') || this.isPunct(this.peek(), '-')) {
      const op = (this.next() as { v: '+' | '-' }).v;
      const right = this.parseMulDiv();
      if (this.error || !right) return null;
      left = { kind: 'binary', op, left: left as ExprNode, right };
    }
    return left;
  }

  private parseMulDiv(): ExprNode | null {
    let left = this.parseUnary();
    if (this.error) return null;
    while (this.isPunct(this.peek(), '*') || this.isPunct(this.peek(), '/')) {
      const op = (this.next() as { v: '*' | '/' }).v;
      const right = this.parseUnary();
      if (this.error || !right) return null;
      left = { kind: 'binary', op, left: left as ExprNode, right };
    }
    return left;
  }

  private parseUnary(): ExprNode | null {
    if (this.isPunct(this.peek(), '-') || this.isPunct(this.peek(), '+')) {
      const op = (this.next() as { v: '-' | '+' }).v;
      const node = this.parseUnary();
      return node ? { kind: 'unary', op, node } : null;
    }
    return this.parsePrimary();
  }

  private parsePrimary(): ExprNode | null {
    const tok = this.next();
    if (!tok) { this.fail('Esperava um número, campo ou parêntese.'); return null; }

    if (tok.t === 'num') return { kind: 'num', value: tok.v };

    if (tok.t === 'punct' && tok.v === '(') {
      const node = this.parseAddSub();
      if (!this.isPunct(this.peek(), ')')) { this.fail('Parêntese não fechado na expressão.'); return null; }
      this.next();
      return node;
    }

    if (tok.t === 'ident') {
      const name = normalizeWord(tok.v);
      if (this.isPunct(this.peek(), '(')) {
        if (!FUNCTIONS.has(name)) { this.fail(`Função desconhecida "${tok.v}". Use abs, min, max, round.`); return null; }
        this.next();
        const args: ExprNode[] = [];
        if (!this.isPunct(this.peek(), ')')) {
          for (;;) {
            const arg = this.parseAddSub();
            if (!arg) return null;
            args.push(arg);
            if (this.isPunct(this.peek(), ',')) { this.next(); continue; }
            break;
          }
        }
        if (!this.isPunct(this.peek(), ')')) { this.fail(`Esperava ")" depois dos argumentos de ${name}.`); return null; }
        this.next();
        const arity = name === 'min' || name === 'max' ? 2 : 1;
        if (args.length !== arity) { this.fail(`${name} espera ${arity} argumento(s).`); return null; }
        return { kind: 'call', name: name as 'abs' | 'min' | 'max' | 'round', args };
      }

      const builtin = resolveField(tok.v);
      const field = builtin ?? name;
      if (builtin && !isBuiltinNumericField(builtin)) {
        this.fail(`O campo "${tok.v}" é de texto e não pode entrar numa expressão numérica.`);
        return null;
      }
      if (!builtin && !this.allowed.has(name)) {
        this.fail(`Campo desconhecido "${tok.v}" na expressão.`);
        return null;
      }
      return { kind: 'field', field };
    }

    this.fail(`Esperava um número, campo ou parêntese na posição ${tok.pos}.`);
    return null;
  }
}

function compileExpression(expression: string, allowed: Set<string>): { ast: ExprNode | null; error: string | null } {
  const { tokens, error } = tokenize(expression ?? '');
  if (error) return { ast: null, error };
  const parser = new ExprParser(tokens, allowed);
  const ast = parser.parse();
  if (parser.error || !ast) return { ast: null, error: parser.error ?? 'Expressão inválida.' };
  return { ast, error: null };
}

// ---------------------------------------------------------------------------
// Compilação / avaliação
// ---------------------------------------------------------------------------

function reservedSet(opts: CompileOptions): Set<string> {
  const reserved = new Set<string>(KEYWORDS);
  for (const f of RULE_FIELDS) {
    reserved.add(normalizeWord(f.key));
    for (const a of f.aliases) reserved.add(normalizeWord(a));
  }
  for (const r of opts.reservedFields ?? []) reserved.add(normalizeWord(r));
  return reserved;
}

/**
 * Compila as definições. Cada campo só pode usar built-ins, fundamentos e campos
 * definidos ANTES dele (evita ciclo). Retorna também os inválidos (com `error`) p/ UI.
 */
export function compileCustomFields(defs: CustomFieldDef[], opts: CompileOptions = {}): CustomFieldCompiled[] {
  const reserved = reservedSet(opts);
  const baseAllowed = new Set<string>((opts.allowedFields ?? []).map((f) => normalizeWord(f)));
  for (const f of RULE_FIELDS) if (f.numeric) baseAllowed.add(normalizeWord(f.key));

  const seen = new Set<string>();
  const out: CustomFieldCompiled[] = [];

  for (const def of defs) {
    const id = normalizeWord(def.id ?? '');
    const label = def.label?.trim() || id;
    if (!CUSTOM_FIELD_ID_RE.test(id)) {
      out.push({ id, label, expression: def.expression, ast: null, error: 'Id inválido (use letras, números e _, começando por letra/_ ).' });
      continue;
    }
    if (reserved.has(id)) {
      out.push({ id, label, expression: def.expression, ast: null, error: `"${id}" é reservado (campo/conector existente).` });
      continue;
    }
    if (seen.has(id)) {
      out.push({ id, label, expression: def.expression, ast: null, error: `Id duplicado "${id}".` });
      continue;
    }
    seen.add(id);

    const allowed = new Set(baseAllowed);
    for (const prev of out) if (!prev.error) allowed.add(prev.id);
    const { ast, error } = compileExpression(def.expression ?? '', allowed);
    out.push({ id, label, expression: def.expression, ast, error });
  }

  return out;
}

/** Ids válidos (para passar AO PARSER de regras). */
export function customFieldIds(compiled: CustomFieldCompiled[]): string[] {
  return compiled.filter((c) => !c.error).map((c) => c.id);
}

/** Avalia uma expressão com um resolvedor de campos. */
export function evaluateExpr(node: ExprNode, resolve: (field: string) => number | null): number | null {
  switch (node.kind) {
    case 'num':
      return node.value;
    case 'field':
      return resolve(node.field);
    case 'unary': {
      const v = evaluateExpr(node.node, resolve);
      if (v == null) return null;
      return node.op === '-' ? -v : v;
    }
    case 'binary': {
      const a = evaluateExpr(node.left, resolve);
      const b = evaluateExpr(node.right, resolve);
      if (a == null || b == null) return null;
      switch (node.op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/': return b === 0 ? null : a / b;
        default: return null;
      }
    }
    case 'call': {
      const args = node.args.map((a) => evaluateExpr(a, resolve));
      if (args.some((v) => v == null)) return null;
      const nums = args as number[];
      switch (node.name) {
        case 'abs': return Math.abs(nums[0]);
        case 'min': return Math.min(nums[0], nums[1]);
        case 'max': return Math.max(nums[0], nums[1]);
        case 'round': return Math.round(nums[0]);
        default: return null;
      }
    }
    default:
      return null;
  }
}

/**
 * Avalia os campos custom para uma linha. `resolve` deve entregar valores built-in/extra
 * (já em unidades de exibição, ex.: variação em %).
 */
export function evaluateCustomFields(
  compiled: CustomFieldCompiled[],
  resolve: (field: string) => number | null,
): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  const resolveAcc = (field: string): number | null => {
    if (field in out) return out[field];
    return resolve(field);
  };
  for (const c of compiled) {
    if (!c.ast) continue;
    out[c.id] = evaluateExpr(c.ast, resolveAcc);
  }
  return out;
}

/** Conveniência: resolvedor a partir de uma linha do screener. */
export function makeRowResolver(row: RuleRow): (field: string) => number | null {
  return (field) => {
    const builtin = resolveField(field);
    if (builtin && isBuiltinNumericField(builtin)) return builtinNumericFromRow(row, builtin);
    return row.extra?.[field] ?? null;
  };
}

function builtinNumericFromRow(row: RuleRow, field: string): number | null {
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
