# Requisições — `/requisicao/` (protótipo)

Controle das requisições do município, uma tela para o que hoje é a planilha
`REQUISIÇÕES 2026.xlsx`: **uma aba por secretaria**, sempre as mesmas oito
colunas.

## A faixa de secretarias

É a primeira coisa da tela porque é a primeira decisão de quem usa. Ela faz
o papel das abas da planilha e serve a duas coisas ao mesmo tempo:

- **filtra** a lista para aquela secretaria;
- **diz em nome de quem a próxima requisição nasce**: com uma secretaria
  escolhida, "＋ Nova requisição" já abre com ela preenchida e com o
  **próximo número dela** — cada secretaria tem a própria sequência, como
  cada aba tinha.

## O que a tela mostra

Busca única em tudo (credor, objeto, número, modalidade, empenho, valor) e
filtro por coluna como numa planilha. A busca de cada coluna procura no que
**aquela coluna mostra**: digitar o número do empenho na coluna Empenho acha
o empenho, e o menu diz quantas requisições ele está segurando.

A coluna Empenho mostra o número quando existe e **"falta empenhar"** quando
não. Não é situação inventada: é a coluna EMPENHO vazia na planilha, que é
justamente o que se procura ao abrir o arquivo.

Relatório em PDF do filtro atual e ficha em PDF de uma requisição, no mesmo
papel dos Contratos e dos Pedidos de Diligência: logo do município, título,
rodapé com paginação.

## Isto ainda é protótipo

Não há banco de dados nem contas. A lista vem de `dados/requisicoes.json` e
**o que você salvar fica só neste navegador**, com aviso amarelo na tela;
"Exportar JSON" gera o arquivo para substituir o do repositório.

O passo seguinte, quando o desenho estiver aprovado, é o mesmo caminho que
os Contratos fizeram: coleção no Firestore do projeto `processos-ijui`, mais
um painel em `acessos` (`requisicao`), regras, e o histórico de edições.
Enquanto isso não acontece, duas pessoas mexendo ao mesmo tempo **não** se
enxergam.

## A planilha e o conversor

```
python3 requisicao/ferramentas/planilha-para-json.py PLANILHA.xlsx --gravar
```

Sem `--gravar` é ensaio. Ele escreve também `dados/CONFERIR.md` com o que
ficou em dúvida. Três coisas que ele resolve e valem saber:

1. **Números que viraram data.** O Excel lê `7/2026` como mês/ano e grava
   `01/07/2026`. O **mês** é o número da requisição — confirmado pela
   vizinhança nas abas (…`006/2026`, `01/07/2026`, `008/2026`…). Só acontece
   até 12, que é onde o Excel ainda enxerga um mês.
2. **Um traço sozinho** numa célula quer dizer "não tem": vira vazio, para a
   tela não mostrar uma etiqueta de empenho com "-" dentro.
3. **Valor** entra tanto como número quanto como texto à brasileira
   (`25.000,00`).

Números repetidos dentro da mesma secretaria **não são erro**: uma requisição
pode cobrir vários credores (em SMH, a `010/2026` tem sete linhas, uma por
fornecedor de material de distribuição gratuita). O `CONFERIR.md` lista os
casos para conferência, sem mexer em nada.
