# Consulta de Itens Licitados — licitacon/

Página pública, só leitura, **sem Firebase**: nenhum dado sai daqui, nenhum
login, nada é gravado. Serve para alguém (a própria secretaria, o Tribunal de
Contas, um cidadão) buscar rápido por item, empresa vencedora ou valor
homologado numa licitação do Município de Ijuí.

## De onde vêm os dados

Do **Portal LicitaCon do TCE-RS** — é para lá que o Município já envia esses
dados por obrigação legal; este módulo só os torna mais fáceis de buscar.
Não há ligação com o Firestore das licitações (`processos-ijui`) nem com o
dos contratos: é um terceiro banco de dados, e este aqui nem é banco — é um
arquivo estático.

`dados/itens.json` tem **6.514 itens** (dados de 2023 a 2026, exportados em
02/09/2026), um por linha. Cada um é uma linha de item dentro de um processo:
processo (modalidade, número, ano), item, quantidade/unidade, valor unitário
e total homologados, empresa vencedora e CNPJ (quando houve vencedor).

A coluna **"Objeto"** do portal não é a descrição do processo — é uma
categoria ampla (Compras, Obras e Serviços de Engenharia, Serviços de
Saúde...). Por isso ela virou o campo `categoria` no JSON; a descrição de
verdade é a do item, no campo `item`.

## Como atualizar os dados

O Portal LicitaCon exporta um `.xls` que, por dentro, é uma tabela HTML (é o
formato que o Oracle BI Publisher do portal gera — abre normal no Excel, mas
não é uma planilha de verdade).

1. No Portal LicitaCon: **Consultas > Compras > Resultado da Busca por
   Item**, filtre pelo órgão (Prefeitura Municipal de Ijuí) e exporte.
2. Rode o conversor:

   ```bash
   node licitacon/ferramentas/converter.mjs caminho/do/resultado_da_busca_item.xls
   ```

   Ele sobrescreve `dados/itens.json`. Se o portal tiver mudado as colunas,
   o script avisa e para — não grava um arquivo fora do formato esperado.
3. Conferir com `git diff --stat licitacon/dados/itens.json` antes de commitar
   — dá para ver de longe se o tamanho da mudança faz sentido (poucos itens
   novos vs. o arquivo inteiro reescrito por engano).

## Arquivos

| | |
|---|---|
| `index.html` | a tela (busca, painel dinâmico, cards, modal de detalhe) |
| `dados/itens.json` | os itens, um por linha |
| `ferramentas/converter.mjs` | transforma o export do portal em `dados/itens.json` |
| `../testes/t-licitacon.js` | confere que filtros e totais batem com o arquivo |
