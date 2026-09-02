#!/usr/bin/env node
// Sobe contratos/dados/contratos.json para o Firestore DO PROJETO DE CONTRATOS.
//
// Projeto separado do das licitacoes de proposito: ver contratos/LEIA-ME.md.
// Este script NAO le nem escreve nada em processos-ijui.
//
// Uso:
//   node contratos/ferramentas/importar.mjs                 # so mostra o que faria
//   node contratos/ferramentas/importar.mjs --confirmar     # grava de verdade
//   node contratos/ferramentas/importar.mjs --confirmar --de 500 --ate 700
//
// A chave web e o id do projeto saem do FIREBASE_CONFIG de contratos/index.html,
// para nao existirem duas fontes de verdade.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const COLECAO = "contratos";

function lerConfig() {
  const html = readFileSync(join(RAIZ, "contratos", "index.html"), "utf8");
  const bloco = html.match(/const FIREBASE_CONFIG = (\{[\s\S]*?\});/);
  if (!bloco) throw new Error("nao achei FIREBASE_CONFIG em contratos/index.html");
  const apiKey = bloco[1].match(/apiKey:\s*["']([^"']+)["']/);
  const projectId = bloco[1].match(/projectId:\s*["']([^"']+)["']/);
  if (!apiKey || !projectId) {
    throw new Error(
      "FIREBASE_CONFIG ainda esta vazio em contratos/index.html.\n" +
      "Crie o projeto de contratos no console do Firebase, cole o config la e rode de novo."
    );
  }
  return { apiKey: apiKey[1], projectId: projectId[1] };
}

// Converte JSON comum no formato tipado que a API REST do Firestore espera.
function tipar(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(tipar) } };
  if (typeof v === "object") {
    const fields = {};
    for (const [k, x] of Object.entries(v)) fields[k] = tipar(x);
    return { mapValue: { fields } };
  }
  throw new Error("tipo que nao sei converter: " + typeof v);
}

function documento(c) {
  const fields = {};
  for (const [k, v] of Object.entries(c)) fields[k] = tipar(v);
  return { fields };
}

function arg(nome) {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : null;
}

const confirmar = process.argv.includes("--confirmar");
const de = Number(arg("--de") || 0);
const ate = Number(arg("--ate") || Infinity);

const contratos = JSON.parse(
  readFileSync(join(RAIZ, "contratos", "dados", "contratos.json"), "utf8")
).filter((c) => c.id >= de && c.id <= ate);

if (!contratos.length) {
  console.error("nenhum contrato na faixa pedida — nada a fazer");
  process.exit(1);
}

const ids = new Set(contratos.map((c) => c.id));
if (ids.size !== contratos.length) {
  console.error("ha ids repetidos no arquivo; corrija antes de importar");
  process.exit(1);
}

let apiKey, projectId;
try {
  ({ apiKey, projectId } = lerConfig());
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${COLECAO}`;

console.log(`projeto......: ${projectId}`);
console.log(`colecao......: ${COLECAO}`);
console.log(`contratos....: ${contratos.length} (id ${contratos[0].id} a ${contratos[contratos.length - 1].id})`);

if (!confirmar) {
  console.log("\nEnsaio — nada foi gravado. Rode de novo com --confirmar para valer.");
  console.log("Exemplo do que seria gravado (documento " + contratos[0].id + "):");
  console.log(JSON.stringify(documento(contratos[0]), null, 2).slice(0, 600) + " ...");
  process.exit(0);
}

let gravados = 0;
const falhas = [];

for (const c of contratos) {
  // O id do documento e o id numerico em texto: reimportar atualiza o mesmo
  // documento em vez de criar uma copia.
  const url = `${base}/${c.id}?key=${apiKey}`;
  try {
    const r = await fetch(url, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(documento(c)),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    gravados++;
    if (gravados % 100 === 0) console.log(`  ${gravados}/${contratos.length}...`);
  } catch (e) {
    falhas.push({ id: c.id, erro: e.message });
  }
}

console.log(`\ngravados: ${gravados}   falhas: ${falhas.length}`);
if (falhas.length) {
  console.error("\nfalhas:");
  falhas.slice(0, 20).forEach((f) => console.error(`  contrato ${f.id}: ${f.erro}`));
  if (falhas.length > 20) console.error(`  ... e mais ${falhas.length - 20}`);
  process.exit(1);
}
