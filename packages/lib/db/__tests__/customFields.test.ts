// SCANNER — campos personalizados (expressões aritméticas).
import { describe, it, expect } from 'vitest';
import {
  compileCustomFields,
  evaluateCustomFields,
  makeRowResolver,
  customFieldIds,
  type CustomFieldDef,
} from '../customFields';
import type { RuleRow } from '../screenerRules';

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
    extra: { pe: 20, divyield: 1.5 },
    ...over,
  };
}

function values(defs: CustomFieldDef[], r: RuleRow = row()): Record<string, number | null> {
  return evaluateCustomFields(
    compileCustomFields(defs, { allowedFields: ['pe', 'divyield'] }),
    makeRowResolver(r),
  );
}

describe('compileCustomFields', () => {
  it('compila e avalia operações básicas', () => {
    const defs: CustomFieldDef[] = [
      { id: 'forca', expression: 'change5d - change' }, // 5 - 3 = 2
      { id: 'amp', expression: 'high5d - low5d' }, // 15
      { id: 'score', expression: 'abs(change) * 2 + change5d' }, // 6 + 5 = 11
    ];
    const out = values(defs);
    expect(out.forca).toBeCloseTo(2);
    expect(out.amp).toBeCloseTo(15);
    expect(out.score).toBeCloseTo(11);
    expect(customFieldIds(compileCustomFields(defs))).toEqual(['forca', 'amp', 'score']);
  });

  it('permite encadear campos definidos antes', () => {
    const out = values([
      { id: 'amp', expression: 'high5d - low5d' },
      { id: 'amp2', expression: 'amp * 2' },
    ]);
    expect(out.amp2).toBeCloseTo(30);
  });

  it('usa fundamentos e built-ins', () => {
    const out = values([{ id: 'ey', expression: '1 / pe * 100' }]); // 5
    expect(out.ey).toBeCloseTo(5);
  });

  it('funções min/max/round', () => {
    const out = values([
      { id: 'a', expression: 'min(change, change5d)' },
      { id: 'b', expression: 'max(change, change5d)' },
      { id: 'c', expression: 'round(price / 3)' },
    ]);
    expect(out.a).toBeCloseTo(3);
    expect(out.b).toBeCloseTo(5);
    expect(out.c).toBeCloseTo(33);
  });

  it('divisão por zero vira null', () => {
    const out = values([{ id: 'x', expression: 'price / (change - change)' }]);
    expect(out.x).toBeNull();
  });

  it('rejeita id reservado, inválido e duplicado', () => {
    const compiled = compileCustomFields([
      { id: 'change', expression: 'price' },
      { id: '1bad', expression: 'price' },
      { id: 'ok', expression: 'price' },
      { id: 'ok', expression: 'price * 2' },
    ]);
    expect(compiled[0].error).toContain('reservado');
    expect(compiled[1].error).toContain('inválido');
    expect(compiled[2].error).toBeNull();
    expect(compiled[3].error).toContain('duplicado');
  });

  it('rejeita campo desconhecido, texto e ciclo (referência futura)', () => {
    const compiled = compileCustomFields([
      { id: 'a', expression: 'naoexiste + 1' },
      { id: 'b', expression: 'sector' },
      { id: 'c', expression: 'd + 1' }, // d ainda não existe
      { id: 'd', expression: 'price' },
    ]);
    expect(compiled[0].error).toContain('desconhecido');
    expect(compiled[1].error).toContain('texto');
    expect(compiled[2].error).toContain('desconhecido');
    expect(compiled[3].error).toBeNull();
  });

  it('rejeita expressão vazia e parêntese aberto', () => {
    expect(compileCustomFields([{ id: 'a', expression: '' }])[0].error).toContain('vazia');
    expect(compileCustomFields([{ id: 'a', expression: '(price + 1' }])[0].error).toContain('Parêntese');
  });
});
