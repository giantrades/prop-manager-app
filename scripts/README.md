# QuantowerBridge — Setup

## O que é

O **QuantowerBridge** é uma strategy C# que roda dentro do Quantower e expõe uma API HTTP com seus dados de trading (posições, trades, contas). Um webapp companion consome essa API para sincronizar dados automaticamente.

O **Tailscale Funnel** permite acessar o bridge de qualquer lugar (pelo celular, por exemplo) sem abrir portas no roteador ou configurar DNS.

## Como usar num PC novo

### Pré-requisitos

- Windows 10/11
- Conta Tailscale (gratuita em [tailscale.com](https://tailscale.com))
- Quantower instalado
- Node.js 18+ ([nodejs.org](https://nodejs.org))
- Git ([git-scm.com](https://git-scm.com))

### 1. Clone o repositório

```powershell
cd C:\Users\Gian\Desktop
git clone <url-do-repositorio> apps
```

### 2. Execute o setup

**Como Administrador:**

```powershell
cd C:\Users\Gian\Desktop\apps\scripts
.\setup-new-pc.bat
```

O script vai:
- Instalar Tailscale (se não tiver)
- Reservar a URL ACL para porta 8787
- Copiar o QuantowerBridge.dll para a pasta de Strategies
- Criar tarefa no Agendador para iniciar o Funnel no boot
- Ativar o Tailscale Funnel na porta 8787
- Compilar o webapp (npm install + build)

### 3. Inicie a strategy no Quantower

1. Abra o Quantower
2. Vá em **Strategies Manager**
3. Localize **QuantowerBridge**
4. Clique em **Start**
5. Verifique se **Allow External Access** está marcado como **True**

### 4. Teste

No PowerShell:

```powershell
curl http://localhost:8787/status
curl https://gian-note.tailbafabd.ts.net/status
```

No celular (com Tailscale instalado):

```
https://gian-note.tailbafabd.ts.net/status
```

## Como funciona

```
Celular/Notebook                    PC com Quantower
┌──────────────┐                   ┌──────────────────────┐
│ Chrome       │                   │ Quantower            │
│ Netlify app  │                   │   ┌──────────────┐   │
│ (HTTPS)      │                   │   │ Bridge DLL   │   │
│              │                   │   │ :8787        │   │
│ ┌──────────┐ │                   │   └──────────────┘   │
│ │Adapter   │─┼── HTTPS ─────────┼──▶ HTTP localhost     │
│ │fetch()   │ │  Tailscale       │                      │
│ └──────────┘ │  Funnel          │                      │
└──────────────┘                   └──────────────────────┘
```

O Chrome (HTTPS) → Tailscale Funnel (público) → PC → localhost:8787 (HTTP)

## Comandos úteis

| Comando | O que faz |
|---------|-----------|
| `tailscale funnel 8787` | Ativa o túnel público |
| `tailscale funnel status` | Mostra status do túnel |
| `netsh http show urlacl` | Lista reservas de URL |
| `npm run build` | Compila o webapp |


## Resolução de problemas

### 503 Service Unavailable

O listener do bridge parou. No Quantower:
1. Pare a strategy (Stop)
2. Inicie novamente (Start)

### Chrome bloqueia requisições (Private Network Access)

O webapp foi servido pelo Netlify (HTTPS) e tenta acessar `localhost` (HTTP). Solução:
- Use a URL do Funnel (`https://gian-note.tailbafabd.ts.net`) configurada no app
- Ou sirva o webapp localmente via `serve` + Funnel

### Funnel caiu

```powershell
tailscale funnel 8787
```

O Agendador de Tarefas reinicia automaticamente no boot.

## Recompilar o bridge DLL

No Quantower Algo:
1. Abra `quantower-bridge\QuantowerBridge.cs`
2. Pressione **Ctrl+Shift+B**
3. O DLL será gerado em `quantower-bridge\bin\Debug\QuantowerBridge.dll`
4. Copie para `C:\Quantower\Settings\Scripts\Strategies\QuantowerBridge\`
5. No Quantower, pare e inicie a strategy
