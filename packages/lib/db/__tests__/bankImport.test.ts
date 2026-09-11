// A3 — bankImport. OFX e CSV de banco com valores calculados à mão.
import { describe, it, expect } from 'vitest';
import {
  parseOfx,
  parseBankCsv,
  parseBankFile,
  suggestCategory,
  buildBankImport,
} from '../bankImport';

const OFX = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260905
<TRNAMT>-59.90
<MEMO>UBER TRIP
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260910
<TRNAMT>2000.00
<MEMO>SALARIO
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260912
<TRNAMT>-120.00
<NAME>IFOOD PEDIDO
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;

const CSV_BR = [
  'Data;Descricao;Valor',
  '05/09/2026;ALUGUEL MENSAL;1500,00',
  '10/09/2026;UBER TRIP;59,90',
].join('\n');

describe('bankImport A3 — OFX', () => {
  it('parseia débitos/créditos com data, valor e descrição', () => {
    const entries = parseOfx(OFX);
    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({
      date: '2026-09-05T12:00:00.000Z',
      amount: -59.9,
      description: 'UBER TRIP',
      suggestedCategory: 'transporte',
    });
    expect(entries[1]).toMatchObject({ amount: 2000, suggestedCategory: null });
    expect(entries[2]).toMatchObject({ amount: -120, suggestedCategory: 'alimentacao' });
  });
});

describe('bankImport A3 — CSV BR (ponto milhar + vírgula)', () => {
  it('parseia DD/MM/YYYY e "1.500,00"', () => {
    const entries = parseBankCsv(CSV_BR);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      date: '2026-09-05T12:00:00.000Z',
      amount: 1500,
      description: 'ALUGUEL MENSAL',
      suggestedCategory: 'moradia',
    });
    expect(entries[1].amount).toBe(59.9);
  });

  it('header sem colunas => []', () => {
    expect(parseBankCsv('a;b;c\n1;2;3')).toEqual([]);
  });
});

describe('bankImport A3 — detecção, keywords e dedup', () => {
  it('parseBankFile detecta OFX vs CSV', () => {
    expect(parseBankFile(OFX)).toHaveLength(3);
    expect(parseBankFile(CSV_BR)).toHaveLength(2);
  });

  it('suggestCategory por palavra-chave; desconhecida => null', () => {
    expect(suggestCategory('UBER TRIP SAO PAULO')).toBe('transporte');
    expect(suggestCategory('PADARIA PÃO DOURADO')).toBe('alimentacao');
    expect(suggestCategory('XYZ NUNCA VISTO')).toBeNull();
  });

  it('buildBankImport: dedup contra ledger e dentro do arquivo; kinds', () => {
    const entries = parseOfx(OFX);
    const existing = [{ date: '2026-09-05T12:00:00.000Z', amount: -59.9, note: 'UBER TRIP' }];
    const { result, kinds } = buildBankImport([...entries, entries[0]], existing);
    expect(result.entries).toHaveLength(2); // 1 duplicata do ledger + 1 duplicata interna
    expect(result.skippedDupes).toBe(2);
    expect(result.errors).toHaveLength(0);
    expect(kinds.get(result.entries[0].key)).toBe('income'); // +2000
    expect(kinds.get(result.entries[1].key)).toBe('expense'); // -120
  });
});
