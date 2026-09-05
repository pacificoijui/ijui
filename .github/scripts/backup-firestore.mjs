#!/usr/bin/env node
// Backup diario do Firestore do sistema de licitacoes de Ijui.
//
// Le todas as colecoes pela API REST do Firestore usando a mesma chave web que
// ja esta publica no HTML do site (ler nao exige credencial nenhuma), e grava:
//
//   backup/<data>/<colecao>.json       leitura humana, valores ja convertidos
//   backup/<data>/raw/<colecao>.json   payload cru da API, para restauracao fiel
//   backup/<data>/manifest.json        data, contagem por colecao e total
//
// Uso: node .github/scripts/backup-firestore.mjs [diretorio-de-saida]

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// Cada modulo tem o seu projeto Firebase, separado de proposito (ver
// contratos/LEIA-ME.md): um nao alcanca o outro. O backup e o unico lugar que
// le todos — de fora, so para guardar.
//
// As colecoes de cada um precisam estar listadas aqui: a API REST nao lista
// colecoes sem credencial de admin. Modulo que ganhar projeto e nao entrar
// nesta tabela NAO e copiado, e nada avisa — foi o que aconteceu com editais.
const LICITACOES = [
  "processos",
  "rankings",
  "habilitacoes",
  "diligencias",
  "decisoes",
  "aniversarios",
  "usuarios",
  "status",
  "agentes",
  "observacoes",
  "pontos_facultativos",
  "email_config",
];

// Um modulo por linha: onde esta o HTML que guarda a configuracao do Firebase
// dele, e quais colecoes aquele projeto tem. `exigido` marca o banco que nao
// pode faltar — se a chave dele sumir do HTML, o backup para em vez de gravar
// pela metade.
const MODULOS = [
  { nome: "licitacoes", html: ["pregoeiro", "index.html"], exigido: true, colecoes: LICITACOES },
  { nome: "contratos",  html: ["contratos", "index.html"], colecoes: ["contratos"] },
  { nome: "editais",    html: ["editais", "index.html"],   colecoes: ["editais"] },
];

// A chave e o id do projeto saem do proprio HTML que os usa, para nao
// existirem duas fontes de verdade: trocou la, o backup acompanha sozinho.
// Modulo ainda sem projeto (config vazio) devolve null e e apenas pulado — os
// dados dele nao estao no Firestore, entao nao ha o que copiar.
function lerModulo(mod) {
  const html = readFileSync(join(RAIZ, ...mod.html), "utf8");
  const chave = html.match(/apiKey:\s*["\']([^"\']+)["\']/);
  const projeto = html.match(/projectId:\s*["\']([^"\']+)["\']/);
  if (!chave || !projeto) {
    if (mod.exigido) {
      throw new Error(`nao achei apiKey/projectId em ${mod.html.join("/")}`);
    }
    return null;
  }
  return { projeto: projeto[1], chave: chave[1], colecoes: mod.colecoes };
}

// Converte o formato tipado do Firestore ({stringValue:"x"}) em JSON comum.
function valor(v) {
  if (v == null) return null;
  if ("nullValue" in v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("bytesValue" in v) return v.bytesValue;
  if ("referenceValue" in v) return v.referenceValue;
  if ("geoPointValue" in v) return v.geoPointValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(valor);
  if ("mapValue" in v) return campos(v.mapValue.fields);
  return null;
}

function campos(f) {
  const o = {};
  for (const k of Object.keys(f || {})) o[k] = valor(f[k]);
  return o;
}

async function buscarJson(url, tentativa = 1) {
  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    // Falha de rede: tenta de novo antes de desistir, para nao perder o backup
    // do dia por causa de um soluco de conexao do runner.
    if (tentativa >= 4) throw e;
    await new Promise((r) => setTimeout(r, 2000 * tentativa));
    return buscarJson(url, tentativa + 1);
  }
  if (res.status === 429 || res.status >= 500) {
    if (tentativa >= 4) throw new Error(`HTTP ${res.status} em ${url}`);
    await new Promise((r) => setTimeout(r, 2000 * tentativa));
    return buscarJson(url, tentativa + 1);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
  return res.json();
}

async function baixarColecao(nome, projeto, chave) {
  const base =
    `https://firestore.googleapis.com/v1/projects/${projeto}` +
    `/databases/(default)/documents/${nome}`;
  const docsBrutos = [];
  let pageToken = "";
  do {
    const url =
      `${base}?key=${chave}&pageSize=300` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "");
    const d = await buscarJson(url);
    if (d.error) throw new Error(`${nome}: ${d.error.status} — ${d.error.message}`);
    for (const doc of d.documents || []) docsBrutos.push(doc);
    pageToken = d.nextPageToken || "";
  } while (pageToken);

  const docs = docsBrutos.map((doc) => ({
    id: doc.name.split("/").pop(),
    criadoEm: doc.createTime,
    alteradoEm: doc.updateTime,
    dados: campos(doc.fields),
  }));
  return { docs, docsBrutos };
}

function dataBrasilia() {
  // pt-BR em Sao Paulo devolve dd/mm/aaaa; viramos para aaaa-mm-dd.
  const [d, m, a] = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
  })
    .format(new Date())
    .split("/");
  return `${a}-${m}-${d}`;
}

async function main() {
  const saida = process.argv[2] || join(RAIZ, "backup");
  const dia = dataBrasilia();

  const fontes = [];
  for (const mod of MODULOS) {
    const fonte = lerModulo(mod);
    if (fonte) fontes.push(fonte);
    else console.log(`${mod.nome}: sem projeto proprio ainda — nada a baixar`);
  }
  console.log("");

  const porProjeto = {};
  const vazias = [];
  let total = 0;

  for (const fonte of fontes) {
    // Cada projeto no seu diretorio: um nunca sobrescreve arquivo do outro,
    // nem se os dois tiverem uma colecao de mesmo nome.
    const destino = join(saida, dia, fonte.projeto);
    mkdirSync(join(destino, "raw"), { recursive: true });
    const contagem = {};
    for (const nome of fonte.colecoes) {
      const { docs, docsBrutos } = await baixarColecao(nome, fonte.projeto, fonte.chave);
      writeFileSync(
        join(destino, `${nome}.json`),
        JSON.stringify(docs, null, 2) + "\n"
      );
      writeFileSync(
        join(destino, "raw", `${nome}.json`),
        JSON.stringify(docsBrutos, null, 2) + "\n"
      );
      contagem[nome] = docs.length;
      total += docs.length;
      if (docs.length === 0) vazias.push(`${fonte.projeto}/${nome}`);
      console.log(`${fonte.projeto}/${nome}: ${docs.length}`);
    }
    porProjeto[fonte.projeto] = contagem;
  }

  const destino = join(saida, dia);
  writeFileSync(
    join(destino, "manifest.json"),
    JSON.stringify(
      {
        dia,
        geradoEm: new Date().toISOString(),
        projetos: fontes.map((f) => f.projeto),
        totalDocumentos: total,
        documentosPorColecao: porProjeto,
      },
      null,
      2
    ) + "\n"
  );

  console.log(`\ntotal: ${total} documentos em ${destino}`);

  // Um backup vazio "com sucesso" e pior do que backup nenhum, porque passa a
  // impressao de que esta tudo guardado. Entao isso derruba o workflow.
  if (total === 0) {
    console.error("\nERRO: nenhum documento baixado — backup abortado.");
    process.exit(1);
  }
  if (vazias.length) {
    console.error(`\nAVISO: colecoes vazias: ${vazias.join(", ")}`);
  }
}

main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
