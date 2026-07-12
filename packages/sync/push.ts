import { supabase } from '../supabase/client';

function toSnakeCase(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(toSnakeCase);
  const out: any = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    out[snakeKey] = toSnakeCase(value);
  }
  return out;
}

export async function pushChanges(localData: any, userId: string) {
  // Firms
  if (localData.firms?.length) {
    const { error } = await supabase.from('firms').upsert(
      localData.firms.map((f: any) => toSnakeCase({ ...f, user_id: userId })),
      { onConflict: 'id' }
    );
    if (error) console.error('Push firms error:', error);
  }

  // Accounts
  if (localData.accounts?.length) {
    const { error } = await supabase.from('accounts').upsert(
      localData.accounts.map((a: any) => toSnakeCase({ ...a, user_id: userId })),
      { onConflict: 'id' }
    );
    if (error) console.error('Push accounts error:', error);
  }

  // Payouts
  if (localData.payouts?.length) {
    const { error } = await supabase.from('payouts').upsert(
      localData.payouts.map((p: any) => toSnakeCase({ ...p, user_id: userId })),
      { onConflict: 'id' }
    );
    if (error) console.error('Push payouts error:', error);
  }

  // Trades
  if (localData.trades?.length) {
    const { error } = await supabase.from('trades').upsert(
      localData.trades.map((t: any) => toSnakeCase({ ...t, user_id: userId })),
      { onConflict: 'id' }
    );
    if (error) console.error('Push trades error:', error);
  }

  // Live Positions
  if (localData.livePositions?.length) {
    const { error } = await supabase.from('live_positions').upsert(
      localData.livePositions.map((p: any) => toSnakeCase({ ...p, user_id: userId })),
      { onConflict: 'id' }
    );
    if (error) console.error('Push live_positions error:', error);
  }

  // Strategies
  if (localData.strategies?.length) {
    const { error } = await supabase.from('strategies').upsert(
      localData.strategies.map((s: any) => toSnakeCase({ ...s, user_id: userId })),
      { onConflict: 'id' }
    );
    if (error) console.error('Push strategies error:', error);
  }

  // Settings
  if (localData.settings) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('profiles').upsert({ 
        id: user.id, 
        settings: localData.settings,
        updated_at: new Date().toISOString()
      });
    }
  }
}