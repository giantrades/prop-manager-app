# Shell UX Foundation (P0+P1+P2) — executado

> Escopo transversal (não é módulo de produto): velocidade, palette, toast, onboarding,
> atalhos, tokens, Home personalizável, PWA flow, impressão, push. Dono: `module-shells`.

## P0 — uso diário
- [x] **Code-split**: `App.jsx` com `React.lazy` por rota + `Suspense`; `vite.config.js` com
  `manualChunks` (vendor/charts/icons). Inicial ~367 kB (vendor 161 kB paralelo; gzip ~100 kB);
  charts (421 kB) sob demanda; **blocknote (1,3 MB) só ao abrir o editor de notas** (dynamic import).
  Antes: 1.159 kB em 1 chunk.
- [x] **Command palette** (`packages/ui/CommandPalette.tsx`, Ctrl+K, `/`): 22 rotas +
  3 ações (novo trade, atualizar preços, gerar recorrentes) + busca de contas/estratégias
  (carrega ao abrir). Setas/Enter/Esc, mobile bottom-sheet.
- [x] **Busca global**: dentro da palette (páginas + contas + estratégias).
- [x] **Toast unificado** (`packages/ui/Toast.tsx` + provider no `main.jsx`): `toast(msg,
  {type, action})` com undo, aria-live. Migrados: Navbar (backup), JournalPage,
  WealthEditors (import), SettingsPage (7 chamadas).
- [x] **Onboarding** (`main-app/src/Onboarding.jsx`): aparece com app vazio (0 contas +
  0 trades), 3 passos, dispensa persistente.
- [x] **Atalhos**: Ctrl/Cmd+K palette, `/` palette, `N` novo trade (`/journal?new=1`,
  `JournalPage` lê o param), nunca em campo de texto.

## P1 — polish
- [x] **Tokens**: `:focus-visible` global, `prefers-reduced-motion`, `--sb-muted-txt`
  `#4a5568`→`#8b94a5` (contraste).
- [x] **Home personalizável**: `hidden` em `HomeCommandCenter` + toggle "Personalizar"
  com persistência (`homeWidgetsHidden`).
- [x] **PWA flow** (`main-app/src/usePwa.js`): botão Instalar (prompt nativo + instrução
  iOS), banner offline, toast "Nova versão" com Atualizar.
- [x] **Impressão**: `@media print` (esconde shell/nav/ações) + botões Imprimir
  (FirmPnl, Journal).

## P2 — push (infra pronta, deploy manual)
- [x] Migration `supabase/migrations/20260201000000_push_subscriptions.sql` (RLS por dono).
- [x] `sw.js`: handlers `push` (payload {title,body,url}) + `notificationclick`.
- [x] `main-app/src/usePush.js` + toggle em Settings (com estados sem-chave/negado).
- [x] Edge Function `supabase/functions/push-sender/index.ts` (envia + limpa 410).
- [x] `VITE_VAPID_PUBLIC_KEY` no `.env.example` + runbook `supabase/README-push.md`
  (VAPID, deploy, cron, checklist).
- [ ] **Manual (dono)**: gerar VAPID, `supabase db push`, deploy da function, curl de teste.

## Gate
- [x] `tsc` 0 erros (corrigidos: JSX condicional no Insights, tipo do toast)
- [x] 168 testes verdes · build verde
- [ ] **Manual (dono)**: Lighthouse PWA 100 + Performance ≥90 (roteiro: `pnpm dev:main`,
  Chrome DevTools → Lighthouse → Mobile; ou `npx -y lighthouse http://localhost:4173
  --view` após `pnpm preview`)

## Batch B — ideias UI/UX futuras (não executar agora)
- **B1 — Modo claro**: EXCLUÍDO por decisão do dono (dark-only). Registrado para não reabrir.
- **B2 — Densidade de tela (compacto/confortável)**: toggle que reduz paddings/fontes via classe no root. Afeta todas as telas de uma vez; bom para celular pequeno vs desktop.
- **B3 — Atalhos customizáveis**: remapear Ctrl+K/N// em Settings (persistido em `localStorage`). Hoje são fixos no `App.jsx`.
