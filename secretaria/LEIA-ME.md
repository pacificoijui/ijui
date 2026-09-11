# Painel da Secretaria — `/secretaria/`

Uma tela por pasta. Quem entra vê **as requisições e os contratos da própria
secretaria**, e nada mais: não existe "ver todas", não existe trocar para a
secretaria da vizinha, não existe o cadastro inteiro.

## A pergunta que ele responde

Quem trabalha numa secretaria não faz a mesma pergunta de quem cuida do
cadastro. A pergunta é *"como está o que é meu?"* — quantas requisições
esperam despacho, o que falta empenhar, qual contrato vence nos próximos
noventa dias.

Por isso o painel abre num **resumo**, não numa planilha. Seis números no
alto, e **cada um é um botão que filtra** a lista de baixo. Número que não
leva a lugar nenhum é enfeite; aqui ele é a porta de entrada da pergunta.

| Número | O que conta |
|---|---|
| Requisições | as dos dois últimos meses |
| Aguardando despacho | nascidas no sistema, ainda sem a modalidade do Diretor |
| Falta empenhar | nascidas no sistema, ainda sem número de empenho |
| Contratos vigentes | ATIVO ou ATIVO-PARALIZADO |
| Vencem em 90 dias | vigentes, com prazo entre hoje e 90 dias |
| Já vencidos | vigentes com o prazo passado — o que mais precisa de decisão |

É tela de **leitura**. Quem lança requisição continua em `/requisicao/`,
quem cadastra contrato continua em `/contratos/`. Um cadastro em dois
lugares vira dois cadastros diferentes.

## O recorte é do banco, não da tela

Esta é a parte que importa, e é o motivo de o painel existir como tela
separada em vez de um filtro dentro das outras.

As siglas saem do **perfil da conta** (`usuarios_v2.secretarias`) e vão
dentro da consulta ao Firestore:

```js
where('sec', '==', 'SMEd')                       // requisições
where('secretarias', 'array-contains', 'SMED')   // contratos
```

E as regras do Firestore negam qualquer consulta que não carregue o
recorte. Pedir a coleção inteira, pedir a requisição da vizinha pelo id,
pedir os contratos de outra pasta — tudo é recusado **pelo banco**.

Se a tela lesse tudo e mostrasse um pedaço, bastaria abrir o console do
navegador para ler o resto: **esconder não é proteger**. A prova está em
`testes/t-regras.mjs`, seção "Painel da Secretaria", rodando dentro do
emulador oficial do Firestore — treze asserções, entre elas as que tentam
ler a pasta da vizinha e são negadas.

O escopo também **não vem da URL**. Se viesse, bastaria trocar `?sec=` para
ver outra pasta, e haveria um teste a menos entre o painel e o vazamento.

## Por que o escopo é uma LISTA de siglas

Porque os dois cadastros escrevem a mesma secretaria de jeitos diferentes:

| Secretaria | Nas requisições | Nos contratos |
|---|---|---|
| Educação | `SMEd` | `SMED` |
| Cultura e Turismo | `SMCT` | `SMCET` |
| Desenvolvimento Econômico | `SEMDEC` | `SMDEC` |

Um painel com uma sigla só nasceria com metade vazia, e a pessoa concluiria
— com razão — que o sistema está quebrado. O campo em `/usuarios/` aceita
as duas grafias separadas por vírgula (`SMEd, SMED`); a tela junta as que
são a mesma pasta e mostra **uma só**, dizendo no alto que ela também é
"SMED" nos contratos.

Quem responde por mais de uma pasta ganha um seletor para alternar entre
elas. Quem responde por uma só não ganha botão nenhum.

## Quanto ele lê

O mesmo desenho do resto do sistema, pela mesma razão: ler o que cabe na
tela, não o cadastro inteiro.

* **Requisições** — os dois últimos meses da secretaria, mais as que ainda
  não têm data de recebimento (é como uma requisição nasce enquanto está
  sendo lançada). O resto vem no botão do fim da lista, e quando vem entra
  **só o que falta**: as consultas dos dois meses continuam de pé.
* **Contratos** — os da secretaria, inteiros. Uma secretaria tem dezenas ou
  poucas centenas, não 1.294 — e recortar por ano aqui esconderia
  justamente o contrato de 2022 que ainda está vigente, que é o que a
  pessoa veio ver. `array-contains` é campo único: o Firestore indexa
  sozinho, sem índice para criar no console.

Cada leva fica ouvindo. Trocar de pasta e voltar não relê nada.

O arquivo com os nomes das secretarias é o **`secretarias.json`**, de 1,4
KB — não o `requisicoes.json`, que tem 1,1 MB de histórico junto. Baixar
1,1 MB para ler dezesseis nomes seria desfazer no download a economia feita
nas leituras, e — numa tela que promete mostrar só uma secretaria — seria
baixar as requisições de todas elas para o navegador.

## Conta e senha

São as **mesmas** do resto do sistema (Firebase Authentication +
`usuarios_v2`). Não existe senha própria daqui, e isso é de propósito: um
segundo cadastro de senhas seria um segundo lugar para vazar, sem
recuperação de senha, sem reautenticação, e sem as regras conseguirem
enxergar quem é quem.

O que muda por secretaria é o **escopo** gravado no perfil, não o mecanismo
de entrada. Se o que se quer é uma conta por secretaria (e não uma por
servidor), crie uma conta com o e-mail da pasta — `educacao@…` — e marque o
escopo dela. O mecanismo é o mesmo; muda só quantas contas existem.

### Como liberar

1. A pessoa se cadastra em `/secretaria/`, com e-mail e senha ou com Google.
2. Em `/usuarios/`, na linha dela, ponha **Painel da Secretaria** em
   "Visualizar" — aí aparece o campo **Secretarias**.
3. Escreva as siglas (`SMEd, SMED`) e salve.

Liberar o painel e esquecer as siglas é o engano fácil: a tela pergunta
antes de salvar e, se salvar assim mesmo, quem entra vê um recado dizendo
exatamente o que falta — não um painel vazio sem explicação.

O convite por e-mail leva as siglas junto, para evitar o passo que se
esquece.

## Arquivos

| Arquivo | O que é |
|---|---|
| `index.html` | a tela inteira: portão de acesso, escopo, consultas e listas |
| `../requisicao/dados/secretarias.json` | os nomes por extenso das siglas |
| `../testes/t-secretaria.js` | o teste da tela (56 asserções) |
| `../testes/t-regras.mjs` | o teste do recorte no emulador do Firestore |
