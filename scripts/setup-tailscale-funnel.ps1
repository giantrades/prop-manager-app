# Creates a Windows Scheduled Task that keeps Tailscale Funnel active on port 8787.
# Runs on startup AND on user logon (catches resume from sleep/hibernation).
# Waits for the tailscaled service to be ready before applying the funnel.
#
# Usage: Right-click > "Run with PowerShell" (Admin)
#        Or: powershell -ExecutionPolicy Bypass -File setup-tailscale-funnel.ps1

param(
    [switch]$Remove,
    [switch]$Help
)

$taskName = "QuantowerBridge-Funnel-KeepAlive"
$port = 8787
$tailscaleExe = "$env:ProgramFiles\Tailscale\tailscale.exe"
$logFile = "$env:TEMP\QuantowerBridge-Funnel.log"

if ($Help) {
    Write-Host "Usage: .\setup-tailscale-funnel.ps1 [-Remove]" -ForegroundColor Cyan
    Write-Host "  -Remove   Removes the scheduled task" -ForegroundColor Cyan
    exit 0
}

# Admin check
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[!] Este script precisa ser executado COMO ADMINISTRADOR." -ForegroundColor Red
    Write-Host "    Clique com botao direito > 'Executar como PowerShell (Admin)'" -ForegroundColor Yellow
    exit 1
}

# Remove mode
if ($Remove) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "[-] Tarefa '$taskName' removida." -ForegroundColor Yellow
    exit 0
}

# Check Tailscale
if (-not (Test-Path $tailscaleExe)) {
    Write-Host "[!] Tailscale nao encontrado em: $tailscaleExe" -ForegroundColor Red
    Write-Host "    Instale de: https://tailscale.com/download" -ForegroundColor Yellow
    exit 1
}

# Remove existing task if present
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

# ── The PowerShell command that the task will execute ──
# - Waits for tailscaled to be ready
# - Applies funnel on port 8787
# - Logs to temp file for debugging
$actionScript = @"
`$logFile = '$logFile'
`$tailscale = '$tailscaleExe'
`$port = $port

Add-Content -Path `$logFile -Value "[`$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Funnel keepalive starting..." -Force

# Wait for tailscaled service to be ready (up to 60s)
for (`$i = 0; `$i -lt 60; `$i++) {
    try {
        `$status = & `$tailscale status --peers=false 2>&1
        if (`$LASTEXITCODE -eq 0) {
            Add-Content -Path `$logFile -Value "[`$(Get-Date -Format 'HH:mm:ss')] tailscaled is ready"
            break
        }
    } catch {}
    Start-Sleep 1
}

# Apply funnel (--bg = background, persiste com o serviço tailscaled)
try {
    & `$tailscale funnel --bg `$port
    Add-Content -Path `$logFile -Value "[`$(Get-Date -Format 'HH:mm:ss')] Funnel --bg applied on port `$port"
} catch {
    Add-Content -Path `$logFile -Value "[`$(Get-Date -Format 'HH:mm:ss')] ERROR: `$_"
}
"@

# ── Triggers ──
# 1) At startup (delay 30s) - catches boot even before login
$triggers = @(
    New-ScheduledTaskTrigger -AtStartup -RandomDelay (New-TimeSpan -Seconds 30)
)

# 2) At user logon (delay 10s) - catches resume from sleep/hibernation
$logonTrigger = New-ScheduledTaskTrigger -AtLogon -RandomDelay (New-TimeSpan -Seconds 10)
$triggers += $logonTrigger

# ── Action: runs the PowerShell script block ──
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoLogo -WindowStyle Hidden -ExecutionPolicy Bypass -Command `"$actionScript`""

# ── Settings ──
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Hours 1)

# ── Register ──
Register-ScheduledTask -TaskName $taskName `
    -Action $action `
    -Trigger $triggers `
    -Settings $settings `
    -RunLevel Highest `
    -Force

Write-Host ""
Write-Host "✅ Tarefa '$taskName' configurada:" -ForegroundColor Green
Write-Host "   - Trigger: Inicializacao do Windows (delay 30s)" -ForegroundColor Cyan
Write-Host "   - Trigger: Login do usuario (delay 10s, cobre acordar de hibernacao/suspensao)" -ForegroundColor Cyan
Write-Host "   - Acao: espera tailscaled ficar pronto, depois aplica funnel :$port" -ForegroundColor Cyan
Write-Host "   - Log: $logFile" -ForegroundColor Gray
Write-Host ""
Write-Host "Para testar agora, execute no mesmo terminal:" -ForegroundColor Yellow
Write-Host "   & '$tailscaleExe' funnel $port" -ForegroundColor White
Write-Host ""
Write-Host "Para remover a tarefa:" -ForegroundColor Yellow
Write-Host "   powershell -File '$(Join-Path $PSScriptRoot setup-tailscale-funnel.ps1)' -Remove" -ForegroundColor White
