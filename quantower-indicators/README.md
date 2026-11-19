# Position R:R — indicador do Quantower

Mostra um **painel compacto** (HUD) no canto do gráfico com R e valor em dinheiro das
posições abertas e ordens pendentes do símbolo — de qualquer conta e qualquer conexão.

O painel **não desenha em cima das linhas nativas de SL/TP**, então você continua vendo
e arrastando suas ordens normalmente.

| Linha do painel | O que mostra |
|---|---|
| **ORD / POS** | ordem pendente ou posição, lado, quantidade, preço de entrada e conta |
| **SL** | preço do stop, `-1.00R` (ou `+x.xxR` se já estiver no lucro) e o valor em `$` |
| **TP** | preço do alvo, quantos **R relativos ao stop** e o valor em `$` no alvo |
| **NOW** | preço atual, **R flutuante comparado ao stop** e o P&L em `$` |

Exemplo:

```
ORD BUY 5 @ 28,456.9   5232648
  SL 28,451.9  -1.00R  -$25.00
  TP 28,481.9  +5.00R  +$125.00
```

Depois do fill a mesma estrutura aparece como `POS` e ganha `NOW`:

```
POS BUY 5 @ 28,456.9   5232648
  SL 28,451.9  -1.00R  -$25.00
  TP 28,481.9  +5.00R  +$125.00
  NOW 28,460.0  +0.62R  +$15.50
```

## Por que não escreve direto na linha da ordem

As linhas de SL/TP que o Quantower desenha para ordens/posições são renderizadas pelo
próprio terminal, e a API **não expõe o texto dessas linhas para edição**. Um indicador
só consegue desenhar por cima (GDI). Por isso o padrão é um painel num canto, sem cobrir
as linhas. Se quiser uma referência visual, ligue `Draw price lines on chart` (linhas
finas pontilhadas, sem texto).

## Arquivo

- `PositionRR.cs` — código completo do indicador (C#).

## Passo a passo (Visual Studio)

> O Quantower Algo usa **C#**. "Visual Basic" = **Visual Studio** (a IDE).

1. Instale a extensão **Quantower Algo** no Visual Studio.
2. `File → New → Project` → procure **Quantower** / **Indicator** e escolha o template
   **Indicator** (descrição “A blank indicator template”). Não escolha Strategy.
3. Substitua o conteúdo do `.cs` gerado por `PositionRR.cs`.
4. No `.csproj`, confirme:
   - `<TargetFramework>net10.0</TargetFramework>` (Quantower v1.147.x roda em .NET 10;
     `net8` gera `CS1705`)
   - `<AlgoType>Indicator</AlgoType>`
   - `OutputPath` em `...\Settings\Scripts\Indicators\PositionRR`
   - referência ao `System.Drawing.Common.dll` de `...\bin\System` (`Private=False`)
5. `Build → Build Solution` (`Ctrl+Shift+B`). Use **Build**, não Start/F5.
6. Feche e reabra o Quantower.
7. No gráfico: botão direito → **Indicators → Add Indicator** →
   `Position R:R (R + $)`.

Se não aparecer: confirme o DLL em
`C:\Quantower\Settings\Scripts\Indicators\PositionRR\PositionRR.dll` e reinicie o
Quantower (ele carrega os scripts no startup).

## Erros comuns de compilação

**`Font`/`Graphics`/`Pen`/`DashStyle`/`SmoothingMode`/`TextRenderingHint` não encontrados
(“encaminhado para System.Drawing.Common”)**
Falta a referência:

```xml
<Reference Include="System.Drawing.Common">
  <HintPath>C:\Quantower\TradingPlatform\v1.147.10\bin\System\System.Drawing.Common.dll</HintPath>
  <Private>False</Private>
</Reference>
```

**`CS1705: System.Runtime... 10.0.0.0` / conflitos `8.0.0.0` vs `10.0.0.0`**
O projeto está em `net8`. Troque para `net10.0`. Se o csproj no disco já estiver certo,
feche o VS, apague `obj`, `bin` e `.vs`, reabra e compile.

**“Biblioteca de classes não pode ser iniciada diretamente”**
Você apertou Start/F5; use **Build**. Para o F5 abrir o Quantower:

```xml
<StartAction>Program</StartAction>
<StartProgram>C:\Quantower\TradingPlatform\v1.147.10\Console.StarterNew.exe</StartProgram>
```

**Mensagens de estilo** (“inicialização de coleção…”, “use `string.Contains`”, “membro
pode ser estático”…) são sugestões do analisador, não erros.

## Como funciona

- Lê `Core.Instance.Positions` e `Core.Instance.Orders` direto do Quantower; por isso
  enxerga todas as contas/conexões.
- Filtra pelo símbolo do gráfico.
- O `$` é calculado na **moeda do instrumento** (a moeda de cotação do símbolo, ex.:
  USD no NAS100), igual às linhas nativas do Quantower. Ele usa o multiplicador do
  contrato (manual, cacheado por conta/símbolo ou `Symbol.LotSize`), **não** o `GrossPnL`
  ao vivo da conta. Por isso o valor no SL/TP fica fixo mesmo quando o câmbio da conta
  (ex.: EUR → USD) se mexe.
- Se a conta estiver em moeda diferente da do instrumento, o indicador tenta converter o
  multiplicador pela taxa do par de moedas; se não achar o par, usa `Symbol.LotSize`.
- `R` é medido contra a distância do stop (`entry → stop`).
- SL/TP de ordem pendente com `PriceMeasurement.Offset` são convertidos de **ticks**
  para preço usando `Symbol.TickSize`.

> **Se o `$` não bater com a linha nativa do Quantower**, ajuste
> `Money per 1.0 price / 1 unit` (ex.: NAS100 = `1`, MNQ = `2`, MES = `5`, NQ = `20`,
> ES = `50`). Isso trava o valor exato no multiplicador que você conhece.

## Ordens pendentes

Assim que a ordem limit/stop com SL/TP está pendente, ela já aparece como `ORD`:

- entry = `order.Price` (limit) ou `order.TriggerPrice` (stop)
- SL/TP vêm de `order.StopLoss` / `order.TakeProfit`
- não dá para ler o que está digitado no Order Entry **antes** de enviar a ordem

## Adicionar a uma posição (futuros / preço médio)

Em conta netting, adicionar contratos atualiza `Quantity` e `OpenPrice` (preço médio).
O indicador lê esses campos, então:

- **1R** = `(preço médio − stop) × quantidade total × multiplicador`
- **$ no SL/TP** é recalculado com a quantidade total e o novo preço médio
- **R do TP** = `$ no TP ÷ 1R`; adicionar num preço pior aumenta o risco e diminui o R
- o cálculo é agregado da posição inteira, não o risco isolado de cada “add”

## Alterar o TP muda o R?

Não muda o 1R; muda só o R e o `$` do próprio TP. Vale antes e depois do fill.

| Você altera | 1R | R do TP | $ no TP |
|---|---|---|---|
| TP mais longe | não muda | aumenta | aumenta |
| TP mais perto | não muda | diminui | diminui |
| SL (R basis Initial stop) | não muda | não muda | não muda |
| SL (R basis Current stop) | muda | muda | não muda |
| Adiciona contratos | muda | muda | muda |

## Stop movido para breakeven ou lucro

Com `R basis = Initial stop` (padrão), 1R fica travado no stop inicial:

| Situação | SL no painel | R do TP | NOW |
|---|---|---|---|
| Stop inicial | `-1.00R -$100` | `+2.50R +$250` | `+0.80R +$80` |
| Stop no breakeven | `0.00R $0` | `+2.50R +$250` | `+0.80R +$80` |
| Stop no lucro (+0.5R) | `+0.50R +$50` | `+2.50R +$250` | `+0.80R +$80` |

O stop inicial é memorizado enquanto o Quantower está rodando. Se o indicador for
adicionado depois que o stop já foi movido, ele usa o stop atual como base.

## Parâmetros

| Parâmetro | Default | Para que serve |
|---|---|---|
| Draw price lines on chart | off | liga linhas guias finas (sem texto). Desligado = só o painel |
| Panel corner | Top Right | canto do painel: Top Left / Top Right / Bottom Left / Bottom Right |
| Show panel header | off | mostra `R:R <símbolo>` no topo do painel |
| Show floating NOW label | on | mostra a linha `NOW` |
| Show account name on labels | on | identifica a conta |
| R basis | Initial stop | `Initial stop` trava 1R no stop da entrada; `Current stop` usa o atual |
| Show initial SL reference | on | com linhas ligadas, mostra o stop original |
| Font size | 7 | tamanho da fonte do painel |
| Panel margin (px) | 10 | distância do painel até a borda/canto |
| Money per 1.0 price / 1 unit (0 = auto) | 0 | força o multiplicador manualmente |
| Currency symbol override (empty = auto) | vazio | força o símbolo; vazio detecta USD/EUR/etc. |

## Multiplicador manual (só se precisar)

| Contrato | Multiplicador |
|---|---|
| MNQ / NQ | 2 / 20 |
| MES / ES | 5 / 50 |
| MGC / GC | 10 / 100 |
| MCL / CL | 100 / 1000 |
| M6E / 6E | 12500 / 125000 |
| Ações (1 ação) | 1 |
| Forex (1 lote padrão) | 100000 |

Deixe em `0` para automático.

## Observações

- Adicione o indicador em cada gráfico que quiser acompanhar.
- Várias posições/ordens no mesmo símbolo aparecem com `#1`, `#2`, ...
- O `$` do TP/SL é uma projeção linear do que o broker pagaria naquele nível.
- Se a conexão não expuser o bracket (`Order.StopLoss` / `Order.TakeProfit`), a ordem
  pendente aparece só com o que estiver disponível.
