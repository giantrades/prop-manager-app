# P2 Push — runbook (Web Push fim-a-fim)

> Cliente (SW + `usePush` + toggle em Settings) já está no app. Falta **só** o lado
> servidor, que exige credenciais do SEU projeto — por isso são passos manuais.

## 1. Gerar chaves VAPID (1x, na sua máquina)

```bash
npx -y web-push generate-vapid-keys
```

Anote `publicKey` e `privateKey`.

## 2. Env vars

**App (Netlify + `.env` local):**

```bash
VITE_VAPID_PUBLIC_KEY=<publicKey>
```

**Edge Function (Supabase Dashboard → Edge Functions → push-sender → Secrets):**

```bash
VAPID_PUBLIC_KEY=<publicKey>
VAPID_PRIVATE_KEY=<privateKey>
VAPID_SUBJECT=mailto:voce@seudominio.com
```

(`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já existem no ambiente da function.)

Também adicione `VITE_VAPID_PUBLIC_KEY=` ao `.env.example` (já incluído).

## 3. Migration (tabela)

```bash
supabase db push
```

Aplica `supabase/migrations/002_push_subscriptions.sql`
(tabela `push_subscriptions` + RLS por dono).

## 4. Deploy da function

```bash
supabase functions deploy push-sender --no-verify-jwt
```

Teste manual:

```bash
curl -X POST https://<ref>.supabase.co/functions/v1/push-sender \
  -H "Authorization: Bearer <SEU_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"title":"Teste","body":"Push funcionando","url":"/actions"}'
```

## 5. Agendar verificações (opcional — pg_cron + pg_net)

No SQL Editor (requer extensões `pg_cron` e `pg_net` habilitadas):

```sql
-- Exemplo: todo dia 08:00 UTC chama o sender (adapte a lógica de alerta depois).
select cron.schedule(
  'push-daily',
  '0 8 * * *',
  $$
  select net.http_post(
    url := 'https://<ref>.supabase.co/functions/v1/push-sender',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body := jsonb_build_object(
      'user_id', '<SEU_USER_ID>',
      'title', 'FinanceOS',
      'body', 'Bom dia! Confira o Risk antes de operar.',
      'url', '/risk'
    )
  );
  $$
);
```

Alertas inteligentes (DD perto do limite, payout elegível) entram como queries
nesse cron depois — a infra já está pronta.

## 6. Digest diário (B8 — `push-digest`)

O app tem um toggle **Settings → Notificações push → "Resumo diário"** (grava
`app_meta` key `push:digest` = `{ enabled }`; sincroniza). A Edge Function
`push-digest` monta, para cada usuário com subscription, um retrospecto das
**últimas 24h** — **só narra** números já gravados (`trades.result_net`,
`transactions.amount`, `payouts` pendentes); **não cria fórmula nova**.

```bash
supabase functions deploy push-digest --no-verify-jwt
```

Agendar (SQL Editor, requer `pg_cron` + `pg_net`):

```sql
select cron.schedule(
  'push-digest-daily',
  '0 11 * * *',  -- 08:00 BRT
  $$
  select net.http_post(
    url := 'https://<ref>.supabase.co/functions/v1/push-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

Quem desativou o "Resumo diário" é pulado (a function lê `app_meta.push:digest`).

## Checklist de aceite

- [ ] Settings → "Ativar neste dispositivo" → permissão concedida, linha em `push_subscriptions`
- [ ] `curl` de teste chega como notificação (app fechado inclusive)
- [ ] Clicar abre a URL (`/actions`)
- [ ] Subscription morta (410) é removida sozinha
- [ ] `push-digest` agendado + toggle "Resumo diário" respeitado
