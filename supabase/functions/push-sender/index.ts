// P2 Push — Edge Function `push-sender`. Lê `push_subscriptions` com service_role
// e envia Web Push (VAPID) para as subscriptions do usuário.
// Deploy: `supabase functions deploy push-sender --no-verify-jwt` (ver ../README-push.md).
// Body: { user_id?: string, title: string, body?: string, url?: string }.
// Sem user_id, exige header Authorization (usa o próprio JWT para filtrar por dono).

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }
  let payload: { user_id?: string; title?: string; body?: string; url?: string };
  try {
    payload = await req.json();
  } catch {
    return new Response('Bad Request', { status: 400 });
  }
  if (!payload.title) {
    return new Response('Missing title', { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  let userId = payload.user_id ?? null;
  if (!userId) {
    const auth = req.headers.get('Authorization') ?? '';
    const token = auth.replace(/^Bearer\s+/i, '');
    if (!token) return new Response('Unauthorized', { status: 401 });
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return new Response('Unauthorized', { status: 401 });
    userId = data.user.id;
  }

  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userId);
  if (error) {
    return new Response(`DB error: ${error.message}`, { status: 500 });
  }

  const pushPayload = JSON.stringify({ title: payload.title, body: payload.body ?? '', url: payload.url ?? '/' });
  let sent = 0;
  const errors: string[] = [];
  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          pushPayload,
        );
        sent += 1;
      } catch (e) {
        // 410 Gone = subscription morta: remove para não tentar de novo.
        const status = (e as { statusCode?: number })?.statusCode;
        if (status === 410) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
        }
        errors.push(`${s.endpoint.slice(0, 40)}: ${e instanceof Error ? e.message : 'error'}`);
      }
    }),
  );
  return Response.json({ sent, total: subs?.length ?? 0, errors: errors.slice(0, 5) });
});
