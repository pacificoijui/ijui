#!/usr/bin/env node
// Restauracao a partir de um backup gerado por backup-firestore.mjs.
//
// Le os arquivos de backup/<data>/<projeto>/raw/ (que guardam o formato exato
// da API) e grava os documentos de volta no Firestore. Por padrao NAO escreve
// nada: so mostra o que faria. Para escrever de verdade e preciso --confirmar.
//
//   node .github/scripts/restaurar-firestore.mjs backup/2026-08-29/processos-ijui
//   node .github/scripts/restaurar-firestore.mjs backup/2026-08-29/processos-ijui --colecao processos
//   node .github/scripts/restaurar-firestore.mjs backup/2026-08-29/processos-ijui --colecao processos --confirmar
//
// O projeto de destino vem do nome da pasta. Sao dois bancos separados (ver
// contratos/LEIA-ME.md) e restaurar um nunca pode escrever no outro por
// engano — por isso a pasta manda, e nao uma constante aqui dentro.
//
// Restaurar sobrescreve o documento inteiro pelo conteudo do backup. Se alguem
// alterou aquele processo depois da data do backup, a alteracao se perde. Por
// isso o padrao e --colecao: restaurar so o que quebrou, nao o banco todo.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename, resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// Cada projeto tem a sua chave web, e ela sai do HTML que o usa — assim nao ha
// como restaurar contratos com a chave das licitacoes.
function fonteDe(projeto) {
  if (projeto === "processos-ijui") {
    const html = readFileSync(join(RAIZ, "pregoeiro", "index.html"), "utf8");
    const m = html.match(/apiKey:\s*"([^"]+)"/);
    if (!m) throw new Error("nao achei a apiKey em pregoeiro/index.html");
    return { projeto, chave: m[1] };
  }
  const html = readFileSync(join(RAIZ, "contratos", "index.html"), "utf8");
  const bloco = html.match(/const FIREBASE_CONFIG = (\{[\s\S]*?\});/);
  const chave = bloco && bloco[1].match(/apiKey:\s*["\']([^"\']+)["\']/);
  const id = bloco && bloco[1].match(/projectId:\s*["\']([^"\']+)["\']/);
  if (!chave || !id) {
    throw new Error(
      `nao sei a chave do projeto "${projeto}".\n` +
      "Se e o de contratos, preencha o FIREBASE_CONFIG em contratos/index.html."
    );
  }
  if (id[1] !== projeto) {
    throw new Error(
      `a pasta diz "${projeto}" mas o contratos/index.html aponta para "${id[1]}" — ` +
      "confira se e mesmo esse backup que voce quer restaurar."
    );
  }
  return { projeto, chave: chave[1] };
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

async function gravar(colecao, id, fields, chave, projeto) {
  const url =
    `https://firestore.googleapis.com/v1/projects/${projeto}` +
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
    console.error("uso: node restaurar-firestore.mjs backup/<data>/<projeto> [--colecao X] [--confirmar]");
    process.exit(1);
  }
  const raw = join(dir, "raw");
  if (!existsSync(raw)) {
    throw new Error(
      `nao achei ${raw}\n` +
      "A pasta tem de ser a do projeto, nao a da data: backup/<data>/<projeto>."
    );
  }

  const arquivos = readdirSync(raw)
    .filter((f) => f.endsWith(".json"))
    .filter((f) => !colecao || f === `${colecao}.json`);
  if (!arquivos.length) throw new Error("nenhuma coleção correspondente no backup");

  const { projeto, chave } = fonteDe(basename(resolve(dir)));
  console.log(`projeto de destino: ${projeto}\n`);

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
      await gravar(nome, id, doc.fields, chave, projeto);
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
