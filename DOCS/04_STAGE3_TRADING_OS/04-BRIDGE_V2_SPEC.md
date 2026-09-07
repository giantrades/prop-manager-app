# BRIDGE V2 SPEC (novo) — QuantowerBridge.cs

> Estado atual verificado (`QuantowerBridge.cs`, commit `f26cea5`): rotas existentes são
> `GET /status`, `/accounts`, `/trades`, `/positions`, `/health` e `POST /positions/close`
> (dispatch em `QuantowerBridge.cs:310-329`). **Nenhuma rota pede autenticação hoje.**
> `Access-Control-Allow-Origin: *` (linha 366) e `Access-Control-Allow-Private-Network:
> true` (linha 370) — esse segundo header já opt-in permite que uma página pública
> acesse o bridge na rede privada, o que piora o CORS aberto. `AllowExternal = false`
> por padrão (linha 50) é o único freio real hoje. `/status` já retorna
> `version: "1.0.0"` hardcoded (sem campo `build`); `/health` já retorna
> `{status:"ok", timestamp}` (sem `version`) — a infra do handshake existe pela metade,
> falta o lado cliente comparar.

## Autenticação (aplica a TODAS as rotas, sem exceção)

```
Header obrigatório: X-Bridge-Token: <token>
```

- Token gerado localmente (GUID) na primeira execução do bridge, salvo num arquivo de
  config ao lado do executável (nunca hardcoded no `.cs`, nunca no repo).
- App mostra o token uma vez (tela de pareamento) pro usuário copiar pro
  `.env`/config do app — não há troca automática de chave por rede (evita MITM na
  primeira conexão).
- Toda rota sem o header, ou com token errado, responde `401` com o contrato de erro
  abaixo — **inclusive `/positions/close`, que hoje não pede nada**.
- Rotação: comando manual (`bridge --rotate-token`) invalida o token atual; app mostra
  aviso "bridge token mudou, repareie" em vez de falhar silenciosamente.
- Remover `Access-Control-Allow-Private-Network: true` enquanto não houver token
  funcionando — reintroduzir só depois, se necessário, nunca antes.

## Endpoints

### Já existentes (adicionar token, manter contrato)

| Rota | Método | Hoje | v2 |
|---|---|---|---|
| `/status` | GET | `{status, version:"1.0.0"}` | some `build: string` (data+hash do build do bridge) |
| `/health` | GET | `{status:"ok", timestamp}` | some `version` (mesmo valor de `/status`) pra handshake em 1 chamada só |
| `/accounts` | GET | lista de contas Quantower | sem mudança de contrato, só token |
| `/trades` | GET | lista de trades | sem mudança de contrato, só token |
| `/positions` | GET | posições abertas | sem mudança de contrato, só token |
| `/positions/close` | POST | fecha posição, **sem auth hoje** | adiciona token + `clientOrderId` |
| `/orders` | GET | (rota existe no dispatch, confirmar contrato ao implementar — **NÃO VERIFICADO** o formato de resposta atual) | token |

### Novos

```
POST /positions/open
  body: { accountId, symbol, side: 'buy'|'sell', qty, sl?, tp?, note?, clientOrderId }
  200: { success: true, platformPositionId, filledPrice, filledQty }
  4xx: ver contrato de erro

POST /positions/modify
  body: { platformPositionId, sl?, tp?, clientOrderId }
  200: { success: true, platformPositionId }
  4xx: ver contrato de erro

POST /orders/place
  body: { accountId, symbol, side, qty, type: 'limit'|'stop', price, sl?, tp?, clientOrderId }
  200: { success: true, platformOrderId }

POST /orders/cancel
  body: { platformOrderId, clientOrderId }
  200: { success: true }
```

Toda resposta de escrita: `{ success: boolean, platformPositionId?, platformOrderId?,
error?: ErrorPayload }`.

## Idempotência

Todo `POST` de escrita carrega `clientOrderId` (gerado pelo app, UUID). O bridge
mantém um cache em memória (últimos N=200 ou 10 minutos, o que vier primeiro) de
`clientOrderId` já processados — reenvio do mesmo `clientOrderId` retorna a mesma
resposta original sem reenviar a ordem pro Quantower. Isso cobre o caso real de
celular com rede instável reenviando por timeout enquanto a primeira ordem já foi
executada.

## Contrato de erro (`ErrorPayload`)

```ts
{
  code: 'insufficient_margin' | 'symbol_closed' | 'market_closed' | 'invalid_token' |
        'position_not_found' | 'order_not_found' | 'quantower_disconnected' |
        'duplicate_client_order_id' | 'unknown',
  message: string,          // texto humano, safe pra mostrar direto na UI
  retryable: boolean,       // 'market_closed' = false, 'quantower_disconnected' = true
}
```

Sem esse contrato o app mobile não sabe diferenciar "tenta de novo em 5s" de "nunca
vai funcionar, mostra erro final pro usuário" — hoje `/positions/close`
(`QuantowerBridge.cs:373-410`) retorna erro como string solta, sem `code`.

## Version handshake

Cliente (`quantowerAdapter.js`) compara `EXPECTED_BRIDGE_VERSION` (constante no app)
contra o `version` retornado por `/status` (ou `/health` no v2). Se diferente: banner
"bridge desatualizada — baixe a versão X" em vez de falhar mudo ou (pior) seguir
chamando rotas que podem ter contrato diferente na versão antiga do bridge.

**Correção necessária antes do handshake fazer sentido**: `quantowerAdapter.js:23`
hoje define `this.bridgeUrl = options.bridgeUrl || FALLBACK_URLS[0]`, e
`FALLBACK_URLS[0]` é `http://127.0.0.1:8787` — esse default **não passa** pelo filtro
`isPageSecure` que existe só pra lista de fallback. Em produção HTTPS sem
`options.bridgeUrl` explícito, a tentativa primária já é bloqueada como mixed content
pelo navegador, e como todos os `FALLBACK_URLS` também são `http://`, o array
filtrado fica vazio — o adapter nunca conecta, silenciosamente. Aplicar o mesmo
filtro ao valor default antes de qualquer outra mudança do v2.

## Copy-trade aware

`Account { copyGroup?: string, copyMultiplier?: number, lotStep?: number }` (definido
em `00-DOMAIN_MODEL.md`). Ao abrir posição pelo celular numa conta com `copyGroup`
definido:

1. UI mostra preview: "vai replicar para E8 50K ×0.5, Apex ×1" **antes** de enviar,
   nunca depois.
2. Cada réplica calcula `qty = qtyOriginal * copyMultiplier`, arredondado pro
   `lotStep` da conta de destino (nunca lote fracionário abaixo do mínimo negociável
   do símbolo/conta — sem `lotStep` isso quebra silenciosamente ou a corretora rejeita
   com erro genérico).
3. Cada réplica é uma chamada `/positions/open` separada com seu próprio
   `clientOrderId` — nunca uma "ordem em lote" que trata o grupo como atômico (se uma
   conta rejeitar, as outras não devem ser desfeitas, só a UI mostra qual falhou).
4. Deep-link "abrir no Quantower na conta X" (`quantower://` ou similar,
   **NÃO VERIFICADO se o Quantower expõe URL scheme próprio — confirmar com a
   documentação do Quantower antes de prometer isso na UI**) quando a ação precisar do
   desktop (ex: ajuste fino que o bridge v2 ainda não cobre).

## Testes (demo, antes de qualquer conta real)

- [ ] Request sem `X-Bridge-Token` em qualquer rota → `401`.
- [ ] `POST /positions/open` com `clientOrderId` repetido → mesma resposta, sem
      segunda ordem no Quantower (checar manualmente no terminal).
- [ ] Handshake: subir bridge com `version` diferente do `EXPECTED_BRIDGE_VERSION` do
      app → banner aparece, nenhuma chamada de escrita é tentada.
- [ ] Fechar bridge no meio de um `/positions/open` → app mostra erro `retryable:true`,
      nunca mostra sucesso sem confirmação real.
- [ ] Copy-group: abrir 1 posição numa conta-mestre com 2 réplicas configuradas,
      confirmar 3 `clientOrderId` distintos e 3 posições reais no Quantower.
