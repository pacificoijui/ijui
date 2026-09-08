# Contratos — banco próprio, separado das licitações

## Por que projeto separado e não "um grupo" dentro do mesmo

A pergunta era: para deixar os contratos isolados das licitações, é mais seguro
**outro projeto Firebase** ou **separar por grupo/coleção dentro do mesmo**?

**Outro projeto.** As três opções, do mais fraco para o mais forte:

| | o que separa | o que NÃO separa |
|---|---|---|
| Coleções com prefixo no mesmo banco | nada, só o nome | chave, regras, cota, console — tudo compartilhado |
| Segundo banco no mesmo projeto | o banco e o arquivo de regras | a chave web, o projeto, quem tem acesso ao console, a cobrança |
| **Projeto separado** | **tudo** | — |

O que decide é isto: **num projeto só, a única coisa que separa contratos de
licitações é o arquivo de regras.** Uma linha errada nele — e regra de Firestore
é fácil de errar — expõe os dois de uma vez. Com projetos separados, errar a
regra das licitações não alcança os contratos, porque a chave é outra, o banco é
outro e o endereço é outro. Não existe caminho de um para o outro nem se alguém
quiser.

O resto vem junto: cota e cobrança independentes (uma consulta pesada nos
contratos não derruba a licitação em andamento), acesso ao console concedido
separadamente, e apagar um projeto não chega perto do outro.

O preço é pequeno e conhecido: dois configs para manter, dois lugares para olhar
no console, e o backup precisa saber dos dois — o que ele já sabe. O plano
gratuito (Spark) vale por projeto, então o segundo projeto não custa nada.

**Isso não é um substituto para as regras.** Separar limita o estrago; não
impede. O banco das licitações tinha as regras abertas para leitura com a
chave pública — inclusive a antiga coleção `usuarios`, com hash de senha — até
a introdução do login por Firebase Authentication e do fechamento das regras
(ver `CONTROLE-DE-ACESSO.md` na raiz do repositório). Ao criar o projeto dos
contratos, vale já nascer com regra restritiva e o mesmo modelo de conta e
aprovação por painel, em vez de repetir o problema.

## Como está hoje

`FIREBASE_CONFIG` em `contratos/index.html` está **vazio**. Enquanto estiver, a
tela carrega de `dados/contratos.json` — os mesmos 1.264 contratos, versionados
aqui no repositório. Tudo funciona: busca, filtros, relatórios em PDF. A tarja do
cabeçalho diz qual das duas fontes está no ar.

## Cadastro, edição e aditivos

A tela cadastra contrato novo, edita contrato existente e registra aditivos
(prazo, valor, ou os dois). **Onde isso é gravado depende do `FIREBASE_CONFIG`:**

- **com o config preenchido**, salvar escreve no Firestore dos contratos e todo
  mundo passa a ver;
- **com ele vazio** — a situação de hoje —, não existe onde gravar: a alteração
  fica guardada no `localStorage` **daquele navegador**, e a tela avisa isso numa
  tarja amarela permanente. Para virar cadastro de verdade, o botão
  **Exportar JSON** gera o `dados/contratos.json` novo (mesmo formato, um
  contrato por linha), que substitui o arquivo do repositório. O botão
  **Descartar** joga os rascunhos fora.

O valor e o vencimento que a lista mostra são sempre os **vigentes**. Quando um
contrato ganha aditivo, o valor e o prazo de origem passam a morar em
`valorBase`/`vencimentoBase` e os campos `valor`/`vencimento` viram conta:
valor de origem + soma dos aditivos, e o prazo do aditivo assinado mais
recentemente. Assim a lista, os filtros e os relatórios continuam lendo
`valor` e `vencimento` sem saber que aditivo existe — e editar ou apagar um
aditivo refaz a conta sem somar duas vezes.

### Quem pode editar

Ler continua público, sem login nenhum — igual a hoje. **Gravar** (cadastro
novo, edição, aditivo) já está pronto no código para exigir conta aprovada
com nível **"Editar"**, no mesmo modelo de `CONTROLE-DE-ACESSO.md`: conta
nasce pendente sem nenhum acesso, um administrador aprova escolhendo **Sem
acesso / Visualizar / Editar** no botão **Usuários** (aparece no cabeçalho
assim que alguém loga), e o e-mail `pedrohhpacifico@gmail.com` já nasce
administrador com edição liberada. Isso já está implementado em
`contratos/index.html` (procure por "CONTAS E PERMISSÕES") e em
`contratos/firestore-contratos-ijui.rules` — só falta o passo abaixo, que só
você consegue fazer, porque exige a sua conta do Firebase.

Enquanto `FIREBASE_CONFIG` estiver vazio (a situação de hoje), nada disso
entra em cena: não existe conta, e salvar cai direto no rascunho do
navegador — exatamente o comportamento de sempre, sem nenhuma mudança.

## Como ligar o Firestore

1. No console do Firebase, **criar um projeto novo** (ex.: `contratos-ijui`).
   Não reaproveitar o `processos-ijui`.
2. **Authentication** → **Sign-in method** → ativar **Google** (e, se quiser,
   **E-mail/senha** também) — é o mesmo tipo de login do sistema de
   licitações, mas com conta separada, porque o projeto é outro.
3. Criar o Firestore. Colar o conteúdo de
   [`contratos/firestore-contratos-ijui.rules`](firestore-contratos-ijui.rules)
   em **Firestore Database** → **Regras** → **Publicar**. Esse arquivo já
   deixa a leitura de `contratos` pública (como hoje) e a escrita restrita a
   quem tiver nível "Editar" — não precisa (nem deve) copiar as regras das
   licitações.
4. Registrar um app Web e copiar o objeto de configuração.
5. Colar em `FIREBASE_CONFIG`, em `contratos/index.html`.
6. Subir os dados:

   ```bash
   node contratos/ferramentas/importar.mjs              # ensaio, não grava nada
   node contratos/ferramentas/importar.mjs --confirmar  # grava de verdade
   ```

   O id de cada documento é o `id` numérico do contrato em texto, então rodar de
   novo atualiza os mesmos documentos em vez de duplicar.

7. Conferir: a tarja do cabeçalho deve passar a dizer `DADOS AO VIVO`.
8. Abrir a tela e entrar com **pedrohhpacifico@gmail.com** pelo Google — nasce
   administrador na hora, com edição liberada. No botão **Usuários** que
   aparece no cabeçalho, aprove as duas pessoas que vão editar contratos,
   escolhendo o nível **Editar** para cada uma. A partir daí, as duas
   conseguem estar na tela ao mesmo tempo: quem salva um contrato ou aditivo
   aparece para a outra pessoa na hora, sem precisar atualizar a página — a
   tela ouve o Firestore ao vivo (`onSnapshot`), não só na hora de abrir.

A partir daí o backup diário passa a incluir o projeto de contratos sozinho —
ele lê o `FIREBASE_CONFIG` daqui e, enquanto estiver vazio, simplesmente pula.

## Arquivos

| | |
|---|---|
| `index.html` | a tela: busca que varre tudo, tabela única com filtro em cada coluna, o cadastro de contratos e aditivos, e as contas/permissões (bloco "CONTAS E PERMISSÕES") |
| `dados/contratos.json` | os 1.264 contratos, um por linha |
| `ferramentas/importar.mjs` | sobe o JSON para o Firestore dos contratos |
| `firestore-contratos-ijui.rules` | as regras do Firestore do projeto de contratos (colar no console, quando o projeto existir) |
| `../testes/t-contratos.js` | confere que a tela continua fazendo o que fazia |
