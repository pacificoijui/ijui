#!/usr/bin/env node
// Restauracao a partir de um backup gerado por backup-firestore.mjs.
//
// Le os arquivos de backup/<data>/raw/ (que guardam o formato exato da API) e
// grava os documentos de volta no Firestore. Por padrao NAO escreve nada: so
// mostra o que faria. Para escrever de verdade e preciso passar --confirmar.
//
//   node .github/scripts/restaurar-firestore.mjs backup/2026-08-29
//   node .github/scripts/restaurar-firestore.mjs backup/2026-08-29 --colecao processos
//   node .github/scripts/restaurar-firestore.mjs backup/2026-08-29 --colecao processos --confirmar
//
// Restaurar sobrescreve o documento inteiro pelo conteudo do backup. Se alguem
// alterou aquele processo depois da data do backup, a alteracao se perde. Por
// isso o padrao e --colecao: restaurar so o que quebrou, nao o banco todo.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PROJETO = "processos-ijui";

function lerChaveWeb() {
  const html = readFileSync(join(RAIZ, "pregoeiro", "index.html"), "utf8");
  const m = html.match(/apiKey:\s*"([^"]+)"/);
  if (!m) throw new Error("nao achei a apiKey em pregoeiro/index.html");
  return m[1];
}

function args() {
  const a = process.argv.slice(2);
  const dir = a.find((x) => !x.startsWith("--"));
  const i = a.indexOf("--colecao");
  return {
    dir,
    colecao: i >= 0 ? a[i + 1] : null,
    confirmar: a.includes("--confirmar"),
  };
}

async function gravar(colecao, id, fields, chave) {
  const url =
    `https://firestore.googleapis.com/v1/projects/${PROJETO}` +
    `/databases/(default)/documents/${colecao}/${encodeURIComponent(id)}` +
    `?key=${chave}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields: fields || {} }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`${colecao}/${id}: HTTP ${res.status} — ${txt.slice(0, 300)}`);
  }
}

async function main() {
  const { dir, colecao, confirmar } = args();
  if (!dir) {
    console.error("uso: node restaurar-firestore.mjs <pasta-do-backup> [--colecao X] [--confirmar]");
    process.exit(1);
  }
  const raw = join(dir, "raw");
  if (!existsSync(raw)) throw new Error(`nao achei ${raw}`);

  const arquivos = readdirSync(raw)
    .filter((f) => f.endsWith(".json"))
    .filter((f) => !colecao || f === `${colecao}.json`);
  if (!arquivos.length) throw new Error("nenhuma coleção correspondente no backup");

  const chave = lerChaveWeb();

  if (!confirmar) {
    console.log("SIMULAÇÃO — nada será gravado. Use --confirmar para valer.\n");
  }

  let total = 0;
  for (const arq of arquivos) {
    const nome = arq.replace(/\.json$/, "");
    const docs = JSON.parse(readFileSync(join(raw, arq), "utf8"));
    console.log(`${nome}: ${docs.length} documentos`);
    if (!confirmar) {
      total += docs.length;
      continue;
    }
    for (const doc of docs) {
      const id = doc.name.split("/").pop();
      await gravar(nome, id, doc.fields, chave);
      total++;
    }
    console.log(`  gravados ${docs.length}`);
  }

  console.log(
    `\n${confirmar ? "restaurados" : "seriam restaurados"}: ${total} documentos`
  );
}

main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
