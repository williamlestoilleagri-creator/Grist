@echo off
chcp 65001 >nul
title Compte rendu de reunion - demonstration
cd /d "%~dp0backend"

python --version >nul 2>nul
if errorlevel 1 (
  echo.
  echo Python nest pas installe.
  echo Installez-le depuis https://www.python.org/downloads/
  echo en cochant la case "Add python.exe to PATH", puis relancez ce fichier.
  echo.
  pause
  exit /b 1
)

if not exist .venv (
  echo Premiere utilisation : preparation de lenvironnement...
  python -m venv .venv
)
call .venv\Scripts\activate.bat
echo Installation des composants (1 a 2 minutes la premiere fois)...
python -m pip install --disable-pip-version-check -q -r requirements-demo.txt
if errorlevel 1 (
  echo Echec de linstallation. Verifiez votre connexion internet.
  pause
  exit /b 1
)

set CR_DEMO=1
echo.
echo ==========================================================
echo  Application lancee : http://localhost:8000
echo  Laissez cette fenetre OUVERTE pendant lutilisation.
echo  Pour arreter : fermez cette fenetre.
echo ==========================================================
start "" cmd /c "timeout /t 6 >nul & start http://localhost:8000"
python -m uvicorn app.main:app --port 8000
pause
