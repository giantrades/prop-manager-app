# Scanner — Linguagem de regras (DSL)

> Você escreve a condição do scan como texto. O app compila e filtra.
> Guia também está **dentro do app** (aba Scanner → “Como escrever as regras”), gerado da
> mesma fonte (`RULE_FIELDS`/`RULE_EXAMPLES` em `packages/lib/db/screenerRules.ts`).

## Campos

Percentuais em **pontos percentuais**: `change > 2` significa **+2%**.

| Campo | Aliases | O que é | Unidade |
|---|---|---|---|
| `price` | `preco` | Preço atual | — |
| `change` | `chg`, `var` | Variação do dia | % |
| `change5d` | `chg5d`, `var5d` | Variação em 5 dias | % |
| `absChange` | `abs`, `mover` | Variação absoluta do dia | % |
| `volume` | `vol` | Volume do dia | — |
| `high5d` | `max5d`, `high5` | Máxima dos últimos 5 dias | preço |
| `low5d` | `min5d`, `low5` | Mínima dos últimos 5 dias | preço |
| `range5d` | `range`, `amplitude` | Amplitude 5d: `(máx−mín)/mín` | % |
| `offHigh` | `fromHigh`, `distHigh` | Distância do topo de 5d (0 = no topo) | % |
| `offLow` | `fromLow`, `distLow` | Distância do fundo de 5d (0 = no fundo) | % |
| `sector` | `setor` | Setor — aceita id (`tech`) ou nome (`"Technology"`) | texto |
| `symbol` | `simbolo`, `ticker` | Símbolo (`NVDA`) | texto |
| `name` | `nome` | Nome da empresa | texto |

Campo/alias são **case-insensitive** e ignoram acento.

## Operadores

- Comparação: `>`, `>=`, `<`, `<=`, `=`, `!=`
- Faixa: `between X and Y` (aceita X > Y; normaliza)
- Texto: `contains`
- Lista: `in (a, b, c)`
- Lógica: `AND`, `OR`, `NOT`, parênteses (precedência: `NOT` > `AND` > `OR`)

Números aceitam sufixos: `%`, `k` (mil), `M` (milhão), `B` (bilhão). Ex.: `1.5M`, `2B`, `-1.5%`.

## Destaque de sintaxe (cores no editor)

Enquanto você digita, o editor colore o que reconhece:

- **Campos** (`change`, `volume`, `sector`…) — azul.
- **Conectores/lógica** (`AND`, `OR`, `NOT`, `between`, `in`, `contains`) — amarelo, negrito.
- **Operadores** (`>`, `>=`, `<`, `<=`, `=`, `!=`) — laranja, negrito.
- **Números** (`2`, `2%`, `1M`) — verde.
- **Strings** (`"apple inc"`) — rosa.
- **Pontuação** (`(`, `)`, `,`) — cinza.
- **Valores livres** (`tech`, `NVDA`) — cor normal.

Se um campo não é reconhecido, ele aparece como valor normal e o parser mostra o erro abaixo do
editor. As cores também seguem o tema (variáveis CSS).

## Quantos filtros posso combinar?

**Quantos quiser.** O formulário tem 10 filtros e a regra aceita qualquer número de condições
ligadas por `AND`/`OR`/`NOT` e parênteses. Ex.:

```text
sector = tech AND change > 1 AND volume > 2M AND price between 20 and 500
  AND range5d > 3 AND offHigh < 2 AND name contains "inc"
```

## Exemplos

```text
change > 2% AND volume > 1M
change < -2% AND price > 10
sector = tech AND absChange > 3%
offHigh < 1% AND change > 0
offLow < 1% AND change < 0
symbol in (NVDA, AMD, MU) AND price between 10 and 500
name contains "apple"
NOT sector = utilities AND volume > 2M
```

## Fundamentos & Earnings (seção separada)

Há uma **segunda caixa de regras**, com campos próprios de fundamentos. Ela combina por **AND**
com a regra técnica e com os filtros do formulário. Depende de um feed externo (ver
`02-fundamentals-feed.md`); sem feed, a seção fica em “Aguardando feed” e as regras não retornam
ativos.

| Campo | Aliases | O que é | Unidade |
|---|---|---|---|
| `marketcap` | `mcap` | Valor de mercado | moeda |
| `pe` | `pl`, `trailingpe` | P/L trailing | múltiplo |
| `forwardpe` | `fwdpe` | P/L forward | múltiplo |
| `eps` | `epstrailing` | EPS trailing | moeda |
| `forwardeps` | `fwdfeps` | EPS forward | moeda |
| `divyield` | `dividend`, `dy` | Dividend yield | % |
| `beta` | — | Beta | — |
| `earningsindays` | `daystoearnings`, `earnings` | Dias até o próximo earnings | dias |
| `revenuegrowth` | `revgrowth` | Crescimento de receita | % |
| `profitmargin` | `margin` | Margem de lucro | % |
| `avgvolume` | `avgvol` | Volume médio (3m) | ações |
| `high52w` | `52whigh` | Máxima 52 semanas | preço |
| `low52w` | `52wlow` | Mínima 52 semanas | preço |

```text
pe < 25 AND revenuegrowth > 10
earningsindays <= 7 AND change > 0
divyield > 3 AND profitmargin > 15
marketcap > 10B AND beta < 1.2
```

Os campos de fundamentos também podem ser usados na regra técnica principal (ex.:
`pe < 25 AND change > 1`).

## Campos personalizados

Você define **expressões numéricas** e usa o `id` como um campo normal (na regra técnica ou na de
fundamentos).

```text
forca     = change5d - change
amplitude = high5d - low5d
score     = abs(change) * 2 + change5d
ey        = 1 / pe * 100
```

- Operadores: `+ - * /` e parênteses.
- Funções: `abs(x)`, `min(a,b)`, `max(a,b)`, `round(x)`.
- Pode referenciar built-ins, fundamentos e campos personalizados **definidos antes** (evita ciclo).
- `id` não pode colidir com campo/conector existente; use letras/números/`_`.
- Se a expressão for inválida, o painel mostra o erro e o campo não é usado.

Depois de criar, use normalmente: `forca > 1 AND price > 10`.

## Regras vs. filtros do formulário

- Formulário (universo, setor, direção, variação, preço, volume, busca) **e** regras
  **combinam com AND**.
- Regra vazia = sem regra.
- Presets (Gainers/Losers/…) **não apagam** a regra; eles mudam direção/ordenação.
- Regra inválida **não quebra** o scan: o app mostra o erro e ignora a regra (o resto dos
  filtros continua valendo).

## O que não existe no feed grátis

O Yahoo (usado pelo scanner) não entrega **open/gap/RVOL por barra**. Por isso não há campos
de gap, preço de abertura ou volume relativo. Campos disponíveis são os da tabela acima.

## Como funciona por dentro

- `packages/lib/db/screenerRules.ts` — tokenizer + parser recursivo descendente + avaliador
  puro (`parseRule`, `evaluateRule`, `resolveField`, `RULE_FIELDS`, `RULE_EXAMPLES`).
- `packages/lib/db/marketScanner.ts` — aplica a regra em `buildScreener` (após os filtros do
  formulário) e devolve `ruleError`.
- `packages/ui/market/MarketScreener.tsx` — editor de regras, mensagens de erro e guia (o
  mesmo `RULE_FIELDS`/`RULE_EXAMPLES`).
- Testes: `__tests__/screenerRules.test.ts` (parser/avaliador) e `__tests__/marketScanner.test.ts`
  (integração).
