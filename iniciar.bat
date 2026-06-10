@echo off
title Barbearia - Sistema Completo
echo Iniciando Sistema Dom Cabral...
echo.

echo [1/2] Iniciando Bot WhatsApp...
start "Bot WhatsApp" cmd /k node index.js

timeout /t 5 /nobreak

echo [2/2] Iniciando Servidor Web...
start "Servidor Web" cmd /k uvicorn main:app --reload --port 8000

echo.
echo ========================================
echo Sistema iniciado!
echo Acesse: http://localhost:8000/admin
echo Login: admin / admin123
echo ========================================
echo.
echo Feche as janelas do CMD para parar o sistema.
pause