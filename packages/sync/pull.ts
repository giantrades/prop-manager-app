import { supabase } from '../supabase/client';

export async function pullAllData(userId: string) {
  const [firms, accounts, payouts, trades, profile] = await Promise.all([
    supabase.from('firms').select('*').eq('user_id', userId),
    supabase.from('accounts').select('*').eq('user_id', userId),
    supabase.from('payouts').select('*').eq('user_id', userId),
    supabase.from('trades').select('*').eq('user_id', userId),
    supabase.from('profiles').select('settings').eq('id', userId).single(),
  ]);

  return {
    firms: firms.data || [],
    accounts: accounts.data || [],
    payouts: payouts.data || [],
    trades: trades.data || [],
    settings: profile.data?.settings || {},
  };
}