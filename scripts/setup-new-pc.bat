@echo off
chcp 65001 >nul
title QuantowerBridge — PC Setup

echo ============================================
echo  QuantowerBridge — Configurador de PC Novo
echo ============================================
echo.

:: ── 1. Check admin ────────────────────────────
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Este script precisa ser executado COMO ADMINISTRADOR.
    echo     Clique com botao direito ^> "Executar como administrador"
    pause
    exit /b 1
)

set "BRIDGE_PORT=8787"
set "SERVER_PORT=8787"
set "APP_DIR=%~dp0.."
set "DLL_SRC=%APP_DIR%\quantower-bridge\QuantowerBridge.dll"
set "DLL_DST=C:\Quantower\Settings\Scripts\Strategies\QuantowerBridge\QuantowerBridge.dll"

:: ── 2. Tailscale ──────────────────────────────
echo [1/7] Verificando Tailscale...
winget list --name Tailscale >nul 2>&1
if %errorlevel% neq 0 (
    echo     Nao encontrado. Baixando e instalando...
    winget install --name Tailscale.Tailscale --accept-source-agreements --silent >nul 2>&1
    if %errorlevel% neq 0 (
        echo     [!] Falha ao instalar Tailscale.
        echo     Baixe manualmente de: https://tailscale.com/download
        pause
        exit /b 1
    )
    echo     Instalado. Faca login no Tailscale na janela que abrir.
    start "" "C:\Program Files\Tailscale\Tailscale.exe"
    pause
) else (
    echo     OK
)

:: ── 3. URL ACL ────────────────────────────────
echo [2/7] Reservando URL ACL para porta %BRIDGE_PORT%...
netsh http show urlacl url=http://+:%BRIDGE_PORT%/ >nul 2>&1
if %errorlevel% neq 0 (
    netsh http add urlacl url=http://+:%BRIDGE_PORT%/ user=Everyone >nul 2>&1
    if %errorlevel% equ 0 (echo     OK) else (echo     [!] Falha ao reservar URL ACL)
) else (
    echo     Ja existe
)

:: ── 4. Bridge DLL ─────────────────────────────
echo [3/7] Copiando bridge DLL...
if exist "%DLL_SRC%" (
    if not exist "%~dp0%DLL_DST%" mkdir "%~dp0%DLL_DST%" >nul 2>&1
    copy /Y "%DLL_SRC%" "%DLL_DST%" >nul 2>&1
    echo     OK
) else (
    echo     [!] DLL nao encontrado em:
    echo         %DLL_SRC%
    echo     Compile o projeto QuantowerBridge no Quantower Algo primeiro.
    echo     Depois copie manualmente para:
    echo         %DLL_DST%
    pause
)

:: ── 5. Task Scheduler (Funnel KeepAlive) ──────
echo [4/7] Configurando tarefa no agendador para manter Funnel ativo...
powershell -ExecutionPolicy Bypass -File "%~dp0setup-tailscale-funnel.ps1" >nul 2>&1
if %errorlevel% equ 0 (echo     OK) else (echo     [!] Falha ao configurar tarefa. Execute manualmente: setup-tailscale-funnel.ps1)

:: ── 6. Funnel ─────────────────────────────────
echo [5/7] Ativando Tailscale Funnel (porta %SERVER_PORT%)...
tailscale funnel --bg %SERVER_PORT% >nul 2>&1
echo     OK — URL: https://gian-note.tailbafabd.ts.net -> porta %SERVER_PORT%

:: ── 7. Build webapp ───────────────────────────
echo [6/7] Compilando webapp...
cd /d "%APP_DIR%"
if exist "package.json" (
    where npm >nul 2>&1
    if %errorlevel% equ 0 (
        call npm install >nul 2>&1
        call npm run build >nul 2>&1
        if %errorlevel% equ 0 (echo     OK — Build concluido) else (echo     [!] Build falhou)
    ) else (
        echo     [!] Node.js nao encontrado. Instale de: https://nodejs.org
    )
) else (
    echo     [!] package.json nao encontrado em %APP_DIR%
)

:: ── 8. Iniciar server.js ──────────────────────
echo [7/7] Iniciando server Node.js...
start "" /B node "%APP_DIR%\server.js"
if %errorlevel% equ 0 (echo     OK — Server rodando na porta %SERVER_PORT%) else (echo     [!] Falha ao iniciar server. Execute manualmente: node server.js)

echo.
echo ============================================
echo  Configuracao concluida!
echo ============================================
echo.
echo  Fluxo de funcionamento:
echo   1. QuantowerBridge (C#) API na porta %BRIDGE_PORT%
echo   2. Node.js (server.js) na porta %SERVER_PORT% serve SPA + proxy API
echo   3. Tailscale Funnel -> porta %SERVER_PORT%
echo.
echo  Proximos passos:
echo   1. Abra o Quantower e va em Strategies Manager
echo   2. Inicie a strategy "QuantowerBridge"
echo   3. Acesse de qualquer dispositivo:
echo      https://gian-note.tailbafabd.ts.net
echo.
echo  Se o login do Tailscale nao foi feito acima:
echo   1. Clique no icone do Tailscale na bandeja do sistema
echo   2. Faca login com sua conta
echo   3. Em Settings, ative "Funnel"
echo   4. Rode novamente este script ou execute manualmente:
echo      tailscale funnel %SERVER_PORT%
echo.
pause
