# Arquivo e Anulações — `/arquivo/`

Ligado no Firestore do projeto `processos-ijui` — o mesmo banco do resto do
sistema — atrás do mesmo portão de acesso, olhando o painel **`arquivo`** em
`usuarios_v2`. Três níveis: sem acesso não entra, *Visualizar* vê e não
grava, *Editar* marca a volta e importa.

Quatro coleções, uma por planilha: `arquivo_tramites`, `arquivo_anulacoes`,
`arquivo_memorandos` e `arquivo_pastas`.

## O que estas quatro planilhas são, na verdade

| Caderno | Abas | O que registra |
|---|---|---|
| `ANULAÇÕES 2026` | 1 | anulação de empenho: nº, requisição, memorando, pedido, empenho, credor, valor, ida e volta da contabilidade |
| `MEMORANDOS 2026` | 19 (uma por secretaria) | memorando que chegou: número, data, assunto, para quem foi entregue |
| `Controle do Arquivo 2026` | 6 | o que está arquivado (concorrência, pregão, dispensa, inexigibilidade) e o empréstimo do arquivo |
| `PROCESSOS 2026` | 5 | montagem, assinatura e volta — uma aba por quem assina |

São 30 abas, e todas dizem a mesma coisa: **um papel saiu daqui, foi parar
com alguém, e precisa voltar.** O que muda entre uma aba e outra é o nome
que se dá à ida — assinatura, parecer, empréstimo, contabilidade — e quem
recebeu. É uma informação só, anotada em quatro lugares.

## O defeito que nenhuma delas consegue ter

Toda planilha tem a coluna **DATA RETORNO**. Nenhuma tem como avisar quando
ela fica vazia tempo demais — **célula vazia não chama ninguém**.

Nos dados de 2026, medindo de verdade:

- o tempo normal de uma assinatura é **1 dia** (mediana de 452 idas e voltas);
- mas **51 documentos** saíram e não consta a volta;
- **45 deles estão fora há mais de 30 dias**, e o mais antigo há **183**.

O contraste é a história inteira: o setor é rápido, e o que escapa não
escapa por lentidão — escapa por ser **invisível**. Uma linha entre mil, numa
aba entre trinta, com uma célula vazia no fim.

## O desenho

Quatro telas, e a primeira é a razão de existir do módulo.

**📍 Na rua** — tudo que saiu e não voltou, **agrupado por pessoa**, ordenado
por quem espera há mais tempo. Agrupar por pessoa e não por tipo de documento
é a decisão central: ninguém cobra "as inexigibilidades", fala-se com o
Andrei. Cada bloco é uma conversa. A cor vem do prazo medido nos próprios
dados — até 7 dias é o normal, acima de 30 é esquecimento. Um clique em
"✓ Voltou hoje" fecha a pendência, em vez de procurar a linha certa em 30
abas.

**✂️ Anulações** — o mesmo cadastro de hoje, com os mesmos campos, mas
numerado em sequência única e com o valor somado no alto (R$ 11,1 milhões em
298 anulações no ano). Cada anulação já cita a **requisição interna**
(`09-72-2026-SMED`) e o **memorando** — dois ponteiros para coisas que o
sistema já tem: a requisição vive em `/requisicao/`, o memorando na aba ao
lado. Hoje essa ligação existe só na cabeça de quem digitou.

**🗄️ Arquivo** — responde "onde está a DL 45/2025?" com a modalidade e uma
linha de busca, em vez de quatro cadernos e aba por aba. O empréstimo (quem
levou, quando) vira pendência na primeira tela sozinho.

É lido **uma modalidade por vez**, pela faixa do alto — do mesmo jeito que
as Requisições são lidas uma secretaria por vez, e pela mesma razão: o
Controle do Arquivo é uma aba por modalidade, e é assim que se procura ("a
dispensa tal", "o pregão tal"). A faixa é **recorte, não filtro**: cada
botão é uma consulta própria (`where('modalidade','==',…)`), e as 449
dispensas não são lidas para mostrar os 26 da concorrência.

Não há "Todas", pela mesma razão das Requisições: seria a única leitura a
custar a coleção inteira, e é justamente a que ninguém precisa para
trabalhar. O número ao lado do botão só aparece na modalidade carregada —
nas outras seria invenção, porque a tela não as leu. A coluna "Modalidade"
saiu da tabela junto: a faixa já diz onde se está.

**📨 Memorandos** — as 19 abas viram uma lista com busca. O memorando é o
*porquê* de quase tudo: é ele que a anulação cita.

## Quanto do cadastro cada tela lê

Nenhuma coleção é lida na abertura, e nenhuma tela lê a sua inteira. É a
conta que `/contratos/` já pagou — 1.294 documentos lidos por abertura
para mostrar 141 — e que aqui vem resolvida de saída:

| Tela | Recorte | Lê |
|---|---|---|
| Na rua | `where('voltouEm','==',null)` | **51** dos 978 trâmites |
| Arquivo | `where('modalidade','==',…)` | até 449 das 659 pastas |
| Anulações | `where('ano','==',…)` + os sem ano | 298 do ano, não de todos |
| Memorandos | `where('ano','==',…)` + os sem ano | 512 do ano, não de todos |

Cada tela lê a sua coleção **uma vez por visita**, e só quando é aberta:
quem entra para ver o que está na rua não paga pelo arquivo, pelas
anulações nem pelos memorandos.

**O ano precisa ser um CAMPO.** O Firestore não filtra por "os quatro
primeiros caracteres de `recebidoEm`". A anulação já traz o `ano` da
planilha; o memorando não, e ganha o dele **na importação** — é por isso
que o recorte tinha de nascer antes da primeira carga, e não depois:
acrescentar o campo com o cadastro já no banco é reimportar tudo.

**A consulta dos SEM ANO vem sempre junto.** Data torta — célula vazia,
`#VALUE!`, o `24/07/2062` que a planilha guarda — vira `ano: null` em vez
de um ano inventado, e o documento aparece em qualquer ano escolhido.
Arquivar um registro num ano que ninguém vai abrir é escondê-lo, e
esconder é pior que pagar a leitura.

Enquanto o recorte está de pé, um aviso na tela diz qual ano está à mostra
e traz **Ver todos os anos** — o mesmo desenho do aviso de `/contratos/`.

A tela do Arquivo **não** recorta por ano além da modalidade: seria uma
consulta composta (modalidade + ano), que no Firestore exige criar um
índice à mão, para economizar 29 leituras de 449. Não paga.

## Os filtros

Um motor só, igual nas quatro telas — o comportamento não muda de aba para
aba. Cada tela declara de onde vem a lista, qual data conta como "quando
veio", que facetas oferece e em que ordens pode ficar; o resto (marcar,
contar, limpar, mostrar o que está ligado) é o mesmo código.

| Tela | Filtra por | Ordena por |
|---|---|---|
| Na rua | com quem, tipo, documento, secretaria | fora há mais tempo · saiu por último · nome |
| Anulações | secretaria, quem lançou, faixa de valor | mais recentes · mais antigas · maior valor · nº |
| Arquivo | pregoeiro, checklist, ano (dentro da modalidade) | arquivado por último · primeiro · processo A–Z |
| Memorandos | secretaria, entregue para | mais recentes · mais antigos · secretaria A–Z |

Mais o **período** (7, 30, 90 dias ou tudo) e a **busca**, em todas.

Três decisões que valem explicação:

**As opções saem dos dados, não de uma lista fixa.** Secretaria que não
aparece no cadastro não vira opção — filtro que promete o que não tem faz
procurar onde não há. Cada opção mostra quantas linhas traz.

**A contagem considera os outros filtros ligados, menos o próprio.** Marcar
"SMED" em Anulações faz "quem lançou" contar só dentro de SMED (136 e 162
viram 45 e 55) — mas a lista de secretarias continua mostrando as outras 20,
senão não haveria como marcar uma segunda.

**O período é escolha única, as facetas são múltiplas.** "Os últimos que
vieram" é uma pergunta só; "SMED ou SMS" são duas respostas para a mesma.
Por isso período é botão segmentado e faceta é caixa de marcar.

Cada aba guarda o filtro dela: trocar de aba e voltar não desmancha o que
foi montado.

## Por que não é uma aba por planilha

Seria o caminho curto e erraria o alvo. Copiar as 30 abas para a tela
mantém o mesmo trabalho dobrado — anotar a mesma ida em dois lugares — e
mantém a pergunta que importa sem resposta. O módulo só se paga se a
primeira tela responder sozinha, com o que já foi digitado nas outras.

## Separar trâmite de memorando

Memorando **não** é empréstimo: chegou da secretaria, foi entregue, acabou —
a planilha nem tem coluna de devolução. Se ele entrasse na conta do que está
fora, a tela de pendências nasceria com **580 linhas em vermelho**, e as 51
que importam sumiriam no meio. É o mesmo ruído que hoje as esconde. Por
isso são duas listas: `tramites` (espera volta) e `memorandos` (não espera).

## O que o formulário conserta sozinho

`dados/CONFERIR.md` lista o que a conversão achou nas planilhas. Uma amostra
do que uma coluna de data aceita hoje e um campo de data recusaria:

| Onde | Estava escrito |
|---|---|
| `PROCESSOS!MAITÃDENER!118` | `#VALUE!` |
| `PROCESSOS!MAITÃDENER!9` | `SERAFIM` (numa coluna de data) |
| `MEMORANDOS!SMS!13` | `24/07/2062` |
| `PROCESSOS!MAITÃDENER!108` | `11/08/2026 (Faltou 78)` |
| `ANULAÇÕES!C8` | `11/2026` virou `01/11/2026` pelo Excel |

O `SERAFIM` na coluna "DATA RETORNO" é o mais interessante: não é erro de
digitação, é a planilha **não tendo como dizer** que o documento não voltou —
passou para outra pessoa. O sistema precisa disso como um gesto próprio
("passar para"), senão a pendência se perde na troca de mãos.

## Os dados, e como eles entram no banco

`dados/*.json` sai das planilhas por:

```
python3 arquivo/ferramentas/planilhas-para-json.py PASTA_COM_AS_PLANILHAS --gravar
```

Sem `--gravar` é ensaio. Ele também escreve `dados/CONFERIR.md`.

**A carga real NÃO está no repositório**, e isso muda como ela sobe. Este
repositório é público (vira o site ijui.net), e a carga traz credor, valor,
empenho e o assunto de cada memorando. Nada disso é segredo — são atos
administrativos, do tipo que o portal da transparência publica —, mas
publicar um cadastro inteiro de uma vez é decisão de quem responde pelo
setor, não efeito colateral de um deploy. E é a única coisa aqui que não dá
para desfazer: o que vai para o histórico do git de um repositório público
não volta.

Por isso **subir o cadastro é um gesto da tela**, e não um passo de
publicação: **⬆️ Importar planilhas** abre o seletor de arquivos, você
escolhe os JSON **no seu computador** e eles vão para as quatro coleções.
Grava em lotes de 400 (o limite do Firestore é 500) e usa o número da
própria carga como identificador do documento — **importar duas vezes
reescreve, não duplica**, então repetir depois de acrescentar linhas na
planilha é seguro. Cada arquivo é reconhecido pelo nome (`tramites.json`,
`anulacoes.json`, `memorandos.json`, `pastas.json`), e dá para mandar os
quatro de uma vez ou um por vez.

A primeira versão fazia `fetch('dados/tramites.json')`, buscando a carga
no servidor, ao lado do `index.html`. **Não funcionava nunca**, e pela
mesma razão que a carga existe: ela é gitignored porque o repositório é
público, então nunca está lá. Quem abria pelo site só via "não achei
dados/*.json". Escolher do disco também é o gesto certo — a carga vive na
máquina de quem rodou o conversor, e é de lá que ela sobe.

Se um dia a decisão for publicar a carga no repositório, ela precisa ser
varrida antes atrás de CPF, e-mail, telefone e assunto pessoal. Na conversão
de 2026 isso foi feito e não havia nenhum — mas a conferência vale por
carga, não para sempre.

`dados/exemplo/*.json` continua versionado: é a carga fictícia, escrita à
mão, que serviu ao protótipo.

## O que falta

1. **Cadastrar pela tela**: a anulação (com numeração automática), o
   trâmite novo e o "passar para outra pessoa" — hoje a tela grava a volta,
   e o resto ainda entra pela planilha e pela importação.
2. **Ligar na requisição** — a anulação cita `09-72-2026-SMED`, que já
   existe em `/requisicao/`. Clicar e abrir a requisição fecha o ciclo.

