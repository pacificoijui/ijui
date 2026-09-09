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
e clicar abre a ficha. O botão do rodapé da ficha leva ao mesmo contrato no
sistema, onde dá para editar, lançar aditivo e gerar PDF.

Feriados, pontos facultativos, aniversários dos servidores e a observação do
dia são **os mesmos da Agenda de Licitações**, lidos das mesmas coleções.
Aqui é só leitura: quem cadastra continua sendo a Agenda, porque o mesmo
cadastro em dois lugares vira dois cadastros diferentes.

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
