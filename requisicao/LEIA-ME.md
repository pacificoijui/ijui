# Requisições — `/requisicao/`

Controle das requisições do município, uma tela para o que hoje é a planilha
`REQUISIÇÕES 2026.xlsx`: **uma aba por secretaria**, sempre as mesmas
colunas — mais a coluna **DIRETOR**, que a planilha não tinha.

A tela é fechada: mesma conta do resto do sistema, sem link público. Ver
[CONTROLE-DE-ACESSO.md](../CONTROLE-DE-ACESSO.md).

## A faixa de secretarias

É a primeira coisa da tela porque é a primeira decisão de quem usa. Ela faz
o papel das abas da planilha e serve a duas coisas ao mesmo tempo:

- **filtra** a lista para aquela secretaria;
- **diz em nome de quem a próxima requisição nasce**: com uma secretaria
  escolhida, "＋ Nova requisição" já abre com ela preenchida e com o
  **próximo número dela** — cada secretaria tem a própria sequência, como
  cada aba tinha.

## Lançar e editar na própria tabela

A requisição não nasce pronta: chega, recebe data, depois objeto, depois o
empenho, depois vai para a contabilidade. Um formulário com todos os campos
obrigava a abrir e fechar um card a cada etapa — aqui a tabela **é** a folha
de lançamento.

- **＋ Nova requisição** abre uma linha no alto, já na secretaria escolhida
  na faixa e com o próximo número dela, com a célula da data aberta.
- As **datas abrem em hoje**: a requisição nasce recebida no dia em que está
  sendo lançada, e o campo de contabilidade, quando vazio, abre no dia de
  hoje — um Enter e está gravado. Automático não é imposto: a data continua
  sendo um seletor, e trocar é um clique.
- Enquanto a linha está **sendo lançada**, a coluna do empenho espera quieta.
  "Falta empenhar" é aviso sobre requisição que já existe e está pendente;
  numa linha que a pessoa ainda está digitando era aviso falso, e em âmbar.
- **Um clique** em qualquer célula abre aquele campo para preencher, e
  clicar direto noutra célula salva esta e abre aquela — sem clicar duas
  vezes em nada.
- **Tab** salva e anda para a próxima coluna, **Enter** salva, **Esc**
  desiste. A edição só se fecha quando o clique cai fora dela: clicar na
  borda da própria célula não interrompe o preenchimento.
- O **número** abre num painel ancorado na célula, com Secretaria, Nº, Ano e
  Complemento rotulados. São quatro coisas, e a coluna tem pouco mais de cem
  pixels — espremidos ali dentro viravam "34…" e "20…".
- A linha nova fica destacada e no topo, furando os filtros, enquanto está
  sendo preenchida — senão ela sumiria da tela no instante em que nasce.
  Trocar de secretaria ou limpar os filtros a solta.
- A linha nova **só vai para o banco no primeiro campo preenchido**. Até lá
  o **✕** ao fim dela a descarta — depois disso não há como apagar
  requisição, nem pela tela nem pelas regras, e uma linha em branco aberta
  por engano viraria lixo permanente.

Não há moldura seguindo o mouse pelas células: a tabela é para ser lida, e
o cursor de texto já diz que dá para escrever ali.

## O que a tela mostra

Busca única em tudo (credor, objeto, número, modalidade, empenho, valor) e
filtro por coluna como numa planilha. A busca de cada coluna procura no que
**aquela coluna mostra**: digitar o número do empenho na coluna Empenho acha
o empenho, e o menu diz quantas requisições ele está segurando.

A busca do alto diz "pesquisar em tudo", e é isso que ela faz: ao **começar**
uma busca, ela abre o recorte da tela — volta para todas as secretarias e
limpa os filtros de coluna —, e avisa. Sem isso a resposta era "nenhuma
requisição" para um registro que existe, só que na aba do lado. Só a
primeira letra abre: se você filtrar depois de buscar, é porque quis cruzar
as duas coisas, e o filtro fica.

A coluna Empenho mostra o número quando existe e **"falta empenhar"** quando
não. Não é situação inventada: é a coluna EMPENHO vazia na planilha, que é
justamente o que se procura ao abrir o arquivo.

Relatório em PDF do filtro atual e ficha em PDF de uma requisição, no mesmo
papel dos Contratos e dos Pedidos de Diligência: logo do município, título,
rodapé com paginação.

## A coluna DIRETOR — o despacho

Entre **Recebida** e **Credor** há uma coluna que **não é campo da
planilha: é uma decisão**. Ela diz por qual caminho a contratação segue, e
tem seis opções, nenhuma delas escrita à mão:

> Pregão · Concorrência · Dispensa por limite · Dispensa por justificativa ·
> Inexigibilidade · Ata de Registro de Preços

Quem preenche a requisição **não escolhe nenhuma delas** — para essas
pessoas a célula aparece com um cadeado e não abre. Quem despacha é só quem
tiver o nível **Diretor** no painel de Usuários, e esse alguém **não mexe em
mais nada** da requisição: para ele, todas as outras células estão trancadas.

O despacho grava junto **quem assinou e quando**, e aparece na ficha e no
relatório em PDF.

### O que veio da planilha não pede despacho

A coluna tem **três** estados, não dois. As requisições da migração já foram
contratadas antes de a coluna existir: nelas o campo fica **vazio**, um traço
como o de qualquer outro campo em branco — sem convite e sem cadeado, porque
ali não há decisão pendente. Oferecer "despachar" em milhares de linhas
antigas esconderia, no meio delas, as poucas que de fato esperam.

O que separa uma coisa da outra é o campo **`criadaEm`**: quem nasce nesta
tela ganha a data, quem veio do arquivo não tem. A célula antiga continua
abrindo para o Diretor, se um caso antigo precisar mesmo de decisão — o que
sai é o barulho, não a possibilidade.

### A fila do Diretor

Quem despacha ganha um botão — **"⚖️ 6 requisições aguardam despacho"** — que
abre a **fila**: o que aguarda decisão, de todas as secretarias. Ele não
trabalha dentro de uma secretaria, trabalha entre elas.

A fila é um **modo**, não uma cela. Quem só despacha abre nela, porque é o
trabalho dele; mas clicar numa secretaria sai da fila e mostra a secretaria
inteira, como para qualquer pessoa — o Diretor também precisa olhar o
conjunto para decidir. O botão devolve a fila quando quiser.

A consulta da fila fica **sempre ouvindo**, mesmo enquanto ele navega por uma
secretaria: é o que faz o contador do botão estar sempre certo sem custar uma
leitura a cada clique.

E ela lê **só o que aguarda** — `despacho == ''` e `criadaEm > ''`, não tudo
o que nasceu no sistema. Isso não é detalhe de tela: sem o primeiro filtro a
consulta cresceria para sempre, uma linha por requisição já criada, e o
Diretor pagaria por todas a cada F5 para ver as poucas que faltam. Com ele, a
fila **encolhe conforme o trabalho é feito**, que é o que uma fila deve
fazer. As que vieram da planilha nunca entram: foram contratadas antes de a
coluna existir e não esperam decisão de ninguém.

Por isso uma requisição nova **nasce com o campo `despacho` escrito, vazio**.
Campo ausente não casa com consulta nenhuma no Firestore — sem essa linha ela
nasceria fora da fila, que é o defeito mais caro que esta tela poderia ter.

Despachou, a linha sai da fila. O que ele despachou **nesta visita** continua
ao alcance enquanto estiver na fila (é assim que se desfaz um despacho errado
sem sair dela); sair da fila esquece, e voltar mostra só o que ainda aguarda.
Quando não sobra nada, o botão fica verde (**"✅ nada aguardando despacho"**)
e a tela diz que está em dia, em vez de dizer que não encontrou nada.

## Procurar uma requisição pelo número

O menu da coluna **REQUISIÇÃO** é uma busca por número: digite `248` e a tela
já filtra, sem precisar marcar nada. Uma lista de números para clicar embaixo
seria um segundo clique fazendo o que o primeiro já fez.

## Excluir uma requisição

Quem preenche pode excluir, pela ficha (🔍 → **🗑️ Excluir**). Duas travas:

1. **A senha, a cada exclusão.** Antes de apagar, o Firebase reautentica a
   conta — e nada fica guardado de uma exclusão para a outra. Estar com o
   sistema aberto não é o mesmo que ser a pessoa, e é exatamente esse o caso
   que isto cobre: um computador deixado no balcão não vira uma exclusão. A
   tela nunca vê nem guarda a senha; quem confere é o Firebase.

   > **O limite, com todas as letras.** Isso vale de verdade para contas de
   > **e-mail e senha**. Para conta do **Google** não existe senha a conferir
   > do lado do navegador — a sessão *é* a credencial. O melhor que dá para
   > fazer é forçar a janela de escolha de conta a cada exclusão
   > (`prompt: select_account`), o que exige uma ação deliberada e mostra em
   > nome de quem se está apagando, mas não é uma senha. Quem precisar dessa
   > garantia deve usar conta de e-mail e senha.
2. **Requisição já despachada não sai.** O despacho é decisão do Diretor, e
   quem preenche não pode mexer nele — se pudesse apagar a requisição
   inteira, apagaria o despacho junto, e a trava vazaria pelo delete. Para
   excluir uma despachada, o Diretor tira o despacho primeiro. As regras do
   Firestore recusam, não só a tela.

A exclusão fica no **registro de atividades** com a requisição inteira
guardada — e de lá o botão **↶ Restaurar** a traz de volta, com o mesmo
número e o mesmo conteúdo.

## Registro de atividades

O botão **🕘 Atividades** abre quem mexeu no quê, e quando. Toda gravação
deixa registro em `requisicoes_historico`, com a requisição inteira antes e
depois — é o "antes" que torna o **desfazer** possível. Desfazer aqui é
regravar o valor anterior, não apagar nada, e o próprio desfazer entra no
registro: dá para desfazer o desfazer.

**Uma linha por requisição, não uma por coluna.** Preencher uma requisição
são sete ou oito gravações seguidas; uma linha para cada transformaria "a
Serli lançou a 023/2026" em oito entradas quase idênticas. As alterações da
mesma pessoa na mesma requisição se juntam numa linha só, gravada quando o
trabalho ali termina — ao mexer noutra, ao fechar a aba, ao abrir o painel,
ou depois de 25 segundos parado.

**O despacho não se junta a nada.** É ato de outra pessoa, com outro sentido
e outra permissão: *"o Rodrigo despachou a 023/2026"* é uma linha por si.

E o desfazer respeita a mesma divisão de poderes: quem preenche desfaz o que
preencheu, e **só o Diretor desfaz um despacho**. Se fosse a linha inteira, o
desfazer viraria o buraco por onde a trava vaza.

O registro guarda **30 dias**. O que passa disso é apagado quando alguém abre
o painel, e as regras do Firestore só deixam apagar o que **já venceu**:
ninguém consegue sumir com o rastro do que fez ontem — nem um administrador.

A trava não é da tela — a tela só avisa antes. Quem barra de verdade são as
regras do Firestore, que olham **quais campos mudaram** em cada gravação:
uma alteração que toca no despacho vinda de quem só preenche é recusada, e
uma que toca em qualquer outro campo vinda do Diretor também. Por isso a
tela grava **campo a campo**, e não o documento inteiro.

## Quanto do banco a tela puxa

A tela lia a coleção inteira a cada visita. Com 3,6 mil requisições já custa;
com cinco anos de cadastro seriam 20 mil documentos lidos toda vez que alguém
aperta F5 — e o preço cresceria sozinho: quem abrisse a tela em 2030 pagaria
por 2026.

Agora ela lê **uma secretaria por vez**, que é como o setor trabalha — a
planilha tinha uma aba por secretaria e cada pessoa vive dentro da dela.

| Secretaria | Leituras ao abrir |
|---|---|
| SMS (a maior) | 1.007 |
| SMDS | 339 |
| SMDR | 168 (a mediana) |
| SMA (a menor) | 22 |

Contra **3.617 sempre**, antes. Para metade das secretarias é **95% a
menos**; para a maior, 72%. E a conta para de crescer com o arquivo: cresce
só com o tamanho da secretaria de quem está olhando.

**Não existe mais "Todas"** — não por falta de vontade, e sim porque "todas"
era justamente a leitura que ninguém precisa fazer para trabalhar, e era ela
que pagava por 3,6 mil documentos a cada visita.

**A primeira visita não lê nada.** Sem uma secretaria escolhida a tela pede
para escolher, e só então consulta. A escolha fica guardada neste navegador,
então isso acontece uma vez por pessoa.

Trocar de secretaria é **outra consulta**, do tamanho dela — não é filtro de
tela. É a diferença entre esconder linhas e não as ler.

**E dentro da secretaria, só os dois últimos meses.** É o que o setor tem em
mãos no dia a dia. SMS tem 1.007 requisições; abrir custa **145**. O resto
vem com um clique — o botão **"Ver requisições mais antigas"** no fim da
lista, ou abrir o menu de qualquer coluna (as contagens dele mentiriam com
dois meses na mão). Depois disso aquela secretaria fica **completa para o
resto da visita**: sair e voltar não relê nada.

E completar lê **só o que falta**. A consulta dos dois meses continua de pé e
entra uma terceira, `recebido < início`, em vez de trocar tudo pela
secretaria inteira — que releria as linhas que já estão na tela. Em SMS:
abrir custa 145, completar custa 862, e as duas somadas dão as 1.007 da
secretaria. Uma vez, não uma vez e meia.

As requisições **sem data de recebimento** vêm sempre, por consulta própria —
é como uma requisição nasce enquanto está sendo lançada, e sumir com ela no
instante em que é criada seria o pior defeito possível numa tela de
lançamento.

> **Índices necessários no Firestore.** Duas consultas cruzam igualdade num
> campo com faixa noutro, e isso exige **índice composto**:
>
> * `sec` + `recebido` — o recorte de dois meses de cada secretaria (e o
>   "ver as mais antigas", que usa o mesmo);
> * `despacho` + `criadaEm` — a fila do Diretor.
>
> Enquanto um deles não existir a tela não quebra: cai na consulta larga
> (a secretaria inteira, ou tudo o que nasceu no sistema) e avisa no console
> do navegador, com o link que cria o índice em um clique. Custa mais leitura
> até alguém clicar.

**Cada secretaria visitada fica aberta.** Voltar para uma que você já abriu é
instantâneo e não custa leitura nenhuma — e ela chegou atualizada enquanto
você estava noutra, porque a consulta continuou ouvindo. Fechar e reabrir
seria pagar de novo pelos mesmos documentos. O que uma consulta aberta custa
depois da primeira leva é só **o que muda**: se alguém lançar em SMS enquanto
você está em SMEd, é uma leitura, não mil.

### A importação saiu da tela

A migração da planilha acabou. O botão que subia o `requisicoes.json` para o
banco não tinha mais como funcionar direito — a tela nunca tem o cadastro
inteiro na mão, então a conferência daria sempre "faltam alguns milhares" — e
o que sobrava era um botão capaz de reescrever 3.617 documentos por cima do
banco vivo. Saiu inteiro. Se um dia precisar de carga em massa de novo, é
trabalho de ferramenta, não de botão numa tela de uso diário.

### O Diretor é a exceção, e tem de ser

Ele não trabalha dentro de uma secretaria, trabalha **entre** elas. A
consulta dele é a fila: as requisições **nascidas no sistema**, de todas as
secretarias. As 3,6 mil que vieram da planilha já foram contratadas antes de
a coluna existir e não esperam decisão de ninguém — então nem chegam a ser
lidas. A economia e a clareza pelo mesmo gesto.

### A busca global saiu

Com uma secretaria por vez, "pesquisar em tudo" prometia o que não podia
cumprir. Procurar passou a ser **procurar numa coluna** — e o menu de cada
coluna continua com a busca dela, que acha sem acento e diz quantas linhas
está segurando.

## Onde ficam os dados

No Firestore do projeto `processos-ijui`, coleção `requisicoes` — o mesmo
projeto e o mesmo cadastro de contas (`usuarios_v2`) da Agenda, do Sistema
Interno e dos Contratos. Duas pessoas mexendo ao mesmo tempo se enxergam:
o que uma salva aparece na tela da outra sem recarregar, e é assim que o
despacho do Diretor chega a quem lançou.

`dados/requisicoes.json` continua no repositório, mas só serve a duas
coisas: a **lista de secretarias** e a **primeira carga**. Com o banco
vazio, um administrador vê na tela o botão de importar; a importação sobe em
lotes, é retomável e reenviar o que já subiu não duplica nada (o id do
documento é o id da requisição). Se o arquivo for atualizado pela planilha
do setor, um aviso amarelo oferece subir só o que falta.

O arquivo **não** é espelho do banco: depois da primeira carga, quem manda é
o Firestore.

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
