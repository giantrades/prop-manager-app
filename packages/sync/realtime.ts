import { supabase } from '../supabase/client';
import { toCamelCase } from './pull';

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
    .subscribe((status) => {
      console.log('✅ Supabase Realtime:', status);
    });

  return () => supabase.removeChannel(channel);
}

export function subscribeToLivePositions(
  userId: string, 
  onUpdate: (position: any) => void
) {
  const channel = supabase
    .channel(`live-positions-${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'live_positions', filter: `user_id=eq.${userId}` },
      (payload) => {
        if (payload.new) onUpdate(toCamelCase(payload.new));
      }
    )
    .subscribe((status) => {
      console.log('✅ Supabase Realtime Live Positions:', status);
    });

  return () => supabase.removeChannel(channel);
}