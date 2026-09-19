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
numerado em sequência única. Cada anulação já cita a **requisição interna**
(`09-72-2026-SMED`) e o **memorando** — dois ponteiros para coisas que o
sistema já tem: a requisição vive em `/requisicao/`, o memorando na aba ao
lado. Hoje essa ligação existe só na cabeça de quem digitou.

**🗄️ Arquivo** — responde "onde está a DL 45/2025?" com a modalidade e uma
linha de busca, em vez de quatro cadernos e aba por aba. É aqui que o
processo é cadastrado, e é daqui que ele sai para a rua pelo botão **📤**:
a pasta deixa a prateleira e vira pendência na primeira tela, com quem está
com ela (ver *A pasta que sai e a pasta que volta*).

As três telas de cadastro (Arquivo, Anulações, Memorandos) **não têm painel
de cartões** em cima da tabela. Quem abre uma delas vem procurar um
registro ou lançar outro; "valor anulado no recorte" e "secretaria que mais
anula" são números de relatório, e empurravam a primeira linha para baixo
da dobra. 📍 Na rua mantém os seus — lá o número **é** a tela.

Fica **ao lado de 📍 Na rua** na barra de abas, e não por acaso: são as duas
pontas da mesma história — o documento sai para assinatura, volta assinado,
precisa ser catalogado. Um "✓ Voltou hoje" num trâmite de assinatura, com um
`docTipo` reconhecido (DL, PE, Inex, Conc — os mesmos tipos que viram
modalidade), pergunta na hora se é para catalogar; aceitando, a tela pula
para o Arquivo, já na modalidade certa, com uma **linha nova** na tabela e a
célula "Processo" aberta, já escrita (`DL 999/2026`) e a data de hoje
preenchida — a pessoa confere e completa (vencedor, valor, pregoeiro), não
digita do zero. O retorno em si é gravado de qualquer jeito, sim ou não na
pergunta: o que muda é só se o Arquivo abre atrás. Nada entra no cadastro
sem confirmar a célula — a sugestão nunca cria pasta sozinha. Papelada do
processo (EXTRATOS, SÚMULAS, ADITIVOS…) e empréstimo (documento que já
estava arquivado, só saiu para uma consulta) não disparam a pergunta — não
são processo novo virando pasta.

É lido **uma modalidade por vez**, pela faixa do alto — do mesmo jeito que
as Requisições são lidas uma secretaria por vez, e pela mesma razão: o
Controle do Arquivo é uma aba por modalidade, e é assim que se procura ("a
dispensa tal", "o pregão tal"). A faixa é **recorte, não filtro**: cada
botão é uma consulta própria (`where('modalidade','==',…)`), e as 449
dispensas não são lidas para mostrar os 26 da concorrência.

Não há "Todas", pela mesma razão das Requisições: seria a única leitura a
custar a coleção inteira, e é justamente a que ninguém precisa para
trabalhar. O número ao lado do botão só aparece na modalidade carregada —
nas outras seria invenção, porque a tela não as leu.

A tabela tem uma coluna "Modalidade", mesmo a faixa já dizendo onde se
está: é dali que se **move** um processo para outra modalidade (trocar o
valor da célula), e uma coluna que só existe quando se está editando seria
mais estranha que uma coluna sempre visível, mas discreta.

**📨 Memorandos** — as 18 abas (16 secretarias e dois "genéricos" que a
planilha mistura junto, "DOCUMENTAÇÕES DIVERSAS" e "GP") viram uma faixa de
secretarias, na mesma lógica das Requisições: **uma secretaria por vez**,
lida por inteiro — sem recorte de data, porque uma secretaria sozinha já é
pequena (~30 memorandos no ano, contra 533 no cadastro inteiro). O
memorando é o *porquê* de quase tudo: é ele que a anulação cita em
"REF. MEMORANDO".

## Quanto do cadastro cada tela lê

Nenhuma coleção é lida na abertura, nenhuma tela lê a sua inteira, e o que
chega é **dos últimos 30 dias**. É a conta que `/contratos/` já pagou —
1.294 documentos lidos por abertura para mostrar 141.

| Tela | O que a consulta pede | Lê |
|---|---|---|
| Na rua | `voltouEm == null` | **51** dos 978 trâmites |
| Arquivo | `arquivadoEm >= hoje-30` | ~55 das 659 pastas |
| Anulações | `contabilidadeEm >= hoje-30` | ~25 das 298 |
| Memorandos | `secretaria == escolhida` | ~30 das 533 (uma secretaria) |

Cada tela lê a sua coleção **uma vez por visita**, e só quando é aberta.

**A janela é um controle só.** Antes havia um período (7/30/90/tudo) que
peneirava o que já tinha sido baixado — a mesma pergunta em dois lugares,
uma lendo do banco e outra filtrando o resultado, com respostas
diferentes. Agora os botões **30 dias · 90 dias · Este ano · Tudo** mandam
na consulta. A tela diz qual janela está lendo.

**Memorandos é a exceção: não tem janela de data.** A secretaria já é o
recorte — uma secretaria sozinha (~30 memorandos) não precisa de mais uma
peneira por cima. O período (7/30/90/tudo) continua na tela, mas como
filtro sobre o que já foi lido daquela secretaria, não como consulta —
igual a como o período funcionava em todo lugar antes desta mudança.

**A busca alarga sozinha.** Procurar é dizer "não está à vista": buscar a
DL 45/2025 dentro de 30 dias não acharia nada, e a pessoa concluiria que o
processo não existe — o pior resultado possível num sistema de arquivo. A
primeira letra digitada abre o cadastro inteiro daquela tela, uma vez por
visita, e a tela avisa que abriu.

**"Na rua" fica de fora, e isso é o ponto do módulo.** Das 51 pendências,
45 estão abertas há MAIS de 30 dias — a janela esconderia justamente as
que precisam ser cobradas. Ela continua lendo por `voltouEm == null`, que
já é pequeno.

**Cada janela é uma consulta de um campo só, de propósito.** Cruzar dois
(modalidade E data) obrigaria a criar índice composto no console a cada
combinação: trabalho manual, fora do repositório, que quebra calado quando
falta. Por isso, na janela por data, a tela do arquivo pergunta ao banco
pela DATA e separa a modalidade no navegador — 55 documentos do mês, em
vez dos 449 que a dispensa tem no ano. Em "Tudo", volta a perguntar pela
modalidade.

**A consulta dos SEM DATA vem sempre junto.** Data torta — célula vazia,
`#VALUE!`, o `24/07/2062` que a planilha guarda — vira `ano: null` em vez
de um ano inventado, e o documento aparece em qualquer janela. Esconder um
registro é pior que pagar a leitura dele.

O `ano` precisa ser um CAMPO para a janela "Este ano" funcionar: o
Firestore não filtra por "os quatro primeiros caracteres de `recebidoEm`".
A anulação já traz o dela da planilha; o memorando ganha o dele **na
importação** — por isso isso tinha de nascer antes da primeira carga.

## Cadastrar e editar dentro da própria tabela

Até aqui, um documento só entrava numa das quatro coleções pela planilha e
pela importação — mesmo algo tão simples quanto "isto saiu hoje para
assinatura" esperava a próxima conversão. Agora as quatro cadastram e
editam, e fazem isso **na própria tabela, sem modal e sem card** — o mesmo
motor das Requisições: clicar numa célula vira um campo ali mesmo; Enter
ou clicar fora salva; Esc desiste.

O botão **＋** (Novo processo, Nova anulação, Novo memorando) insere uma
linha em branco no topo da tabela e já abre a primeira célula que faz
sentido preencher. Uma linha assim **não toca o banco até o primeiro campo
de verdade ser gravado** — e isso importa porque anulação, memorando e
trâmite não apagam: uma linha aberta por engano e nunca tocada não vira
lixo permanente. Ela só existe na tela, com um ✕ para descartá-la, e some
sozinha se a pessoa apertar Esc sem ter escrito nada.

**A largura das colunas é declarada, não medida.** Cada campo traz o seu
peso (`larg`), a tabela sai com `<colgroup>` e `table-layout: fixed`, e a
célula aberta guarda a altura que a linha tinha. Sem isso, clicar numa
célula trocava o texto por um campo de digitar — que mede outra coisa — e
a tabela inteira se redesenhava a cada clique: as colunas mudando de
largura, a linha encolhendo, tudo se mexendo debaixo do cursor.

Em Arquivo e Memorandos, a própria célula também **move**: trocar a
modalidade ou a secretaria tira o registro da faixa em que ele estava e
manda para a outra — a tela avisa para onde foi, porque sumir sem
explicação é o que faz alguém achar que perdeu o registro. É por isso que
as duas telas mantêm a coluna (Modalidade, Secretaria) mesmo a faixa já
dizendo qual é: é dali que se corrige o lugar de um registro. "Na rua" e
Anulações não têm essa faixa para mover entre (docTipo e requisição não
particionam a leitura como modalidade e secretaria fazem), então ali a
edição só corrige, nunca move.

**"Na rua" não é tabela** — é agrupada por pessoa, de propósito (ver
adiante). Por isso ali o clique abre a **linha inteira** como formulário
plano, em vez de célula por célula: mesmo espírito ("nada de modal"),
adaptado ao layout que já existia. E ali não se **cadastra**: o processo é
cadastrado uma vez, no Arquivo, e de lá muda de estado (ver *A pasta que
sai e a pasta que volta*).

**Tab anda pela linha inteira**, na mesma ordem das colunas — Shift+Tab
volta. É o que faz preencher um cadastro ser rápido: a mão nunca sai do
teclado para mirar a próxima célula com o mouse. Cada Tab grava a célula
que está fechando antes de abrir a próxima (por isso funciona até numa
linha ainda não gravada — o primeiro Tab é o que cria o documento no
Firestore e troca o id de rascunho pelo id de verdade; só depois disso a
segunda célula é encontrada e aberta).

## A pasta que sai e a pasta que volta

O processo que sai do arquivo **não é um cadastro novo: é a mesma pasta,
noutro estado.** Antes não era assim — "Na rua" tinha o seu próprio ＋, e a
mesma DL era digitada duas vezes, em duas telas, sem nada ligando uma à
outra. Era por isso que o "✓ Voltou hoje" não devolvia nada a lugar nenhum:
não havia a quem devolver.

Agora o caminho é um só:

1. o processo é cadastrado **uma vez**, no Arquivo;
2. o botão **📤** na linha dele manda a pasta para a rua — a linha já nasce
   preenchida a partir da pasta (o tipo do documento sai da modalidade, o
   número sai do processo, a data é hoje, é um empréstimo) e o cursor entra
   na única coisa que falta: **com quem** o papel está. Sem esse nome a
   gravação é recusada — pendência sem dono não cobra ninguém;
3. a pasta **sai da lista do Arquivo** e passa a viver em 📍 Na rua, com a
   etiqueta "🗄️ do arquivo". A tela do Arquivo conta quantas estão fora e
   leva até elas, porque sumir sem explicação é o que faz alguém cadastrar
   o mesmo processo de novo;
4. **✓ Voltou hoje** fecha o trâmite e devolve a pasta à prateleira. Aqui
   não se pergunta se é para catalogar (a sugestão de catalogar continua
   valendo para o trâmite que **não** veio de uma pasta): a pasta já existe,
   catalogar de novo duplicaria.

Duas marcas sustentam isso: `pastaId` no trâmite (é por ele que a volta
sabe qual pasta devolver) e `naRua` na pasta (é o que a tira da lista do
Arquivo). O filtro é na tela, não na consulta — perguntar modalidade **e**
`naRua` ao Firestore pediria índice composto, pelo motivo de sempre.

## Apagar: só a pasta, e de propósito

Trâmite, anulação e memorando **não apagam**. Um lançamento errado neles se
corrige clicando na célula e escrevendo o valor certo. Não é limitação
esquecida, é a regra do Firestore (`allow delete: if false` nas três, ver o
arquivo de regras): elas são registro de que **algo aconteceu** — o papel
saiu, o empenho foi anulado, o memorando chegou — e apagar uma linha
destruiria justamente o rastro que o módulo existe para guardar.

**A pasta do arquivo é a exceção, e tem 🗑 na linha.** Ela não conta um
acontecimento: ela diz **o que está na prateleira**. Processo lançado duas
vezes, na modalidade errada ou aberto por engano, "corrigido editando",
deixaria uma linha de um processo que não existe — e aí o arquivo passa a
mentir sobre o que guarda, que é pior que a linha não estar lá. A regra é
`allow delete: if arquivoEdit()`: quem apaga é quem pode editar. Pergunta
antes, dizendo o nome do processo, e não pede senha de novo (diferente do
`/requisicao/`, onde excluir mexe no despacho de terceiro) — o registro é
do próprio setor, e o portão de edição do painel é o que protege.

Vale para as quatro telas a linha **nunca gravada** (criada com ＋ e ainda
sem nenhum campo salvo): essa se descarta com Esc ou o ✕ da linha, porque
ela nunca existiu no banco para começo de conversa.

Registro nascido na tela **não leva o campo `id`** da planilha — quem usa
esse número é a importação, para reescrever em vez de duplicar. Ele ganha
id próprio do Firestore, e assim uma reimportação nunca passa por cima
dele.

**A anulação é a exceção: ela tem numeração própria e sequencial**, que a
planilha nunca pula (1, 2, 3…) — diferente do número de um memorando ou de
um trâmite, que é só o que está escrito no papel físico. Por isso o campo
"Nº" não se digita: ao abrir a linha nova, a tela pergunta ao banco pelo
maior número do **ano corrente** (`where('ano','==',ANO)`, uma consulta de
campo só — sem `orderBy`, para não pedir índice composto) e usa aquele
mais um. Essa consulta é separada do que está carregado na tela de
propósito: se a janela aberta for "30 dias", a maior anulação do ano pode
nem estar em memória, e tirar o próximo número dali repetiria um nº que já
existe no banco. É uma leitura a mais, só ao abrir uma linha nova — não a
cada render, e não presa ao que a tela está mostrando.

A anulação também **não pede secretaria** — não há coluna nem célula para
`reqSec`: o campo continua existindo para o que já veio importado da
planilha (a faceta "Secretaria" nos filtros usa ele), mas nada na tela
pede esse dado para um registro novo, porque ele não ajuda em nada que se
faça ali.

E ela ganhou uma célula que faltava: **"Voltou"** (o campo `retornoEm`) —
antes só a importação preenchia essa data; não havia jeito nenhum de
marcar pela tela que uma anulação tinha voltado da contabilidade, então
ela ficava em branco para sempre. Agora é uma célula de data como
qualquer outra, editável clicando nela.

**Pregoeiro muda de nome, ou some, conforme a modalidade.** Como a tabela
do Arquivo só mostra uma modalidade por vez, a tela decide a coluna uma
vez por render: em **Inexigibilidade** a coluna nem aparece (não existe
pregoeiro numa inexigibilidade), e em **Concorrência** o mesmo campo do
banco (`pregoeiro`) aparece rotulado **"Agente de Contratação"** — é só o
rótulo que muda, não o dado nem a coluna, então não precisou mexer no
schema nem migrar nada que já estava arquivado.

Não há trava contra duas pessoas cadastrando no mesmo minuto e calculando
o mesmo próximo número — é um escritório pequeno, o caso é raro, e
corrige-se editando o número depois. Não é um problema que pede a
complexidade de uma transação.

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
| Memorandos | entregue para | mais recentes · mais antigos |

Mais o **período** (7, 30, 90 dias ou tudo) e a **busca**, em todas — em
Memorandos, o período filtra dentro da secretaria já lida, não o banco.

A **faceta** de secretaria saiu dos filtros — não a coluna. A tabela de
Memorandos mantém a coluna "Secretaria" (assim como o Arquivo mantém
"Modalidade"), porque é editando essa célula que um memorando **move** de
secretaria; mas como opção de filtro ela some, porque a faixa acima já é
o recorte, e oferecer a mesma escolha duas vezes é confuso.

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

1. **Um gesto próprio para "passar para outra pessoa"** — hoje isso é só
   editar o campo "Com quem" no formulário de "Na rua" (ver *Cadastrar e
   editar dentro da própria tabela*), o que funciona mas não deixa rastro
   de que houve uma troca de mãos, só o estado final. O `SERAFIM` escrito
   na coluna "DATA RETORNO" da planilha é exatamente esse caso sem forma
   própria.
2. **Ligar na requisição** — a anulação cita `09-72-2026-SMED`, que já
   existe em `/requisicao/`. Clicar e abrir a requisição fecha o ciclo.

