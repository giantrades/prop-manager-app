# Changelog simples â€” o que mudou no app (explicado sem tecniquÃªs)

> Este arquivo Ã© para VOCÃŠ: cada mudanÃ§a explicada em linguagem normal â€” o que mudou,
> onde aparece e por quÃª. Atualizado a cada etapa. O plano tÃ©cnico/checklist fica em
> `01-backlog.md` e a anÃ¡lise da auditoria em `00-analise-auditoria-profissional.md`.

---

## JÃ¡ entregue ANTES da auditoria (contexto)
- **Seletor de perÃ­odo global** (MÃªs Â· Intervalo de X a Y Â· Tudo) em Home, Trading, Contas,
  Investimentos, Planejamento e Gastos. Tudo na tela respeita o perÃ­odo escolhido.
- **Gastos com histÃ³rico por mÃªs** (estilo Mobills): vocÃª escolhe o mÃªs e a dashboard inteira
  muda; â€œA pagarâ€ tambÃ©m passou a ser do perÃ­odo.
- **Impostos como categoria de despesa**: tipos IR, DARF, ITBI, IPTU, IOF, Cripto, Exterior;
  widget â€œImpostosâ€ no resumo do Gastos (total do perÃ­odo, por tipo e â€œdesde o inÃ­cioâ€).
  O antigo â€œTax cockpitâ€ de day trade foi **removido**.
- **Firms**: cor e Ã­cone; a conexÃ£o (Quantower/cTrader) pode ser ligada a uma firm, e as contas
  daquela conexÃ£o herdam a firm. Cor/Ã­cone aparecem nas contas e nos grÃ¡ficos.
- **Contas**: status enxutos (**Challenge Â· Funded Â· Live Â· Standby**); formulÃ¡rio de conta prop
  simplificado; removidos campos inÃºteis (Moeda, ID na plataforma, â€œpeso rateioâ€).
- **ConexÃµes**: cards por conexÃ£o com status; associar/criar contas do bridge; botÃ£o â€œVer exemploâ€.
- **Positions & Orders** (live): ver posiÃ§Ãµes e ordens, editar SL/TP, fechar, cancelar e enviar
  nova ordem; o bridge agora devolve SL/TP.
- **SincronizaÃ§Ã£o**: tudo que Ã© do usuÃ¡rio sincroniza (inclusive categorias, firms, conexÃµes,
  â€œlidoâ€ das notificaÃ§Ãµes). SÃ³ fica no aparelho o que Ã© do aparelho (token da ponte, cache, etc.).
- **Demo** que se desliga sozinho quando vocÃª cadastra sua primeira conta.
- **SincronizaÃ§Ã£o de perÃ­odo na URL**: o perÃ­odo escolhido fica no endereÃ§o (dÃ¡ pra voltar/compartilhar).

---

## P0 â€” Prioridade mÃ¡xima (entregue)
- **P0-01 â€” Nome certo do nÃºmero**: onde estava escrito â€œROIâ€ (que era payouts Ã· capital), agora
  estÃ¡ **â€œPayout Yieldâ€**, com legenda â€œpayouts / capital nominalâ€. Em Trading e Contas.
- **P0-02 â€” â€œFrescor dos dadosâ€ (widget na Home)**: mostra, com a **idade** de cada um,
  se o **Quantower** estÃ¡ conectado, quando foi a **Ãºltima sincronizaÃ§Ã£o de trades**, quantas
  **cotaÃ§Ãµes** estÃ£o em cache e o **USD/BRL**. Se algum dado estiver velho, avisa.
- **P0-03 â€” Insights com â€œabrir â†’â€**: cada insight/aviso agora mostra a **fonte** (a conta que
  gerou o nÃºmero) e um link **â€œabrir â†’â€** que leva ao lugar certo do app.
- **P0-04 â€” NotificaÃ§Ãµes melhores**: severidade clara (**CrÃ­tico / AtenÃ§Ã£o / Info / Ok**), botÃ£o
  **â€œAbrir contextoâ€**, **â€œAdiar 1 diaâ€** (snooze) e **â€œDispensarâ€**. O que vocÃª lÃª/dispensa fica
  sincronizado entre aparelhos.
- **P0-05 â€” Abrir detalhe sem sair da tela (Entity Drawer)**: clicar numa conta nos widgets da Home
  abre um **painel lateral** com o resumo, sem trocar de pÃ¡gina.
- **P0-06 â€” PerÃ­odo no endereÃ§o (URL)**: o perÃ­odo escolhido vai para o link; recarregar/voltar
  mantÃ©m, e dÃ¡ pra compartilhar.
- **P0-07 â€” ComparaÃ§Ã£o com o perÃ­odo anterior**: nos KPIs da Home, ao lado do valor aparece
  **â–²/â–¼** com a diferenÃ§a vs o perÃ­odo anterior (ex.: saldo dos Gastos, PnL acumulado).

## P1 â€” AnalÃ­tico e gestÃ£o (em andamento)
- **P1-01 â€” Risk Headroom (Trading)**: por conta prop, mostra a **equity** e **quanto do limite de
  drawdown jÃ¡ foi usado** (barra colorida: verde/amarelo/vermelho conforme o risco).
- **P1-02 â€” PnL por dia (Trading)**: barras verdes/vermelhas com o resultado de **cada dia**.
- **P1-03 â€” Expectancy mÃ³vel (Trading)**: uma linha que mostra a **expectativa mÃ©dia a cada 20 trades**
  (ajuda a ver se o â€œedgeâ€ estÃ¡ melhorando ou piorando).
- **P1-04 â€” MAE/MFE (Trading)**: quanto o trade andou **contra** (MAE) e **a favor** (MFE) antes de
  fechar, com a razÃ£o MFE/MAE. (SÃ³ aparece quando o trade tem esses dados/fills.)
- **P1-05 â€” Heatmap por dia da semana (Trading)** *(parcial)*: mostra como vocÃª performa em cada dia
  (nÂº de trades, acerto, R mÃ©dio e PnL, com cor). Falta a versÃ£o por **sessÃ£o/hora e setup**.
- **P1-06 â€” R em caixa (Trading)**: mÃ­nimo, Q1, mediana, Q3 e mÃ¡ximo do R, + quantos **outliers**.
- **P1-09 â€” Account Matrix (Contas)**: uma **tabela** comparando todas as contas:
  tipo, status, equity/saldo, % de drawdown, payouts, nÂº de trades e Ãºltima sincronizaÃ§Ã£o.
- **P1-10 â€” Payout Waterfall (Contas)**: mostra **Bruto â†’ (âˆ’) Taxas â†’ LÃ­quido** com barras.
- **P1-07 â€” Strategy Matrix (Trading)**: uma **tabela por estratÃ©gia** com nÂº de trades, acerto,
  R mÃ©dio, profit factor e expectancy â€” ordenada por expectancy. EstratÃ©gia com menos de 20 trades
  aparece com **`*` (amostra insuficiente)**, pra vocÃª nÃ£o se enganar com pouco dado.
- **P1-11 â€” OrÃ§ado Ã— realizado (Gastos)**: por categoria, quanto vocÃª planejou vs quanto gastou,
  com barra **verde** (dentro) ou **vermelha** (estourou) e o percentual.
- **P1-12 â€” ComposiÃ§Ã£o dos gastos por mÃªs (Gastos)**: grÃ¡fico de **barras empilhadas** mostrando
  como cada categoria pesa mÃªs a mÃªs (top 6 + â€œOutrosâ€).
- **P1-13 â€” Taxa de poupanÃ§a (Gastos)**: quanto do que entrou vocÃª **poupou** (%) e a comparaÃ§Ã£o
  com o **perÃ­odo anterior**.
- **P1-14 â€” Quick Add (Gastos)**: um **lanÃ§amento rÃ¡pido** direto no resumo â€” escolhe conta, valor,
  categoria e nota e clica â€œAdicionarâ€, sem abrir a pÃ¡gina de lanÃ§amentos.
- **P1-16 â€” Performance relativa (Investimentos)**: grÃ¡fico comparando o **seu portfÃ³lio** com o
  **CDI**, os dois comeÃ§ando em **100**. Se a sua linha fica acima, vocÃª bateu o CDI no perÃ­odo.
- **P1-15 â€” Fluxo do patrimÃ´nio (Investimentos)**: um â€œwaterfallâ€ do perÃ­odo mostrando
  **Entradas â†’ (âˆ’) Gastos â†’ (âˆ’) Custos de firm â†’ PnL de trading â†’ VariaÃ§Ã£o**. Ajuda a ver de onde
  o patrimÃ´nio subiu ou desceu.

---

## Como ler o status
- `01-backlog.md` â†’ checklist por item (`[x]` feito / `[ ]` pendente).
- Este documento â†’ explicaÃ§Ã£o simples do que cada item faz.
- Toda entrega roda com verificaÃ§Ã£o automÃ¡tica (build + testes) antes de ir para produÃ§Ã£o.

## P2 — em andamento
- **P2-02 — Saúde da plataforma (Positions & Orders)**: um painel compacto mostrando **plataforma,
  nº de conexões, posições abertas, ordens pendentes e a última sincronização** — pra você ver
  num relance se a ponte está saudável.
- **P2-01 — Sync Center (Quantower)**: mostra o **último run de sincronização**: quando foi,
  quantos trades foram **criados**, **atualizados** e **ignorados**.
- **P2-03 — Exposure + Position Heatmap (Positions & Orders)**: mostra o **total long vs short**
  (barras) e um **mapa de calor por símbolo** onde a cor indica o PnL (verde ganho, vermelho perda,
  intensidade = tamanho), com a quantidade long/short de cada símbolo.
- **P1-08 — Rule Adherence (Trading)**: cruza o **checklist do dia** com o **resultado do dia**.
  Mostra a aderência média, quantos dias você seguiu o plano (=80%) e o **PnL médio** nos dias em
  que seguiu vs nos que não seguiu — pra ver se a disciplina está pagando.
- **P1-17 — Filtros globais (conta/estratégia)**: além do período, agora dá para filtrar por
  **conta** e por **estratégia** — e isso vai para o endereço (compartilhável). Aplicado no
  Trading e no Gastos.
- **P1-18 — Empty states acionáveis (slice)**: quando não há dados, a tela agora diz o que fazer
  com um atalho (ex.: “Sem despesas no período ? lançar”; “Sem estratégia ? abrir Journal”).
- **P2-05 — Relatório do período (Relatórios)**: a página agora tem **seletor de período** e um
  **resumo do período** (entrou/gastou/saldo) + **fluxo do patrimônio** (entradas ? gastos ?
  custos ? PnL trading ? payouts ? variação). Bom para “como foi o mês”.
- **P2-06 — “Posso comprar isso?” (Planejamento)**: você digita o valor de uma compra e o app
  mostra o seu **caixa livre agora**, **como fica depois** e um veredito (cabe / repense).
- **P2-09 — Treemap do portfólio (Investimentos)**: um mapa de blocos onde o **tamanho** de cada
  bloco é o valor do ativo — ótimo para ver concentração num relance.
- **P2-07 — Runway (Planejamento)**: quantos **meses** seu caixa livre cobre, usando o **gasto médio
  mensal** dos últimos 3 meses. (Scenario Cone fica como continuação.)
- **P2-13 — Auditoria de rotas/legacy**: comparei rotas × navegação × links. Resultado: **/risk** e
  **/networth** eram “órfãs” (existiam só por URL, sem link) e foram **removidas**; **/playbook**
  fica (é usado pelo Journal). Navegação e rotas agora estão alinhadas.
- **P2-11 — Metric Registry leve**: um documento (`03-metric-registry.md`) com **nome, definição e
  fonte** de cada métrica (evita divergência de nome/fórmula). Regra: a UI nunca recalcula.
- **P2-12 — Reserva de imposto (Gastos ? Impostos)**: nova linha **“A pagar (reservar)”** com o total
  de impostos lançados como **ainda não pagos**.
- **P2-08 — Projeção de metas (Planejamento)**: para cada meta em aberto, estima em **quantos meses**
  (e em que **mês/ano**) ela é atingida, no ritmo do **fluxo mensal líquido** do forecast.
- **P2-10 — Cartões como entidade (Sistema ? Settings)**: agora você cadastra o cartão com
  **limite, dia de fechamento, dia de vencimento, bandeira e conta**. Fica sincronizado.
  (Migration `004` aplicada no banco.)
- **P2-04 — Versão do playbook no trade (Journal)**: campo **“Versão do playbook”** ao lançar/editar
  um trade — base para comparar desempenho por versão. (Coluna nova `strategy_version` no banco.)
