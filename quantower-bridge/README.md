# QuantowerBridge — Local HTTP Bridge (v2)

Plugin C# que roda dentro do Quantower e expõe um servidor HTTP local para o webapp fazer auto-sync,
abrir/editar/fechar posições pelo celular e copy-trade.

## Setup

### 1. Abrir no Visual Studio
- Instale a extensão **Quantower Algo** no Visual Studio 2022
- Crie um novo projeto Quantower Strategy
- Substitua o código pelo conteúdo de `QuantowerBridge.cs`

### 2. Compilar
- Build → Build Solution (Ctrl+Shift+B)
- O .dll será gerado automaticamente

### 3. Instalar no Quantower
- Abra o Quantower
- Vá em **Strategies Manager**
- O strategy "BridgeStrategy" aparecerá automaticamente
- Clique **Run** para iniciar o bridge

### 4. Parear o token
- No primeiro run, o bridge gera um token (GUID) e salva em
  `%LOCALAPPDATA%\QuantowerBridge\token.txt`
- Copie esse token para o `.env`/config do app (`BRIDGE_TOKEN`).
- **Toda rota exige o header `X-Bridge-Token: <token>`** — sem ele, `401`.

### 5. Verificar
Abra no browser: `http://localhost:8787/status`

```json
{
  "online": true,
  "version": "2.0.0",
  "build": "2.0.0-202601011200",
  "platform": "quantower",
  "connectionsCount": 2,
  "connections": []
}
```

## Autenticação (v2)

- Header obrigatório: `X-Bridge-Token: <token>` em **todas** as rotas, sem exceção
  (inclusive `/positions/close`, que no v1 não pedia nada).
- Token inválido/ausente → `401` com `{ success: false, error: { code: "invalid_token", ... } }`.
- Rotação: rode o bridge com `--rotate-token` (regenera o token e o app precisa reparear).
- O header `Access-Control-Allow-Private-Network` foi **removido** (04-BRIDGE_V2_SPEC.md).

## Endpoints

### Leitura

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/status` | GET | Status + `version` + `build` (handshake do cliente) |
| `/health` | GET | `{ status, timestamp, version }` |
| `/accounts` | GET | Todas as contas de todas as connections |
| `/trades` | GET | Histórico de trades (optional: `?from=&to=`) |
| `/positions` | GET | Posições abertas com P&L em tempo real |
| `/orders` | GET | Ordens pendentes |
| `/stream` | GET (SSE) | Stream contínuo de posições+ordens (`text/event-stream`, ~1.5s). Auth por `?token=` (EventSource não manda header) |

### Escrita (toda resposta `{ success, platformPositionId?, platformOrderId?, error? }`)

| Endpoint | Método | Body | Retorno |
|----------|--------|------|---------|
| `/positions/open` | POST | `{ accountId, symbol, side:'buy'\|'sell', qty, sl?, tp?, note?, clientOrderId }` | `{ success, platformPositionId, filledPrice, filledQty }` |
| `/positions/modify` | POST | `{ platformPositionId, sl?, tp?, clientOrderId }` | `{ success, platformPositionId }` |
| `/positions/close` | POST | `{ id, clientOrderId }` | `{ success }` |
| `/orders/place` | POST | `{ accountId, symbol, side, qty, type:'limit'\|'stop', price, sl?, tp?, clientOrderId }` | `{ success, platformOrderId }` |
| `/orders/cancel` | POST | `{ platformOrderId, clientOrderId }` | `{ success }` |

## Streaming (SSE) — posições em tempo real

`GET /stream?token=<token>` mantém a conexão aberta e envia, a cada ~1.5s, um evento
`data: { positions, orders, timestamp }`. O app (`usePlatform`) abre via `EventSource`
quando o bridge está online e cai para polling (60s) se não puder.

- **Desktop**: praticamente tempo real com o app aberto.
- **Celular**: funciona **com o app em primeiro plano**. iOS/Android suspendem conexões
  quando o app vai para segundo plano — por isso o botão **"Manter tela ligada"**
  (Screen Wake Lock) em Positions & Orders, e o **Web Push** para alertas com o app fechado.
- **Rede**: no celular, exponha o bridge via **Tailscale** (URL `https://…ts.net`) — SSE
  exige HTTPS quando a página é HTTPS (evita mixed content). O token vai na query porque
  `EventSource` não permite header customizado; use só em rede privada/Tailscale.

## Idempotência

Toda escrita carrega `clientOrderId` (UUID gerado pelo app). O bridge guarda os últimos
200 `clientOrderId` (ou 10 min) — reenvio do mesmo `clientOrderId` retorna a mesma resposta
sem reenviar a ordem pro Quantower.

## Contrato de erro

```json
{ "success": false, "error": { "code": "...", "message": "...", "retryable": true } }
```

Códigos: `insufficient_margin | symbol_closed | market_closed | invalid_token |
position_not_found | order_not_found | quantower_disconnected | duplicate_client_order_id | unknown`.

## Configuração

- **Port**: Porta do servidor (default: 8787). Configurável nos parâmetros da strategy.
- **Allow External Access**: Se true, aceita conexões de outros PCs na rede (ex.: via Tailscale).

## Recuperação após reboot / hibernação

Depois de desligar o PC, o fluxo remoto (celular) depende de 3 partes: o **Quantower**
rodando a strategy `QuantowerBridge` (não auto-inicia), o **Tailscale** conectado e o
**Funnel** aplicado na porta 8787.

Sintoma clássico: `tailscale status` retorna `unexpected state: NoState` (ou "Tailscale is
starting"). Isso acontece quando a **GUI/IPN** (`tailscale-ipn.exe`) não subiu no logon —
o serviço `Tailscale` roda, mas o backend nunca conecta.

Recuperação em um clique (PowerShell **como administrador**):

```powershell
scripts\fix-bridge.bat
# ou
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\fix-bridge.ps1
```

O script: sobe `NlaSvc`/`netprofm`, inicia `tailscale-ipn`, espera o Tailscale sair do
`NoState`, reinicia o serviço se travar, reaplica `tailscale funnel --bg 8787`, verifica o
bridge local (`/status` com token) e o acesso público, e cria um atalho da GUI na pasta
Inicializar (evita o `NoState` voltar no próximo boot) — remova com `-RemoveAutoStart`.

Endereços: **PC** = `http://127.0.0.1:8787`; **celular** = `https://gian-note.tailbafabd.ts.net`.

