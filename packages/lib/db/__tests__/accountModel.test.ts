import { describe, it, expect } from 'vitest';
import {
  getRiskStatus,
  propRiskStatus,
  investRiskStatus,
  isActiveProp,
  isRiskTracked,
  type AccountRiskMetrics,
} from '../accountModel';
import type { Account, PropExtension } from '../types';

function propAccount(overrides: Partial<Account> = {}): Account {
  return { id: 'a1', kind: 'prop', name: 'FTMO', currency: 'USD', hidden: false, defaultWeight: 1, ...overrides } as Account;
}

function propExt(overrides: Partial<PropExtension> = {}): PropExtension {
  return {
    accountId: 'a1', nominalSize: 100000, challengeCost: 500, phase: 'funded', target: 100000,
    maxDD: 0.1, trailingDD: 0.1, dailyDD: 0.05, consistencyPct: 0.4, minDays: 1,
    payoutRules: { minProfit: 0, minDaysSincePayout: 1, feePct: 0.2, method: 'Rise' },
    profitSplit: 0.8, payoutFrequency: 'monthly', ...overrides,
  } as PropExtension;
}

const noMetrics = undefined;

describe('accountModel — getRiskStatus (Risk genérico)', () => {
  it('prop com DD usado 0% -> SAFE', () => {
    const metrics: AccountRiskMetrics = {
      accountId: 'a1', kind: 'prop', equity: 100000, nominalSize: 100000,
      maxDDUsed: 0, trailingDDUsed: 0, dailyDDUsed: 0,
    };
    const r = getRiskStatus(propAccount(), metrics, propExt());
    expect(r.status).toBe('SAFE');
    expect(r.headroom.percent).toBeGreaterThan(0);
  });

  it('prop com DD usado em 50% -> WARN (limiar documentado)', () => {
    const metrics: AccountRiskMetrics = {
      accountId: 'a1', kind: 'prop', equity: 95000, nominalSize: 100000,
      maxDDUsed: 0.5, trailingDDUsed: 0.5, dailyDDUsed: 0.5,
    };
    const r = getRiskStatus(propAccount(), metrics, propExt());
    expect(r.status).toBe('WARN');
    expect(r.headroom.percent).toBeCloseTo(0.5, 5);
  });

  it('prop com DD usado >= 100% -> STOP', () => {
    const metrics: AccountRiskMetrics = {
      accountId: 'a1', kind: 'prop', equity: 85000, nominalSize: 100000,
      maxDDUsed: 1.2, trailingDDUsed: 1.2, dailyDDUsed: 1.2,
    };
    const r = getRiskStatus(propAccount(), metrics, propExt());
    expect(r.status).toBe('STOP');
    expect(r.headroom.value).toBe(0);
  });

  it('prop sem PropExtension -> SAFE com razão explicativa (não mente risco)', () => {
    const r = getRiskStatus(propAccount(), noMetrics, undefined);
    expect(r.status).toBe('SAFE');
    expect(r.reason).toContain('sem PropExtension');
  });

  it('prop sem métricas -> SAFE (nunca inventa risco)', () => {
    const r = getRiskStatus(propAccount(), noMetrics, propExt());
    expect(r.status).toBe('SAFE');
    expect(r.reason).toContain('sem métricas');
  });

  it('invest/crypto: drawdown alto -> STOP; médio -> WARN', () => {
    const account: Account = { id: 'x1', kind: 'investment', name: 'XP', currency: 'USD', hidden: false, defaultWeight: 1 } as Account;
    const safe = getRiskStatus(account, { accountId: 'x1', kind: 'investment', drawdown: 0.05 });
    expect(safe.status).toBe('SAFE');
    const warn = getRiskStatus(account, { accountId: 'x1', kind: 'investment', drawdown: 0.15 });
    expect(warn.status).toBe('WARN');
    const stop = getRiskStatus(account, { accountId: 'x1', kind: 'investment', drawdown: 0.3 });
    expect(stop.status).toBe('STOP');
  });

  it('concentração alta em invest/crypto -> STOP', () => {
    const account: Account = { id: 'c1', kind: 'crypto', name: 'Binance', currency: 'USD', hidden: false, defaultWeight: 1 } as Account;
    const r = getRiskStatus(account, { accountId: 'c1', kind: 'crypto', concentration: 0.8 });
    expect(r.status).toBe('STOP');
  });
});

describe('accountModel — helpers', () => {
  it('isActiveProp considera só challenge1/challenge2/funded', () => {
    expect(isActiveProp('funded')).toBe(true);
    expect(isActiveProp('paused')).toBe(false);
    expect(isActiveProp('failed')).toBe(false);
    expect(isActiveProp(undefined)).toBe(false);
  });

  it('isRiskTracked exclui contas ocultas e prop inativa', () => {
    expect(isRiskTracked(propAccount(), propExt())).toBe(true);
    expect(isRiskTracked(propAccount({ hidden: true }), propExt())).toBe(false);
    expect(isRiskTracked(propAccount(), propExt({ phase: 'failed' }))).toBe(false);
    const cash: Account = { id: 'c', kind: 'cash', name: 'Cash', currency: 'USD', hidden: false, defaultWeight: 1 } as Account;
    expect(isRiskTracked(cash)).toBe(true);
  });

  it('propRiskStatus/investRiskStatus retornam headroom em valor e percentual', () => {
    const metrics: AccountRiskMetrics = {
      accountId: 'a1', kind: 'prop', equity: 100000, nominalSize: 100000,
      maxDDUsed: 0.25, trailingDDUsed: 0.25, dailyDDUsed: 0.25,
    };
    const r = propRiskStatus(metrics);
    expect(r.headroom.value).toBeCloseTo(0.75, 5);
    expect(r.headroom.percent).toBeCloseTo(0.75, 5);
  });
});
