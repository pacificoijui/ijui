# Contratos — dentro do mesmo banco, com painel próprio de acesso

## Por que acabou ficando no mesmo projeto

A primeira decisão aqui foi por **projeto Firebase separado**, e o motivo
era bom: num projeto só, a única coisa que separa contratos de licitações é
o arquivo de regras — uma linha errada nele expõe os dois de uma vez. Com
projetos separados, errar a regra de um lado não alcança o outro.

O que mudou foi o **login**. Quando aquilo foi escrito, contratos não tinha
conta nenhuma; o que estava em jogo era só isolar dado de dado. Depois o
sistema ganhou contas de verdade (Firebase Authentication + `usuarios_v2`,
ver `CONTROLE-DE-ACESSO.md`), e aí a conta passou a pesar mais que o
isolamento:

| | projeto separado | mesmo projeto |
|---|---|---|
| Contas | duas por pessoa, dois cadastros, dois painéis de aprovação | **uma conta, um lugar pra aprovar** |
| Isolamento | total | por regra, `match /contratos/{id}` independente das outras |
| Para funcionar | criar projeto, ativar login, importar, manter dois configs | **já funciona** |

O risco que sobra é conhecido: se alguém colar uma regra errada no console,
expõe licitações **e** contratos de uma vez. Mitigado por duas coisas — as
regras são por coleção (não há curinga `match /{document=**}`), e o arquivo
`firestore-processos-ijui.rules` está versionado aqui, então dá pra
comparar e voltar atrás.

**Isso não é substituto para as regras.** O que protege o cadastro é a
regra `match /contratos/{id}`, que exige conta aprovada com o painel
Contratos: ver exige o painel, gravar exige nível "Editar".

## Como está hoje

Ligado no Firestore do projeto `processos-ijui`, coleção `contratos`, atrás
do portão de acesso — a tela só carrega a lista depois de confirmar que
quem entrou tem o painel Contratos liberado. A tarja do cabeçalho diz
`DADOS AO VIVO` quando é o banco que está no ar.

O `dados/contratos.json` continua no repositório como **histórico e semente
da primeira importação**. Ele não é mais a fonte da tela: se o Firestore
negar a leitura, a tela mostra o erro em vez de cair no arquivo — o arquivo
é público, e usá-lo como plano B furaria a proteção inteira.

## A tela abre recortada, e a busca abre o recorte

A tela abre nos contratos **do ano corrente**, do último cadastrado para
trás: quem chega de manhã quer ver o que entrou desde ontem.

O recorte é de verdade: a consulta ao Firestore pede
`where('ano','==',2026)` — hoje 141 documentos dos 1.294. Antes a tela lia
os 1.294 e escondia 1.153 na hora de desenhar, que é o pior dos dois
mundos: paga-se o cadastro inteiro a cada F5 e não se vê nada a mais por
isso. Contrato de 2022 ainda vigente continua existindo e aparecendo — ele
só não vem na abertura, exatamente como já não aparecia.

Uma consulta a mais acompanha ela, para contrato **sem ano preenchido**:
`where('ano','==',null)` não sai de graça no mesmo filtro, e somê-lo da
abertura seria esconder cadastro.

O resto vem quando alguém procura. **Uma vez por visita**, e daí em diante
fica: quem já pagou a leitura não paga de novo ao trocar de filtro. Traz o
cadastro inteiro quem:

* digitar qualquer coisa na busca do alto (ela diz "pesquisar em tudo" —
  com um ano na mão, não seria);
* abrir o menu de filtro de uma coluna (as opções têm de ser as do
  cadastro, não as do ano);
* abrir a folha de filtros do celular;
* clicar em **Limpar filtros**;
* pedir o JSON ou a importação (os dois precisam do cadastro inteiro para
  não gerar arquivo torto nem subir contrato que já está lá).

Enquanto o recorte está de pé, um aviso embaixo da lista diz o que está na
tela e traz o botão **Ver todos os anos**. Ele some sozinho depois que o
cadastro inteiro chega.

Ao **começar** uma busca a tela também limpa os filtros de coluna e avisa.
Antes, procurar uma empresa de 2019 respondia "nenhum contrato" para um
contrato que existe. Só a primeira letra abre: se você filtrar depois de
buscar, é porque quis cruzar as duas coisas, e o filtro fica.

### Banco vazio × ano vazio

Recorte vazio não é banco vazio — pode ser só um ano sem contrato. Antes de
dizer a um administrador "o banco está vazio, importe o cadastro", a tela
faz **uma** leitura (`limit(1)`) para separar os dois casos.

Pela mesma razão, a conferência com o `dados/contratos.json` é feita dentro
do recorte: comparar o arquivo inteiro com os 141 do ano diria "faltam mil"
e ofereceria subir o cadastro de novo — um botão perigoso nascido de conta
errada. Já o botão **Subir os que faltam**, quando clicado, traz o cadastro
inteiro antes de comparar.

## Cadastro, edição e aditivos

A tela cadastra contrato novo, edita contrato existente e registra aditivos
(prazo, valor, ou os dois). Salvar escreve direto no Firestore, e **quem
estiver com a tela aberta vê a alteração na hora**, sem recarregar: a lista
é ouvida ao vivo (`onSnapshot`). É isso que permite duas pessoas mexerem
nos contratos ao mesmo tempo.

O valor e o vencimento que a lista mostra são sempre os **vigentes**. Quando um
contrato ganha aditivo, o valor e o prazo de origem passam a morar em
`valorBase`/`vencimentoBase` e os campos `valor`/`vencimento` viram conta:
valor de origem + soma dos aditivos, e o prazo do aditivo assinado mais
recentemente. Assim a lista, os filtros e os relatórios continuam lendo
`valor` e `vencimento` sem saber que aditivo existe — e editar ou apagar um
aditivo refaz a conta sem somar duas vezes.

Os aditivos moram **dentro** do documento do contrato, numa lista. Isso tem
efeito direto na conta do Firebase: um contrato com 20 aditivos continua
sendo **um** documento — uma gravação ao salvar, uma leitura ao carregar,
com os 20 aditivos juntos. Aditivo não vira documento, e por isso não vira
leitura.

### Quem pode editar

Três níveis, os mesmos dos outros painéis (ver `CONTROLE-DE-ACESSO.md`):

- **Sem acesso** — nem entra: fica na tela de "aguardando liberação", e a
  lista de contratos nem chega ao navegador;
- **Visualizar** — vê tudo, mas os botões de cadastro somem e qualquer
  tentativa de gravar é recusada (no navegador e nas regras);
- **Editar** — cadastra, edita e registra aditivos.

Quem aprova é um administrador, no painel **Usuários** dentro do Sistema
Interno — é o mesmo cadastro de contas do resto do sistema. Para alguém que
só cuida de contrato: **Contratos: Editar**, e "Sem acesso" nos outros dois
painéis.

## Primeira importação

A coleção nasce vazia. Com o banco vazio, um administrador que abrir a tela
vê o botão **"Importar os contratos agora"**, que sobe os contratos do
`dados/contratos.json` em lotes. É feito pela tela de propósito: gravar
exige login, e assim não é preciso terminal nem credencial de
administrador do Firebase.

**Não feche a página no meio.** Assim que o primeiro lote entra o banco
deixa de estar vazio e a lista se monta por cima da tela de importação —
parece pronto, mas ainda falta lote. O andamento fica num aviso próprio,
que a lista não apaga, e só some quando acaba.

Se mesmo assim ficar pela metade, não fica escondido: enquanto houver
contrato do arquivo fora do banco, o administrador vê um aviso amarelo
dizendo quantos faltam, com o botão **"Subir os que faltam"**. Pode clicar
quantas vezes quiser — cada contrato grava no documento com o próprio id,
então reenviar não duplica nada. Esse mesmo aviso é o que apareceria depois
de o arquivo ser atualizado pela planilha do setor.

Depois disso quem manda é o banco. O arquivo do repositório fica como
histórico — e o **Exportar JSON** da tela continua gerando uma cópia no
mesmo formato quando você quiser atualizar esse histórico.

## Relatórios e fichas em PDF

Mesmo desenho dos Pedidos de Diligência do Sistema Interno: logo do
município no alto, título abaixo, e o rodapé com a identificação e a
paginação. Texto em preto, para o papel e a fotocópia.

Um cuidado que não se vê: as fontes que o gerador de PDF traz de fábrica
desenham o alfabeto ocidental e nada além. Um caractere fora dessa conta
não sai errado só ele — a **linha inteira** sai com as letras esparramadas.
O cadastro tem 75 setas `→` e 28 setas de Wingdings coladas do Word, todas
separando o valor total do mensal; `pdfTexto()` troca por `->` antes de
desenhar. Ao colar objeto novo vindo do Word, é isso que segura o estrago.

## Histórico de edições

Toda gravação — contrato novo, edição, aditivo cadastrado, alterado ou
excluído — deixa um registro na coleção `contratos_historico`: quem foi,
quando, e o contrato inteiro **antes** e **depois**. O botão **🕘 Histórico**
abre a lista, em português ("Serli editou o contrato nº 12/2025"), já
mostrando o que mudou em cada campo.

**Desfazer** regrava a versão anterior. Não apaga nada: o próprio desfazer
entra no histórico como mais uma edição, então dá para desfazer o desfazer.
Se o contrato tiver sido alterado de novo depois daquela edição, o aviso
diz isso antes de confirmar — desfazer ali descarta também o que veio
depois. Contrato recém-cadastrado não tem "antes" para voltar: para tirá-lo
do ar, marque **INATIVO** na ficha (o sistema não exclui contrato).

Quem tem **Contratos: Visualizar** lê o histórico mas não desfaz nada.

O painel abre com as 300 edições mais recentes e busca as mais antigas no
botão do fim da lista — um ano de trabalho de uma equipe passa fácil disso.

Cada registro nasce com validade de **365 dias**. Quem abre o painel varre e
apaga o que já venceu, então o histórico não cresce para sempre. As regras
do Firestore só deixam apagar registro **vencido** — ninguém, nem o
administrador, consegue sumir com o rastro do que fez ontem, e nenhum
registro pode ser reescrito depois de gravado.

Para o Firestore fazer essa limpeza sozinho, sem depender de alguém abrir a
tela: no console do Firebase, **Firestore Database → TTL → Criar política**,
coleção `contratos_historico`, campo `expiraEm`. É opcional.

## Agenda de vencimentos (`/contratos/agenda/`)

O calendário dos vencimentos, aberto pelo botão **📅 Agenda**. Cada dia
mostra os contratos que vencem ali, só pelo número — "Contrato 74/2022" —,
e clicar abre a ficha. Do rodapé dela saem a **ficha em PDF** (a mesma do
sistema) e o caminho para o mesmo contrato no sistema, onde dá para editar
e lançar aditivo.

Feriados, pontos facultativos e aniversários dos servidores são **os mesmos
da Agenda de Licitações**, lidos das mesmas coleções. Aqui é só leitura:
quem cadastra continua sendo a Agenda, porque o mesmo cadastro em dois
lugares vira dois cadastros diferentes. A observação do dia da Agenda
("PE 131 PEDR", "leilão 09:30") não vem: é recado de licitação e não diz
nada a quem está olhando vencimento de contrato.

Um dia com muitos vencimentos mostra todos, e a linha do calendário cresce
para caber — a alternativa seria esconder alguns atrás de um "+4 mais", e o
dia com dez contratos é justamente aquele em que esconder atrapalha. Por
isso o mês e as setas ficam grudados no topo ao rolar.

Uma diferença de propósito em relação à Agenda de Licitações: lá a semana
tem cinco colunas, porque licitação não abre no fim de semana. Aqui tem
sete — vencimento cai no dia que cai, e esconder sábado e domingo faria
sumir da tela um contrato que vence justamente ali.

Quem tem **Contratos: Visualizar** entra normalmente; é uma tela que não
grava nada.

## O que ainda depende de você, no console do Firebase

Só uma coisa: **publicar as regras**. O arquivo
[`../firestore-processos-ijui.rules`](../firestore-processos-ijui.rules) já
traz o `match /contratos/{id}`. Enquanto ele não for publicado, a coleção
`contratos` fica sem regra nenhuma — e sem regra o Firestore nega tudo, ou
seja, a tela não carrega.

## Arquivos

| | |
|---|---|
| `index.html` | a tela: busca que varre tudo, tabela única com filtro em cada coluna, o cadastro de contratos e aditivos, o portão de acesso (bloco "CONTAS E PERMISSÕES") e a importação inicial |
| `dados/contratos.json` | os contratos, um por linha — histórico e semente da primeira importação |
| `../firestore-processos-ijui.rules` | as regras, incluindo `match /contratos/{id}` |
| `../CONTROLE-DE-ACESSO.md` | como funcionam as contas e os três painéis |
| `../testes/t-contratos.js` | confere a tela, o portão e a atualização ao vivo |
