// STAGE 10 — seedDemo. Popula o app-db v3 com dados de demonstração (contas, prop,
// trades, payout, goals, positions) para o app não abrir zerado. Só roda com
// `VITE_DEMO_MODE=1` (nunca em produção). Usa só o DataService/DataChainEngine.

import type { DataService } from './DataService';
import type { DataChainEngine } from './DataChainEngine';
import { nowIso } from './dateUtils';
import { saveFirm, listFirms } from './firms';
import { setDemoIds } from './demoMode';
import type { Account, Goal, Payout, Position, PropExtension, Trade } from './types';

const now = () => nowIso();
function daysAgo(n: number, hour = 10): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 30, 0, 0);
  return d.toISOString();
}

export async function seedDemoData(ds: DataService, chain: DataChainEngine): Promise<number> {
  // Firms (cor/ícone) — a cor propaga nas contas, cards de conexão e gráficos.
  await saveFirm(ds, { name: 'FTMO', type: 'Futures', color: '#22c55e', icon: '🏦' });
  await saveFirm(ds, { name: 'E8 Markets', type: 'Futures', color: '#e74c3c', icon: '⚡' });
  await saveFirm(ds, { name: 'XP', type: 'Corretora', color: '#3498db', icon: '📈' });
  const firms = await listFirms(ds);
  const firmId = (name: string) => firms.find((f) => f.name === name)?.id;

  const accounts: Account[] = [
    { id: 'acct-e8', kind: 'prop', name: 'E8 100k', currency: 'USD', hidden: false, defaultWeight: 1, firmId: firmId('E8 Markets'), platformAccountId: 'qt_demo_1', platformName: 'quantower', institution: 'E8 Markets', updatedAt: now(), deviceId: 'demo', version: 0 },
    { id: 'acct-ftmo', kind: 'prop', name: 'FTMO 50k', currency: 'USD', hidden: false, defaultWeight: 1, firmId: firmId('FTMO'), platformAccountId: 'qt_demo_2', platformName: 'quantower', institution: 'FTMO', updatedAt: now(), deviceId: 'demo', version: 0 },
    { id: 'acct-wise', kind: 'wallet', name: 'Wise', currency: 'USD', hidden: false, defaultWeight: 1, updatedAt: now(), deviceId: 'demo', version: 0 },
    { id: 'acct-c6', kind: 'bank', name: 'C6', currency: 'BRL', hidden: false, defaultWeight: 1, updatedAt: now(), deviceId: 'demo', version: 0 },
    { id: 'acct-xp', kind: 'investment', name: 'XP', currency: 'BRL', hidden: false, defaultWeight: 1, firmId: firmId('XP'), updatedAt: now(), deviceId: 'demo', version: 0 },
    { id: 'acct-binance', kind: 'crypto', name: 'Binance', currency: 'USD', hidden: false, defaultWeight: 1, updatedAt: now(), deviceId: 'demo', version: 0 },
  ];
  const props: PropExtension[] = [
    {
      accountId: 'acct-e8', nominalSize: 100000, challengeCost: 499, phase: 'funded', target: 100000,
      maxDD: 0.1, trailingDD: 0.1, dailyDD: 0.05, consistencyPct: 0.4, minDays: 5,
      payoutRules: { minProfit: 0, minDaysSincePayout: 1, feePct: 0.2, method: 'Rise' },
      profitSplit: 0.8, payoutFrequency: 'monthly', updatedAt: now(), deviceId: 'demo', version: 0,
    },
    {
      accountId: 'acct-ftmo', nominalSize: 50000, challengeCost: 89, phase: 'challenge', target: 50000,
      maxDD: 0.1, trailingDD: 0.08, dailyDD: 0.05, consistencyPct: 0.4, minDays: 4,
      payoutRules: { minProfit: 0, minDaysSincePayout: 1, feePct: 0.2, method: 'Bank' },
      profitSplit: 0.8, payoutFrequency: 'weekly', updatedAt: now(), deviceId: 'demo', version: 0,
    },
  ];

  await Promise.all(accounts.map((a) => ds.accounts.put(a, { source: 'restore' })));
  await Promise.all(props.map((p) => ds.propExtensions.put(p, { source: 'restore' })));

  const symbols = ['EURUSD', 'XAUUSD', 'US30', 'NAS100'];
  const trades: Trade[] = [];
  for (let i = 0; i < 24; i++) {
    const entry = Number((1.08 + (Math.random() * 0.02)).toFixed(4));
    const dir: 'long' | 'short' = Math.random() > 0.5 ? 'long' : 'short';
    const qty = 1;
    const exit = dir === 'long' ? entry + (Math.random() * 0.01 - 0.004) : entry - (Math.random() * 0.01 - 0.004);
    const stopPrice = Number((dir === 'long' ? entry - 0.003 : entry + 0.003).toFixed(4));
    const resultNet = Number(((exit - entry) * (dir === 'long' ? 1 : -1) * qty * 100000).toFixed(2));
    const risk = Math.abs(entry - stopPrice) * qty * 100000;
    const resultR = risk > 0 ? Number((resultNet / risk).toFixed(2)) : null;
    trades.push({
      id: `trade-demo-${i}`, accountId: i % 2 === 0 ? 'acct-e8' : 'acct-ftmo', symbol: symbols[i % symbols.length], direction: dir,
      entryDatetime: daysAgo(i), exitDatetime: daysAgo(i, 11), qty, entryPrice: entry, exitPrice: Number(exit.toFixed(4)),
      stopPrice, commission: 0, swap: 0, rebate: 0, fees: 0, multiplier: 100000, source: 'manual',
      resultNet, resultR, updatedAt: now(), deviceId: 'demo', version: 0,
    });
  }
  await Promise.all(trades.map((t) => ds.trades.put(t, { source: 'restore' })));
  for (const t of trades) await chain.syncTrade(t);

  const payout: Payout = {
    id: 'payout-demo', accountIds: ['acct-e8'], gross: 3200, fee: 640, net: 2560,
    splitByAccount: { 'acct-e8': { gross: 3200, net: 2560, fee: 640 } },
    status: 'Paid', method: 'Rise', attachments: {}, date: daysAgo(3), updatedAt: now(), deviceId: 'demo', version: 0,
  };
  await ds.payouts.put(payout, { source: 'restore' });
  await chain.applyPayout(payout, { destinationAccountId: 'acct-wise' });

  const goals: Goal[] = [
    { id: 'goal-emergency', kind: 'emergency', targetValue: 50000, currentDerived: 0, updatedAt: now(), deviceId: 'demo', version: 0 },
    { id: 'goal-nw', kind: 'networth', targetValue: 1000000, currentDerived: 0, updatedAt: now(), deviceId: 'demo', version: 0 },
    { id: 'goal-payout', kind: 'payout_year', targetValue: 180000, windowType: 'rolling_12m', currentDerived: 0, updatedAt: now(), deviceId: 'demo', version: 0 },
  ];
  await Promise.all(goals.map((g) => ds.goals.put(g, { source: 'restore' })));

  const positions: Position[] = [
    { id: 'pos-ivvb', accountId: 'acct-xp', symbol: 'IVVB11', qty: 40, avgPrice: 210, lastMarkPrice: 232, lastMarkAt: now(), updatedAt: now(), deviceId: 'demo', version: 0 },
    { id: 'pos-btc', accountId: 'acct-binance', symbol: 'BTC', qty: 0.05, avgPrice: 42000, lastMarkPrice: 46000, lastMarkAt: now(), updatedAt: now(), deviceId: 'demo', version: 0 },
    { id: 'pos-cdb', accountId: 'acct-xp', symbol: 'CDB 2027', qty: 1, avgPrice: 20000, lastMarkPrice: 20600, lastMarkAt: now(), assetKind: 'fixed', yieldRate: 0.12, yieldType: 'pre', updatedAt: now(), deviceId: 'demo', version: 0 },
    { id: 'pos-apto', accountId: 'acct-xp', symbol: 'Apartamento', qty: 1, avgPrice: 350000, lastMarkPrice: 420000, lastMarkAt: now(), assetKind: 'other', updatedAt: now(), deviceId: 'demo', version: 0 },
  ];
  await Promise.all(positions.map((p) => ds.positions.put(p, { source: 'restore' })));

  // Marca tudo que é demo: quando o usuário criar a 1ª conta própria, isso é limpo.
  const seedFirmNames = ['FTMO', 'E8 Markets', 'XP'];
  await setDemoIds(ds, {
    accounts: accounts.map((a) => a.id),
    transactions: (await ds.transactions.list()).map((t) => t.id),
    trades: trades.map((t) => t.id),
    payouts: [payout.id],
    goals: goals.map((g) => g.id),
    positions: positions.map((p) => p.id),
    propExtensions: props.map((p) => p.accountId),
    firms: firms.filter((f) => seedFirmNames.includes(f.name)).map((f) => f.id),
  });

  return trades.length;
}
