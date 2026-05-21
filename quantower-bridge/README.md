# QuantowerBridge — Local HTTP Bridge

Plugin C# que roda dentro do Quantower e expõe um servidor HTTP local para o webapp fazer auto-sync.

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

### 4. Verificar
Abra no browser: `http://localhost:8787/status`

Deve retornar algo como:
```json
{
  "online": true,
  "version": "1.0.0",
  "platform": "quantower",
  "connectionsCount": 2,
  "connections": [
    { "id": "rithmic-1", "name": "Rithmic" },
    { "id": "dxfeed-1", "name": "DXFeed" }
  ]
}
```

## Endpoints

| Endpoint | Descrição |
|----------|-----------|
| `GET /status` | Status do bridge + connections ativas |
| `GET /accounts` | Todas as contas de todas as connections |
| `GET /trades` | Histórico de trades (optional: `?from=2025-01-01&to=2025-04-28`) |
| `GET /positions` | Posições abertas com P&L em tempo real |
| `GET /orders` | Ordens pendentes |

## Configuração

- **Port**: Porta do servidor (default: 8787). Configurável nos parâmetros da strategy.
- **Allow External Access**: Se true, aceita conexões de outros PCs na rede.
