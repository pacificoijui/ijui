#!/usr/bin/env node
// Converte o export do Portal LicitaCon (TCE-RS) — "resultado da busca por
// item", uma tabela HTML disfarçada de .xls (é o formato que o Oracle BI
// Publisher do portal gera) — em dados/itens.json, que é o que a tela lê.
//
// Uso:
//   node licitacon/ferramentas/converter.mjs caminho/do/export.xls
//
// Como reexportar do zero: no Portal LicitaCon, Consultas > Compras >
// Resultado da Busca por Item, filtre pelo órgão (Prefeitura Municipal de
// Ijuí) e exporte. O arquivo baixado abre normal no Excel/LibreOffice, mas
// por dentro é HTML — é por isso que este conversor lê com regex em vez de
// abrir como planilha de verdade.

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const CABECALHO_ESPERADO = [
  "Órgão", "Modalidade", "Nr.", "Ano", "Objeto", "Abertura", "Item",
  "Qtd.", "Un.", "Vl. Un. Homolg.", "Vl. Total Homolg.", "Vencedor", "CPF/CNPJ",
];

function textoDaCelula(td) {
  return td
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// "355.000,00" -> 355000; "" -> null
function numeroBR(s) {
  if (!s) return null;
  const n = parseFloat(s.replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? null : n;
}

// "11/12/2024" -> "2024-12-11"; "" -> null
function dataBR(s) {
  const m = s && s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function linhas(html) {
  const out = [];
  for (const trm of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const tds = [...trm[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) =>
      textoDaCelula(m[1])
    );
    if (tds.length) out.push(tds);
  }
  return out;
}

function main() {
  const origem = process.argv[2];
  if (!origem) {
    console.error("uso: node converter.mjs caminho/do/resultado_da_busca_item.xls");
    process.exit(1);
  }

  const html = readFileSync(origem, "utf8");
  const todas = linhas(html);
  if (!todas.length) throw new Error("nenhuma linha de tabela encontrada no arquivo");

  const cabecalho = todas[0];
  const bate = CABECALHO_ESPERADO.every((c, i) => cabecalho[i] === c);
  if (!bate) {
    console.error("AVISO: o cabeçalho do arquivo é diferente do esperado.");
    console.error("  esperado:", CABECALHO_ESPERADO.join(" | "));
    console.error("  achado..:", cabecalho.join(" | "));
    console.error("O portal pode ter mudado as colunas — confira antes de seguir.");
    process.exit(1);
  }

  const orgaos = new Set();
  const itens = todas.slice(1).map((c, i) => {
    orgaos.add(c[0]);
    return {
      id: i + 1,
      modalidade: c[1],
      nr: c[2],
      ano: c[3],
      // A coluna "Objeto" do portal não é a descrição do processo — é uma
      // categoria ampla (Compras, Obras e Serviços de Engenharia, Serviços de
      // Saúde...). A descrição de verdade é a do item, na coluna seguinte.
      categoria: c[4],
      abertura: dataBR(c[5]),
      item: c[6],
      qtd: numeroBR(c[7]),
      unidade: c[8],
      vlUnit: numeroBR(c[9]),
      vlTotal: numeroBR(c[10]),
      vencedor: c[11],
      cnpj: c[12],
    };
  });

  if (orgaos.size > 1) {
    console.error(
      "AVISO: o export tem mais de um órgão (" + [...orgaos].join(", ") + ").\n" +
      "A tela assume um órgão só (Prefeitura de Ijuí) e não mostra essa coluna — confira se é isso mesmo que você quer."
    );
  }

  const destino = join(RAIZ, "dados", "itens.json");
  writeFileSync(destino, JSON.stringify(itens, null, 0).replace(/},{/g, "},\n{") + "\n");

  console.log(`órgão: ${[...orgaos].join(", ")}`);
  console.log(`itens: ${itens.length}`);
  console.log(`gravado em: ${destino}`);
}

main();
