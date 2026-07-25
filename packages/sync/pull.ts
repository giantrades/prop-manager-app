import { supabase } from '../supabase/client';
import { getTradeLedger, markTradeDeleted } from '@apps/lib/dataStore';

export function toCamelCase(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(toCamelCase);
  const out: any = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    out[camelKey] = toCamelCase(value);
  }
  return out;
}

export async function pullAllData(userId: string) {
  const [firms, accounts, payouts, trades, livePositions, strategies, profile, deletedTrades] = await Promise.all([
    supabase.from('firms').select('*').eq('user_id', userId),
    supabase.from('accounts').select('*').eq('user_id', userId),
    supabase.from('payouts').select('*').eq('user_id', userId),
    supabase.from('trades').select('*').eq('user_id', userId),
    supabase.from('live_positions').select('*').eq('user_id', userId),
    supabase.from('strategies').select('*').eq('user_id', userId),
    supabase.from('profiles').select('settings').eq('id', userId).single(),
    supabase.from('deleted_trades').select('*').eq('user_id', userId),
  ]);

  // Populate local ledger with server-side deleted trades
  const deletedRows = deletedTrades.data || [];
  for (const d of deletedRows) {
    try {
      await markTradeDeleted(d.platform_trade_id, d.position_id || '');
    } catch (e) {
      // silent
    }
  }

  // Get ledger to filter out deleted trades
  const ledger = await getTradeLedger();
  const deletedTradeIds = new Set(ledger.filter(e => e.status === 'deleted').map(e => e.platformTradeId));
  const deletedPositionIds = new Set(ledger.filter(e => e.status === 'deleted' && e.positionId).map(e => e.positionId));

  return {
    firms: toCamelCase(firms.data || []),
    accounts: toCamelCase(accounts.data || []),
    payouts: toCamelCase(payouts.data || []),
    trades: toCamelCase((trades.data || []).filter(t => {
      if (deletedTradeIds.has(t.platform_trade_id)) return false;
      if (t.position_id && deletedPositionIds.has(t.position_id)) return false;
      const isEntryFill =
        Number(t.result_net || 0) === 0 &&
        (!t.exit_datetime || t.exit_datetime.startsWith('0001') || t.exit_datetime === t.entry_datetime || !t.exit_price);
      if (isEntryFill) return false;
      return true;
    })),
    livePositions: toCamelCase(livePositions.data || []),
    strategies: toCamelCase(strategies.data || []),
    settings: profile.data?.settings || {},
  };
}