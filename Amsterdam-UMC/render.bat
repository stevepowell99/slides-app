@echo off
REM Render slides.qmd to HTML (slides.html) and PDF (slides.pdf).
REM Requires: quarto, decktape (npm install -g decktape).

cd /d "%~dp0"

echo.
echo [1/2] Rendering HTML...
quarto render slides.qmd --to revealjs
if errorlevel 1 (
    echo HTML render failed.
    pause
    exit /b 1
)

echo.
echo [2/2] Generating PDF via decktape...
where decktape >nul 2>&1
if errorlevel 1 (
    echo.
    echo decktape not found. Install once with:
    echo   npm install -g decktape
    echo.
    echo HTML is ready, PDF skipped.
    pause
    exit /b 1
)
decktape reveal slides.html slides.pdf --size 1280x720
if errorlevel 1 (
    echo PDF render failed.
    pause
    exit /b 1
)

echo.
echo Done. slides.html and slides.pdf ready.
pause
