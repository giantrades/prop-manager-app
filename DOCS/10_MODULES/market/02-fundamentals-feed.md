# Fundamentos & Earnings — feed externo (contrato)

> O app **não inventa fundamentos**. A seção "Fundamentos & Earnings" do Scanner fica em
> **“Aguardando feed”** até existir um endpoint configurado. Este documento é o contrato para
> humano + IA conferirem o que precisa existir **fora do app**.

## 1. O que o app espera

- Uma URL HTTP(S) que aceite `GET` com a lista de símbolos:
  ```text
  GET {ENDPOINT}?symbols=AAPL,MSFT,NVDA
  ```
- Resposta JSON:
  ```json
  {
    "at": "2026-10-23T12:00:00Z",
    "items": [
      {
        "symbol": "AAPL",
        "marketCap": 3000000000000,
        "peTrailing": 28.5,
        "peForward": 25.1,
        "epsTrailing": 6.1,
        "epsForward": 6.9,
        "dividendYield": 0.005,
        "beta": 1.2,
        "earningsDate": "2026-11-05",
        "revenueGrowth": 0.08,
        "profitMargin": 0.25,
        "avgVolume": 55000000,
        "fiftyTwoWeekHigh": 260,
        "fiftyTwoWeekLow": 160
      }
    ]
  }
  ```

## 2. Regras de dados (importante)

| Campo | Tipo | Unidade | Observação |
|---|---|---|---|
| `symbol` | string | — | **obrigatório**, maiúsculo |
| `marketCap` | number \| null | moeda (USD) | valor absoluto |
| `peTrailing` | number \| null | múltiplo | P/L trailing |
| `peForward` | number \| null | múltiplo | P/L forward |
| `epsTrailing` | number \| null | moeda/ação | EPS trailing |
| `epsForward` | number \| null | moeda/ação | EPS forward |
| `dividendYield` | number \| null | **fração** (0.005 = 0,5%) | NÃO mandar 0.5 |
| `beta` | number \| null | — | 5y monthly |
| `earningsDate` | string \| null | ISO `YYYY-MM-DD` | próxima divulgação; aceita timestamp numérico |
| `revenueGrowth` | number \| null | **fração** (0.08 = 8%) | YoY |
| `profitMargin` | number \| null | **fração** (0.25 = 25%) | — |
| `avgVolume` | number \| null | ações | média 3m |
| `fiftyTwoWeekHigh` | number \| null | preço | — |
| `fiftyTwoWeekLow` | number \| null | preço | — |

- Campos ausentes podem vir `null` (ou omitidos) — a UI/régua trata como “sem dado”.
- **Percentuais em fração** no feed; o app converte para pontos na linguagem de regras.
- O app também aceita `snake_case` (`market_cap`, `pe_trailing`, `earningsTimestamp`…), mas o
  contrato oficial é o camelCase acima.

## 3. Como configurar (dentro do app)

- **Produção/dev:** variável de ambiente do Vite
  ```text
  VITE_FUNDAMENTALS_ENDPOINT=https://seu-proxy.exemplo.com/fundamentals
  ```
- **Teste rápido (sem rebuild):** no console do navegador
  ```js
  localStorage.setItem('fundamentals:endpoint:v1', 'https://seu-proxy.exemplo.com/fundamentals')
  // remover:
  localStorage.removeItem('fundamentals:endpoint:v1')
  ```
  O endpoint no `localStorage` tem prioridade sobre a env.

- Cache local de **6h** (`fundamentals:cache:v1`). Sem endpoint, o app usa cache se existir.

## 4. Opções de fonte (escolher 1)

### A. Yahoo Finance via proxy serverless (sem chave)
- Endpoint: `quoteSummary` ou `v7/finance/quote` (batch).
- Exige fluxo de **cookie + crumb** (`fc.yahoo.com` → `v1/test/getcrumb`).
- Grátis, mas **frágil** (pode bloquear IP de datacenter / mudar schema).
- O proxy deve rodar no servidor (Netlify Function) e expor o contrato da seção 1.

### B. Finnhub (free tier, com chave)
- `https://finnhub.io/api/v1/quote` (preço) e `stock/metric?metric=all` (fundamentos).
- Precisa de **API key** (gratuita), mantida **no servidor**.
- Bom para earnings date (`earningsCalendar`) e métricas.

### C. Financial Modeling Prep (free tier, com chave)
- `profile`, `key-metrics`, `ratios`, `earnings-calendar`.
- Precisa de **API key** (gratuita), mantida **no servidor**.

> **Nunca** colocar chave em variável `VITE_*` (ela vai para o bundle). `VITE_FUNDAMENTALS_ENDPOINT`
> deve apontar para um **proxy seu** que guarda a chave.

## 5. Checklist para conferir (humano + IA)

- [ ] `GET {ENDPOINT}?symbols=AAPL` responde 200 com JSON `{ at, items }`.
- [ ] `items[].symbol` em maiúsculo.
- [ ] `dividendYield`, `revenueGrowth`, `profitMargin` **em fração**.
- [ ] `earningsDate` em `YYYY-MM-DD` (ou timestamp).
- [ ] CORS liberado para o domínio do app (ou proxy same-origin).
- [ ] Rate limit comporta lotes (o app pede ~150 símbolos por carga; o proxy deve fatiar).
- [ ] Timeout ≤ 10s; em falha, retornar erro HTTP (o app cai para cache/“indisponível”).
- [ ] Nenhuma chave exposta no cliente.

## 6. Como o app consome

- `packages/lib/db/fundamentals.ts` — `fetchFundamentals`, `normalizeFundamentals`,
  `fundamentalNumeric`, `toFundamentalValues`, `FUNDAMENTAL_FIELDS`.
- `main-app/src/useFundamentals.js` — SWR por chave `fundamentals`.
- `packages/lib/db/marketScanner.ts` — injeta os valores em `row.extra`; a regra separada
  (`fundamentalRules`) usa só campos de fundamentos.
- `main-app/src/pages/scanner/ScannerScreenerPage.jsx` — busca para `CONSTITUENT_SYMBOLS`.

## 7. O que NÃO está incluído

- Histórico de earnings/surpresas (EPS estimate vs actual) — não há campo.
- Consenso de analistas, guidance, short interest.
- Ajuste de fuso/calendário de earnings (o app mostra dias até a data informada).

Se precisar desses, é só estender o contrato + `FUNDAMENTAL_FIELDS` (1 entrada por campo) e a UI
passa a exibir/filtrar automaticamente.
