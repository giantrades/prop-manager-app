# MELHORIAS — Prop/Firm Manager (batch A)

> Um arquivo por módulo. Itens rotulados `A1, A2, ...`. Futuras melhorias: batch B (`B1...`).
> O agente analisa os `[ ]` abertos e executa um a um (código + teste + build verde).

## A1 — Trailing-DD live via posições abertas
- Status: [x] executada
- Contexto: o Risk Center calcula DD sobre equity de trades fechados. Com posições abertas (live), o DD real é maior — e é ele que estoura a conta.
- Proposta: `getRiskStatus` soma PnL não realizado das `LivePositions` da conta ao equity antes de comparar com os limites. Badge "inclui live" quando houver posição aberta afetando o cálculo.
- Arquivos: `packages/lib/db/risk.ts`, `RiskCenter.tsx`, ingest de posições
- Aceite: sem posição aberta, número idêntico ao atual; com posição, headroom reflete PnL flutuante; `tsc` 0; build verde.

## A2 — Templates de regras por firm (FTMO/E8/Apex)
- Status: [x] executada
- Contexto: criar conta prop exige digitar target/DD/consistency/minDays à mão — errar um número invalida o Risk.
- Proposta: presets versionados `{ firm, plan, target, maxDD, trailingDD, dailyDD, consistencyPct, minDays, payoutRules, profitSplit }` para FTMO/E8/Apex (conferir regulamento atual). Ao criar conta, escolher firm+plano preenche tudo; editável. Presets com `version` + data de conferência.
- Arquivos: novo `packages/lib/db/firmTemplates.ts` (+ testes), `Accounts.tsx`
- Aceite: criar via preset zera digitação e passa no Risk corretamente; preset desatualizado mostra aviso; `tsc` 0; build verde.

## A3 — Alertas de elegibilidade de payout
- Status: [x] executada
- Contexto: `computePayoutEligibility` existe, mas o trader só descobre que está elegível se abrir a tela da conta.
- Proposta: quando uma conta fica elegível (todas YES), emitir `payout:eligible` → Action Center + badge Navbar. Anti-spam: 1 alerta por conta por ciclo (reseta após payout registrado).
- Arquivos: `DataChainEngine` ou `RiskService`, Action Center, Navbar badge
- Aceite: alerta 1x por ciclo; some após payout; `tsc` 0; build verde.

## A4 — Export relatório da firm (para contador/imposto)
- Status: [x] executada
- Contexto: Firm P&L existe na tela, mas não sai de lá — contador e IR precisam de documento.
- Proposta: botão "Exportar relatório" na Firm P&L: CSV/PDF com challenges, resets, payouts, fees, rebates, lucro líquido por período + conversão BRL (PTAX do recebimento, mesma regra do Tax). Reutilizar padrão do "Exportar análise" do journal.
- Arquivos: `FirmPnl.tsx`, `firmPnlByFirm`, export CSV
- Aceite: relatório reconcilia com a tela e com o Tax; `tsc` 0; build verde.

## B1 — Comparador histórico firm a firm
- Status: [x] executada
- Contexto: o comparador atual é fotografia do total. A pergunta real é "qual firm me pagou melhor POR MÊS ao longo do tempo?".
- Proposta: `firmPnlHistory(txs, months)` (lucro por firm por mês, reutilizando a lógica do `firmPnlReport`) + barras agrupadas por mês na Firm P&L + ranking "lucro/mês".
- Arquivos: `money.ts` (motor + testes), `FirmPnl.tsx` (chart)
- Aceite: meses sem movimento mostram 0 (não buraco); reconcilia com o total; `tsc` 0; testes verdes; build verde.
- Fora de escopo: projeção futura de lucro por firm (separado).

## B2 — Calendário de payouts (ideia UI/UX)
- Status: [ ] ideia (futura)
- Contexto: payouts têm data, mas não há visão temporal de "quando recebi / quando espero".
- Proposta: mini-calendário na Firm P&L com payouts recebidos + próximos elegíveis (via `computePayoutEligibility`), por conta. Reuso do `PnLCalendar` como base visual.

## Batch C � Accounts unificado + Firms (executado)
- **C1 Accounts = registro de TODAS as contas**: a p�gina deixou de ser "s� prop firm". Agora
  cobre `prop | bank | wallet | investment | crypto | cash`, com resumo (contas, capital
  gerido, l�quido), busca, filtro por tipo, cards com saldo (derivado por
  `computeAccountBalance`) ou nominal (prop), pill de fase/risco e cor da firm. Editar/criar
  em modal (regras da prop s� quando `kind=prop`), painel da conta em modal (`AccountDetail`).
  Arquivos: `packages/ui/Accounts.tsx` (reescrito), `AccountsPage.jsx` (modal + saldos),
  `Account.firmId` (aditivo).
- **C2 Firms vira cadastro de empresas dentro de Contas**: nova p�gina `/firms`
  (`FirmsPage`) com nome, tipo, cor, logo e observa��es + P&L por firm. Persistido em `meta`
  (`packages/lib/db/firms.ts`: `listFirms`/`saveFirm`/`deleteFirm`/`firmColorById`, + testes).
- **C3 cor da firm propaga**: cards de conta, dot/subt�tulo e gr�ficos (`FirmPnl` aceita
  `colorById`) usam a cor cadastrada � muda a empresa, muda o app inteiro.
- **C4 payouts sa�ram de Contas**: `/payouts` e `/payout-center` agora s�o abas do m�dulo
  **Dinheiro** (payout � dinheiro, n�o cadastro de conta). Contas = Resumo|Contas|Firms.
- Gate: `tsc` 0 + build verde + 232 testes verdes (4 novos de firms).

## Batch E � Ciclo de vida de conta prop (executado)
- **E1 Status selecionável no painel**: o botão único "Avançar status" virou um seletor de
  status (`challenge|funded|live|demo|standby`) no painel da conta (`AccountsPage.jsx`).
  Novo status **DEMO** em `PropPhase` (`types.ts`), `normalizePropPhase` e UI. DEMO não conta
  no Risk Center (`ACTIVE_PROP_PHASES` = challenge/funded/live).
- **E2 Desabilitar conta (soft-disable)**: `Account.disabled`/`disabledAt`. Botão
  "Desabilitar/Reabilitar" no painel e nos cards. Conta desabilitada some de Contas
  (`Accounts.tsx`) e do dashboard `/contas`, e sai das conexões (`ConnectionsManager`
  matching/associação/criação, `syncPlatformBalances`, ingest prefere conta ativa). O
  registro permanece (não é hard-delete) para resolver nome no histórico.
- **E3 Ghost**: conta desabilitada aparece esmaecida com badge 👻; referências antigas
  (payouts, trades, `AccountDetail`) mostram o nome + ícone ghost. Payout novo não oferece
  conta desabilitada no split.
- Gate: `pnpm test` 306 verdes (+5 de accountModel, +1 de platformBalances) e `build:all` verde.
- **Próximo**: snapshot de nome para hard-delete (payouts/trades) e ghost nos demais widgets
  (Expenses/Portfolio/Gastos) que resolvem conta ao vivo.

## Batch D � p�gina Payouts/Withdrawals rica (executado)
- Reaproveitada a UX do app antigo: cards Gross solicitado / Total de taxas / L�quido
  recebido, **l�quido por firm** (com a cor da firm), busca, filtro de status, ordena��o,
  tabela (desktop) + cards (mobile), export CSV e form completo (m�todo/status/data,
  split por peso com preview do net por conta, comprovante).
- Aloca��o inline (Tax?Living?Invest?Cash) via modal `PayoutCenter` � sem aba "Alocar".
- Arquivos: `packages/ui/Payouts.tsx` (reescrito), `PayoutsPage.jsx` (passa firms), rota
  `/payout-center` removida. Gate: `tsc` 0 + build verde + 232 testes.
- Pr�ximo: filtro por per�odo (date range) e gr�fico de payouts por m�s/firm.
