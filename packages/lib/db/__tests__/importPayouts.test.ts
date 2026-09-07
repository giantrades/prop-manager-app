import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryDbAdapter, createMemoryBackend } from '../adapter';
import { DataService } from '../DataService';
import { DataChainEngine } from '../DataChainEngine';
import { EventBus } from '../events';
import {
  importPayouts,
  normalizeLegacyPayout,
  type LegacyPayout,
} from '../importPayouts';
import type { Account } from '../types';

function makeService(deviceId = 'dev-test') {
  const adapter = new MemoryDbAdapter(createMemoryBackend());
  const ds = new DataService({ adapter, deviceId, bus: new EventBus(), channel: null });
  const chain = new DataChainEngine(ds);
  return { ds, chain };
}

// Os 2 payouts atuais (formato legado `propmanager-data-v1`).
const LEGACY_PAYOUTS: LegacyPayout[] = [
  {
    id: 'payout-legacy-1',
    dateCreated: '2026-01-15T12:00:00Z',
    amountSolicited: 10000,
    amountReceived: 8000,
    fee: 2000,
    method: 'Rise',
    status: 'Paid',
    accountIds: ['acct-ftmo'],
    splitByAccount: { 'acct-ftmo': { gross: 10000, net: 8000, fee: 2000 } },
    attachments: { 'acct-ftmo': { fileId: 'drive-1', fileName: 'proof-1.pdf', url: 'https://x' } },
  },
  {
    id: 'payout-legacy-2',
    dateCreated: '2026-02-20T15:30:00Z',
    amountSolicited: 5000,
    amountReceived: 4000,
    fee: 1000,
    method: 'Wise',
    status: 'Pending',
    accountIds: ['acct-e8'],
    splitByAccount: { 'acct-e8': { gross: 5000, net: 4000, fee: 1000 } },
    attachments: {},
  },
];

describe('importPayouts — 2 payouts legados', () => {
  let ctx: ReturnType<typeof makeService>;

  beforeEach(() => {
    ctx = makeService();
  });

  it('normaliza o payout legado preservando toda a informação', () => {
    const p = normalizeLegacyPayout(LEGACY_PAYOUTS[0]);
    expect(p.gross).toBe(10000);
    expect(p.net).toBe(8000);
    expect(p.fee).toBe(2000);
    expect(p.status).toBe('Paid');
    expect(p.method).toBe('Rise');
    expect(p.splitByAccount['acct-ftmo']).toEqual({ gross: 10000, net: 8000, fee: 2000 });
    expect(p.attachments['acct-ftmo'].fileName).toBe('proof-1.pdf');
    expect(p.date).toBe('2026-01-15T12:00:00Z');
  });

  it('importa os 2 payouts em Payout seed + Transaction payout_in/fee', async () => {
    const { ds, chain } = ctx;
    // Cria a wallet de destino (money out).
    await ds.accounts.put({
      id: 'wallet-1',
      kind: 'wallet',
      name: 'Wise',
      currency: 'USD',
      hidden: false,
      defaultWeight: 1,
    } as Account);

    const result = await importPayouts(ds, chain, LEGACY_PAYOUTS, {
      destinationAccountId: 'wallet-1',
    });

    expect(result.importedCount).toBe(2);
    expect(result.skippedCount).toBe(0);
    expect(result.payouts).toHaveLength(2);

    const payouts = await ds.payouts.list();
    expect(payouts).toHaveLength(2);
    expect(payouts.map((p) => p.id).sort()).toEqual(['payout-legacy-1', 'payout-legacy-2']);

    const txs = await ds.transactions.list();
    // 2 payouts * (payout_in + fee) = 4 transactions.
    expect(txs).toHaveLength(4);
    const inTx = txs.filter((x) => x.kind === 'payout_in');
    const feeTx = txs.filter((x) => x.kind === 'fee');
    expect(inTx).toHaveLength(2);
    expect(feeTx).toHaveLength(2);
    expect(inTx.map((x) => x.amount).sort((a, b) => b - a)).toEqual([8000, 4000]);
    expect(feeTx.map((x) => x.amount).sort((a, b) => b - a)).toEqual([-1000, -2000]);
  });

  it('pula payout sem valor (gross/net = 0)', async () => {
    const { ds, chain } = ctx;
    const result = await importPayouts(ds, chain, [
      { id: 'p0', amountSolicited: 0, amountReceived: 0, method: 'Rise' },
      ...LEGACY_PAYOUTS,
    ]);
    expect(result.importedCount).toBe(2);
    expect(result.skippedCount).toBe(1);
    expect(await ds.payouts.list()).toHaveLength(2);
  });
});
