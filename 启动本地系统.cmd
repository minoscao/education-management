@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "PORTAL_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%PORTAL_NODE%" set "PORTAL_NODE=node"
echo 本地系统地址：http://localhost:3100
echo 请保持此窗口打开。关闭窗口或按 Ctrl+C 可以停止系统。
"%PORTAL_NODE%" scripts\start-local.mjs
pause
