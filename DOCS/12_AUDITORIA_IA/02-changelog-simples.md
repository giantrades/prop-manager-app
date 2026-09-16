# Changelog simples — o que mudou no app (explicado sem tecniquês)

> Este arquivo é para VOCÊ: cada mudança explicada em linguagem normal — o que mudou,
> onde aparece e por quê. Atualizado a cada etapa. O plano técnico/checklist fica em
> `01-backlog.md` e a análise da auditoria em `00-analise-auditoria-profissional.md`.

---

## Já entregue ANTES da auditoria (contexto)
- **Seletor de período global** (Mês · Intervalo de X a Y · Tudo) em Home, Trading, Contas,
  Investimentos, Planejamento e Gastos. Tudo na tela respeita o período escolhido.
- **Gastos com histórico por mês** (estilo Mobills): você escolhe o mês e a dashboard inteira
  muda; “A pagar” também passou a ser do período.
- **Impostos como categoria de despesa**: tipos IR, DARF, ITBI, IPTU, IOF, Cripto, Exterior;
  widget “Impostos” no resumo do Gastos (total do período, por tipo e “desde o início”).
  O antigo “Tax cockpit” de day trade foi **removido**.
- **Firms**: cor e ícone; a conexão (Quantower/cTrader) pode ser ligada a uma firm, e as contas
  daquela conexão herdam a firm. Cor/ícone aparecem nas contas e nos gráficos.
- **Contas**: status enxutos (**Challenge · Funded · Live · Standby**); formulário de conta prop
  simplificado; removidos campos inúteis (Moeda, ID na plataforma, “peso rateio”).
- **Conexões**: cards por conexão com status; associar/criar contas do bridge; botão “Ver exemplo”.
- **Positions & Orders** (live): ver posições e ordens, editar SL/TP, fechar, cancelar e enviar
  nova ordem; o bridge agora devolve SL/TP.
- **Sincronização**: tudo que é do usuário sincroniza (inclusive categorias, firms, conexões,
  “lido” das notificações). Só fica no aparelho o que é do aparelho (token da ponte, cache, etc.).
- **Demo** que se desliga sozinho quando você cadastra sua primeira conta.
- **Sincronização de período na URL**: o período escolhido fica no endereço (dá pra voltar/compartilhar).

---

## P0 — Prioridade máxima (entregue)
- **P0-01 — Nome certo do número**: onde estava escrito “ROI” (que era payouts ÷ capital), agora
  está **“Payout Yield”**, com legenda “payouts / capital nominal”. Em Trading e Contas.
- **P0-02 — “Frescor dos dados” (widget na Home)**: mostra, com a **idade** de cada um,
  se o **Quantower** está conectado, quando foi a **última sincronização de trades**, quantas
  **cotações** estão em cache e o **USD/BRL**. Se algum dado estiver velho, avisa.
- **P0-03 — Insights com “abrir →”**: cada insight/aviso agora mostra a **fonte** (a conta que
  gerou o número) e um link **“abrir →”** que leva ao lugar certo do app.
- **P0-04 — Notificações melhores**: severidade clara (**Crítico / Atenção / Info / Ok**), botão
  **“Abrir contexto”**, **“Adiar 1 dia”** (snooze) e **“Dispensar”**. O que você lê/dispensa fica
  sincronizado entre aparelhos.
- **P0-05 — Abrir detalhe sem sair da tela (Entity Drawer)**: clicar numa conta nos widgets da Home
  abre um **painel lateral** com o resumo, sem trocar de página.
- **P0-06 — Período no endereço (URL)**: o período escolhido vai para o link; recarregar/voltar
  mantém, e dá pra compartilhar.
- **P0-07 — Comparação com o período anterior**: nos KPIs da Home, ao lado do valor aparece
  **▲/▼** com a diferença vs o período anterior (ex.: saldo dos Gastos, PnL acumulado).

## P1 — Analítico e gestão (em andamento)
- **P1-01 — Risk Headroom (Trading)**: por conta prop, mostra a **equity** e **quanto do limite de
  drawdown já foi usado** (barra colorida: verde/amarelo/vermelho conforme o risco).
- **P1-02 — PnL por dia (Trading)**: barras verdes/vermelhas com o resultado de **cada dia**.
- **P1-03 — Expectancy móvel (Trading)**: uma linha que mostra a **expectativa média a cada 20 trades**
  (ajuda a ver se o “edge” está melhorando ou piorando).
- **P1-04 — MAE/MFE (Trading)**: quanto o trade andou **contra** (MAE) e **a favor** (MFE) antes de
  fechar, com a razão MFE/MAE. (Só aparece quando o trade tem esses dados/fills.)
- **P1-05 — Heatmap por dia da semana (Trading)** *(parcial)*: mostra como você performa em cada dia
  (nº de trades, acerto, R médio e PnL, com cor). Falta a versão por **sessão/hora e setup**.
- **P1-06 — R em caixa (Trading)**: mínimo, Q1, mediana, Q3 e máximo do R, + quantos **outliers**.
- **P1-09 — Account Matrix (Contas)**: uma **tabela** comparando todas as contas:
  tipo, status, equity/saldo, % de drawdown, payouts, nº de trades e última sincronização.
- **P1-10 — Payout Waterfall (Contas)**: mostra **Bruto → (−) Taxas → Líquido** com barras.
- **P1-07 — Strategy Matrix (Trading)**: uma **tabela por estratégia** com nº de trades, acerto,
  R médio, profit factor e expectancy — ordenada por expectancy. Estratégia com menos de 20 trades
  aparece com **`*` (amostra insuficiente)**, pra você não se enganar com pouco dado.
- **P1-11 — Orçado × realizado (Gastos)**: por categoria, quanto você planejou vs quanto gastou,
  com barra **verde** (dentro) ou **vermelha** (estourou) e o percentual.
- **P1-12 — Composição dos gastos por mês (Gastos)**: gráfico de **barras empilhadas** mostrando
  como cada categoria pesa mês a mês (top 6 + “Outros”).
- **P1-13 — Taxa de poupança (Gastos)**: quanto do que entrou você **poupou** (%) e a comparação
  com o **período anterior**.
- **P1-14 — Quick Add (Gastos)**: um **lançamento rápido** direto no resumo — escolhe conta, valor,
  categoria e nota e clica “Adicionar”, sem abrir a página de lançamentos.
- **P1-16 — Performance relativa (Investimentos)**: gráfico comparando o **seu portfólio** com o
  **CDI**, os dois começando em **100**. Se a sua linha fica acima, você bateu o CDI no período.
- **P1-15 — Fluxo do patrimônio (Investimentos)**: um “waterfall” do período mostrando
  **Entradas → (−) Gastos → (−) Custos de firm → PnL de trading → Variação**. Ajuda a ver de onde
  o patrimônio subiu ou desceu.

---

## Como ler o status
- `01-backlog.md` → checklist por item (`[x]` feito / `[ ]` pendente).
- Este documento → explicação simples do que cada item faz.
- Toda entrega roda com verificação automática (build + testes) antes de ir para produção.

## P2 � em andamento
- **P2-02 � Sa�de da plataforma (Positions & Orders)**: um painel compacto mostrando **plataforma,
  n� de conex�es, posi��es abertas, ordens pendentes e a �ltima sincroniza��o** � pra voc� ver
  num relance se a ponte est� saud�vel.
- **P2-01 � Sync Center (Quantower)**: mostra o **�ltimo run de sincroniza��o**: quando foi,
  quantos trades foram **criados**, **atualizados** e **ignorados**.
