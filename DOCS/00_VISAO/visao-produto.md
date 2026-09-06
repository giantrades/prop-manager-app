# 00 — Visão: Personal Finance OS para Trader

## Tese

Não é "Prop Manager maior". É o lugar que responde:

> Quanto tenho? Onde está? Quanto ganho/arriscco? Quanto em prop? A receber?
> Investido? Devo de imposto? Posso gastar? Posso reinvestir? Como evoluo?

Trading/prop é um pilar gerador de caixa, não o produto inteiro.

## 7 áreas

```
              FINANCIAL HUB
                   HOME (composição, por último)
                    |
    TRADING ----- MONEY ----- INVESTMENTS
      |            |              |
    Prop        Wallets       Portfolio
    Journal     Payouts       Positions
    Risk        Expenses      Performance
    Challenges  Taxes
      |            |
      +------ WEALTH -------+
             Net Worth / Goals / Forecast / Calendar
                    |
              INTELLIGENCE (camada, não página)
```

Sidebar alvo (7 itens, resto é drill-down):

```
HOME / CONTAS / TRADING / DINHEIRO / INVESTIMENTOS / PLANEJAMENTO / RELATÓRIOS
```

## O que NÃO construir

1. Banco digital (não custodiar/movimentar)
2. Corretora (não executar ordem)
3. Bloomberg (sem feed realtime massivo)
4. ERP contábil (cockpit fiscal, não substituto do contador)
5. YNAB completo (sem envelope burocrático)
6. Rede social de traders

Foco: inteligência, controle e decisão.

## Novas apostas incorporadas (do 3º parecer)

- **Financial Calendar:** Trading + contas + payouts + DARF + aportes no mesmo calendário.
- **Cash Flow Forecast 30/60/90d:** hoje + payouts esperados - contas - imposto - aportes.
- **"Posso comprar isso?":** Net Worth + caixa líquido - 30d contas - reserva imposto + payouts esperados = Safe Available.
- **Financial Journal:** eventos de vida ("primeiro payout $10k") ligados ao patrimônio.
- **AI como camada transversal:** pergunta responde consultando Transactions/Trades/Payouts/Tax, não "página de IA".

## Princípio arquitetural (do 3º parecer, adotado)

Centro não é Prop nem Wallet. É o modelo unificado:

```
Account + Transaction + Position + Trade + Payout + Goal
```

Todo o resto é visão especializada da mesma realidade.
Resto dos detalhes por stage nas pastas 01-07.
