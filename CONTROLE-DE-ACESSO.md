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
   pedido esperando. Marca ali mesmo quais painéis a pessoa vai ter —
   Agenda, Sistema Interno, ou os dois — e aprova.
4. A liberação chega **na hora**, sem precisar relogar: quem estava com a
   aba aberta na tela de espera vê o sistema abrir sozinho.

O e-mail `pedrohhpacifico@gmail.com` é o **e-mail de resgate**: a primeira
vez que ele entra, já nasce administrador com os dois painéis liberados —
garante que sempre exista alguém capaz de aprovar todo o resto. É a mesma
ideia do antigo `AUTH_BOOTSTRAP_ADMIN = "pacifico"`, só que agora amarrada a
um e-mail de verdade (verificado pelo Google/Firebase), não a um texto que
qualquer um poderia digitar.

## Pré-cadastro por e-mail (opcional)

No painel Usuários também dá para **preparar um convite**: nome, e-mail e
os painéis que a pessoa vai ter, antes mesmo de ela entrar pela primeira
vez. Isso **não dá acesso sozinho** — é só um lembrete. Quando a pessoa
efetivamente se cadastra com aquele e-mail, o pedido dela aparece destacado
("★ convite preparado: Agenda, Sistema Interno") e um clique aplica
exatamente o que foi preparado. A liberação continua sendo sempre uma ação
do administrador, nunca algo que o próprio cadastro força sozinho — é isso
que torna seguro deixar o cadastro em si aberto ao público.

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
  sem edição") deixa de funcionar sem login. Ele permitia navegar a lista
  inteira de processos sem nenhuma conta — exatamente o tipo de exposição
  ampla que "fechar tudo" pede pra eliminar. Quem recebia esse link agora
  precisa logar (com Google, em segundos) para ver a mesma tela.
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

Essas regras foram escritas e revisadas com cuidado, mas **nunca testadas
contra o motor de regras de verdade** — o ambiente onde este trabalho foi
feito não tem acesso à rede do Firebase. O Playground é rápido e não exige
saber programar; vale a pena rodar esses casos antes de confiar 100%.

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
| `testes/fbstub3.js` | o Firestore E o Firebase Auth falsos usados nos testes (`firebase.auth()` simulado, sem rede nenhuma) |

## Contratos e Editais

Esses dois módulos ainda não têm projeto Firebase próprio (ver
`contratos/LEIA-ME.md`) — continuam funcionando com dados locais/arquivo. O
mesmo modelo (Firebase Authentication + `usuarios_v2` + painel de
aprovação por painel) deve ser repetido quando cada um ganhar o próprio
projeto, com o próprio arquivo de regras — nunca compartilhando o projeto
das licitações, pelo mesmo motivo de isolamento já documentado em
`contratos/LEIA-ME.md`.
