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

## Batch V — consolidação visual + IA (audit UX externo, executado)
- **V1 glass restoration**: `.ws-tabs` + upgrades glass (gradiente+tinta+sombra do CSS antigo)
  em `packages/ui/styles.css`; `jd-card` com tinta por posição, `pf-total-card` roxo, `hc-quad` glass.
- **V2 journal em 3 abas**: Dashboard (métricas+calendário+day drill) | Trades | Review
  (heatmap/breakdown/R/duração/weekly) em `JournalPage.jsx`.
- **V3 workspaces por rota** (sem duplicação, chunks preservados): Portfolio Overview|Holdings,
  Accounts Contas|Firms, Payouts Payouts|Alocar (`ws-tabs` com NavLink nas 6 páginas).
- **V4 nav enxuta**: Trading sem payout-center/positions/quantower/import; Quantower+Importar
  no Sistema; rotas e palette intactas.
- **V5 accounts master-detail**: lista + detalhe lado a lado no desktop (`.ac2-master-detail`).
- **V6 home attention-first**: Action Center logo após Trading Today (`HomeCommandCenter.tsx`).
- Fora de escopo (churn alto, valor baixo): Goals+Forecast virarem "Planning", fundir os dois
  calendários, status unificado texto+ícone+cor em tudo, IA ler+agir (contratos Fase 5 proíbem).
- Gate: `vite build` verde + 220 testes verdes.

## Batch C — backlog do dono (anotado, não executar ainda)
- **C1 — cada módulo vira um app inteiro**: ex. Gastos ≈ Mobills completo (só precisar dele);
  mesmo padrão p/ Portfolio, Prop/Firms, Journal. Tudo bem demonstrado nos painéis de
  comando/dashboards/centrais (Home + Action Center refletem cada módulo).
- **C2 — Settings centraliza configs editáveis**: taxa USD→BRL editável (hoje só no Portfolio),
  CDI, sessões de trading, firms/templates, alertas, moeda padrão, densidade, atalhos.
  Nenhuma config espalhada em páginas avulsas.

## Batch B — ideias UI/UX futuras (não executar agora)
- **B1 — Modo claro**: EXCLUÍDO por decisão do dono (dark-only). Registrado para não reabrir.
- **B2 — Densidade de tela (compacto/confortável)**: toggle que reduz paddings/fontes via classe no root. Afeta todas as telas de uma vez; bom para celular pequeno vs desktop.
- **B3 — Atalhos customizáveis**: remapear Ctrl+K/N// em Settings (persistido em `localStorage`). Hoje são fixos no `App.jsx`.
