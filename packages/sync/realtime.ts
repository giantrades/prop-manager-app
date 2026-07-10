import { supabase } from '../supabase/client';

export function subscribeToChanges(
  userId: string, 
  onChange: (table: string, payload: any) => void
) {
  const channel = supabase
    .channel(`user-${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', filter: `user_id=eq.${userId}` },
      (payload) => {
        onChange(payload.table, payload);
      }
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}