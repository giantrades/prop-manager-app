// SCANNER — testes da linguagem de regras (parser + avaliador).
import { describe, it, expect } from 'vitest';
import { parseRule, evaluateRule, resolveField, highlightRule, RULE_FIELDS, type RuleRow } from '../screenerRules';

function row(over: Partial<RuleRow> = {}): RuleRow {
  return {
    price: 100,
    changePct: 0.03,
    change5d: 0.05,
    high5d: 110,
    low5d: 95,
    volume: 2_000_000,
    offHigh5d: 0.01,
    offLow5d: 0.1,
    sector: 'Technology',
    sectorId: 'tech',
    symbol: 'NVDA',
    name: 'NVIDIA',
    ...over,
  };
}

function evalRule(rule: string, r: RuleRow = row()): boolean {
  const { ast, error } = parseRule(rule);
  expect(error).toBeNull();
  if (!ast) throw new Error('AST nulo');
  return evaluateRule(ast, r);
}

describe('parseRule — campos e aliases', () => {
  it('resolve campos e aliases (case-insensitive, sem acento)', () => {
    expect(resolveField('change')).toBe('change');
    expect(resolveField('CHG')).toBe('change');
    expect(resolveField('preço')).toBe('price');
    expect(resolveField('setor')).toBe('sector');
    expect(resolveField('ticker')).toBe('symbol');
    expect(resolveField('foo')).toBeNull();
    expect(RULE_FIELDS.length).toBe(13);
  });
});

describe('parseRule — comparações numéricas', () => {
  it('aceita % e multiplicadores', () => {
    expect(evalRule('change > 2')).toBe(true);
    expect(evalRule('change > 2%')).toBe(true);
    expect(evalRule('change < 2%')).toBe(false);
    expect(evalRule('volume > 1M')).toBe(true);
    expect(evalRule('volume > 1.5B')).toBe(false);
    expect(evalRule('volume >= 2m')).toBe(true);
  });

  it('between, in e absChange', () => {
    expect(evalRule('price between 50 and 150')).toBe(true);
    expect(evalRule('price between 150 and 50')).toBe(true); // normaliza ordem
    expect(evalRule('price between 101 and 150')).toBe(false);
    expect(evalRule('price in (100, 200)')).toBe(true);
    expect(evalRule('price in (200, 300)')).toBe(false);
    expect(evalRule('absChange > 2')).toBe(true);
    expect(evalRule('offHigh < 2')).toBe(true);
    expect(evalRule('offLow < 5')).toBe(false);
  });

  it('5d', () => {
    expect(evalRule('change5d > 4')).toBe(true);
    expect(evalRule('change5d < 4')).toBe(false);
  });
});

describe('parseRule — texto', () => {
  it('sector por id ou nome, símbolo e contains', () => {
    expect(evalRule('sector = tech')).toBe(true);
    expect(evalRule('sector = "Technology"')).toBe(true);
    expect(evalRule('sector = energy')).toBe(false);
    expect(evalRule('sector != tech')).toBe(false);
    expect(evalRule('symbol = nvda')).toBe(true);
    expect(evalRule('symbol in (AMD, NVDA)')).toBe(true);
    expect(evalRule('name contains nvid')).toBe(true);
    expect(evalRule('name contains apple')).toBe(false);
    expect(evalRule('name contains "NVID"')).toBe(true);
  });

  it('contains não vale para campo numérico', () => {
    expect(parseRule('change contains 2').error).toContain('numérico');
  });
});

describe('parseRule — lógica', () => {
  it('AND/OR/NOT e parênteses com precedência', () => {
    expect(evalRule('change > 2 AND volume > 1M')).toBe(true);
    expect(evalRule('change > 2 AND volume > 10M')).toBe(false);
    expect(evalRule('change > 10 OR change > 2')).toBe(true);
    expect(evalRule('NOT change < 0')).toBe(true);
    expect(evalRule('change < 2 OR change > 2 AND volume > 1M')).toBe(true);
    expect(evalRule('(change < 2 OR change > 2) AND volume > 10M')).toBe(false);
    expect(evalRule('NOT (price > 50 AND price < 200)')).toBe(false);
  });

  it('palavras-chave são case-insensitive', () => {
    expect(evalRule('CHANGE > 2 and VOLUME > 1m')).toBe(true);
    expect(evalRule('Change > 2 Or Volume > 10M')).toBe(true);
  });
});

describe('evaluateRule — nulos não passam', () => {
  it('campos ausentes reprovam a condição', () => {
    const r = row({ change5d: null, offHigh5d: null, volume: null });
    expect(evalRule('change5d > 0', r)).toBe(false);
    expect(evalRule('offHigh < 5', r)).toBe(false);
    expect(evalRule('volume > 1', r)).toBe(false);
    // OR com uma condição verdadeira ainda passa
    expect(evalRule('change5d > 0 OR change > 2', r)).toBe(true);
  });
});

describe('parseRule — erros amigáveis', () => {
  it('campo desconhecido, operador ausente, parêntese e vazio', () => {
    expect(parseRule('foo > 1').error).toContain('desconhecido');
    expect(parseRule('change 2').error).toContain('operador');
    expect(parseRule('(change > 1').error).toContain('Parêntese');
    expect(parseRule('').error).toContain('vazia');
    expect(parseRule('change >').error).toContain('valor');
    expect(parseRule('price between 1').error).toContain('and');
    expect(parseRule('symbol in ()').error).toContain('ao menos um');
  });
});

describe('campos derivados de 5d', () => {
  it('high5d, low5d e range5d', () => {
    expect(evalRule('high5d > 105')).toBe(true);
    expect(evalRule('low5d < 100')).toBe(true);
    expect(evalRule('range5d > 15')).toBe(true); // (110-95)/95 � 15.8%
    expect(evalRule('range5d < 10')).toBe(false);
  });
});

describe('highlightRule � destaque de sintaxe', () => {
  it('classifica campo, conector, operador e n�mero', () => {
    const parts = highlightRule('change > 2% AND volume > 1M');
    const kinds = parts.filter((p) => p.kind !== 'space').map((p) => `${p.text}:${p.kind}`);
    expect(kinds).toEqual([
      'change:field',
      '>:operator',
      '2%:number',
      'AND:keyword',
      'volume:field',
      '>:operator',
      '1M:number',
    ]);
  });

  it('preserva o texto exato (inclusive espa�os/quebras)', () => {
    const input = 'NOT (sector = "Technology" OR name contains nvid)\nAND price between 10 and 500';
    expect(highlightRule(input).map((p) => p.text).join('')).toBe(input);
  });

  it('reconhece conectores between/in/contains e pontua��o', () => {
    const parts = highlightRule('symbol in (NVDA, AMD) AND price between 10 and 500');
    expect(parts.find((p) => p.text === 'in')?.kind).toBe('keyword');
    expect(parts.find((p) => p.text === 'between')?.kind).toBe('keyword');
    expect(parts.find((p) => p.text === 'and')?.kind).toBe('keyword');
    expect(parts.find((p) => p.text === '(')?.kind).toBe('punct');
    expect(parts.find((p) => p.text === ',')?.kind).toBe('punct');
    expect(parts.find((p) => p.text === 'NVDA')?.kind).toBe('value');
  });

  it('strings entre aspas e palavras desconhecidas', () => {
    const parts = highlightRule('name contains "apple inc" AND sector = tech');
    expect(parts.find((p) => p.text === '"apple inc"')?.kind).toBe('string');
    expect(parts.find((p) => p.text === 'tech')?.kind).toBe('value');
  });
});
