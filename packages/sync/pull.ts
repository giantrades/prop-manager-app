import { supabase } from '../supabase/client';

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
  const [firms, accounts, payouts, trades, livePositions, strategies, profile] = await Promise.all([
    supabase.from('firms').select('*').eq('user_id', userId),
    supabase.from('accounts').select('*').eq('user_id', userId),
    supabase.from('payouts').select('*').eq('user_id', userId),
    supabase.from('trades').select('*').eq('user_id', userId),
    supabase.from('live_positions').select('*').eq('user_id', userId),
    supabase.from('strategies').select('*').eq('user_id', userId),
    supabase.from('profiles').select('settings').eq('id', userId).single(),
  ]);

  return {
    firms: toCamelCase(firms.data || []),
    accounts: toCamelCase(accounts.data || []),
    payouts: toCamelCase(payouts.data || []),
    trades: toCamelCase(trades.data || []),
    livePositions: toCamelCase(livePositions.data || []),
    strategies: toCamelCase(strategies.data || []),
    settings: profile.data?.settings || {},
  };
}