# Como o módulo de Editais funciona

O edital sai do **próprio modelo de vocês** — não é um documento remontado do
zero. Um `.odt` é um zip com XML dentro; a página abre esse zip no navegador,
apaga os parágrafos dos trechos que não se aplicam, troca os marcadores pelos
valores digitados e fecha o zip de novo. Por isso o resultado mantém brasão,
cabeçalho, fontes, numeração e margens exatamente como no arquivo original.

## Os arquivos

| arquivo | o que é |
|---|---|
| `../index.html` | a página do módulo (formulário, prévia, geração) |
| `../modelo-edital.odt` | o edital padrão com os valores trocados por `@@MARCADORES@@` e sem os comentários de redação |
| `../blocos.json` | o mapa dos 34 trechos condicionais: faixa de parágrafos + a marcação que mantém cada um |

## Quando o edital padrão mudar

Se a COPAM alterar o edital modelo, **os índices do `blocos.json` saem do
lugar** e é preciso regerar os dois arquivos. A página se recusa a gerar
quando isso acontece (confere uma impressão digital de cada bloco antes) — ela
para com uma mensagem em vez de emitir um edital mutilado.

Para regerar, com o edital novo salvo como `edital.odt` nesta pasta:

```bash
python3 preparar.py    # gera modelo-edital.odt + indice.txt
python3 regras.py      # gera blocos.json a partir das faixas em BLOCOS
```

O `preparar.py` procura os valores do edital de exemplo (PE 131/2026) para
trocar por marcadores — se o edital novo tiver outros números, ajuste a lista
`CAMPOS` no topo dele.

O `regras.py` traz as faixas de parágrafos na constante `BLOCOS`. Use o
`indice.txt` (que o `preparar.py` grava, um parágrafo por linha, numerado) para
achar os novos limites. Ele imprime a impressão digital de cada bloco no fim —
confira se o texto bate com o trecho pretendido antes de publicar.

## Conferindo o resultado

`verificar.py` abre os `.odt` gerados e checa o que um olho humano não pega:
pacote ODF válido (mimetype primeiro e sem compressão), XML bem-formado,
prefixos de namespace preservados, nenhum marcador sobrando, e cada trecho
condicional presente ou ausente conforme o cenário.

```bash
python3 verificar.py
```

Ele espera os arquivos `saida-*.odt` na pasta corrente, gerados pelos cenários
de teste.

## Detalhes que não são óbvios

**Namespaces.** O ElementTree do Python reinventa os prefixos ao gravar
(`draw:` vira `ns8:`), e o ODF referencia prefixo dentro de valor de atributo —
o arquivo abre quebrado. Por isso o `preparar.py` relê os prefixos do arquivo
original e registra todos antes de parsear.

**mimetype.** O ODF exige que ele seja o primeiro membro do zip e fique sem
compressão. O JSZip comprime tudo por padrão, então o `index.html` regrava esse
membro com `{compression:'STORE'}` antes de fechar o pacote.

**Texto picado em spans.** No ODF uma frase costuma estar dividida em vários
`<text:span>`. Uma busca-e-troca ingênua no XML não acha "131/2026" porque o
texto pode estar partido no meio. O `preparar.py` reescreve a troca segmento a
segmento, mantendo os spans (e a formatação) de pé.

**Comentários de redação.** As 23 anotações do edital padrão ("EXCLUIR ITEM
4.12 QUANDO...", "EM AMARELO SOMENTE PARA SERVIÇOS") são instruções para quem
redige, não fazem parte do edital. Elas foram lidas para montar as regras e
removidas do modelo. Os destaques em amarelo/laranja/rosa, que marcavam os
mesmos trechos condicionais, também foram zerados.
