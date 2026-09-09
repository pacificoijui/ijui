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
3. Um administrador abre **Usuários** (dentro do Sistema Interno) e vê o
   pedido esperando. Marca ali mesmo, painel por painel (Agenda, Sistema
   Interno, Contratos), um de três níveis — **Sem acesso**, **Visualizar**
   ou **Editar** — e aprova.
4. A liberação chega **na hora**, sem precisar relogar: quem estava com a
   aba aberta na tela de espera vê o sistema abrir sozinho.

## Os três painéis

Uma conta só, com um nível para cada painel:

| Painel | O que é | Endereço |
|---|---|---|
| **Agenda** | a agenda pública de licitações | `/` |
| **Sistema Interno** | a central do pregoeiro | `/pregoeiro/` |
| **Contratos** | o cadastro de contratos e aditivos | `/contratos/` |

Os três moram no mesmo projeto do Firebase e usam a **mesma conta**: quem
cuida só de contrato ganha nível em Contratos e "Sem acesso" nos outros
dois, e continua sendo uma pessoa, uma conta, aprovada num lugar só.

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

## Editais

Ainda sem projeto e sem contas — continua com dados locais/arquivo. Quando
ganhar cadastro, o caminho é o mesmo: mais um painel em `acessos`, mais um
`match` nas regras.

## Backup diário

O backup automático (GitHub Actions, `.github/workflows/backup-firestore.yml`)
lia as coleções com a chave web pública. **Isso parou de funcionar quando as
regras foram fechadas** — listar coleção passou a exigir conta aprovada.
Agora ele entra com uma conta admin do próprio sistema, e para isso precisa
de dois secrets no repositório:

1. Crie uma conta de e-mail/senha só para isso (na tela de login, "Criar uma
   conta" — pode ser um e-mail seu com `+backup`, tipo
   `seuemail+backup@gmail.com`), e **aprove como administrador** no painel
   Usuários. Precisa ser admin porque o backup também copia o cadastro de
   contas.
2. No GitHub: **Settings → Secrets and variables → Actions → New repository
   secret**, criando dois:
   - `BACKUP_EMAIL` — o e-mail dessa conta
   - `BACKUP_SENHA` — a senha dela
3. Rode uma vez na mão para conferir: aba **Actions** → "Backup diário do
   Firestore" → **Run workflow**.

Sem esses secrets o backup falha com a mensagem explicando isso — de
propósito, para não gravar um backup vazio achando que está tudo bem.
