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
