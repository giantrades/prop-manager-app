// Fase 1 — import PDF/foto (motor puro): perfis, parser de extrato/fatura e reconciliação.
import { describe, it, expect } from 'vitest';
import {
  parseStatementLines,
  detectBankProfile,
  detectStatementTotals,
  reconcileStatement,
  parseStatementDate,
  DEFAULT_BANK_PROFILES,
} from '../bankStatement';
import { MemoryDbAdapter, createMemoryBackend } from '../adapter';
import { DataService } from '../DataService';
import { EventBus } from '../events';

const CHECKING = [
  'Itaú Unibanco - Extrato',
  '05/09/2026 PIX RECEBIDO JOAO 1.200,00 C',
  '06/09/2026 PAGAMENTO FORNECEDOR 350,00 D',
  '07/09/2026 COMPRA MERCADO CENTRAL 120,45 D',
  'Saldo anterior 879,55',
  'Total de débitos 470,45',
  'Total de créditos 1.200,00',
  'Saldo final 1.609,10',
];

const CREDIT = [
  'Nubank - Fatura',
  '05/09 IFOOD 45,90',
  '10/09 UBER TRIP 30,00',
  '12/09 ESTORNO PEDIDO 20,00',
  'Total da fatura 55,90',
];

describe('Fase 1 — parser de extrato', () => {
  it('reconhece data no início (DMY/YMD) e devolve ISO', () => {
    expect(parseStatementDate('05/09/2026 PIX', 'DMY')?.iso.slice(0, 10)).toBe('2026-09-05');
    expect(parseStatementDate('2026-09-05 PIX', 'YMD')?.iso.slice(0, 10)).toBe('2026-09-05');
    expect(parseStatementDate('sem data', 'DMY')).toBeNull();
  });

  it('parseia extrato: créditos, débitos e ignora saldo/totais', () => {
    const p = parseStatementLines(CHECKING, DEFAULT_BANK_PROFILES[0]);
    expect(p.entries).toHaveLength(3);
    expect(p.entries[0]).toMatchObject({ amount: 1200, description: 'PIX RECEBIDO JOAO', confidence: 'high' });
    expect(p.entries[1]).toMatchObject({ amount: -350, description: 'PAGAMENTO FORNECEDOR', confidence: 'high' });
    expect(p.entries[2].amount).toBe(-120.45);
  });

  it('parseia fatura: compra é despesa; estorno é crédito', () => {
    const prof = DEFAULT_BANK_PROFILES.find((p) => p.id === 'generic-credit')!;
    const p = parseStatementLines(CREDIT, prof);
    expect(p.entries.map((e) => e.amount)).toEqual([-45.9, -30, 20]);
    expect(p.entries[2].confidence).toBe('high');
  });

  it('linha de continuação entra na descrição anterior', () => {
    const lines = ['05/09/2026 COMPRA PARCELADA', 'LOJA XYZ 3/10 120,00 D'];
    const p = parseStatementLines(lines, DEFAULT_BANK_PROFILES[0]);
    expect(p.entries).toHaveLength(1);
    expect(p.entries[0].description).toContain('LOJA XYZ');
  });
});

describe('Fase 1 — detecção de banco e totais', () => {
  it('detecta o banco pelo nome', () => {
    expect(detectBankProfile(CHECKING.join('\n'))?.name).toBe('Itaú');
    expect(detectBankProfile(CREDIT.join('\n'))?.name).toBe('Nubank');
    expect(detectBankProfile('linha qualquer sem banco')).toBeNull();
  });

  it('lê totais e saldos declarados', () => {
    const t = detectStatementTotals(CHECKING);
    expect(t).toMatchObject({ declaredDebits: 470.45, declaredCredits: 1200, openingBalance: 879.55, closingBalance: 1609.1 });
    expect(detectStatementTotals(CREDIT).declaredTotal).toBe(55.9);
  });
});

describe('Fase 1 — reconciliação (checksum com os totais do documento)', () => {
  it('extrato que fecha fica ok', () => {
    const p = parseStatementLines(CHECKING, DEFAULT_BANK_PROFILES[0]);
    const r = reconcileStatement(p);
    expect(r.ok).toBe(true);
    expect(r.checks.map((c) => c.label)).toEqual(['Total de débitos', 'Total de créditos', 'Saldo final']);
  });

  it('extrato com valor errado falha e mostra o diff', () => {
    const lines = CHECKING.slice(0, 4).concat(['Total de débitos 999,99']);
    const p = parseStatementLines(lines, DEFAULT_BANK_PROFILES[0]);
    const r = reconcileStatement(p);
    expect(r.ok).toBe(false);
    const chk = r.checks.find((c) => c.label === 'Total de débitos')!;
    expect(chk.expected).toBe(999.99);
    expect(chk.actual).toBe(470.45);
  });

  it('fatura que fecha fica ok (net = débitos − créditos)', () => {
    const prof = DEFAULT_BANK_PROFILES.find((p) => p.id === 'generic-credit')!;
    const p = parseStatementLines(CREDIT, prof);
    expect(reconcileStatement(p).ok).toBe(true);
  });

  it('sem totais declarados => não ok (nada para conferir)', () => {
    const p = parseStatementLines(['05/09/2026 LOJA 10,00 D'], DEFAULT_BANK_PROFILES[0]);
    const r = reconcileStatement(p);
    expect(r.checks).toHaveLength(0);
    expect(r.ok).toBe(false);
  });
});

describe('Fase 1 — perfis persistidos em meta', () => {
  it('get/save/remove profile', async () => {
    const adapter = new MemoryDbAdapter(createMemoryBackend());
    const ds = new DataService({ adapter, deviceId: 'd', bus: new EventBus(), channel: null });
    const { getBankProfiles, saveBankProfile, removeBankProfile } = await import('../bankStatement');
    expect((await getBankProfiles(ds)).length).toBe(DEFAULT_BANK_PROFILES.length);
    await saveBankProfile(ds, { ...DEFAULT_BANK_PROFILES[0], id: 'meu-banco', name: 'Meu Banco' });
    expect((await getBankProfiles(ds)).some((p) => p.id === 'meu-banco')).toBe(true);
    await removeBankProfile(ds, 'meu-banco');
    expect((await getBankProfiles(ds)).some((p) => p.id === 'meu-banco')).toBe(false);
  });
});
