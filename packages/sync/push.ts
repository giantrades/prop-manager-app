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
  const errors: string[] = [];

  if (localData.firms?.length) {
    const { error } = await supabase.from('firms').upsert(
      localData.firms.map((f: any) => toSnakeCase({ ...f, user_id: userId })),
      { onConflict: 'id' }
    );
    if (error) errors.push(`firms: ${error.message}`);
  }

  if (localData.accounts?.length) {
    const { error } = await supabase.from('accounts').upsert(
      localData.accounts.map((a: any) => toSnakeCase({ ...a, user_id: userId })),
      { onConflict: 'id' }
    );
    if (error) errors.push(`accounts: ${error.message}`);
  }

  if (localData.payouts?.length) {
    const { error } = await supabase.from('payouts').upsert(
      localData.payouts.map((p: any) => toSnakeCase({ ...p, user_id: userId })),
      { onConflict: 'id' }
    );
    if (error) errors.push(`payouts: ${error.message}`);
  }

  if (localData.trades?.length) {
    const { error } = await supabase.from('trades').upsert(
      localData.trades.map((t: any) => toSnakeCase({ ...t, user_id: userId })),
      { onConflict: 'id' }
    );
    if (error) errors.push(`trades: ${error.message}`);
  }

  if (localData.livePositions?.length) {
    const { error } = await supabase.from('live_positions').upsert(
      localData.livePositions.map((p: any) => toSnakeCase({ ...p, user_id: userId })),
      { onConflict: 'id' }
    );
    if (error) errors.push(`live_positions: ${error.message}`);
  }

  if (localData.strategies?.length) {
    const { error } = await supabase.from('strategies').upsert(
      localData.strategies.map((s: any) => toSnakeCase({ ...s, user_id: userId })),
      { onConflict: 'id' }
    );
    if (error) errors.push(`strategies: ${error.message}`);
  }

  if (localData.settings) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { error } = await supabase.from('profiles').upsert({ 
        id: user.id, 
        settings: localData.settings,
        updated_at: new Date().toISOString()
      });
      if (error) errors.push(`settings: ${error.message}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Push failed: ${errors.join('; ')}`);
  }
}