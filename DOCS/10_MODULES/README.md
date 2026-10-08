# MÓDULOS — Cada módulo é um "app separado" (dashboard + gerenciar + configurar)

> Decisão do dono: cada módulo deve funcionar como um **app autocontido**, com a própria
> dashboard, abas de gerenciamento e configuração — como o app antigo tinha (Prop Manager
> tinha Dashboard/Accounts/Payouts/Goals/Firms/Settings; Journal tinha Dashboard/Trades/
> Strategies/Settings). O motor (DataService/DataChainEngine) é compartilhado; a **casca**
> (navegação, telas, gráficos) é por módulo.

## Estrutura (cada módulo = pasta com spec + melhorias)

```
DOCS/10_MODULES/
  README.md                        <- você está aqui
  shell-ux-foundation.md           <- TRANSVERSAL: shell/nav/palette/toast/PWA/push + batches V/C/D/E/B ✅ EXECUTADO (dono: module-shells)
  trading-journal/
    00-spec.md                     <- spec completa (J1–J12) ✅ EXECUTADA
    melhorias.md                   <- batch A (A1–A8) p/ o agente executar
  gastos/
    00-spec.md                     <- spec Mobills-like
    melhorias.md                   <- batch A (A1–A5)
  portfolio/
    00-spec.md                     <- spec dados LIVE ✅ EXECUTADA
    melhorias.md                   <- batch A (A1–A8)
  propfirm/
    00-spec.md                     <- spec Prop/Firm Manager
    melhorias.md                   <- batch A (A1–A4)
  options/
    00-spec.md                     <- Options Analytics (Quantower-like) + renda + portfólio — SPEC APROVADA (F0–F4 pendentes)
    melhorias.md                   <- batch A (A1–A7)
```

> O mapa de código (rota → container → UI → motor) vive em `DOCS/11_PAGE_MAP.md`.
> Os agentes das fases de reconstrução (`phase0..phase5`) foram **arquivados** em
> `DOCS/_ARCHIVE/agents/` — a reconstrução terminou; melhorias agora são por página.

> TODO que atravessa módulos (nav, palette, toast, PWA, Home, Settings global) é do
> `module-shells` e vive em `shell-ux-foundation.md` como batch novo — nunca em doc solto
> nem no `melhorias.md` de um módulo.

## Como atacar (1 agente/conversa por módulo)

Cada módulo tem **um agente** em `.opencode/agent/module-*.md`. Para rodar um módulo:

1. Abra o opencode na raiz.
2. Novo agente/conversa → selecione `module-trading-journal`, `module-gastos`,
   `module-portfolio`, `module-propfirm-manager` (via `/agent <nome>`). Para TODO
   transversal (shell/nav/palette/PWA/Home/Settings global): `/agent module-shells`
   + diga o batch (ex. "execute o Batch C do shell-ux-foundation").
   Para melhorias **por página** (uma rota por vez): `/agent module-page-improvements`
   + a rota (ex. "melhore `/expenses`"); o mapa está em `DOCS/11_PAGE_MAP.md`.
3. O prompt do agente aponta para a spec do módulo + contratos compartilhados.
4. **Depois da spec, o agente lê `melhorias.md`**: cada item tem Status `[ ]`,
   Contexto, Proposta, Arquivos envolvidos e Critérios de aceite. Ele analisa os
   abertos (batch A: `A1, A2, ...`) e os executa um a um. Ao concluir, marca `- [x]`.
   **Futuras melhorias entram em batch B (`B1, B2, ...`) no mesmo arquivo** — nunca criar
   mais de um arquivo de melhorias por módulo.

## Contratos compartilhados (todo módulo lê)

- `DOCS/00_AUDITORIA_ULTRA/00-PIVOT_RECONSTRUCAO.md` (fonte de verdade atual)
- `DOCS/README.md` (índice + gates)
- `DOCS/02_STAGE1_DOMAIN/00-DOMAIN_MODEL.md`, `02-FINANCIAL_FORMULAS.md`, `01-DATA_CONTRACT.md`
- Regras de UI: `DOCS/04_STAGE3_TRADING_OS/02-design.md` (mobile 360px, tokens, a11y, toast, ErrorBoundary)

## Regras duras por módulo

- Fórmulas **só** de `02-FINANCIAL_FORMULAS.md` + `packages/lib/db/financialFormulas.ts`. Proibido recriar.
- **Nunca** escrever saldo direto; tudo via `DataService`/`DataChainEngine`/`useFinance()`.
- UI nunca calcula — só compõe selectors dos motores.
- Mobile-first 360px + offline-first. Sem `alert()`; toast + `ErrorBoundary`.
- Cada módulo: código + teste + doc atualizada + `pnpm build:all` verde.

## Limites transversais (afetam TODOS os módulos — registrar, nunca esquecer)

> Todo limite conhecido deve virar item em `melhorias/` do módulo. Os transversais abaixo
> não pertencem a um módulo só — todo agente de módulo deve respeitá-los.

1. **Bundle ~1,15 MB em 1 chunk** (build avisa). Viola a spec PWA (Performance ≥90, TTI <3s
   em 4G). Precisa de **code-split por rota** (`React.lazy`) + `manualChunks` (separar
   `recharts`, `@blocknote`, vendor). → TODO módulo que adicionar tela deve usar `lazy()`.
2. **Verificação PWA manual pendente** (add-to-home iOS/Android + modo avião) — não
   automatizável; roteiro em `08_STAGE7_INTEGRATION/00-plano.md`.
3. **Conversão de moeda** no Portfolio (USD) — ver `portfolio/melhorias/05-moeda-usd-conversao.md`.
4. **Brapi rate-limit** — ver `portfolio/melhorias/07-rate-limit-brapi.md`.
5. **Ações US (proxy CORS)** — ver `portfolio/melhorias/06-acoes-us-yahoo.md`.
6. **No futuro, o `priceService` deve ter cooldown por símbolo** (evitar martelar API
   quando o usuário tem muitas posições).

## Ordem sugerida

1. **Module Shells** ✅ FEITO (navegação em módulos com sub-nav).
2. **Trading Journal** ✅ FEITO (J1–J12) — restam as **8 melhorias** (01–08).
3. **Portfolio Live** ✅ FEITO (P1–P8) — restam as **8 melhorias** (01–08).
4. **Gastos** → próximo (maior valor visual pendente).
5. **PropFirm** → depois.
6. **Opções** → spec aprovada (`options/00-spec.md`); executar F0–F4. Ao iniciar a F0,
   criar `.opencode/agent/module-options.md` no padrão dos demais agentes de módulo.
