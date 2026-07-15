# Configura o Task Scheduler para reativar o Tailscale Funnel ao acordar da hibernação
# Deve ser executado como Administrador

$taskName = "QuantowerBridge-Funnel"
$actionPath = "$env:ProgramFiles\Tailscale\tailscale.exe"

# Verifica se o Tailscale existe
if (-not (Test-Path $actionPath)) {
    Write-Host "Tailscale não encontrado em $actionPath" -ForegroundColor Red
    exit 1
}

# Define os gatilhos
$triggers = @(
    # Inicialização do Windows
    New-ScheduledTaskTrigger -AtStartup -RandomDelay (New-TimeSpan -Seconds 30)
)

# Adiciona gatilho de wake (Event ID 107 = resume from sleep/hibernate)
$wakeTrigger = New-CimInstance -ClassName MSFT_TaskEventTrigger -Namespace "Root\Microsoft\Windows\TaskScheduler:MSFT_TaskEventTrigger" -Property @{
    Enabled = $true
    Subscription = @"
<QueryList><Query Id="0" Path="System"><Select Path="System">*[System[Provider[@Name='Microsoft-Windows-Kernel-Power'] and (EventID=107)]]</Select></Query></QueryList>
"@
}
$triggers += $wakeTrigger

# Define a ação
$action = New-ScheduledTaskAction -Execute $actionPath -Argument "funnel --bg 8787"

# Configurações
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -AllowHardTerminate:$false `
    -MultipleInstances IgnoreNew

# Se a tarefa já existe, atualiza; senão, cria
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

Register-ScheduledTask -TaskName $taskName `
    -Action $action `
    -Trigger $triggers `
    -Settings $settings `
    -RunLevel Highest `
    -Force

Write-Host "✅ Tarefa '$taskName' configurada com:"
Write-Host "   - Gatilho: Inicialização do Windows (+30s)"
Write-Host "   - Gatilho: Ao acordar de hibernação/suspensão"
Write-Host ""
Write-Host "Teste com: Get-ScheduledTask -TaskName '$taskName' | fl"
