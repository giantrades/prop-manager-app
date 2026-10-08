import { describe, it, expect } from 'vitest';
import { MemoryDbAdapter, createMemoryBackend } from '../adapter';
import { DataService } from '../DataService';
import { EventBus } from '../events';
import {
  buildOptionPremiumTransactions,
  recordOptionPremium,
  optionAssignment,
  optionPortfolioExposure,
  optionCoverage,
  optionExpiryEvents,
} from '../optionsIntegrations';
import type { OptionLeg, OptionRight, Position } from '../types';

function leg(partial: Partial<OptionLeg> & { right: OptionRight; strike: number; qty: number }): OptionLeg {
  return {
    id: partial.id ?? `leg_${Math.random().toString(36).slice(2, 8)}`,
    accountId: partial.accountId ?? 'a1',
    underlying: partial.underlying ?? 'PETR4',
    symbol: partial.symbol ?? `PETR4${partial.strike}${partial.right[0].toUpperCase()}`,
    right: partial.right,
    strike: partial.strike,
    expiry: partial.expiry ?? '2027-01-15',
    qty: partial.qty,
    multiplier: partial.multiplier ?? 100,
    entryPrice: partial.entryPrice ?? 0,
    entryDatetime: partial.entryDatetime ?? '2026-10-01T00:00:00Z',
    exitPrice: partial.exitPrice,
    exitDatetime: partial.exitDatetime,
    fees: partial.fees ?? 0,
    ivEntry: partial.ivEntry,
    groupId: partial.groupId,
    source: partial.source ?? 'manual',
    updatedAt: partial.updatedAt ?? '2026-10-01T00:00:00Z',
    deviceId: partial.deviceId ?? 'dev-test',
    version: partial.version ?? 0,
  };
}

function position(partial: Partial<Position> & { symbol: string; qty: number }): Position {
  return {
    id: partial.id ?? `pos_${partial.symbol}`,
    accountId: partial.accountId ?? 'a1',
    symbol: partial.symbol,
    qty: partial.qty,
    avgPrice: partial.avgPrice ?? 30,
    currency: partial.currency ?? 'USD',
    assetKind: partial.assetKind ?? 'equity',
    updatedAt: partial.updatedAt ?? '2026-10-01T00:00:00Z',
    deviceId: partial.deviceId ?? 'dev-test',
    version: partial.version ?? 0,
  };
}

describe('opções — integrações F4', () => {
  it('gera transações de prêmio só de grupos fechados com lucro (id determinístico)', () => {
    const legs = [
      // fechada com lucro
      leg({ right: 'call', strike: 40, qty: -1, entryPrice: 1.2, exitPrice: 0.2, groupId: 'g-win', exitDatetime: '2026-09-20T00:00:00Z' }),
      // fechada com perda
      leg({ right: 'call', strike: 41, qty: -1, entryPrice: 0.5, exitPrice: 1.5, groupId: 'g-loss', exitDatetime: '2026-09-21T00:00:00Z' }),
      // aberta
      leg({ right: 'put', strike: 36, qty: -1, entryPrice: 1.5, groupId: 'g-open' }),
    ];
    const txs = buildOptionPremiumTransactions(legs, { currency: 'USD' });
    expect(txs).toHaveLength(1);
    expect(txs[0].kind).toBe('option_premium');
    expect(txs[0].id).toBe('optprem:g-win');
    expect(txs[0].amount).toBeCloseTo(100, 2); // (-1)*100*(0.2-1.2)
    expect(txs[0].date).toBe('2026-09-20T00:00:00Z');
  });

  it('recordOptionPremium grava e é idempotente (mesmo id)', async () => {
    const adapter = new MemoryDbAdapter(createMemoryBackend());
    const ds = new DataService({ adapter, deviceId: 'dev', bus: new EventBus(), channel: null });
    const legs = [leg({ right: 'put', strike: 36, qty: -1, entryPrice: 1.5, exitPrice: 0.3, groupId: 'g1', exitDatetime: '2026-09-20T00:00:00Z' })];
    expect(await recordOptionPremium(ds, legs)).toBe(1);
    expect(await recordOptionPremium(ds, legs)).toBe(1);
    const all = await ds.transactions.list();
    expect(all).toHaveLength(1);
    expect(all[0].kind).toBe('option_premium');
  });

  it('assignment: put vendida → ações com cost basis; call vendida → entrega', () => {
    const put = optionAssignment(leg({ right: 'put', strike: 90, qty: -1, entryPrice: 2.5 }));
    expect(put.shares).toBe(100);
    expect(put.position?.qty).toBe(100);
    expect(put.position?.avgPrice).toBeCloseTo(87.5, 6); // (90*100 - 250)/100
    expect(put.position?.symbol).toBe('PETR4');

    const call = optionAssignment(leg({ right: 'call', strike: 110, qty: -1, entryPrice: 2.5 }));
    expect(call.proceedsPerShare).toBeCloseTo(112.5, 6);
  });

  it('exposição por subjacente (delta notional + contagem de shorts)', () => {
    const legs = [
      leg({ right: 'call', strike: 40, qty: -1, entryPrice: 1.2, ivEntry: 0.3, groupId: 'cc' }),
      leg({ right: 'put', strike: 36, qty: -1, entryPrice: 1.5, ivEntry: 0.32, groupId: 'csp' }),
      leg({ right: 'call', strike: 38, qty: 1, entryPrice: 1.8, ivEntry: 0.29, groupId: 'bcs' }),
    ];
    const exposure = optionPortfolioExposure(legs, { spotByUnderlying: { PETR4: 38 }, r: 0.11, now: new Date('2026-10-01T00:00:00Z') });
    expect(exposure).toHaveLength(1);
    expect(exposure[0].underlying).toBe('PETR4');
    expect(exposure[0].openLegs).toBe(3);
    expect(exposure[0].shortCalls).toBe(1);
    expect(exposure[0].shortPuts).toBe(1);
    expect(exposure[0].deltaNotional).toBeGreaterThan(0);
  });

  it('cobertura de covered call sobre ações da carteira', () => {
    const legs = [
      leg({ right: 'call', strike: 40, qty: -1, entryPrice: 1.2, groupId: 'cc1' }),
      leg({ right: 'call', strike: 41, qty: -1, entryPrice: 0.9, groupId: 'cc2' }),
    ];
    const full = optionCoverage(legs, [position({ symbol: 'PETR4', qty: 500 })]);
    expect(full[0].coveredContracts).toBe(2);
    expect(full[0].coveragePct).toBe(1);

    const half = optionCoverage(legs, [position({ symbol: 'PETR4', qty: 100 })]);
    expect(half[0].coveredContracts).toBe(1);
    expect(half[0].coveragePct).toBe(0.5);
  });

  it('vencimentos: só pernas abertas dentro da janela', () => {
    const now = new Date('2026-10-01T00:00:00Z');
    const legs = [
      leg({ right: 'call', strike: 40, qty: -1, expiry: '2026-10-20', entryPrice: 1 }),
      leg({ right: 'put', strike: 36, qty: -1, expiry: '2027-06-01', entryPrice: 1 }),
      leg({ right: 'call', strike: 42, qty: -1, expiry: '2026-10-10', entryPrice: 1, exitPrice: 0.5 }),
    ];
    const events = optionExpiryEvents(legs, { withinDays: 30, now });
    expect(events).toHaveLength(1);
    expect(events[0].underlying).toBe('PETR4');
    expect(events[0].dte).toBe(19);
  });
});
