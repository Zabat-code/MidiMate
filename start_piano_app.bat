@echo off
REM ============================================================
REM start_piano_app.bat
REM Lanza Piano-app sin abrir consola manualmente:
REM   1. Verifica Node/npm
REM   2. Instala dependencias si faltan (usa el .npmrc con include=dev)
REM   3. Levanta el servidor de desarrollo (npm run dev) y abre el navegador
REM ============================================================

cd /d "%~dp0"

REM --- 1. Verificar Node ---
where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js no esta instalado. Instalalo desde https://nodejs.org
    pause
    exit /b 1
)

REM --- 2. Verificar npm ---
where npm >nul 2>nul
if errorlevel 1 (
    echo [ERROR] npm no encontrado (Node parece incompleto). Reinstala Node.js.
    pause
    exit /b 1
)

echo Node:   & node -v
echo npm:    & npm -v
echo.

REM --- 3. Instalar dependencias si faltan ---
if not exist "node_modules" (
    echo ============================================
    echo  Instalando dependencias (npm install)...
    echo  (puede tardar la primera vez)
    echo ============================================
    call npm install
    if errorlevel 1 (
        echo.
        echo [ERROR] Fallo npm install. Revisa tu conexion o el .npmrc.
        pause
        exit /b 1
    )
) else (
    echo Dependencias ya presentes (node_modules). Se omite npm install.
)

echo.
echo ============================================
echo  Levantando servidor de desarrollo...
echo  Vite abrira el navegador automaticamente.
echo  (Cierra esta ventana o Ctrl+C para detener)
echo ============================================
echo.

REM npm run dev tiene server.open=true en vite.config.js,
REM asi que el navegador se abre solo en el puerto que Vite elija
REM (por defecto 5173; si esta ocupado, usa 5174, 5175, etc.).
call npm run dev

pause
