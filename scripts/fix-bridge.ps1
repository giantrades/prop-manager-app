<#
  fix-bridge.ps1 - Recupera o QuantowerBridge apos reboot / hibernacao.

  Causa raiz do "unexpected state: NoState" no Windows: o NlaSvc (Reconhecimento
  de Locais de Rede) sobe tarde/parado e o tailscaled fica travado "starting".
  A correcao e: garantir NlaSvc e REINICIAR o servico Tailscale. A GUI
  (tailscale-ipn.exe) NAO e necessaria para o app (ele fala com o bridge HTTP) e,
  se iniciada antes do tray existir, quebra com "walk.NewNotifyIcon". Por isso ela
  e apenas um ULTIMO recurso, depois do shell pronto.

  O que ele faz (em ordem):
    1. Garante os servicos de rede (nsi / netprofm / NlaSvc).
    2. Tenta conectar SEM a GUI; se travar, reinicia o servico Tailscale.
    3. Ultimo recurso: sobe a GUI/IPN (apos o Explorer/tray estar pronto).
    4. Aplica o Tailscale Funnel na porta 8787.
    5. Verifica o bridge local (http://127.0.0.1:8787/status com o token).
    6. Verifica o acesso publico (https://gian-note.tailbafabd.ts.net).
    7. Instala a automacao: tarefa agendada "QuantowerBridge-AutoRecover" que roda
       este script (-Silent) a cada logon, e remove o atalho antigo da GUI.

  Uso:
    .\fix-bridge.ps1                 -> recupera e instala a automacao
    .\fix-bridge.ps1 -NoAutoStart    -> recupera sem instalar a automacao
    .\fix-bridge.ps1 -RemoveAutoStart-> remove a automacao
    .\fix-bridge.ps1 -Silent         -> modo headless (usado pela tarefa agendada)
    .\fix-bridge.ps1 -Help           -> ajuda

  Precisa de Administrador para os passos de servico (o script pede elevacao
  sozinho quando rodado interativamente; no modo -Silent ele nao eleva).
#>
param(
  [switch]$NoAutoStart,
  [switch]$RemoveAutoStart,
  [switch]$Silent,
  [switch]$Help
)

$ErrorActionPreference = 'Continue'

$tsExe       = Join-Path $env:ProgramFiles 'Tailscale\tailscale.exe'
$ipnExe      = Join-Path $env:ProgramFiles 'Tailscale\tailscale-ipn.exe'
$port        = 8787
$funnel      = 'gian-note.tailbafabd.ts.net'
$tokenFile   = Join-Path $env:LOCALAPPDATA 'QuantowerBridge\token.txt'
$autoLnk     = Join-Path ([Environment]::GetFolderPath('Startup')) 'Tailscale.lnk'
$recoverTask = 'QuantowerBridge-AutoRecover'
$keepTask    = 'QuantowerBridge-Funnel-KeepAlive'
$logFile     = Join-Path $env:TEMP 'QuantowerBridge-Recover.log'

function Emit {
  param([string]$m, [string]$color = 'Gray')
  try { Add-Content -LiteralPath $logFile -Value ("[" + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + "] " + $m) -ErrorAction SilentlyContinue } catch {}
  if (-not $Silent) { Write-Host $m -ForegroundColor $color }
}
function Write-Ok   { param([string]$m) Emit "  [OK] $m" 'Green' }
function Write-Warn { param([string]$m) Emit "  [!]  $m" 'Yellow' }
function Write-Bad  { param([string]$m) Emit "  [X]  $m" 'Red' }
function Write-Step { param([string]$m) Emit ""; Emit "== $m" 'Cyan' }

function Get-TsIp {
  $out = & $tsExe ip -4 2>$null
  if ($LASTEXITCODE -eq 0 -and $out) { return ($out | Select-Object -First 1).Trim() }
  return $null
}
function Wait-TsIp {
  param([int]$seconds, [switch]$Nudge)
  $ip = $null
  for ($i = 0; $i -lt $seconds; $i++) {
    $ip = Get-TsIp
    if ($ip) { return $ip }
    if ($Nudge -and $i -in 4, 12) { & $tsExe up 2>$null | Out-Null }
    Start-Sleep -Seconds 1
  }
  return $null
}

if ($Help) {
  Get-Help $PSCommandPath -Detailed | Out-String | Write-Host
  exit 0
}

# --------------------------------------------------------------------------
# Admin (auto-elevacao - apenas no modo interativo)
# --------------------------------------------------------------------------
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin -and -not $Silent) {
  Write-Host 'Reabrindo como ADMINISTRADOR...' -ForegroundColor Yellow
  try {
    Start-Process powershell.exe -Verb RunAs -ArgumentList @(
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`""
    )
  } catch {
    Write-Bad 'Nao foi possivel elevar. Clique com o botao direito > Executar como administrador.'
    Start-Sleep -Seconds 5
  }
  exit
}

if ($RemoveAutoStart) {
  Unregister-ScheduledTask -TaskName $recoverTask -Confirm:$false -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $autoLnk -Force -ErrorAction SilentlyContinue
  Write-Ok "Automacao removida (tarefa '$recoverTask' + atalho da GUI)."
  exit 0
}

if (-not (Test-Path -LiteralPath $tsExe)) {
  Write-Bad "Tailscale nao encontrado em: $tsExe"
  Write-Warn 'Instale o Tailscale (https://tailscale.com/download) e rode de novo.'
  if (-not $Silent) { Read-Host 'Enter para sair' }
  exit 1
}

Emit '======================================================' 'White'
Emit ' QuantowerBridge - Recuperacao (Tailscale + Funnel)' 'White'
Emit '======================================================' 'White'

# --------------------------------------------------------------------------
# 1. Servicos de rede
# --------------------------------------------------------------------------
Write-Step '1/7 Servicos de rede (NLA / Lista de Redes)'
foreach ($svc in @('nsi', 'netprofm', 'NlaSvc')) {
  $s = Get-Service -Name $svc -ErrorAction SilentlyContinue
  if (-not $s) { Write-Warn "$svc nao existe"; continue }
  if ($s.Status -eq 'Running') { Write-Ok "$svc ja rodando" ; continue }
  try { Start-Service -Name $svc -ErrorAction Stop; Write-Ok "$svc iniciado" }
  catch { Write-Warn "$svc nao pode ser iniciado: $($_.Exception.Message)" }
}

# --------------------------------------------------------------------------
# 2. Conectar SEM a GUI (NlaSvc + restart do servico resolvem o NoState)
# --------------------------------------------------------------------------
Write-Step '2/7 Conectando (sem a GUI)'
$ip = Wait-TsIp -seconds 20 -Nudge
if ($ip) {
  Write-Ok "Tailscale conectado - IP $ip"
} else {
  Write-Warn 'NoState - reiniciando o servico Tailscale...'
  try { Restart-Service -Name Tailscale -Force -ErrorAction Stop; Write-Ok 'Servico Tailscale reiniciado' }
  catch { Write-Warn "Restart falhou: $($_.Exception.Message)" }
  Start-Sleep -Seconds 3
  $ip = Wait-TsIp -seconds 30 -Nudge
  if ($ip) { Write-Ok "Tailscale conectado - IP $ip" }
}

# --------------------------------------------------------------------------
# 3. Ultimo recurso: GUI/IPN (so depois do Explorer/tray pronto)
# --------------------------------------------------------------------------
if (-not $ip) {
  Write-Step '3/7 Ultimo recurso: GUI/IPN do Tailscale'
  Write-Warn 'Ainda em NoState - subindo a GUI (aguardando o tray)...'
  for ($i = 0; $i -lt 30; $i++) { if (Get-Process -Name 'explorer' -ErrorAction SilentlyContinue) { break }; Start-Sleep -Seconds 1 }
  Start-Sleep -Seconds 3
  if (-not (Get-Process -Name 'tailscale-ipn' -ErrorAction SilentlyContinue)) {
    try { Start-Process -FilePath $ipnExe -ErrorAction Stop; Write-Ok 'tailscale-ipn iniciado' }
    catch { Write-Warn "Falha ao iniciar tailscale-ipn: $($_.Exception.Message)" }
  }
  $ip = Wait-TsIp -seconds 40
  if ($ip) { Write-Ok "Tailscale conectado - IP $ip" }
  else { Write-Bad 'Tailscale NAO conectou. Veja as dicas no fim.' }
} else {
  Write-Step '3/7 Ultimo recurso: GUI/IPN'
  Write-Ok 'Nao precisou (conectou sem a GUI).'
}

# --------------------------------------------------------------------------
# 4. Funnel
# --------------------------------------------------------------------------
Write-Step '4/7 Tailscale Funnel'
if ($ip) {
  & $tsExe funnel --bg $port 2>$null | Out-Null
  $fs = (& $tsExe funnel status 2>$null) | Out-String
  if ($fs -match [regex]::Escape($funnel)) { Write-Ok "Funnel ativo: https://$funnel -> http://127.0.0.1:$port" }
  else { Write-Warn "Funnel nao confirmado. Rode manualmente: tailscale funnel --bg $port" }
} else {
  Write-Warn 'Pulado (Tailscale offline).'
}

# --------------------------------------------------------------------------
# 5. Bridge local
# --------------------------------------------------------------------------
Write-Step '5/7 Bridge local (porta 8787)'
if (Test-Path -LiteralPath $tokenFile) {
  $tok = (Get-Content -LiteralPath $tokenFile -Raw).Trim()
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:$port/status" -Headers @{ 'X-Bridge-Token' = $tok } -UseBasicParsing -TimeoutSec 5
    if ($r.StatusCode -eq 200) { Write-Ok "Bridge online. $($r.Content)" }
  } catch {
    Write-Warn "Bridge sem resposta: $($_.Exception.Message)"
    Write-Warn 'Abra o Quantower e rode a strategy "QuantowerBridge" (Strategies Manager > Run).'
  }
} else {
  Write-Warn "Token nao encontrado em: $tokenFile"
  Write-Warn 'Rode a strategy no Quantower uma vez para gerar o token.'
}

# --------------------------------------------------------------------------
# 6. Funnel publico (o que o celular usa)
# --------------------------------------------------------------------------
Write-Step '6/7 Verificacao publica (celular)'
if ($ip) {
  try {
    $r = Invoke-WebRequest -Uri "https://$funnel/status" -UseBasicParsing -TimeoutSec 15
    Write-Ok "https://$funnel responde HTTP $($r.StatusCode)"
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    if ($code -eq 401) { Write-Ok "https://$funnel responde 401 (bridge viva; o app envia o token)" }
    elseif ($code -eq 502) { Write-Warn "https://$funnel responde 502 (Funnel ok, mas o bridge local nao esta rodando - abra o Quantower)." }
    else { Write-Warn "Sem resposta publica ($code). Pode levar ~30s; tente de novo em instantes." }
  }
} else {
  Write-Warn 'Pulado (Tailscale offline).'
}

# --------------------------------------------------------------------------
# 7. Automacao: tarefa no logon (e remove o atalho antigo da GUI)
# --------------------------------------------------------------------------
if (-not $Silent -and -not $NoAutoStart) {
  Write-Step '7/7 Automacao (auto-recuperacao no logon)'

  # Remove o atalho antigo da GUI (subia cedo demais -> dialogo "walk.NewNotifyIcon").
  if (Test-Path -LiteralPath $autoLnk) {
    Remove-Item -LiteralPath $autoLnk -Force -ErrorAction SilentlyContinue
    Write-Ok "Atalho antigo da GUI removido: $autoLnk"
  }

  try {
    $act = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Silent"
    $trg = New-ScheduledTaskTrigger -AtLogOn -RandomDelay (New-TimeSpan -Seconds 30)
    $set = New-ScheduledTaskSettingsSet `
      -AllowStartIfOnBatteries `
      -DontStopIfGoingOnBatteries `
      -StartWhenAvailable `
      -ExecutionTimeLimit (New-TimeSpan -Minutes 10) `
      -RestartCount 2 `
      -RestartInterval (New-TimeSpan -Minutes 2)
    try {
      $prin = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Highest
      Register-ScheduledTask -TaskName $recoverTask -Action $act -Trigger $trg -Settings $set -Principal $prin -Force | Out-Null
    } catch {
      Register-ScheduledTask -TaskName $recoverTask -Action $act -Trigger $trg -Settings $set -Force | Out-Null
    }
    Write-Ok "Tarefa '$recoverTask' criada (roda -Silent no logon, +30s)."
  } catch {
    Write-Warn "Nao foi possivel criar a auto-recuperacao: $($_.Exception.Message)"
  }
} elseif (-not $Silent) {
  Write-Step '7/7 Automacao'
  Write-Warn 'Pulado (-NoAutoStart).'
}

# --------------------------------------------------------------------------
# Resumo
# --------------------------------------------------------------------------
Emit ''
Emit '------------------------------------------------------' 'White'
Emit ' Resumo' 'White'
Emit '------------------------------------------------------' 'White'
if ($ip) { Emit "  Tailscale:  CONECTADO ($ip)" 'Green' }
else     { Emit "  Tailscale:  OFFLINE (NoState)" 'Red' }
if (Get-ScheduledTask -TaskName $recoverTask -ErrorAction SilentlyContinue) {
  Emit "  Auto-recover: '$recoverTask' presente" 'Green'
} else {
  Emit "  Auto-recover: ausente" 'Yellow'
}
Emit ''
Emit '  App no PC:      use Bridge URL  http://127.0.0.1:8787' 'Gray'
Emit "  App no celular: use Bridge URL  https://$funnel" 'Gray'
Emit "  Token:          $tokenFile (mesmo nos dois)" 'Gray'
Emit ''
if (-not $ip) {
  Emit '  Se continuar NoState:' 'Yellow'
  Emit '   1. Abra o app do Tailscale na bandeja e clique Connect / Log in.' 'Yellow'
  Emit '   2. Reinicie o PC.' 'Yellow'
  Emit '   3. Se persistir: Configuracoes > Apps > Tailscale > Reparar.' 'Yellow'
  Emit ''
}
Emit "  Log: $logFile" 'Gray'
Emit ''
if (-not $Silent) { Read-Host 'Pressione Enter para fechar' }
