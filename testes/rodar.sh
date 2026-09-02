#!/usr/bin/env bash
# Roda a suíte de regressão inteira.
#
#   ./rodar.sh              todos os testes
#   ./rodar.sh hab          só os que têm "hab" no nome
#   ./rodar.sh t-smoke.js   um teste específico
#
# Sobe um servidor local na porta 8099 (os testes carregam as páginas por
# http://, não por file://, porque o Firestore e o fetch do modelo .odt não
# funcionam em file://). Derruba o servidor no fim, mesmo se algo falhar.

set -uo pipefail
cd "$(dirname "$0")"
RAIZ="$(cd .. && pwd)"
PORTA=8099
FILTRO="${1:-}"

vermelho() { printf '\033[31m%s\033[0m\n' "$1"; }
verde()    { printf '\033[32m%s\033[0m\n' "$1"; }

# ── dependências ────────────────────────────────────────────────────────
if [ ! -d node_modules/jszip ] || [ ! -d node_modules/jspdf ]; then
  echo "Instalando dependências dos testes (jszip, jspdf)..."
  npm install --silent || { vermelho "npm install falhou"; exit 1; }
fi

# ── servidor ────────────────────────────────────────────────────────────
SERVIDOR_PID=""
limpar() { [ -n "$SERVIDOR_PID" ] && kill "$SERVIDOR_PID" 2>/dev/null; }
trap limpar EXIT

if curl -s -o /dev/null "http://127.0.0.1:$PORTA/pregoeiro/index.html"; then
  echo "Servidor já rodando na porta $PORTA — reaproveitando."
else
  npx --yes http-server "$RAIZ" -p "$PORTA" -s > /tmp/testes-ijui.log 2>&1 &
  SERVIDOR_PID=$!
  for _ in $(seq 1 20); do
    curl -s -o /dev/null "http://127.0.0.1:$PORTA/pregoeiro/index.html" && break
    sleep 0.3
  done
  if ! curl -s -o /dev/null "http://127.0.0.1:$PORTA/pregoeiro/index.html"; then
    vermelho "Não consegui subir o servidor na porta $PORTA (veja /tmp/testes-ijui.log)"
    exit 1
  fi
fi

# ── execução ────────────────────────────────────────────────────────────
if [ -n "$FILTRO" ]; then
  ARQUIVOS=$(ls t-*.js | grep -- "$FILTRO" || true)
  [ -z "$ARQUIVOS" ] && { vermelho "Nenhum teste casa com '$FILTRO'"; exit 1; }
else
  ARQUIVOS=$(ls t-*.js)
fi

PASSOU=0; FALHOU=0; FALHAS=""
for t in $ARQUIVOS; do
  printf '%-46s' "$t"
  SAIDA=$(node "$t" 2>&1)
  if [ $? -eq 0 ] && ! echo "$SAIDA" | grep -q '✗'; then
    RESUMO=$(echo "$SAIDA" | grep -oE '[0-9]+ (passaram|conferências passaram)' | tail -1)
    verde "ok ${RESUMO:-}"
    PASSOU=$((PASSOU+1))
  else
    vermelho "FALHOU"
    echo "$SAIDA" | grep -E '✗|Error|error' | head -6 | sed 's/^/      /'
    FALHOU=$((FALHOU+1)); FALHAS="$FALHAS $t"
  fi
done

# ── conferência estrutural dos .odt gerados pelo módulo de editais ──────
if echo "$ARQUIVOS" | grep -qE 't-(editais|itens|dotacao)\.js'; then
  printf '%-46s' "verificar-odt.py"
  SAIDA=$(python3 verificar-odt.py 2>&1)
  if [ $? -eq 0 ]; then
    verde "ok $(echo "$SAIDA" | grep -oE '[0-9]+ conferências passaram' | tail -1)"
    PASSOU=$((PASSOU+1))
  else
    vermelho "FALHOU"
    echo "$SAIDA" | grep '✗' | head -6 | sed 's/^/      /'
    FALHOU=$((FALHOU+1)); FALHAS="$FALHAS verificar-odt.py"
  fi
fi

echo
if [ "$FALHOU" -eq 0 ]; then
  verde "$PASSOU arquivo(s) de teste, todos passaram."
else
  vermelho "$PASSOU passaram, $FALHOU falharam:$FALHAS"
  exit 1
fi
