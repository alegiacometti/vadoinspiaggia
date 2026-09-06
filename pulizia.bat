@echo off
rem  Cancella la vecchia pagina di Senigallia, che ha cambiato nome.
rem  Va lanciato UNA VOLTA dentro la cartella vadoinspiaggia, prima del push.
cd /d "%~dp0"
if exist "spiaggia\senigallia-spiaggia-di-velluto-marche-018.html" (
  del "spiaggia\senigallia-spiaggia-di-velluto-marche-018.html"
  echo   Cancellata la vecchia pagina di Senigallia.
) else (
  echo   Niente da cancellare: la vecchia pagina non c'e' gia' piu'.
)
echo.
pause
