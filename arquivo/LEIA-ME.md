# Arquivo e Anulações — `/arquivo/`

**Protótipo.** Lê `dados/*.json`, não grava, não pede login e não fala com o
Firestore. É para olhar, clicar e dizer o que muda.

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
numerado em sequência única e com o valor somado no alto (R$ 11,1 milhões em
298 anulações no ano). Cada anulação já cita a **requisição interna**
(`09-72-2026-SMED`) e o **memorando** — dois ponteiros para coisas que o
sistema já tem: a requisição vive em `/requisicao/`, o memorando na aba ao
lado. Hoje essa ligação existe só na cabeça de quem digitou.

**🗄️ Arquivo** — responde "onde está a DL 45/2025?" com uma linha de busca,
em vez de quatro cadernos e aba por aba. O empréstimo (quem levou, quando)
vira pendência na primeira tela sozinho.

**📨 Memorandos** — as 19 abas viram uma lista com busca. O memorando é o
*porquê* de quase tudo: é ele que a anulação cita.

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

## Os dados

`dados/*.json` sai das planilhas por:

```
python3 arquivo/ferramentas/planilhas-para-json.py PASTA_COM_AS_PLANILHAS --gravar
```

Sem `--gravar` é ensaio. Ele também escreve `dados/CONFERIR.md`.

**Estes arquivos não estão no repositório** (ver `.gitignore`), e é de
propósito: este repositório é público — vira o site ijui.net —, e os dados
trazem credores, valores e o assunto de cada memorando. Publicá-los é
decisão de quem cuida do setor, não efeito colateral de um protótipo. Para
ver a tela com dados de verdade, rode o conversor na sua máquina.

## O que falta para virar módulo de verdade

Nesta ordem, e nenhum passo é grande:

1. **Portão de acesso** — o mesmo `usuarios_v2` do resto, com um painel novo
   (`arquivo`) e os três níveis de sempre. Sem isso não sobe com dado real.
2. **Firestore** — quatro coleções (`arquivo_tramites`, `arquivo_anulacoes`,
   `arquivo_memorandos`, `arquivo_pastas`) mais as regras. A consulta da
   primeira tela já nasce pequena de propósito: `where('voltouEm','==',null)`
   traz 51 documentos, não os 978 do ano — a lição de `/contratos/`, que lia
   1.300 por abertura, já vem aplicada.
3. **Gravar**: o "✓ Voltou hoje", o cadastro de anulação (com numeração
   automática) e o "passar para outra pessoa".
4. **Ligar na requisição** — a anulação cita `09-72-2026-SMED`, que já existe
   em `/requisicao/`. Clicar e abrir a requisição fecha o ciclo.
5. **Testes** — `testes/t-arquivo.js`, no mesmo molde dos outros.
