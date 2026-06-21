@echo off
chcp 65001 >nul
title T-A-C-T Incident Response System
echo ==========================================
echo   T-A-C-T: TEE-Secured Agentic Commander
echo   for Triage - Incident Response System
echo ==========================================
echo.

REM Change to the directory where this script lives
cd /d "%~dp0"

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo [1/4] Node.js detected:
node --version
echo.

REM Install dependencies only if node_modules does not exist
if exist "node_modules" (
    echo [2/4] node_modules already present -- skipping npm install.
) else (
    echo [2/4] Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo [ERROR] Failed to install dependencies.
        pause
        exit /b 1
    )
)
echo [OK] Dependencies ready.
echo.

REM Compile TypeScript only if dist does not exist
if exist "dist" (
    echo [3/4] dist already present -- skipping TypeScript compilation.
) else (
    echo [3/4] Compiling TypeScript...
    call npm run compile
    if errorlevel 1 (
        echo [ERROR] TypeScript compilation failed.
        pause
        exit /b 1
    )
)
echo [OK] TypeScript compiled.
echo.

REM Prepare frontend login app if it exists
if exist "frontend" (
    echo [3.5/4] Preparing frontend login app...
    cd frontend
    if not exist "node_modules" (
        echo [Frontend] Installing dependencies...
        call npm install
        if errorlevel 1 (
            echo [WARNING] Failed to install frontend dependencies.
        )
    )
    if not exist "dist" (
        echo [Frontend] Building login app...
        call npm run build
        if errorlevel 1 (
            echo [WARNING] Failed to build frontend login app.
        )
    )
    cd ..
    echo [OK] Frontend ready.
    echo.
)

REM Start the application
echo [4/4] Starting T-A-C-T Server...
echo.
echo ==========================================
echo   Frontend: http://localhost:3000
echo   API:      http://localhost:3000/api
echo ==========================================
echo.
echo Press Ctrl+C to stop the server.
echo.

node server.js

pause
