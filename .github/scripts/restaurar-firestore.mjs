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

// Cada modulo tem o seu HTML e, dentro dele, a chave web do seu projeto. O
// nome da PASTA do backup diz para onde restaurar, e so vale se algum desses
// HTMLs apontar para esse mesmo projeto — assim nao ha como despejar o backup
// de um banco por cima do outro.
const HTMLS = [
  ["pregoeiro", "index.html"],
  ["contratos", "index.html"],
  ["editais", "index.html"],
];
function fonteDe(projeto) {
  const vistos = [];
  for (const caminho of HTMLS) {
    const html = readFileSync(join(RAIZ, ...caminho), "utf8");
    const chave = html.match(/apiKey:\s*["\']([^"\']+)["\']/);
    const id = html.match(/projectId:\s*["\']([^"\']+)["\']/);
    if (!chave || !id) continue;
    if (id[1] === projeto) return { projeto, chave: chave[1] };
    vistos.push(`${id[1]} (${caminho.join("/")})`);
  }
  throw new Error(
    `nao sei a chave do projeto "${projeto}".\n` +
    (vistos.length
      ? `Os projetos configurados hoje sao: ${vistos.join(", ")}.\n` +
        "Se a pasta do backup e de um deles, confira o nome; se e de um modulo\n" +
        "ainda sem projeto, preencha o FIREBASE_CONFIG do HTML dele primeiro."
      : "Nenhum HTML tem FIREBASE_CONFIG preenchido.")
  );
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
