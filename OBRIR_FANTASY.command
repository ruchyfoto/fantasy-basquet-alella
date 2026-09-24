#!/bin/bash
cd "$(dirname "$0")"
PORT=8765
URL="http://127.0.0.1:$PORT/index.html"
LOG="/tmp/fantasy_basket_server.log"
rm -f "$LOG"

echo "=========================================="
echo "   FANTASY BÀSQUET ALELLA"
echo "=========================================="
echo ""
echo "Iniciant el servidor local..."
echo ""

SERVER_PID=""

if command -v python3 >/dev/null 2>&1; then
  python3 -m http.server "$PORT" --bind 127.0.0.1 >"$LOG" 2>&1 &
  SERVER_PID=$!
elif command -v php >/dev/null 2>&1; then
  php -S 127.0.0.1:"$PORT" -t . >"$LOG" 2>&1 &
  SERVER_PID=$!
elif command -v ruby >/dev/null 2>&1; then
  ruby -run -e httpd . -p "$PORT" -b 127.0.0.1 >"$LOG" 2>&1 &
  SERVER_PID=$!
else
  echo "No he trobat cap servidor disponible (Python, PHP o Ruby)."
  echo ""
  echo "Copia'm aquest missatge i t'ajudaré a instal·lar-ne un."
  read -r -p "Prem INTRO per tancar..."
  exit 1
fi

sleep 2

if curl -fsS --max-time 2 "http://127.0.0.1:$PORT/" >/dev/null 2>&1; then
  echo "Servidor iniciat correctament."
  echo "Obrint la web..."
  open "$URL"
  echo ""
  echo "NO tanquis aquesta finestra mentre utilitzis la web."
  echo ""
  wait "$SERVER_PID"
else
  echo "NO S'HA POGUT INICIAR EL SERVIDOR."
  echo ""
  echo "Aquest és l'error detectat:"
  echo "------------------------------------------"
  cat "$LOG"
  echo "------------------------------------------"
  echo ""
  echo "Envia'm una captura d'aquesta finestra."
  kill "$SERVER_PID" 2>/dev/null || true
  read -r -p "Prem INTRO per tancar..."
  exit 1
fi
