# Controle de acesso — contas e permissões

Até aqui, entrar no sistema (Agenda + Sistema Interno) era usuário/senha
guardados numa coleção do Firestore com as regras **abertas para leitura**
— sem isso, o próprio login (feito direto do navegador, sem servidor) não
teria como conferir a senha. Era o preço de não ter backend: qualquer um
com a chave web pública do projeto conseguia ler a coleção `usuarios`
inteira, hashes de senha inclusos.

Agora o login é feito pelo **Firebase Authentication** (Google ou
e-mail/senha), que verifica identidade de fora do Firestore. Isso permite o
banco ficar de verdade fechado: as regras passam a exigir estar autenticado
— e, pra a maioria das coleções, também **aprovado pelo administrador para
aquele painel específico** — em vez de abertas por necessidade técnica.

## Como funciona, do ponto de vista de quem usa

1. A pessoa abre a Agenda ou o Sistema Interno e vê um botão **Entrar com
   Google** (ou pode criar conta com e-mail/senha).
2. Ao entrar pela primeira vez, a conta nasce **pendente**, sem acesso a
   nada — nem à Agenda, nem ao Sistema Interno. A tela mostra "Aguardando
   liberação" com o nome, foto e e-mail de quem entrou.
3. Um administrador abre **Usuários** — a tela própria em `/usuarios/`, à
   qual só administrador tem entrada — e vê o pedido esperando. Marca ali
   mesmo, painel por painel (Agenda, Sistema Interno, Contratos,
   Requisições), um de três níveis — **Sem acesso**, **Visualizar** ou
   **Editar** — e aprova.
4. A liberação chega **na hora**, sem precisar relogar: quem estava com a
   aba aberta na tela de espera vê o sistema abrir sozinho.

## Os quatro painéis

Uma conta só, com um nível para cada painel:

| Painel | O que é | Endereço |
|---|---|---|
| **Agenda** | a agenda pública de licitações | `/` |
| **Sistema Interno** | a central do pregoeiro | `/pregoeiro/` |
| **Contratos** | o cadastro de contratos e aditivos | `/contratos/` |
| **Requisições** | as requisições das secretarias | `/requisicao/` |

Os quatro moram no mesmo projeto do Firebase e usam a **mesma conta**: quem
cuida só de contrato ganha nível em Contratos e "Sem acesso" nos outros
três, e continua sendo uma pessoa, uma conta, aprovada num lugar só.

A tela onde isso tudo se marca é **`/usuarios/`**. Ela não fica mais dentro
do Sistema Interno: aprovar conta e distribuir acesso é trabalho de
administrador, não do pregoeiro, e uma tela só de administrador é mais
fácil de guardar do que um botão escondido no meio de outra. Quem não é
administrador e abre o endereço recebe um recado dizendo isso, e os links
para voltar. O Sistema Interno continua com o botão **Usuários** no topo —
mas só aparece para administrador, e é um link para `/usuarios/`.

## Três níveis por painel: Sem acesso / Visualizar / Editar

Além de dar ou não acesso a um painel, o administrador escolhe **o quanto**
essa pessoa pode fazer nele:

- **Sem acesso** — nem entra no painel.
- **Visualizar** — entra, vê tudo (processos, status, decisões, contratos),
  mas qualquer botão de salvar/editar/excluir é barrado.
  Aparece um aviso fixo no topo da tela ("👁 Modo somente visualização")
  pra nunca confundir com um erro qualquer.
- **Editar** — acesso completo, igual ao que existia antes desta mudança.

A trava não é só visual: o próprio `db.collection(...)` do Firestore é
interceptado no carregamento da página (ver o comentário "Trava de escrita
por painel" no topo de `index.html` e `pregoeiro/index.html`), então uma
tentativa de gravar por quem só tem "Visualizar" é rejeitada **no
navegador**, antes mesmo de tentar a rede — e, por trás dela, as regras do
Firestore (`firestore-processos-ijui.rules`) exigem o nível `'editar'` da
mesma forma, então mesmo alguém mexendo direto no console do navegador não
consegue contornar a trava do cliente.

Contas aprovadas antes desta mudança guardavam só `true`/`false` (liberado
ou não) — não precisaram de nenhuma migração: o sistema trata `true` como
"Editar" e `false`/ausente como "Sem acesso" automaticamente, nos dois
lados (JavaScript e regras do Firestore).

O e-mail `pedrohhpacifico@gmail.com` é o **e-mail de resgate**: a primeira
vez que ele entra, já nasce administrador com os três painéis liberados —
garante que sempre exista alguém capaz de aprovar todo o resto. É a mesma
ideia do antigo `AUTH_BOOTSTRAP_ADMIN = "pacifico"`, só que agora amarrada a
um e-mail de verdade (verificado pelo Google/Firebase), não a um texto que
qualquer um poderia digitar.

## Pré-cadastro por e-mail (opcional)

No painel Usuários também dá para **preparar um convite**: nome, e-mail e
o nível (Sem acesso/Visualizar/Editar) de cada painel que a pessoa vai ter,
antes mesmo de ela entrar pela primeira vez. Isso **não dá acesso sozinho**
— é só um lembrete. Quando a pessoa efetivamente se cadastra com aquele
e-mail, o pedido dela aparece destacado ("★ convite preparado: Agenda
(editar), Sistema Interno (visualizar)") e um clique aplica exatamente o
que foi preparado. A liberação continua sendo sempre uma ação do
administrador, nunca algo que o próprio cadastro força sozinho — é isso que
torna seguro deixar o cadastro em si aberto ao público.

## As 15 contas de hoje (usuário/senha)

Elas **não têm e-mail cadastrado** — só um nome de usuário (`julio`,
`adelar`, `bianca`, `daia`, `juliana`, `lucilda`, `serli`, `anapaula`,
`anna`, `alex`, `papidrigus`, `pacifico`, `andre`, `erlon`, `elio`). Como
Firebase Authentication exige e-mail ou conta Google de verdade, não dá
para migrar essas contas automaticamente — não existe e-mail nenhum
associado a elas para criar a conta nova.

Ficou combinado que **cada pessoa se cadastra quando puder**: mostre este
sistema pra elas, cada uma cria a própria conta (Google é o caminho mais
rápido) e você aprova no painel Usuários, marcando os mesmos painéis que
ela já tinha. Pra ajudar nisso, o painel tem uma seção **"Contas antigas"**
(só leitura) listando quem ainda não migrou, e o painel de convites deixa
preparar o acesso de alguém antes mesmo dela aparecer.

O cadastro antigo (coleção `usuarios`) não é apagado — fica só de
referência. Ele **não autentica mais ninguém**: as regras novas nem
permitem mais lê-lo, exceto o administrador (para essa lista de
acompanhamento).

## O que muda de comportamento (e por quê)

- **O link `?consulta=1`** (compartilhar a lista de processos "sem senha,
  sem edição") passou a pedir login. Ele percorre a lista inteira de
  processos, e listar é exatamente o que as regras fecharam — era o tipo de
  exposição ampla que "fechar tudo" pede pra eliminar. Quem recebe o link
  agora vê o portão, entra com a conta dele (Google, em segundos) e cai no
  mesmo painel de sempre. Basta ter **Agenda ou Sistema Interno** em
  qualquer nível, inclusive "Visualizar" — é um painel só de leitura.
- **Os links `?ranking=ID`, `?hab=ID`, `?assinar=ID` e `?assinatura=ID`
  continuam funcionando sem login**, de propósito: são links individuais
  para UM documento específico (um comitê editando o ranking de um
  processo, uma secretaria julgando uma habilitação, alguém assinando uma
  decisão pelo celular), o id é essencialmente um segredo longo do
  Firestore, e ninguém consegue *listar* a coleção inteira sem estar
  logado — só abrir o documento cujo link já recebeu. É uma exposição
  estreita e deliberada, muito diferente de deixar o banco todo aberto.
- **Redefinir a senha de outra pessoa deixou de existir como botão do
  admin.** O Firebase não permite isso pelo aplicativo (só por um servidor
  com credencial de administrador, que este sistema não tem). No lugar,
  o admin tem o botão **"Enviar redefinição de senha"**, que manda um
  e-mail com um link — a própria pessoa escolhe a senha nova. Só existe
  para contas de e-mail/senha; contas Google não têm senha para redefinir.

## O que fazer no console do Firebase (só você consegue)

Nada disso o Claude consegue fazer sozinho — precisa da sua conta do
Firebase.

### 1. Ativar os métodos de login

Firebase Console → projeto **processos-ijui** → **Authentication** →
**Sign-in method** → ativar:
- **Google**
- **E-mail/senha**

### 2. Publicar as regras novas do Firestore

O arquivo [`firestore-processos-ijui.rules`](firestore-processos-ijui.rules),
na raiz deste repositório, é a fonte da verdade do que as regras deveriam
ser. Copie o conteúdo dele em: Firebase Console → **processos-ijui** →
**Firestore Database** → **Regras** → colar → **Publicar**.

Antes de publicar de vez, vale simular alguns casos na aba **Regras** →
**Playground** do próprio console (não precisa código nenhum):
- Leitura em `usuarios` sem estar autenticado → **negado** (hoje é aberto).
- Leitura em `usuarios_v2/<seu-uid>` autenticado como você mesmo →
  **permitido**.
- Leitura em `usuarios_v2/<outro-uid>` autenticado como alguém que não é
  admin → **negado**.
- Leitura de um `rankings/<id-que-você-tem>` sem estar autenticado →
  **permitido** (o link continua funcionando).
- Listar (`list`) a coleção `rankings` inteira sem estar autenticado →
  **negado**.

Essas regras **agora são testadas de verdade**, contra o motor oficial do
Firestore rodando no emulador: `testes/t-regras.mjs` (41 conferências, do
"visitante não lista processos" ao "ninguém se promove sozinho"), que entra
junto com o resto em `testes/rodar.sh`. O Playground do console continua
útil para uma conferência manual, mas não é mais a única rede de proteção.

### 3. Testar com a sua própria conta

Depois de publicar, abra o site e entre com **pedrohhpacifico@gmail.com**
pelo Google — deve cair direto no sistema, já administrador. A partir daí,
peça para as 15 pessoas irem se cadastrando (Google é o caminho mais
rápido) e aprove cada uma no painel **Usuários**.

## Arquivos

| | |
|---|---|
| `firestore-processos-ijui.rules` | as regras do Firestore do projeto processos-ijui (colar no console) |
| `index.html` (bloco "LOGIN / CONTROLE DE ACESSO") | portão de acesso da Agenda |
| `pregoeiro/index.html` (mesmo bloco + painel "Usuários") | portão de acesso do Sistema Interno, e onde o admin aprova/gerencia |
| `testes/t-auth.js` | confere cadastro → pendente → aprovação → acesso ao vivo, o e-mail de resgate, convites, e a proteção do último admin |
| `contratos/index.html` (bloco "CONTAS E PERMISSÕES") | portão de acesso dos Contratos, no mesmo cadastro |
| `requisicao/index.html` (mesmo bloco) | portão de acesso das Requisições, e a trava do despacho do Diretor |
| `usuarios/index.html` | a tela de Usuários: aprovar contas, marcar níveis, convites e contas antigas — só administrador |
| `testes/t-requisicao.js` | confere a tela das Requisições e a coluna DIRETOR: quem preenche não despacha, quem despacha não preenche |
| `testes/t-regras.mjs` | roda as regras no emulador oficial do Firestore e confere quem pode o quê, caso a caso |
| `testes/fbstub3.js` | o Firestore E o Firebase Auth falsos usados nos testes (`firebase.auth()` simulado, sem rede nenhuma) |

## Contratos

Contratos **não é mais um projeto Firebase à parte**: virou o terceiro
painel deste mesmo controle de acesso. A razão é prática — projeto separado
significaria um segundo Firebase Authentication, ou seja, cada pessoa com
duas contas e você aprovando em dois painéis diferentes. Com um projeto só,
é uma conta por pessoa e um lugar só pra liberar.

O que muda em relação aos outros dois painéis: em Contratos **nem ler é
público**. Sem conta aprovada com o painel liberado, a lista nem chega ao
navegador — e a tela **não** cai no `dados/contratos.json` quando o
Firestore nega, porque esse arquivo é público e isso furaria a proteção
inteira.

Para cadastrar alguém que só cuida de contrato: aprove a conta dela no
painel Usuários com **Contratos: Editar** e **Sem acesso** nos outros dois.

Duas pessoas podem trabalhar ao mesmo tempo: a tela ouve o Firestore ao
vivo, então o que uma salva aparece na outra na hora, sem recarregar.

A primeira importação dos contratos é feita **pela própria tela**:
entre como administrador em `/contratos/` com o banco ainda vazio e clique
em **"Importar os contratos agora"** — sem fechar a página até terminar. Se
sobrar contrato do arquivo fora do banco, a tela avisa e oferece completar.
Ver `contratos/LEIA-ME.md`.

Toda gravação de contrato fica registrada em `contratos_historico` (quem,
quando, antes e depois), com botão de desfazer na tela e validade de 365
dias. As regras não deixam reescrever um registro nem apagar o que ainda
está no prazo — nem para o administrador. Ver `contratos/LEIA-ME.md`.

A Agenda de Contratos (`/contratos/agenda/`) usa o mesmo painel `contratos`
e mostra o calendário de vencimentos. Como ela exibe feriados, pontos
facultativos e aniversários — as mesmas coleções da Agenda de Licitações —,
as regras deixam quem tem só o painel Contratos **ler**
`pontos_facultativos` e `aniversarios`. Escrever nelas continua sendo de
quem cuida da Agenda. A observação do dia (`observacoes`) ficou de fora: é
recado de licitação e não aparece no calendário de contratos.

## Editais

Ainda sem projeto e sem contas — continua com dados locais/arquivo. Quando
ganhar cadastro, o caminho é o mesmo: mais um painel em `acessos`, mais um
`match` nas regras.

### O nome que aparece nas telas

Vem do que a pessoa digitou ao criar a conta, ou do nome da conta Google.
Uma caixa de setor (`contratos@ijui.rs.gov.br`) entra sem nome nenhum e
acabaria chamada de "contratos", que é só o pedaço do e-mail — e é esse
nome que vai para o cabeçalho da tela e para o histórico dos contratos
("**Serli** editou o contrato nº 12/2025").

Por isso o nome é editável direto na linha do painel Usuários, tanto em
Pendentes quanto em Aprovados: clique nele, escreva, e salve junto com o
resto (o botão 💾, ou o próprio "Aprovar"). Deixar em branco não apaga o
nome que já havia. Nomes já gravados no histórico não mudam — o registro
guarda quem era na hora da edição, que é o que um histórico deve fazer.

## Backup diário

O backup automático (GitHub Actions, `.github/workflows/backup-firestore.yml`)
lia as coleções com a chave web pública. **Isso parou de funcionar quando as
regras foram fechadas** — listar coleção passou a exigir conta aprovada.
Agora ele entra com uma conta admin do próprio sistema, e para isso precisa
de dois secrets no repositório.

### Por que não dá para usar a sua conta

O backup entra pela API `accounts:signInWithPassword` — **e-mail e senha**.
Quem entra no sistema **pelo Google não tem senha no Firebase**: não existe
senha para pôr no secret. A conta de quem administra o dia a dia costuma ser
justamente essa, então ela não serve aqui — não é preferência, é técnico.

E mesmo com uma conta admin de e-mail/senha nas mãos, usar a sua seria ruim:
a senha vira um secret do repositório (quem tiver admin no GitHub pode
trocá-la, e um workflow novo pode imprimi-la), o backup para calado no dia em
que você mudar a sua senha, e o log passa a registrar você entrando todo dia
às 3 da manhã.

### O caminho

1. Crie uma conta de e-mail/senha **só para isso**, na tela de login →
   "Criar uma conta". O truque do `+` do Gmail resolve o incômodo:
   `seuemail+backup@gmail.com` chega na sua caixa normal, mas para o
   Firebase é outra conta, com senha própria — uma senha que você inventa,
   usa só ali e não digita em lugar nenhum.
2. Em **`/usuarios/`**, aprove essa conta e marque **☑ Administrador**.
   Precisa ser admin porque o backup também copia o cadastro de contas
   (`usuarios_v2`), que só admin consegue listar.
3. No GitHub: **Settings → Secrets and variables → Actions → New repository
   secret**, criando dois:
   - `BACKUP_EMAIL` — o e-mail dessa conta
   - `BACKUP_SENHA` — a senha dela
4. Rode uma vez na mão para conferir: aba **Actions** → "Backup diário do
   Firestore" → **Run workflow**.

Sem esses secrets o backup falha com a mensagem explicando isso — de
propósito, para não gravar um backup vazio achando que está tudo bem.

### A lista de coleções envelhece calada

A API REST do Firestore não lista coleções sem credencial de administrador do
Google Cloud, então `backup-firestore.mjs` traz a lista **escrita à mão**.
Coleção nova entra no sistema, ninguém lembra do backup, e o job segue verde
copiando tudo menos ela — aconteceu com `editais` e de novo com
`requisicoes`.

`testes/t-backup.js` é o alarme: ele lê os `match /X/{id}` deste arquivo de
regras (que é a lista de verdade do que existe) e compara com a lista do
script. Coleção com regra e sem backup faz o teste falhar dizendo o nome
dela e onde acrescentar.

## Requisições — e o quarto nível, "Diretor"

Requisições é o quarto painel, no mesmo cadastro de contas, e é fechado
como Contratos: **sem conta aprovada com o painel liberado, a lista nem
chega ao navegador**, e a tela não cai no `dados/requisicoes.json` quando o
Firestore nega — esse arquivo é público, e cair nele furaria a proteção.

O que este painel tem de diferente é um nível a mais. Além de **Sem
acesso**, **Visualizar** e **Editar**, existe **Diretor** — e ele não é
"Editar com mais poder": é outra coisa.

| Nível | O que faz |
|---|---|
| Sem acesso | nem entra |
| Visualizar | vê tudo, não grava nada |
| Editar | preenche a requisição inteira, **menos o despacho** |
| Diretor | **só** despacha a modalidade, e não toca em mais nada |

A coluna **DIRETOR** da tela é um despacho: por qual caminho a contratação
segue. Seis opções, nenhuma escrita à mão — Pregão, Concorrência, Dispensa
por limite, Dispensa por justificativa, Inexigibilidade, Ata de Registro de
Preços. Quem preenche a requisição vê a coluna com um cadeado; quem tem
Diretor vê exatamente o contrário: a coluna do despacho aberta e todo o
resto da linha trancado.

**Editar e Diretor não se encontram de propósito.** O despacho é decisão, o
resto é registro, e quem faz uma coisa não faz a outra. As regras do
Firestore são o que garante isso de verdade — elas olham **quais campos
mudaram** em cada gravação:

- quem tem **Editar** grava qualquer campo, desde que a gravação **não
  toque** em `despacho`, `despachoPor` ou `despachoEm` — nem escondendo a
  mudança no meio de outras;
- quem tem **Diretor** grava **só** esses três campos, e nada mais;
- ninguém apaga requisição.

Por isso a tela grava **campo a campo** e não o documento inteiro: regravar
tudo a cada tecla faria uma gravação legítima esbarrar num campo que a
pessoa nem viu. `testes/t-regras.mjs` confere cada um desses casos no
emulador oficial do Firestore, e `testes/t-requisicao.js` confere o que a
tela deixa clicar.

O administrador é o único que acumula: ele pode despachar e preencher —
poderia se marcar Diretor a qualquer momento, então negar seria só somar um
passo.

A primeira importação é feita **pela própria tela**, como nos Contratos:
entre como administrador em `/requisicao/` com o banco vazio e clique em
**"Importar as requisições agora"**. Ver `requisicao/LEIA-ME.md`.
