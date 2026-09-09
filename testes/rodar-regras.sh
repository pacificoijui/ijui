#!/usr/bin/env bash
# Roda t-regras.mjs dentro do emulador oficial do Firestore — é o único jeito
# de conferir as regras contra o motor de verdade, em vez de lê-las com fé.
#
#   ./rodar-regras.sh
#
# Sai com 0 e um aviso se o emulador não puder ser baixado (máquina sem
# acesso ao storage do Google): a suíte principal não depende dele.
set -uo pipefail
cd "$(dirname "$0")"

vermelho() { printf '\033[31m%s\033[0m\n' "$1"; }
amarelo()  { printf '\033[33m%s\033[0m\n' "$1"; }

if [ ! -d node_modules/firebase-tools ] || [ ! -d node_modules/@firebase/rules-unit-testing ]; then
  echo "Instalando o emulador (firebase-tools) e a biblioteca de teste de regras..."
  npm install --silent --save-dev firebase-tools @firebase/rules-unit-testing || {
    amarelo "não consegui instalar — pulando o teste de regras"; exit 0; }
fi

# Roda da raiz do repositorio: o emulador exige que o arquivo de regras
# esteja dentro do diretorio do projeto. O id "demo-" e reconhecido pelo
# Firebase como projeto de teste e dispensa login.
SAIDA=$(cd .. && npx --yes firebase-tools emulators:exec \
  --only firestore \
  --project demo-ijui \
  --config firebase-emulador.json \
  "node testes/t-regras.mjs" 2>&1)
CODIGO=$?

echo "$SAIDA" | grep -vE '^(i|⚠|✔)' | sed '/^$/d'

if [ $CODIGO -ne 0 ]; then
  if echo "$SAIDA" | grep -qiE "download|ENOTFOUND|ECONNREFUSED|getaddrinfo|network|proxy"; then
    amarelo "emulador indisponível nesta máquina (sem acesso ao storage do Google) — teste de regras pulado"
    exit 0
  fi
  vermelho "o teste de regras falhou"
  exit 1
fi
