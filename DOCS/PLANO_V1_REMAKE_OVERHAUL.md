# 🚀 PLANO ESTRATÉGICO & ARQUITETURA: Personal Finance OS para Trader (Versão v1.0)

> **Objetivo Transformacional:** Evoluir o aplicativo atual de um *Prop Manager + Trading Journal* isolado para o **Personal Finance OS para Trader** — um sistema financeiro unificado onde trading/prop é um pilar gerador de caixa que alimenta Wallets, Investimentos, Impostos, Patrimônio Líquido (Net Worth) e Objetivos de Longo Prazo.

---

## 🎯 Visão do Produto & As 7 Áreas Estratégicas

Em vez de dois aplicativos colados ou páginas soltas, o produto é reorganizado em **7 Grandes Pilares**, sustentados por uma **Cadeia de Dados Unificada (Unified Data Chain)**:

```text
                               ┌───────────────────────────┐
                               │ FINANCIAL COMMAND CENTER  │
                               │          (HOME)           │
                               └─────────────┬─────────────┘
                                             │
      ┌──────────────────────────────────────┼──────────────────────────────────────┐
      │                                      │                                      │
┌─────┴──────────────┐             ┌─────────┴──────────┐             ┌─────────────┴────────────┐
│      TRADING       │             │       MONEY        │             │       INVESTMENTS        │
├────────────────────┤             ├────────────────────┤             ├──────────────────────────┤
│ • Prop Accounts    │             │ • Wallets & Banks  │             │ • Portfolio & Assets     │
│ • Trading Journal  │   ──────►   │ • Payout Center    │   ──────►   │ • Cost Basis & DCA       │
│ • Risk Center      │             │ • Expense Tracker  │             │ • Performance & Yield    │
│ • Challenge Engine │             │ • Tax Cockpit      │             │                          │
└────────────────────┘             └────────────────────┘             └──────────────────────────┘
      │                                      │                                      │
      └──────────────────────────────────────┼──────────────────────────────────────┘
                                             │
                                   ┌─────────┴──────────┐
                                   │       WEALTH       │
                                   ├────────────────────┤
                                   │ • Net Worth Engine │
                                   │ • Financial Goals  │
                                   └─────────┬──────────┘
                                             │
                                   ┌─────────┴──────────┐
                                   │    INTELLIGENCE    │
                                   ├────────────────────┤
                                   │ • AI Financial OS  │
                                   │ • Cross Insights   │
                                   └────────────────────┘
```

---

## ⚡ A Cadeia Reativa de Dados (The Unified Data Chain)

A pedra angular da arquitetura técnica é garantir que todas as transações fluam em um único pipeline reativo de dados:

$$\text{Trade} \longrightarrow \text{Prop Account} \longrightarrow \text{PnL / Equity} \longrightarrow \text{Payout Eligible} \longrightarrow \text{Payout Event} \longrightarrow \text{Wallet Inflow} \longrightarrow \text{Tax Reserve / Expenses / Investments} \longrightarrow \text{Net Worth Update} \longrightarrow \text{Goals Progress}$$

---

## 💡 Princípios de Escopo: O que NÃO Construir

Para manter a simplicidade, segurança e alta performance:
1. ❌ **Não ser Banco Digital:** Não custodiar fundos reais nem processar transferências bancárias reais.
2. ❌ **Não ser Corretora / Broker:** Não executar ordens de compra/venda de ativos diretamente em bolsa.
3. ❌ **Não ser Terminal Bloomberg:** Não tentar ser feed de mercado em tempo real para milhares de ativos.
4. ❌ **Não ser ERP Contábil Completo:** Não substituir a declaração oficial do contador ou emitir notas fiscais.
5. ❌ **Não ser YNAB Complexo:** Evitar sistemas burocráticos de orçamento por envelopes que geram atrito diário.
6. ✅ **Foco Absoluto:** Ser o **Centro de Inteligência, Controle e Tomada de Decisão Financeira do Trader**.

---

## 📐 Plano de Execução em 5 Fases

---

### FASE 0: Unificação Técnica & Unified Data Engine (Fundação)
*Objetivo: Resolver dívida técnica crítica P0 e construir o motor de dados unificado antes de criar novas telas.*

#### [MODIFY] `packages/state`
- Implementar o schema unificado IndexedDB v3 (com store dedicado para `accounts`, `trades`, `payouts`, `wallets`, `transactions`, `investments`, `tax_records`, `net_worth_snapshots`, `goals`).
- Corrigir bugs P0 identificados no Audit v3:
  - `isPushing` vs `isPulling` unlock no block `finally` de sync.
  - Sanitização de storage corrompido sem substituir banco por seed zerado.
  - Recálculo multi-conta em `recalcAccountFunding()` e suporte correto a `t.accounts[]` e `defaultWeight`.
- Criar a camada `DataChainEngine` em TypeScript para propagação reativa de eventos entre módulos.

#### [MODIFY] `main-app` & `trading-journal`
- Integrar os dois aplicativos sob uma única casca SPA de React Router (evitando CSS duplicado e reloads de contexto).

---

### FASE 1: Core Financial Hub, Risk Center & Prop Engine 2.0
*Objetivo: Transformar o Trading Hub no painel que o trader abre ANTES e DURANTE o dia de operação.*

#### [NEW] `main-app/src/pages/RiskCenter.tsx` (Risk Center Component & Page)
- **Status do Dia:** Banner `🟢 SAFE TO TRADE`, `🟡 WARN (50% DD)` ou `🔴 STOP TRADING (MAX DD ALCANÇADO)`.
- **Métricas Globais de Risco:** Total Nominal ($), PnL Today ($), Daily DD Used (%), Worst Account ($), Risk Remaining / Headroom ($), Total Trades & Win/Loss Ratio no dia.
- **Tabela Dinâmica de Contas:** Listagem de todas as contas ativas com Equity, Peak Equity, Daily DD restante, Max Trailing DD headroom e Trailing Stop trigger.

#### [MODIFY] `packages/journal-state/src/accountModel.ts` (Prop Engine 2.0 / Account Model)
- Elevar a conta Prop de simples valor de saldo para **Entidade Financeira Completa**:
  - Nominal Size, Challenge Cost, Phase (Challenge 1, Phase 2, Funded, Paused, Failed).
  - Target, Max Drawdown, Trailing Drawdown, Daily Drawdown Limit, Consistency Rule %, Min Trading Days, Payout Rules & Split %.
  - Exibição de métricas calculadas em tempo real: Equity, Peak Equity, Max DD Used %, Daily DD Used %, Payout Eligibility (Sim/Não).

#### [NEW] `main-app/src/pages/HomeCommandCenter.tsx` (Financial Command Center - Home Overhaul)
- Redesenho completo da Dashboard Principal:
  - **Header Patrimonial:** Net Worth Total (R$), Cash Liquidez (R$), Investimentos (R$), Prop Equity ($), Payouts Pendentes ($), Tax Reserve (R$).
  - **Painel Central dividido em 4 quadrants:** Trading Today (Risk Status), Portfolio Yield, Financial Goals Tracker e Action Center (alertas de DARF, DD próximo, Payouts aprovados).

---

### FASE 2: Payout Pipeline, Money Wallets & Tax Cockpit
*Objetivo: Conectar o resultado do trading ao fluxo de dinheiro real e gestão tributária.*

#### [NEW] `main-app/src/pages/PayoutCenter.tsx` (Payout Center & Distribution Wizard)
- Registro detalhado de Payout (Gross, Fee da Mesa, Valor Líquido Recebido, Canal Ex: Wise/Crypto, Prazo Estimado).
- **Assistente de Alocação de Payout ("O que você fez com esse Payout?"):**
  - Automático para: Reserva de Imposto (Tax Reserve) $\rightarrow$ Living/Despesas $\rightarrow$ Investimentos $\rightarrow$ Caixas/Wallets.

#### [NEW] `main-app/src/pages/Wallets.tsx` (Wallets & Financial Accounts Module)
- Módulo de carteiras multi-moeda (USD, BRL, EUR, Crypto):
  - Wise, Contas Bancárias BR (C6, Nubank, Inter), Corretoras, Carteiras Crypto/Stablecoins.
  - Fluxo de caixa unificado (inflows de payouts, outflows de despesas e aportes de investimento).

#### [NEW] `main-app/src/pages/TaxCockpit.tsx` (Tax Cockpit - IR / DARF Trader)
- Cockpit de estimativa fiscal brasileira:
  - Separação por modalidade (Day Trade 20%, Swing Trade 15%, Payouts Internacionais via Carnê-Leão / PJ).
  - Controle automático de prejuízos acumulados para compensação futura.
  - Alerta com contador de prazo para pagamento de DARF.

---

### FASE 3: Wealth & Investment Management (Net Worth, Portfolio & Goals 2.0)
*Objetivo: Dar visibilidade completa da evolução da riqueza total do trader.*

#### [NEW] `main-app/src/pages/Portfolio.tsx` (Portfolio & Asset Tracker)
- Gestão simples e eficiente de Ativos (Ações BR/US, FIIs, Tesouro Direto, CDBs, Crypto, Stablecoins).
- **Métricas Essenciais:** Custo Médio (Cost Basis), Valor Atual, Lucro/Prejuízo Total, Rentabilidade % e Histórico de Aportes (DCA).

#### [NEW] `main-app/src/pages/NetWorth.tsx` (Net Worth Engine & Evolution Chart)
- Painel de Patrimônio Líquido Total com agregação de: Cash + Investimentos + Crypto + Recebíveis + Payouts de Prop Pendentes - Passivos/Impostos a pagar.
- Gráfico de Evolução Patrimonial Mês a Mês (ex: Jan R$280k $\rightarrow$ Jul R$487k) — o gráfico definitivo da vida financeira.

#### [MODIFY] `main-app/src/pages/Goals.tsx` (Financial Goals 2.0 Engine)
- Expansão de Goals para Objetivos Financeiros de Riqueza:
  - Meta de Reserva de Emergência, Meta de Patrimônio Líquido (ex: R$ 1 Milhão), Meta de Compra de Imóvel/Bens, Meta de Payout Anual de Trading.
  - Barra de progresso automática alimentada pelos módulos de Net Worth e Payouts.

---

### FASE 4: Financial Intelligence AI Agent
*Objetivo: Transformar o app de um simples registrador de dados em um assistente de decisão de nível quant/patrimonial.*

#### [NEW] `main-app/src/services/financialIntelligence.ts` (Financial Intelligence Engine)
- Motor de análise transversal da IA:
  - Análise de correlação entre Drawdown no Trading x Impacto na Reserva Financeira.
  - Insights de evolução patrimonial (ex: *"63% do crescimento do seu patrimônio nos últimos 6 meses veio de payouts de prop"*).
  - Alertas inteligentes de runway e alocação de caixa (ex: *"Você possui 28% do seu patrimônio parado em caixa sem rendimento"*).
  - Recomendações de ajuste de gestão de risco baseadas no comportamento patrimonial recente.

---

## 📋 Plano de Verificação Técnicos & Funcionais

### Automated Tests
- Testes unitários para a `DataChainEngine` (validando se a criação de um Trade propaga PnL $\rightarrow$ Equity $\rightarrow$ Payout Eligibility $\rightarrow$ Wallet).
- Testar fórmulas de cálculo de Drawdown (Trailing vs Daily DD limit) no novo modelo de Prop Accounts.

### Manual Verification
- Testar o fluxo de registro de Payout e distribuição no Wizard para Wallets, Impostos e Investimentos.
- Verificar a reatividade do Risk Center durante a simulação de múltiplos trades em lote.
- Validar a renderização responsiva do novo Financial Command Center em telas de desktop e dispositivos móveis.
