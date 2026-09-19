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

## O desenho, e o que desce a cada visita

A identidade é a mesma do `/pregoeiro/`: fonte **Sora**, números em **Space
Grotesk** (valor, nº do contrato, contagem — algarismo de largura fixa, que é
o que deixa comparar valor com valor descendo a coluna), paleta **Mosaico das
Etnias** com a faixa do município no pé do cabeçalho, no topo da lista e no pé
dos modais, cabeçalho como painel escuro e botões chapados.

Os nomes antigos das cores (`--navy`, `--gold`…) viraram **apelidos** da
paleta nova. É o que fez ~500 regras mudarem de cor sem serem reescritas uma a
uma, e é o que deixa a troca reversível. Toda a aparência nova mora num bloco
só, no fim da folha de estilo, sob o título `IDENTIDADE`: mexer na identidade
um dia é mexer ali, não nos 400 seletores de cima.

Na lista, **o objeto aparece inteiro** — sem corte e sem reticências. Ele
chegou a ser limitado a três linhas, para as linhas ficarem todas da mesma
altura; quem usa a tela preferiu ler o objeto por completo ali, sem ter de
abrir a ficha para ver o fim da frase, e a linha passou a crescer com o texto.

O alinhamento: **tudo centrado, o objeto à esquerda**. As colunas curtas são
etiquetas e selos, e centradas viram uma coluna de blocos alinhados em vez de
texto encostado à esquerda com sobra à direita. O objeto é a exceção porque é
o texto que de fato se lê na tabela — justificado, ele fechava as linhas num
retângulo certinho e abria vãos brancos no meio das frases.

**O peso.** Medido com os 1.294 contratos reais, na conta de quem é
administrador — que era quem pagava mais caro:

| | antes | agora |
|---|---|---|
| primeira visita | 1.057 KB | 1.007 KB |
| visitas seguintes | 1.057 KB | **244 KB** |

Três coisas saíram da mochila:

1. **O brasão embutido no HTML** — 27 KB em base64 baixados a cada visita, do
   mesmo brasão que o ícone da aba já pedia — virou `../logo-ijui-180.jpg`, de
   5,7 KB, que serve aos três tamanhos em que ele aparece (16px na aba, 46px
   no cabeçalho, 180px na tela de início do iPhone) e fica no cache.
2. **A conferência com o arquivo** lia `dados/contratos.json` inteiro (763 KB)
   em toda visita de administrador, mesmo com o banco em dia. Agora ela
   pergunta primeiro a *versão* do arquivo — um `HEAD`, que não traz corpo
   nenhum: se for a mesma da última conferência e o banco tiver o mesmo tanto
   de contratos, não há o que conferir. O arquivo só desce quando um dos dois
   lados mexeu (ver `conferirImportacao`), e a resposta fica lembrada no
   próprio navegador.
3. **O brasão do PDF** (29 KB) era buscado na entrada "para estar pronto", e
   quase nenhuma visita imprime. Agora desce no primeiro PDF da visita — os
   dois caminhos que geram PDF já esperavam por ele.

Nada disso é grátis para sempre: as seções 21 e 22 de `../testes/t-contratos.js`
cobram cada uma dessas três (inclusive que o brasão não voltou para dentro do
HTML) e a identidade — fonte, cabeçalho escuro, faixa e alinhamento.

**Mudança grande se prova numa cópia antes.** A suíte inteira roda contra
qualquer pasta: `CONTRATOS_DIR=teste node t-contratos.js` aponta os 310 testes
para `/teste/index.html`. Foi assim que este desenho entrou — publicado em
`ijui.net/teste`, com a suíte passando contra ele, antes de substituir o
original.

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
fica: quem já pagou a leitura não paga de novo ao trocar de filtro. E o
resto é mesmo só o resto — as consultas do ano corrente **continuam de pé** e
entram duas novas, `ano < 2026` e `ano > 2026`, que leem 1.153 dos 1.294.
Trocar a consulta pela coleção inteira releria os 141 que já estão na tela,
e leitura repetida é leitura paga duas vezes: abrir **e** expandir custa o
cadastro uma vez, não uma vez e meia.

Traz o cadastro inteiro quem:

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
contrato ganha aditivo ou apostilamento, o valor e o prazo de origem passam a
morar em `valorBase`/`vencimentoBase` e os campos `valor`/`vencimento` viram
conta: valor de origem + soma dos aditivos e apostilamentos, e o prazo do
ajuste assinado mais recentemente. Assim a lista, os filtros e os relatórios
continuam lendo `valor` e `vencimento` sem saber que aditivo ou apostilamento
existe — e editar ou apagar um deles refaz a conta sem somar duas vezes. O
encerramento (ver abaixo) é diferente: não soma nada, só sobrepõe o
vencimento, porque um contrato encerrado não tem vigência além da data em
que foi encerrado.

Os aditivos e os apostilamentos moram **dentro** do documento do contrato,
cada um na sua lista (`aditivos` e `apostilamentos`). Isso tem efeito direto
na conta do Firebase: um contrato com 20 aditivos continua sendo **um**
documento — uma gravação ao salvar, uma leitura ao carregar, com os 20
aditivos juntos. Aditivo não vira documento, e por isso não vira leitura.

### Os tipos de aditivo, e o que cada um pergunta

São onze, e a diferença entre eles não é só o nome: cada um pede campos
diferentes. Um formulário único com seis campos obriga quem lança a
adivinhar quais preencher — e é assim que nasce um aditivo com "novo
vencimento" em branco que ninguém sabe se foi esquecimento ou se era para
ficar vazio.

| Tipo | O que pergunta |
|---|---|
| Prorrogação de prazo contratual | novo vencimento |
| Renovação contratual | início da renovação, novo vencimento e valor |
| Acréscimo de valor por aumento de quantitativo | valor acrescido |
| Acréscimo do valor por inclusão de itens novos | valor acrescido |
| Redução de valor por supressão de quantidade | valor suprimido |
| Redução de valor por supressão de item | valor suprimido |
| Reequilíbrio econômico-financeiro | variação do valor (para os dois lados) |
| Reajustamento de preço | variação do valor e o índice aplicado |
| Repactuação | variação do valor e o índice aplicado |
| Alteração da natureza ou razão social do contratado | nova razão social e CNPJ |
| Outros | só a observação — não mexe em prazo nem em valor |

**O sinal vem do tipo, não de quem digita.** Uma supressão pede o valor sem
sinal e guarda negativo. Pedir "−5.000" é pedir para alguém esquecer o
traço um dia, e aí a soma dos aditivos fecha errada sem ninguém perceber.

**Alteração de razão social tem consequência sobre o contrato, e a tela
pergunta antes de aplicar:** oferece passar a empresa do contrato para o
nome novo. Perguntar em vez de fazer sozinho — é o cadastro de quem lança,
não do sistema.

Aditivos gravados antes desta lista (com os nomes antigos: PRAZO, VALOR,
SUPRESSÃO…) continuam abrindo e editando normalmente, com todos os campos à
mostra. Nada precisou ser convertido.

Distrato, Rescisão e Apostilamento **não são aditivo** — cada um tem botão,
formulário e registro próprios, descritos a seguir.

### Encerrar contrato

São quatro os jeitos de um contrato acabar: **distrato** (acordo entre as
partes), **rescisão** (por descumprimento), **termo de recebimento de obra
pronta** e **termo de recebimento de serviços prestados** — os dois últimos
são o fim normal, o contrato cumprido. Nenhum deles muda uma cláusula:
acabam com o contrato. Por isso não moram na lista de aditivos: moram em
`encerramento`, um objeto só (o contrato encerra uma vez), com o tipo, a
data, a observação e — só para rescisão, que precisa justificar — o motivo.

Ao salvar, o contrato passa para **INATIVO** e o vencimento passa a ser a
data do encerramento; o valor não muda. A situação de antes fica guardada
junto (`situacaoAnterior`), para o botão **↺ Reabrir este contrato**, no
mesmo modal, saber para onde voltar: reabrir apaga o encerramento, devolve a
situação anterior e o vencimento volta ao que era antes (calculado a partir
dos aditivos e apostilamentos que o contrato já tinha, se algum).

### Apostilamento

Registro unilateral da Administração — não depende de assinatura da
contratada. Também não é aditivo: mora em `apostilamentos`, uma lista à
parte de `aditivos`, com numeração própria (o primeiro apostilamento de um
contrato é sempre o nº 1, mesmo que o contrato já tenha vários aditivos).

Pede só o número, a data e a observação: **não mexe em prazo nem em
valor**. O que se registra ali é o ato em si — a correção de um dado, a
mudança de dotação, o que não altera o que foi contratado. Fica separado na
ficha, no PDF e no histórico, porque juridicamente é outra coisa.

### As quatro situações

**ATIVO**, **PARALISADO**, **PROCESSO JUDICIAL** e **INATIVO**.

**O alerta de vencimento é só do ATIVO.** Um contrato paralisado ou em
processo judicial não está correndo prazo de execução — cobrar a data dele
seria alarme falso todo dia, e alarme falso todo dia é o que faz alguém
parar de olhar os alarmes de verdade. INATIVO, idem: já acabou.

Os três continuam existindo, aparecendo na lista e sendo pesquisáveis. O
que não têm é a cor de aviso no prazo: o selo do vencimento deles fica
cinza, com a data e nada mais.

`ATIVO-PARALIZADO` era o nome antigo de PARALISADO (e vinha com um "z" que
a palavra não tem). Os contratos que ainda o guardam são traduzidos na
leitura e gravam o nome novo na próxima vez que alguém salvar — não é
preciso mutirão de correção.

### "Não pode prorrogar"

Uma marca no cadastro do contrato, logo abaixo do vencimento no formulário.
Marcada, vira um selo **vermelho ao lado do vencimento** — na lista, na
ficha e no PDF.

Fica grudada no vencimento em toda parte de propósito: a pergunta "dá para
prorrogar?" nasce olhando o prazo, e uma resposta guardada noutro canto da
ficha seria lida tarde demais. No PDF isso vale ainda mais — a ficha é
impressa e anexada em processo, e quem lê precisa ver antes de pedir a
prorrogação.

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

## Link do LicitaCon

Os documentos de cada contrato — edital, termo assinado, aditivos — não
ficam aqui: ficam no portal do TCE-RS, o **LicitaCon**, uma página por
contrato. O sistema guarda o endereço dessa página em `linkLicitacon`, e
com ele preenchido a ficha ganha o botão **🔗 LicitaCon**, que abre o
portal numa janela à parte — a ficha continua aberta atrás, que é o que se
quer quando se confere documento contra cadastro.

**Uma ida só, e já no endereço.** Foi tentado abrir a janela vazia e
mandá-la ao portal depois, indo duas vezes para aquecer o caminho — à mão,
abrir/fechar/abrir realmente deixa a segunda ida rápida. Na Central do
Pregoeiro, que é onde esta tela roda de verdade, isso deixava a janela
**em branco**, por dois motivos somados: a Central some com pop-up que
nunca mostrou nada, e a segunda ida aborta o carregamento no meio — junto
com a sessão do portal, que nasce nele.

**Janela à parte, e não embutido na ficha.** Foi tentado: um quadro dentro
da própria ficha, para os documentos parecerem parte do sistema. O portal
recusa ser exibido dentro de outro site — é decisão dele, num cabeçalho da
resposta, e não há nada a fazer deste lado. O quadro vinha em branco.
Quem for mexer aqui, não perca tempo tentando de novo.

### Dentro da Central do Pregoeiro: guia em vez de pop-up

Esta tela roda, no dia a dia, como uma guia da **Central do Pregoeiro**
(o aplicativo em Electron). E a Central já resolve o pop-up feio, sem
precisar de uma linha de código aqui: ela intercepta **todo** `window.open`
de dentro de uma guia e, se o endereço pertencer a alguma guia cadastrada,
entrega o link para **ela** em vez de abrir janelinha (é o roteador de
links da v11.26, campo *"🔗 Links que devem abrir NESTA guia"* no ✎ de cada
guia).

Para o LicitaCon abrir como guia, basta cadastrar `portal.tce.rs.gov.br`
numa guia **própria** — não na guia dos Contratos. Se o endereço for
vinculado à guia dos Contratos, o clique navega a própria guia para o
portal e o cadastro some da tela; e, pior, o roteador para de agir, porque
ele só roteia quando o link sai de um lugar **diferente** do destino.

De quebra isso resolve a lentidão: a guia tem partição de sessão própria e
fica viva, então do segundo contrato em diante o portal já está quente e
logado — que é o efeito que abrir/fechar/abrir à mão produzia.

A Central também oferece esse vínculo sozinha: quando um link sem dono
abre em janelinha, ela pergunta *"de qual guia é esse link?"*. Se alguém
já respondeu "não perguntar mais", o caminho é o ✎ da guia.

Nada disso é configurável daqui: a página não tem como falar com a
Central. As guias são `<webview>` sem `preload`, então `window.central`
não existe dentro delas — o único canal entre esta tela e a Central é o
`window.open`, que é justamente o que o roteador escuta.

Contrato novo já nasce com o link, no próprio formulário. Para o cadastro
antigo existe o **🔗 Links LicitaCon** no cabeçalho: a lista dos contratos
ativos que ainda estão sem endereço, com a caixa já aberta em cada linha.
Cola, sai do campo, salvou — e o contrato sai da conta. O número no botão
é quantos ainda faltam. A tela abre só no ano corrente, então o painel
avisa e oferece trazer os outros anos antes do mutirão.

O campo recusa o que não for endereço `http`/`https`. Não é implicância: o
valor vai parar num `window.open`, e um `javascript:` colado ali seria
script rodando na página. O domínio é conferido à parte porque o navegador
é generoso demais — `new URL('https://frase com espaço')` não dá erro, ele
codifica a frase e devolve um endereço de aparência legítima, que viraria
um botão levando a lugar nenhum.

## Relatórios e fichas em PDF

São duas saídas: o **PDF do filtro atual**, que imprime exatamente os
contratos filtrados na tela, e a **Ficha em PDF** de um contrato. Os
relatórios agrupados (por secretaria, por fiscal, por faixa de vencimento)
saíram: a própria tabela filtra por essas colunas, e imprimir o filtro dá
o mesmo papel sem um segundo lugar para escolher a mesma coisa.

Mesmo desenho dos Pedidos de Diligência do Sistema Interno: logo do
município no alto, título abaixo, e o rodapé com a identificação e a
paginação. Texto em preto, para o papel e a fotocópia.

Um cuidado que não se vê: as fontes que o gerador de PDF traz de fábrica
desenham o alfabeto ocidental e nada além. Um caractere fora dessa conta
não sai errado só ele — a **linha inteira** sai com as letras esparramadas.
O cadastro tem 75 setas `→` e 28 setas de Wingdings coladas do Word, todas
separando o valor total do mensal; `pdfTexto()` troca por `->` antes de
desenhar. Ao colar objeto novo vindo do Word, é isso que segura o estrago.

Outro cuidado, esse dentro de uma célula só: colunas estreitas como "Nº/Ano"
e "Venc." combinam dois dados numa célula com `"\n"` entre eles (o número
embaixo da modalidade, a data embaixo do aviso "NAO PRORROGA"). O jsPDF não
trata esse `"\n"` como quebra de linha — só separa por espaço — e o `"\n"`
embutido virava parte de uma "palavra" sem espaço, cortada no meio do
caractere quando não cabia na coluna: `"141/2026CONC. E. 31/2026"` saía
grudado e cortado ao meio. `pdfQuebrarCelula()` separa por `"\n"` primeiro,
em JavaScript puro, e só depois pede pro jsPDF ajustar cada pedaço à
largura da coluna — cada pedaço vira sua própria linha, nunca emendado com
o seguinte.

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

Cada registro nasce com validade de **30 dias**. Quem abre o painel varre e
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

### Ela lê por mês

O calendário mostra um mês e lia os 1.294 contratos para desenhar os doze
que vencem nele. Agora pede por mês: uma consulta por
`vencimento` entre `AAAA-MM-01` e `AAAA-MM-31`, para cada mês que aparece na
grade — e são até três, porque a grade começa na segunda-feira antes do dia
1 e termina no domingo depois do último dia.

Os listeners ficam de pé. **Ir e voltar entre meses já visitados não custa
leitura nenhuma**, e um contrato que alguém alterar continua chegando ao
vivo em qualquer mês que esteja aberto. A tarja do cabeçalho conta o mês na
tela, não o cadastro: anunciar "1.278 vencimentos" seria falar de um
cadastro que não está aqui.

Na prática são ~12 contratos por mês, ~30 por visita, contra 1.294.

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
| `../logo-ijui-180.jpg` | o brasão em 5,7 KB: ícone da aba, cabeçalho e ícone do iPhone |
| `../testes/t-contratos.js` | confere a tela, o portão, a atualização ao vivo, o peso e a identidade |
