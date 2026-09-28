<#
  fix-bridge.ps1 - Recupera o QuantowerBridge apos reboot / hibernacao.

  O que ele faz (em ordem):
    1. Garante os servicos de rede (nsi / netprofm / NlaSvc).
    2. Sobe o processo da GUI/IPN do Tailscale (tailscale-ipn.exe) - esta e a causa
       do "unexpected state: NoState" quando a GUI nao inicia no logon.
    3. Espera o Tailscale sair do NoState e pegar um IP (100.x). Se travar,
       reinicia o servico do Tailscale e tenta de novo.
    4. Aplica o Tailscale Funnel na porta 8787.
    5. Verifica o bridge local (http://127.0.0.1:8787/status com o token).
    6. Verifica o acesso publico (https://gian-note.tailbafabd.ts.net).
    7. Instala a automacao: atalho da GUI na pasta Inicializar + tarefa agendada
       "QuantowerBridge-AutoRecover" que roda este script (-Silent) a cada logon.

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
  Remove-Item -LiteralPath $autoLnk -Force -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $recoverTask -Confirm:$false -ErrorAction SilentlyContinue
  Write-Ok "Automacao removida (atalho + tarefa '$recoverTask')."
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
# 2. GUI / IPN do Tailscale (causa do NoState)
# --------------------------------------------------------------------------
Write-Step '2/7 Processo da GUI/IPN do Tailscale'
if (Get-Process -Name 'tailscale-ipn' -ErrorAction SilentlyContinue) {
  Write-Ok 'tailscale-ipn ja rodando'
} elseif (Test-Path -LiteralPath $ipnExe) {
  try { Start-Process -FilePath $ipnExe -ErrorAction Stop; Write-Ok 'tailscale-ipn iniciado' }
  catch { Write-Warn "Falha ao iniciar tailscale-ipn: $($_.Exception.Message)" }
} else {
  Write-Warn "tailscale-ipn.exe nao encontrado em: $ipnExe"
}

# --------------------------------------------------------------------------
# 3. Esperar conectar (sair do NoState)
# --------------------------------------------------------------------------
Write-Step '3/7 Conectando (saindo do NoState)'
function Get-TsIp {
  $out = & $tsExe ip -4 2>$null
  if ($LASTEXITCODE -eq 0 -and $out) { return ($out | Select-Object -First 1).Trim() }
  return $null
}

$ip = $null
for ($i = 0; $i -lt 30; $i++) {
  $ip = Get-TsIp
  if ($ip) { break }
  if ($i -eq 4 -or $i -eq 12) { & $tsExe up 2>$null | Out-Null }   # empurrao
  Start-Sleep -Seconds 2
}

if (-not $ip) {
  Write-Warn 'Ainda em NoState - reiniciando o servico do Tailscale...'
  try { Restart-Service -Name Tailscale -Force -ErrorAction Stop; Write-Ok 'Servico Tailscale reiniciado' }
  catch { Write-Warn "Restart falhou: $($_.Exception.Message)" }
  Start-Sleep -Seconds 3
  if (-not (Get-Process -Name 'tailscale-ipn' -ErrorAction SilentlyContinue)) {
    Start-Process -FilePath $ipnExe -ErrorAction SilentlyContinue
  }
  for ($i = 0; $i -lt 20; $i++) { $ip = Get-TsIp; if ($ip) { break }; Start-Sleep -Seconds 2 }
}

if ($ip) { Write-Ok "Tailscale conectado - IP $ip" }
else { Write-Bad 'Tailscale NAO conectou (NoState persistente). Veja as dicas no fim.' }

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
    else { Write-Warn "Sem resposta publica ($code). Pode levar ~30s; tente de novo em instantes." }
  }
} else {
  Write-Warn 'Pulado (Tailscale offline).'
}

# --------------------------------------------------------------------------
# 7. Automacao (atalho da GUI + tarefa de auto-recuperacao no logon)
# --------------------------------------------------------------------------
if (-not $Silent -and -not $NoAutoStart) {
  Write-Step '7/7 Automacao (atalho + auto-recuperacao no logon)'

  # 7a. Atalho da GUI na pasta Inicializar (faz o Tailscale conectar no logon).
  try {
    $sh = New-Object -ComObject WScript.Shell
    $lnk = $sh.CreateShortcut($autoLnk)
    $lnk.TargetPath = $ipnExe
    $lnk.WorkingDirectory = Split-Path -Parent $ipnExe
    $lnk.Description = 'Inicia a GUI/IPN do Tailscale no logon (evita NoState).'
    $lnk.Save()
    Write-Ok "Atalho criado: $autoLnk"
  } catch {
    Write-Warn "Nao foi possivel criar o atalho: $($_.Exception.Message)"
  }

  # 7b. Tarefa agendada no logon: reaplica o Funnel sozinho apos o Tailscale conectar.
  try {
    $act = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Silent"
    $trg = New-ScheduledTaskTrigger -AtLogOn -RandomDelay (New-TimeSpan -Seconds 20)
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
    Write-Ok "Tarefa '$recoverTask' criada (roda -Silent no logon)."
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
if (Get-ScheduledTask -TaskName $keepTask -ErrorAction SilentlyContinue) {
  Emit "  KeepAlive:  '$keepTask' presente" 'Green'
} else {
  Emit "  KeepAlive:  ausente (rode scripts\setup-tailscale-funnel.ps1)" 'Yellow'
}
Emit ''
Emit '  App no PC:      use Bridge URL  http://127.0.0.1:8787' 'Gray'
Emit "  App no celular: use Bridge URL  https://$funnel" 'Gray'
Emit "  Token:          $tokenFile (mesmo nos dois)" 'Gray'
Emit ''
if (-not $ip) {
  Emit '  Se continuar NoState:' 'Yellow'
  Emit '   1. Abra o app do Tailscale na bandeja e clique Connect / Log in.' 'Yellow'
  Emit '   2. Reinicie o PC (entra limpo com a GUI subindo no logon).' 'Yellow'
  Emit '   3. Se persistir: Configuracoes > Apps > Tailscale > Reparar.' 'Yellow'
  Emit ''
}
Emit "  Log: $logFile" 'Gray'
Emit ''
if (-not $Silent) { Read-Host 'Pressione Enter para fechar' }
