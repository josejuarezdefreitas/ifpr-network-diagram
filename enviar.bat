@echo off
title Enviando para o GitHub...

REM Define a mensagem do commit
echo.
set /p commit_message="Digite a mensagem do commit e pressione Enter: "

REM Se a mensagem for vazia, usa uma padrao
if "%commit_message%"=="" set "commit_message=Atualizacao de rotina - %date% %time%"

echo.
echo =======================================================
echo.

REM Adiciona todos os arquivos novos e modificados
echo 1. Adicionando todos os arquivos (git add .)...
git add .

echo.

REM Faz o commit com a mensagem digitada
echo 2. Realizando o commit com a mensagem: "%commit_message%"
git commit -m "%commit_message%"

echo.

REM Envia as alteracoes para o branch principal (main) no GitHub
echo 3. Enviando para o GitHub (git push)...
git push

echo.
echo =======================================================
echo.
echo Processo concluido! A janela sera fechada em 10 segundos.
timeout /t 10