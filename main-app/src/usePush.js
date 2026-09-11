// UX foundation P2 — usePush. Assina Web Push (VAPID) e salva a subscription no
// Supabase (tabela push_subscriptions). Envio é server-side (Edge Function
// supabase/functions/push-sender) — ver supabase/README-push.md.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@apps/supabase/client';

function urlSafeToUint8(base64) {
  const padded = `${base64}===`.slice(0, Math.ceil(base64.length / 4) * 4);
  const bin = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

export function usePush() {
  const [supported] = useState(
    () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window,
  );
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
  );
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

  const refresh = useCallback(async () => {
    try {
      if (!supported) return;
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setSubscribed(!!sub);
      if (typeof Notification !== 'undefined') setPermission(Notification.permission);
    } catch {
      /* noop */
    }
  }, [supported]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const subscribe = useCallback(async () => {
    if (!supported || !vapidKey) return { ok: false, reason: !vapidKey ? 'no-vapid-key' : 'unsupported' };
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') return { ok: false, reason: 'denied' };
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return { ok: false, reason: 'no-sw' };
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlSafeToUint8(vapidKey),
      });
      const { data } = await supabase.auth.getUser();
      const userId = data?.user?.id;
      if (!userId) {
        await sub.unsubscribe().catch(() => {});
        return { ok: false, reason: 'no-user' };
      }
      const json = sub.toJSON();
      const { error } = await supabase.from('push_subscriptions').upsert(
        {
          user_id: userId,
          endpoint: sub.endpoint,
          p256dh: json.keys?.p256dh ?? '',
          auth: json.keys?.auth ?? '',
        },
        { onConflict: 'user_id,endpoint' },
      );
      if (error) throw error;
      await refresh();
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : 'error' };
    } finally {
      setBusy(false);
    }
  }, [supported, vapidKey, refresh]);

  const unsubscribe = useCallback(async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        await sub.unsubscribe().catch(() => {});
      }
      await refresh();
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : e };
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  return { supported, permission, subscribed, busy, subscribe, unsubscribe, hasVapidKey: !!vapidKey };
}
