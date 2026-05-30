@echo off
REM Live preview of slides.qmd with auto-reload on save.
REM Opens a browser tab; edits to the qmd or css refresh automatically.
cd /d "%~dp0"
quarto preview slides.qmd
