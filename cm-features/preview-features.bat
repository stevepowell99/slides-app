@echo off
REM Live preview of features-slides.qmd (use this instead of opening the HTML directly).
cd /d "%~dp0"
quarto preview features-slides.qmd
