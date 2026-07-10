import { supabase } from '../supabase/client';

export async function pushChanges(localData: any, userId: string) {
  // Firms
  if (localData.firms?.length) {
    const { error } = await supabase.from('firms').upsert(
      localData.firms.map((f: any) => ({ ...f, user_id: userId })),
      { onConflict: 'id' }
    );
    if (error) console.error('Push firms error:', error);
  }

  // Accounts
  if (localData.accounts?.length) {
    const { error } = await supabase.from('accounts').upsert(
      localData.accounts.map((a: any) => ({ ...a, user_id: userId })),
      { onConflict: 'id' }
    );
    if (error) console.error('Push accounts error:', error);
  }

  // Payouts
  if (localData.payouts?.length) {
    const { error } = await supabase.from('payouts').upsert(
      localData.payouts.map((p: any) => ({ ...p, user_id: userId })),
      { onConflict: 'id' }
    );
    if (error) console.error('Push payouts error:', error);
  }

  // Trades
  if (localData.trades?.length) {
    const { error } = await supabase.from('trades').upsert(
      localData.trades.map((t: any) => ({ ...t, user_id: userId })),
      { onConflict: 'id' }
    );
    if (error) console.error('Push trades error:', error);
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