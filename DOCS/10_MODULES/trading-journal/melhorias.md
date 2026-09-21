# MELHORIAS — Trading Journal (batch A)

> Um arquivo por módulo. Itens rotulados `A1, A2, ...` (batch A). Futuras melhorias entram
> em batch B (`B1, B2, ...`). Cada item: Contexto, Proposta, Arquivos, Critérios de aceite.
> O agente analisa os `[ ]` abertos e executa um a um (código + teste + build verde).

## A1 — Notas rich-text no TradeForm
- Status: [x] executada
- Contexto: o J9 entregou textarea simples no Review do TradeForm. Para review pós-trade de verdade (checklist do que funcionou/errou, imagens, formatação), um editor rico é superior. `@blocknote/*` já está nas deps do root (usado no app antigo).
- Proposta: trocar o `<textarea>` de notas por editor BlockNote (guardar `notes` como markdown + `notesJson` opcional). Manter textarea como fallback se o BlockNote falhar (import dinâmico, bundle pesado).
- Arquivos: `packages/ui/TradeForm.tsx`, `packages/lib/db/types.ts` (`notesJson?` aditivo)
- Aceite: formatação salva/recarrega intacta; bundle não cresce no 1º paint (import dinâmico); 360px; `tsc` 0; testes verdes; build verde.
- Fora de escopo: anexos/imagens nas notas (separado).

## A2 — MAE/MFE real via série M1
- Status: [x] executada
- Contexto: o J10 entrega MAE/MFE como **proxy via fills** (`maeMfe()`), documentado como limitado. O MAE/MFE verdadeiro exige a excursão intra-trade (máxima/mínima entre entry e exit), que o schema não guarda.
- Proposta: adicionar `Trade.mae`/`Trade.mfe` (em $, opcionais) preenchidos na ingestão Quantower **quando a API expuser high/low**; `maeMfe()` prefere o campo com fallback para fills; mostrar no detalhe do trade + coluna no export.
- Arquivos: `packages/lib/db/types.ts`, `journalAnalytics.ts`, `quantowerIngest.ts`, `packages/ui/Trades.tsx`
- Aceite: com campo usa o campo; sem, usa fills; sem, null (nunca 0); `tsc` 0; testes verdes; build verde.
- Fora de escopo: coleta contínua de M1 (infra de price feed — ver módulo portfolio).

## A3 — Sessões configuráveis por firm/conta
- Status: [x] executada
- Contexto: `sessionAnalysis()` usa buckets UTC fixos (Asian 00–07, London 08–12, NewYork 13–20, Off 21–23). Cada firm/mesa opera em fuso próprio e o trader pode querer sessões personalizadas.
- Proposta: `PropExtension.sessions?: Array<{ id, label, startH, endH }>` (horas UTC) + `timezoneOffsetMinutes`; `sessionAnalysis(trades, sessions?)` usa config com fallback padrão; editor simples no journal.
- Arquivos: `packages/lib/db/types.ts`, `journalAnalytics.ts`, `packages/ui/HeatmapSection.tsx`
- Aceite: sem config idêntico ao atual; com config buckets da firm; `tsc` 0; testes verdes; build verde.
- Fora de escopo: calendário econômico overlay (command/inteligência).

## A4 — Drill-down: clique no dia do calendário → trades do dia
- Status: [x] executada
- Contexto: o `PnLCalendar` mostra PnL por dia com tooltip, mas não mostra quais trades formaram aquele dia.
- Proposta: dia clicável abre painel/lista com os trades do dia (símbolo, direção, PnL, R, link editar); `<button>` focado; `Esc` fecha; mobile em bottom-sheet/expansível.
- Arquivos: `packages/ui/PnLCalendar.tsx`, `JournalPage.jsx`
- Aceite: clique mostra trades do dia; `Esc` fecha; 360px; `tsc` 0; testes verdes; build verde.
- Fora de escopo: edição inline no detalhe (usa TradeForm existente).

## A5 — Filtros no dashboard: período + conta
- Status: [x] executada
- Contexto: todas as análises (J1–J7) operam sobre **todos os trades**. Com várias contas e meses, precisa filtrar (ex.: "só FTMO 100K, últimos 30 dias").
- Proposta: barra de filtros no topo (período 7/30/90d/mês/tudo + conta + direção). Todos os componentes recebem `trades` já filtrados (fonte única no JournalPage). Persistir em `localStorage`.
- Arquivos: `main-app/src/pages/trading/JournalPage.jsx` (estado + filtragem)
- Aceite: trocar filtro atualiza todas as seções; persiste; 360px; `tsc` 0; build verde.
- Fora de escopo: filtro por tag no dashboard (tags filtram só na lista — J12).

## A6 — Equity curve com overlay de payouts
- Status: [x] executada
- Contexto: a equity do journal não mostra quando houve payout — e payout reduz equity disponível.
- Proposta: `JournalDashboard` com marcadores nos dias com `Payout` (`payout_in` com `date`) + valor; toggle "mostrar payouts". Overlay é apresentação, não muda `computeEquity`.
- Arquivos: `packages/ui/JournalDashboard.tsx`, `JournalPage.jsx` (carrega payouts)
- Aceite: dias com payout marcados + tooltip; toggle; sem payout idêntico; `tsc` 0; build verde.
- Fora de escopo: recalcular equity pós-payout (decisão de domínio).

## A7 — Histograma de R com bucket configurável
- Status: [x] executada
- Contexto: `HistogramR` usa bucket fixo 0.5R (`bucketSize` default). Trader com R menores ou granularidade maior não consegue ajustar.
- Proposta: controle de `bucketSize` na UI (0.25/0.5/1.0) + estado no JournalPage; persistir em `localStorage`. `rDistribution(trades, bucketSize)` já aceita o parâmetro.
- Arquivos: `packages/ui/HistogramR.tsx`, `JournalPage.jsx`
- Aceite: trocar bucket atualiza; persiste; dataset 0.25 vs 1.0 coerente; `tsc` 0; testes verdes; build verde.
- Fora de escopo: eixo R com breaks custom (visualização).

## A8 — Dedup garantido no re-sync Quantower
- Status: [x] executada
- Contexto: `quantowerIngest.ts` usa `quantowerId` (`qt_*`) para dedup, mas o re-sync não tem teste que prove que **não duplica**. Se quebrar, PnL dobra e contamina tudo.
- Proposta: teste de regressão (ingerir 2x → 1 registro); upsert por `quantowerId` (nunca criar novo); contador "sincronizado X, ignorados Y" no QuantowerPage.
- Arquivos: `packages/lib/db/quantowerIngest.ts`, `__tests__/quantowerIngest.test.ts`, `QuantowerPage.jsx`
- Aceite: ingerir mesmo lote 2x não duplica; UI mostra ignorados; `tsc` 0; build verde.
- Fora de escopo: dedup por fingerprint de trades antigos sem `quantowerId` (separado).

## B1 — Replay de trade (fills + contexto)
- Status: [x] executada
- Contexto: revisar um trade hoje é ler números. Reconstruir a decisão (entrada → fills → saída, com MAE/MFE) ensina muito mais.
- Proposta: motor `tradeReplay(trade)` (pontos ordenados por tempo a partir de `executions` + entry/exit) + expansível "Replay" na linha do trade (mini-chart + notas). Reuso de `maeMfe()` para contexto.
- Arquivos: `journalAnalytics.ts`, `Trades.tsx` (expansível), teste com fills à mão
- Aceite: replay mostra sequência temporal correta; sem fills, mostra entry→exit; `tsc` 0; testes verdes; build verde.
- Fora de escopo: replay com candles M1 reais (precisa price feed — separado).

## B2 — Performance por tag (ideia UI/UX)
- Status: [ ] ideia (futura)
- Contexto: tags existem (J12) mas não há análise por elas.
- Proposta: winrate/PnL/avgR agrupados por tag + filtro cruzado tag×símbolo. Mesma base do breakdown por símbolo.

## B3 — Sessões de mercado sobrepostas (timeline estilo babypips)
- Status: [x] executada (mapa visual fxblue)
- Contexto: as sessões eram 4 buckets UTC fixos e **disjuntos** (Asian/London/NY/Off) justamente para evitar dupla contagem, o que não representa o mercado real (London∩NY 12–16, Sydney cruza a meia-noite). Faltava uma visualização que deixasse a sobreposição evidente.
- Proposta: `sessionContains()` com suporte a virada de meia-noite + `marketSessionsInLocalZone()` (converte os horários reais de Sydney/Tokyo/London/NY com DST para o **relógio do aparelho**); componente `SessionTradeMap.tsx` — mapa de 1 dia (0–24h, seletor de data, eixo local/UTC) com as sessões ao fundo e cada trade desenhado da **abertura ao fechamento** (bolinha → barra → seta, cor = direção); `sessionAttribution()` atribui cada trade pela **abertura** (1x, sem inflar); editor aceita sobreposição/wrap; sessões persistidas em `meta` (`journal:sessions`, sincroniza entre aparelhos).
- Arquivos: `packages/lib/db/journalAnalytics.ts`, `packages/ui/SessionTradeMap.tsx`, `packages/ui/sessionTime.ts`, `packages/ui/HeatmapSection.tsx`, `main-app/src/pages/trading/JournalPage.jsx`
- Aceite: default do journal = sessões reais no fuso local; mapa mostra trades abertura→fechamento sem dupla contagem; eixo local/UTC; editar sessão sincroniza; `DEFAULT_SESSIONS`/`sessionAnalysis` inalterados (back-compat J7); testes verdes; build verde.
- Fora de escopo: icones SVG de mercado; rateio proporcional do PnL entre sessões atravessadas (hoje atribui 100% à abertura).

## B4 — Sessões DST-exatas (horário de verão)
- Status: [x] executada
- Contexto: as sessões eram achatadas em **horas no relógio do aparelho** e persistidas assim
  (`journal:sessions`). Quando qualquer bolsa (ou o aparelho) muda o relógio, o mapa e o PnL por
  sessão ficavam ~1h errados; o botão "Restaurar padrão" gravava as horas convertidas como custom,
  perdendo o ajuste de vez. O eixo UTC ainda usava o offset do "agora", não do dia exibido.
- Proposta: resolver as janelas a partir do **horário de parede de cada mercado (IANA)** por data,
  com offset por borda (início/fim separados) e recorte no dia do eixo — `marketSessionWindowsForDate()`;
  atribuição DST-proof pelo mercado aberto no instante da entrada — `marketSessionAttribution()`
  (relógio local do mercado via `marketOpenAt()`). Default = dinâmico; sessão custom continua relógio
  fixo. "Restaurar padrão" agora limpa o custom (`onSessions(null)`).
- Arquivos: `packages/lib/db/journalAnalytics.ts`, `packages/ui/WorldSessionMap.tsx`,
  `packages/ui/SessionTradeMap.tsx`, `packages/ui/Sessionmapdata.ts`, `packages/ui/HeatmapSection.tsx`,
  `main-app/src/pages/trading/JournalPage.jsx`, `__tests__/journalAnalytics.test.ts`
- Aceite: janelas mudam 1h entre verão/inverno e no dia da virada (testes em UTC); mapa, cards de
  mercado e PnL por sessão concordam; custom intacto; `tsc` 0; testes verdes; build verde.
- Fora de escopo: sessão custom com fuso IANA próprio (hoje é relógio do usuário).

## B5 — Notícias (red folders) no mapa
- Status: [x] executada
- Contexto: o calendário econômico já existia (`economicCalendar.ts`, API XOOMAR só EUA, high impact),
  mas só aparecia no FinancialCalendar; o mapa de sessões não mostrava onde caíam os eventos.
- Proposta: trilha abaixo do mapa (acima do volume) com uma plaquinha `!` vermelha por evento, no
  horário real do eixo; hover/foco/toque abre tooltip com hora, nome, período, atual/previsto e
  anterior. `EconomicEvent` ganhou `forecast`/`unit` (aditivos). Fetch no container (JournalPage),
  por mês do dia exibido, com o cache offline existente; sem dados → texto discreto (nunca inventa).
- Arquivos: `packages/lib/db/economicCalendar.ts`, `packages/ui/WorldSessionMap.tsx`,
  `packages/ui/HeatmapSection.tsx`, `main-app/src/pages/trading/JournalPage.jsx`
- Aceite: plaquinhas na hora certa (instante absoluto → DST-correct); tooltip com os dados; offline
  não quebra; `tsc` 0; testes verdes; build verde.
- Fora de escopo: med/low no mapa (hoje só high = red folder); realce de trades perto de evento.

## Batch C � dashboard Trading (reaproveitar app antigo)
- Ideia: trazer os gr�ficos/cards/estilos da dashboard antiga do journal (calend�rio,
  heatmap, curvas) para a nova `/trading`, melhorando a UI. Ver `DOCS/11_PAGE_MAP.md`.
- Status: [ ] ideia (futura) � aguardando o dono priorizar.
