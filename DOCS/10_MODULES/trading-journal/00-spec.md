# MÓDULO — Trading Journal (análise e gestão de trades)

> É um "app separado" dentro do produto: tem **Dashboard**, **Gerenciar Trades** e
> **Configurar/Playbook**. O Quantower ingere os trades (`quantowerIngest.ts`) e o usuário
> os controla no app (editar, fechar, copy-trade, revisar). Motor compartilhado; casca própria.

## Sub-áreas (como app separado)

| Área | Rotas | O que faz |
|---|---|---|
| Dashboard | `/journal` | Métricas + gráficos de performance |
| Gerenciar | `/journal/trades` (TradeForm + Trades) | Entrar/editar/visualizar/deletar trades, Quick Entry |
| Playbook/Config | `/playbook` | Estratégias + checklist + análise por setup |
| Diário emocional | `/journal` (seção) | Humor/sono/FOMO cruzado com R |
| Import/Integração | `/import`, `/quantower` | CSV + sync Quantower |

## O que JÁ existe (verificado)

- **Engine:** `packages/lib/db/financialFormulas.ts` — `realizedPnl`, `tradePnl`, `calcR`,
  `tradeR`, `vwapOfExecutions`, `weightForAccount`, `computeEquity`, `computeMaxDrawdown`,
  `computeTrailingDrawdown`, `computeDailyDrawdown`, `consistencyPercent`,
  `computePayoutEligibility`, `winrate`, `profitFactor`, `strategyMetrics`. + `strategies.ts`,
  `csvImport.ts`, `copyTrade.ts`, `quantowerIngest.ts`, `checklist.ts`.
- **UI:** `packages/ui/JournalDashboard.tsx` (equity curve, drawdown, winrate, PF, avgR,
  expectancy, PnL hoje, heatmap por dia da semana), `Trades.tsx`, `TradeForm.tsx` (steps +
  execuções + VWAP), `Strategies.tsx`, `PlaybookPage.jsx`, `EmotionalDiary.tsx`,
  `PreTradeChecklist.tsx`, `LivePositions.jsx`, `RiskBadge.tsx`.
- **Testes:** `DataChainEngine`, `strategies`, `csvImport`, `copyTrade`, `checklist`,
  `isEntryFill` (117 total, verdes).

## O que FALTA (priorizado) — análises ricas que um pro trader quer

> O dashboard atual é **mais simples que o app antigo**. O antigo tinha calendário PnL,
> heatmap por símbolo, análise de duração, histograma de R, category cards. Estas análises
> **não existem no motor** (grep `session|duration|histogram|calendarPnl|bySymbol` = 0).

### P0 — Análises que faltam (criar no motor + UI)
1. **Calendário PnL** (grid mensal, PnL por dia, tooltip) — o antigo tinha, é a tela mais
   pedida de journal.
2. **Heatmap por símbolo / sessão** (não só dia da semana) — PnL por ativo e por período
   (Asian/London/NY).
3. **Histograma de R** (distribuição de múltiplos-R) + média/mediana/std.
4. **Duração (hold time)** — tempo médio por trade, por símbolo, por direção.
5. **Long vs Short split** — WR, avgR, PF separados por direção.
6. **Breakdown por símbolo** — best/worst ativos (n, WR, avgR, PF, expectancy).
7. **Sessão / hora do dia** — melhor horário, pior horário.

### P1 — Gestão / profundidade
8. **Export relatório** (CSV/Excel de análise, não só de trades) + export do journal.
9. **Notas ricas por trade** (rich text / review pós-trade) — verificar se `TradeForm`
   já tem; se não, adicionar.
10. **MAE/MFE** por trade (máximo favorável/desfavorável) — exige guardar no schema.
11. **Review semanal** automático (melhor/pior setup, erro recorrente, meta próxima semana).
12. **Tags** por trade (setup, erro, emocional) e filtro por tag.

### P2 — integração
13. Confirmar **dedup** no re-sync (re-sync Quantower não duplica `qt_*`).
14. **Offline do journal** (ver trades com bridge off — snapshot).

## Dados / fórmula (não criar nova)

- Usar `tradePnl`, `tradeR`, `computeEquity`, `computeMaxDrawdown`, `winrate`,
  `profitFactor`, `strategyMetrics`, `consistencyPercent` de `financialFormulas.ts`.
- Para **histograma de R** e **duração**: derivar de `trade.resultR` + `entryDatetime/exitDatetime`
  (ISO com TZ, via `dateUtils.ts`).
- Para **sessão/hora**: extrair hora do `entryDatetime` (fuso da firm, não do navegador).
- `n<20` (const `MIN_SAMPLE`) → mostrar "sem amostra", nunca um número de baixa confiança.

## UI / design

- Mobile 360px primeiro; charts com `useId()` (sem `margin-left:-12px` hack); `tabular-nums`;
  tooltips com `font-variant-numeric`.
- Calendário PnL: grid mensal com `minWidth` e tooltip centralizado no mobile.
- Sem `alert()`; toast + `ErrorBoundary`.

## Tasks (checkáveis) — ✅ MÓDULO EXECUTADO

- [x] J1 Calendário PnL (motor `calendarPnl()` + UI `PnLCalendar.tsx`)
- [x] J2 Heatmap por símbolo + sessão (motor `heatmapBySymbol()/bySession()` + UI `HeatmapSection.tsx`)
- [x] J3 Histograma de R (motor `rDistribution()` + UI `HistogramR.tsx`)
- [x] J4 Duração (motor `durationStats()` + UI `DurationAnalysis.tsx`)
- [x] J5 Long vs short (motor `directionSplit()` + UI `BreakdownSection.tsx`)
- [x] J6 Breakdown por símbolo (motor `symbolBreakdown()` + UI `BreakdownSection.tsx`)
- [x] J7 Sessão/hora (motor `sessionAnalysis()` + UI `HeatmapSection.tsx`)
- [x] J8 Export análise CSV (botão "Exportar análise" no JournalPage)
- [x] J9 Notas por trade (textarea no Review do TradeForm — ver "Melhorias" p/ rich-text)
- [x] J10 MAE/MFE (proxy via fills + motor `maeMfe()` — ver "Limitações")
- [x] J11 Review semanal (motor `weeklyReview()` + UI `WeeklyReview.tsx` com copiar)
- [x] J12 Tags + filtro (`Trade.tags`, input no form, filtro + pills no Trades)
- [x] Testes unitários para cada novo motor (16 testes, dataset sintético à mão)
- [x] `pnpm build:all` verde + mobile 360px + `tsc` 0 erros (133 testes verdes)

## Limitações conhecidas (pós-execução)
- J9: textarea simples, não editor rich-text (BlockNote está nas deps do root — upgrade futuro).
- J10: proxy via fills; MAE/MFE verdadeiro exige série M1 intra-trade (schema não guarda).
- Sessões: default = horários reais de Sydney/Tokyo/London/NY convertidos pro **fuso do aparelho** (`marketSessionsInLocalZone()`, DST via Intl); visualização `SessionTradeMap.tsx` (mapa de 1 dia, sessões ao fundo, trades desenhados da abertura ao fechamento, eixo local/UTC); configurável e sincronizado via `meta:journal:sessions`. Números por sessão usam `sessionAttribution()` (pela **abertura**, cada trade 1x — sem inflar). `DEFAULT_SESSIONS`/`sessionAnalysis` (J7, trade em todas as sessões) seguem para back-compat.
- Histograma com bucket fixo 0.5R (prop, não configurável na UI).
- Sem drill-down dia do calendário → trades do dia (clique no dia).

## Gate / DoD

- Dashboard do journal tem as 7 análises (J1–J7) renderizando dados reais.
- `n<20` mostra "sem amostra" onde aplicável.
- Nenhuma fórmula nova (só selectors). `tsc` 0 erros, testes verdes, build verde.
- Usável no celular (360px) com bridge off (snapshot).

## Melhorias futuras (pasta melhorias.md)

> Itens numerados em melhorias.md com Status [ ]. O agente do m�dulo deve ler a pasta,
> analisar os itens abertos e execut�-los um a um (c�digo + teste + doc + build verde).
> Ao concluir, marcar - [x] no arquivo da melhoria.

