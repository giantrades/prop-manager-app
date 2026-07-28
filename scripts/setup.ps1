param([switch]$Remove)

$ErrorActionPreference = 'Stop'
$hostname = 'gian-note.tailbafabd.ts.net'
$ip = '100.80.100.89'
$hostsPath = "$env:SystemRoot\System32\drivers\etc\hosts"

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[!] Execute como ADMINISTRADOR (botao direito > PowerShell Admin)" -ForegroundColor Red
    exit 1
}

if ($Remove) {
    # Remove hosts entry
    $content = Get-Content $hostsPath
    $newContent = $content | Where-Object { $_ -notmatch [regex]::Escape($hostname) }
    if ($newContent.Count -ne $content.Count) {
        $newContent | Set-Content $hostsPath -Force
        Write-Host "[-] Hosts entry removida" -ForegroundColor Yellow
    }
    # Remove funnel
    & "$env:ProgramFiles\Tailscale\tailscale.exe" funnel --bg 8787 2>&1 | Out-Null
    Write-Host "[-] Funnel 8787 removido" -ForegroundColor Yellow
    exit 0
}

# 1) Check if bridge is running
try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:8787/status" -UseBasicParsing -TimeoutSec 3
    Write-Host "[1/3] Bridge OK (porta 8787)" -ForegroundColor Green
} catch {
    Write-Host "[!] Bridge nao responde em http://127.0.0.1:8787" -ForegroundColor Red
    Write-Host "    Inicie o QuantowerBridge primeiro." -ForegroundColor Yellow
    exit 1
}

# 2) Add hosts entry
$content = Get-Content $hostsPath
if ($content -match [regex]::Escape($hostname)) {
    Write-Host "[2/3] Hosts entry ja existe" -ForegroundColor Green
} else {
    Add-Content $hostsPath -Value "`n$ip $hostname"
    if ($?) {
        Write-Host "[2/3] Hosts entry adicionada ($ip $hostname)" -ForegroundColor Green
    } else {
        Write-Host "[!] Falha ao adicionar hosts entry" -ForegroundColor Red
        exit 1
    }
}

# 3) Apply funnel on 8787
& "$env:ProgramFiles\Tailscale\tailscale.exe" funnel --bg 8787
if ($LASTEXITCODE -eq 0) {
    Write-Host "[3/3] Funnel apontando para porta 8787" -ForegroundColor Green
} else {
    Write-Host "[!] Falha ao configurar funnel" -ForegroundColor Red
    exit 1
}

# 4) Test funnel
Write-Host ""
Write-Host "Testando conexao pelo funnel..." -ForegroundColor Cyan
try {
    $r = Invoke-WebRequest -Uri "https://gian-note.tailbafabd.ts.net/status" -UseBasicParsing -TimeoutSec 10
    Write-Host "[OK] Funnel funcionando! ($($r.StatusCode) - $($r.RawContentLength) bytes)" -ForegroundColor Green
} catch {
    Write-Host "[!] Funnel nao respondeu ainda (pode levar ~30s)" -ForegroundColor Yellow
    Write-Host "    Tente novamente em alguns segundos." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Feito!" -ForegroundColor Green
Write-Host "Acesse o app pelo Netlify (como antes)." -ForegroundColor Cyan
Write-Host "No Settings do app, use a URL: https://gian-note.tailbafabd.ts.net" -ForegroundColor Cyan
