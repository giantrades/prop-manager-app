@echo off
chcp 65001 >nul
title QuantowerBridge - Recuperacao

:: Reabre como Administrador se necessario
net session >nul 2>&1
if %errorlevel% neq 0 (
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0fix-bridge.ps1"
