# STAGE 0 — Monitoramento (mínimo para operar com dinheiro real)

## Logs

- Prefixar: `[dataStore]`, `[sync:push/pull]`, `[bridge]`, `[finance]`. Hoje só `console.log` solto (`push.ts:187`).
- Nunca logar: access_token Drive (`DriveContext.jsx:177-184` salva `drive-token` em localStorage — mover para memória/session), api keys, payload completo.

## Métricas

- Contadores push/pull (já logados, virar telemetria): records, erros, duração, truncamento paginação.
- Alerta quota: `localStorage >4MB` -> toast "backup agora" (5MB estoura com logo base64 + comprovantes).
- `lastSync`, `quantower:synced/error` visível na Navbar (hoje invisível).

## Erros

- Sentry (ou no mínimo `sync_logs` no Supabase). Todo `catch` que hoje silencia (`load:113`, `save`, `push:189`) deve reportar.
- Toasts com `aria-live="polite"`, substituir `alert/confirm` (`Accounts.jsx:288`, `TradeTable:188`).

## Multi-tab (Stage 0 só observa, Stage 2 resolve)

- Mapear loops: `save->datastore:change->push->save` (`JournalContext:192`, `SyncProvider:358`, `DashboardDataContext:35`).
- Não criar lock novo aqui; só documentar ocorrências para Stage 2 (`navigator.locks`).
