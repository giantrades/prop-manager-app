// B8 — Push Digest. Edge Function agendada (cron) que envia um resumo diário por
// Web Push para cada usuário com subscription ativa.
//
// IMPORTANTE (arquitetura): esta função NÃO calcula métrica nova. Ela apenas NARRA
// números que já foram calculados/persistidos pelos motores do app e sincronizados
// para o Supabase (`trades.result_net`, `transactions.amount`, `payouts.net`).
// Somas de valores já existentes; nenhuma fórmula nova.
//
// Opt-out: o app grava `app_meta` com key `push:digest` = { enabled: false }.
// A função pula quem desativou.
//
// Deploy:  supabase functions deploy push-digest --no-verify-jwt
// Agendar: ver supabase/README-push.md § Digest diário (pg_cron + pg_net).

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

type Sub = { endpoint: string; p256dh: string; auth: string; user_id: string };

function fmtMoney(n: number): string {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(2)}`;
}

/** Janela = últimas 24h até agora (UTC). */
function window24h(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - 24 * 3600 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

async function digestForUser(supabase: ReturnType<typeof createClient>, userId: string): Promise<{ title: string; body: string } | null> {
  // Opt-out explícito.
  try {
    const { data: meta } = await supabase
      .from('app_meta')
      .select('value')
      .eq('user_id', userId)
      .eq('key', 'push:digest')
      .maybeSingle();
    const enabled = (meta?.value as { enabled?: boolean } | undefined)?.enabled;
    if (enabled === false) return null;
  } catch {
    /* app_meta pode não existir — segue */
  }

  const { from, to } = window24h();

  let trades: Array<{ result_net: number | null }> = [];
  let txs: Array<{ kind: string; amount: number | null }> = [];
  let pending = 0;
  try {
    const { data } = await supabase
      .from('trades')
      .select('result_net')
      .eq('user_id', userId)
      .gte('exit_datetime', from)
      .lt('exit_datetime', to);
    trades = (data as typeof trades) ?? [];
  } catch { /* tabela ausente */ }
  try {
    const { data } = await supabase
      .from('transactions')
      .select('kind, amount')
      .eq('user_id', userId)
      .gte('date', from)
      .lt('date', to);
    txs = (data as typeof txs) ?? [];
  } catch { /* tabela ausente */ }
  try {
    const { data } = await supabase
      .from('payouts')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'Pending');
    pending = (data as unknown[] | null)?.length ?? 0;
  } catch { /* tabela ausente */ }

  if (trades.length === 0 && txs.length === 0 && pending === 0) return null;

  const pnl = trades.reduce((s, t) => s + (Number(t.result_net) || 0), 0);
  let income = 0;
  let expense = 0;
  for (const t of txs) {
    const amount = Math.abs(Number(t.amount) || 0);
    if (t.kind === 'expense') expense += amount;
    else if (t.kind === 'income' || t.kind === 'payout_in' || t.kind === 'rebate') income += amount;
  }

  const parts: string[] = [];
  if (trades.length > 0) parts.push(`Trading: ${trades.length} trade(s) · ${fmtMoney(pnl)}`);
  if (income > 0 || expense > 0) parts.push(`Gastos: entrou ${fmtMoney(income)} · gastou ${fmtMoney(expense)}`);
  if (pending > 0) parts.push(`${pending} payout(s) pendente(s)`);

  return { title: 'Retrospecto do dia', body: parts.join(' | ') };
}

Deno.serve(async (req) => {
  // Cron (--no-verify-jwt) ou POST autenticado. Aqui só roda como job.
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('user_id, endpoint, p256dh, auth');
  if (error) return new Response(`DB error: ${error.message}`, { status: 500 });

  const byUser = new Map<string, Sub[]>();
  for (const s of (subs as Sub[]) ?? []) {
    const arr = byUser.get(s.user_id);
    if (arr) arr.push(s);
    else byUser.set(s.user_id, [s]);
  }

  let users = 0;
  let sent = 0;
  const skipped: string[] = [];

  for (const [userId, userSubs] of byUser) {
    let digest: { title: string; body: string } | null = null;
    try {
      digest = await digestForUser(supabase, userId);
    } catch (e) {
      skipped.push(`${userId.slice(0, 8)}: ${e instanceof Error ? e.message : 'erro'}`);
      continue;
    }
    if (!digest) continue;
    users += 1;
    const payload = JSON.stringify({ title: digest.title, body: digest.body, url: '/' });
    await Promise.all(
      userSubs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
          );
          sent += 1;
        } catch (e) {
          const status = (e as { statusCode?: number })?.statusCode;
          if (status === 410) {
            await supabase.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
          }
          skipped.push(`${s.endpoint.slice(0, 30)}: ${e instanceof Error ? e.message : 'error'}`);
        }
      }),
    );
  }

  return Response.json({ users, sent, skipped: skipped.slice(0, 5) });
});
