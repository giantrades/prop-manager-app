# QuantowerBridge — Setup de PC Novo

Passo a passo para configurar uma máquina Windows do zero com Tailscale, bridge e Funnel.

---

## Pré-requisitos

- Windows 10/11
- Conta Tailscale gratuita em [tailscale.com](https://tailscale.com)
- Quantower instalado e logado
- Node.js 18+ ([nodejs.org](https://nodejs.org))
- Git ([git-scm.com](https://git-scm.com))

---

## Setup rápido (automático)

```powershell
# Como Administrador:
cd C:\Users\Gian\Desktop\apps\scripts
.\setup-new-pc.bat
```

O script faz tudo: instala Tailscale, copia a DLL, configura o Funnel, cria a tarefa no Agendador e compila o webapp. Ao final, reinicie o Quantower e inicie a strategy **QuantowerBridge**.

---

## Setup manual (passo a passo)

### 1. Instalar Tailscale

```powershell
winget install --name Tailscale.Tailscale
```

Ou baixe de [tailscale.com/download](https://tailscale.com/download).

Após instalar, faça login e confirme que aparece **Connected** na bandeja do sistema. Anote o nome da máquina (ex: `gian-note`).

### 2. Reservar URL ACL (uma vez)

```powershell
netsh http add urlacl url=http://+:8787/ user=Everyone
```

Permite que qualquer aplicação escute na porta 8787 sem precisar de admin toda vez.

### 3. Configurar Tailscale Funnel (uma vez)

```powershell
# Ativa o túnel público na porta 8787 (--bg = background, persiste com o serviço)
tailscale funnel --bg 8787

# Testa se está no ar
curl https://gian-note.tailf...:8787/status
```

A configuração do Funnel fica salva no servidor do Tailscale. O `--bg` faz o túnel rodar como parte do serviço `tailscaled` — persiste após reboot e não depende de terminal aberto.

### 4. Criar tarefa no Agendador (keepalive)

Para garantir que o Funnel volte automaticamente após boot/hibernação:

**Script #1 (startup + wake via Event ID 107):**
```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup-wake-trigger.ps1
```

**Script #2 (startup + logon, mais robusto — recomendado):**
```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup-tailscale-funnel.ps1
```

Diferença:

| Script | Triggers | Aguarda tailscaled? | Log |
|---|---|---|---|
| `setup-wake-trigger.ps1` | startup + Event ID 107 (kernel resume) | Não | Não |
| `setup-tailscale-funnel.ps1` | startup + user logon (cobre resume) | Sim (até 60s) | Sim (`%TEMP%\QuantowerBridge-Funnel.log`) |

Use o **script #2** (`setup-tailscale-funnel.ps1`) — é mais confiável.

### 5. Compilar e copiar bridge DLL

No Quantower, abra o **Quantower Algo**, abra o arquivo `QuantowerBridge.cs`, pressione **Ctrl+Shift+B**. O DLL será gerado em `quantower-bridge\bin\Debug\QuantowerBridge.dll`.

Copie para a pasta de strategies do Quantower:

```powershell
copy QuantowerBridge.dll "C:\Quantower\Settings\Scripts\Strategies\QuantowerBridge\"
```

### 6. Iniciar a strategy no Quantower

1. Abra o Quantower
2. Vá em **Strategies Manager**
3. Localize **QuantowerBridge**
4. Clique em **Start**
5. Verifique se **Allow External Access** está como **True**

### 7. Testar

```powershell
# Local (funciona sempre)
curl http://localhost:8787/status

# Via Funnel (qualquer dispositivo na internet)
curl https://gian-note.tailf...:8787/status
```

### 8. Configurar URL no app

No Settings do journal, a URL da bridge deve ser:

```
https://gian-note.tailf...:8787
```

> ⚠️ A porta `:8787` é obrigatória. Sem ela o Tailscale Serve padrão (porta 443/80) não roteia para a bridge.

---

## Se trocar de máquina principal

1. Instalar Tailscale na máquina nova e fazer login
2. Rodar `tailscale funnel 8787` (uma vez)
3. Rodar `setup-tailscale-funnel.ps1` (cria tarefa keepalive)
4. Instalar Quantower e copiar bridge DLL
5. Instalar Node.js + Git, clonar o repositório
6. Rodar `pnpm install && pnpm build:journal`
7. Iniciar a strategy no Quantower

---

## Troubleshooting

### 503 Service Unavailable (localhost:8787)

A bridge não está rodando. No Quantower: pare e inicie a strategy.

### ERR_CONNECTION_CLOSED (HTTPS Funnel)

- O Funnel caiu. Rode `tailscale funnel --bg 8787`
- Verifique o log em `%TEMP%\QuantowerBridge-Funnel.log`
- Verifique se o Tailscale está conectado (ícone na bandeja)
- Verifique o status: `tailscale funnel status`

### Mixed Content (HTTPS → HTTP)

O app no Netlify (HTTPS) tentou acessar `http://localhost:8787`. Use a URL do Funnel com `https://`.

### CORS bloqueado

A bridge precisa enviar headers CORS. Verifique no código do bridge se `Access-Control-Allow-Origin: *` está sendo enviado nas respostas HTTP.

---

## Scripts disponíveis

| Script | O que faz |
|---|---|
| `setup-new-pc.bat` | Automação completa de setup (admin) |
| `setup-wake-trigger.ps1` | Cria tarefa agendada com startup + wake (Event ID 107) |
| `setup-tailscale-funnel.ps1` | Cria tarefa agendada com startup + logon, aguarda tailscaled, com log |
| `merge-builds.js` | Utilitário de build |
| `migrate-to-supabase.ts` | Migração de dados |
