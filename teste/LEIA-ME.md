# Prévia do Contratos — `/teste/`

Esta pasta é **temporária**. Ela existe para o desenho novo do sistema de
contratos ser visto em `ijui.net/teste` antes de substituir o
`ijui.net/contratos` de verdade.

É o **mesmo sistema**: o mesmo banco (a coleção `contratos` do Firestore), o
mesmo portão de acesso, a mesma lógica. O que mudou é a folha de estilo — e
três coisas de peso, descritas abaixo. **Editar aqui edita o contrato de
verdade**, porque o banco é um só.

A tela se identifica sozinha: enquanto o arquivo estiver sendo servido de
`/teste/`, aparece o selo **PRÉVIA DO DESENHO NOVO** no cabeçalho e o título
da aba começa com "PRÉVIA". Servido de `/contratos/`, o mesmo arquivo não
mostra nada disso (ver `marcarPrevia`) — então não há nada para "limpar" no
dia da troca.

## O que mudou no desenho

A identidade passou a ser a mesma do `/pregoeiro/`:

- fonte **Sora** na tela e **Space Grotesk** nos números (valor, nº do
  contrato, contagem) — algarismo de largura fixa, que é o que deixa comparar
  valor com valor descendo a coluna;
- paleta **Mosaico das Etnias** (as sete faixas do município), com a faixa
  aparecendo no pé do cabeçalho, no topo da lista e no pé dos modais;
- cabeçalho como **painel escuro**, botões chapados, cantos de 12px.

Os nomes antigos das cores (`--navy`, `--gold`…) viraram **apelidos** da
paleta nova: é o que fez ~500 regras mudarem de cor sem serem reescritas uma
a uma, e é o que deixa a troca reversível. Toda a aparência nova mora num
bloco só, no fim da folha de estilo, sob o título `IDENTIDADE`.

Além da cor: o **objeto do contrato é limitado a três linhas** na lista. Ele
tem de 1 a 12 linhas no cadastro, e era isso que fazia a tabela virar uma
escada — linhas de 30px ao lado de linhas de 120px. O texto inteiro continua
na ficha, a um clique, e a busca continua procurando nele todo.

## O que mudou no peso

Medido com o cadastro real (1.294 contratos), na conta de quem é
administrador — que era quem pagava mais caro:

| | hoje | prévia |
|---|---|---|
| primeira visita | 1.057 KB | 1.007 KB |
| visitas seguintes | 1.057 KB | **244 KB** |

Três coisas saíram da mochila:

1. **O brasão embutido no HTML** (27 KB em base64, baixados a cada visita)
   virou o arquivo `logo-ijui-180.jpg`, de 5,7 KB, que serve ao ícone da aba,
   ao cabeçalho e ao ícone da tela de início do iPhone — e fica no cache.
2. **A conferência com `dados/contratos.json`** (763 KB) era feita em toda
   visita de administrador, mesmo com o banco em dia. Agora ela pergunta
   primeiro a *versão* do arquivo (um `HEAD`, sem corpo): se for a mesma da
   última conferência e o banco tiver o mesmo tanto de contratos, não há o
   que conferir. O arquivo só desce quando um dos dois lados mexeu.
3. **O brasão do PDF** (29 KB) era buscado na entrada "para estar pronto", e
   quase nenhuma visita imprime. Agora desce no primeiro PDF da visita — os
   dois caminhos que geram PDF já esperavam por ele.

## Como virar o sistema de verdade

```bash
cp teste/index.html        contratos/index.html
cp teste/agenda/index.html contratos/agenda/index.html
rm -rf teste
```

Depois, em `testes/t-contratos.js`, tirar a condição `if(CT_DIR === 'contratos')`
que segura as seções 21 e 22 (o peso e a identidade), para elas passarem a
valer sempre.

A suíte roda contra qualquer uma das duas pastas:

```bash
cd testes && ./rodar.sh t-contratos.js          # o /contratos/ de hoje
CONTRATOS_DIR=teste node t-contratos.js         # a prévia
```
