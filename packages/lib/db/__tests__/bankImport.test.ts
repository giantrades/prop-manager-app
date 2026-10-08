// A3 — bankImport. OFX e CSV de banco com valores calculados à mão.
import { describe, it, expect } from 'vitest';
import {
  parseOfx,
  parseBankCsv,
  parseBankFile,
  parseQif,
  detectCsvColumns,
  suggestCategory,
  buildBankImport,
  getImportRules,
  saveImportRules,
  learnImportRule,
  DEFAULT_IMPORT_RULES,
} from '../bankImport';
import { MemoryDbAdapter, createMemoryBackend } from '../adapter';
import { DataService } from '../DataService';
import { EventBus } from '../events';

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

describe('bankImport H10 — dedup forte (FITID + descricao normalizada)', () => {
  it('FITID igual pula mesmo com descricao diferente', () => {
    const a = { date: '2026-09-05T12:00:00.000Z', amount: -10, description: 'PIX A', suggestedCategory: null, key: 'k1', fitid: 'FIT-1' };
    const b = { date: '2026-09-06T12:00:00.000Z', amount: -99, description: 'OUTRO', suggestedCategory: null, key: 'k2', fitid: 'FIT-1' };
    const { result } = buildBankImport([a, b], []);
    expect(result.entries).toHaveLength(1);
    expect(result.skippedDupes).toBe(1);
  });

  it('descricao normalizada + tolerancia de valor', () => {
    const entries = [
      { date: '2026-09-05T12:00:00.000Z', amount: -59.9, description: 'uber  trip', suggestedCategory: null, key: 'x' },
    ];
    const existing = [{ date: '2026-09-05T12:00:00.000Z', amount: -59.9, note: 'UBER TRIP' }];
    const { result } = buildBankImport(entries, existing);
    expect(result.entries).toHaveLength(0);
    expect(result.skippedDupes).toBe(1);
  });
});

describe('bankImport H10 — QIF e mapeamento de coluna', () => {
  const QIF = ['!Type:Bank', 'D09/05/2026', 'T-59.90', 'PUBER TRIP', '^', 'D09/10/2026', 'T2000.00', 'PSALARIO', '^'].join('\n');

  it('parseQif le D/T/P e ignora !Type', () => {
    const entries = parseQif(QIF);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ amount: -59.9, description: 'UBER TRIP', suggestedCategory: 'transporte' });
    expect(entries[1].amount).toBe(2000);
    expect(parseBankFile(QIF)).toHaveLength(2);
  });

  it('detectCsvColumns + mapping explicito', () => {
    const weird = ['Col1;Col2;Col3', '05/09/2026;Mercado;123,45'].join('\n');
    expect(detectCsvColumns(weird).mapping).toBeNull();
    const mapped = parseBankCsv(weird, { date: 0, desc: 1, amount: 2 });
    expect(mapped).toHaveLength(1);
    expect(mapped[0]).toMatchObject({ amount: 123.45, description: 'Mercado', suggestedCategory: 'alimentacao' });
  });
});

describe('bankImport H10 — regras editaveis em meta', () => {
  function makeDs() {
    const adapter = new MemoryDbAdapter(createMemoryBackend());
    return new DataService({ adapter, deviceId: 'dev-import', bus: new EventBus(), channel: null });
  }

  it('getImportRules devolve defaults; save persiste', async () => {
    const ds = makeDs();
    expect((await getImportRules(ds)).length).toBe(DEFAULT_IMPORT_RULES.length);
    await saveImportRules(ds, [{ keyword: 'PADARIA', categoryId: 'lazer' }]);
    const rules = await getImportRules(ds);
    expect(rules).toEqual([{ keyword: 'PADARIA', categoryId: 'lazer' }]);
    expect(suggestCategory('PADARIA CENTRAL', rules)).toBe('lazer');
  });

  it('learnImportRule aprende o token mais longo (idempotente)', async () => {
    const ds = makeDs();
    await saveImportRules(ds, []);
    await learnImportRule(ds, 'PAG*MERCADINHO XYZ', 'alimentacao');
    const rules = await getImportRules(ds);
    expect(rules.some((r) => r.keyword.toUpperCase() === 'MERCADINHO' && r.categoryId === 'alimentacao')).toBe(true);
    const again = await learnImportRule(ds, 'PAG*MERCADINHO XYZ', 'alimentacao');
    expect(again.filter((r) => r.keyword.toUpperCase() === 'MERCADINHO')).toHaveLength(1);
  });

  it('buildBankImport aplica regras customizadas', () => {
    const entries = [{ date: '2026-09-05T12:00:00.000Z', amount: -10, description: 'PADARIA DO ZE', suggestedCategory: null, key: 'k' }];
    const { result } = buildBankImport(entries, [], [{ keyword: 'PADARIA', categoryId: 'lazer' }]);
    expect(result.entries[0].suggestedCategory).toBe('lazer');
  });
});
