# Testes de regressão

O sistema é um punhado de arquivos HTML grandes, sem etapa de build. Isso o
torna fácil de publicar e difícil de refatorar: nada avisa quando uma mudança
num canto quebra outro. Estes testes são esse aviso.

Cada um deles nasceu de um pedido ou de um bug real — não de uma meta de
cobertura. Se um falhar, algo que já funcionou parou de funcionar.

## Rodar

```bash
cd testes
./rodar.sh                      # tudo
./rodar.sh hab                  # só os que têm "hab" no nome
./rodar.sh t-smoke.js           # um específico
```

O script sobe um servidor local na porta 8099 e o derruba no fim. As páginas
precisam ser servidas por `http://` — o Firestore e o `fetch` do modelo `.odt`
não funcionam a partir de `file://`.

Precisa de **Node 18+** e do **Playwright com Chromium**:

```bash
npm install -D playwright && npx playwright install chromium
```

O `navegador.js` acha o Playwright e o Chromium onde estiverem — instalado no
projeto, global, ou nos caminhos do container do Claude Code.

## Como funcionam

Não há Firebase de verdade envolvido. O `fbstub3.js` é um Firestore de mentira
que roda dentro da página: guarda tudo em memória, dispara `onSnapshot` como o
de verdade e expõe `window.__STORE` para o teste conferir o que foi gravado.
Cada teste injeta os dados de que precisa por `window.__SEED` antes da página
carregar.

Isso significa que os testes **não tocam no banco de produção** e rodam sem
rede.

## O que cada um cobre

| arquivo | o que protege |
|---|---|
| `t-smoke.js` | abre e fecha os 10 painéis/modais procurando erro de JS |
| `t-handlers.js` | todo `onclick` do HTML aponta para uma função que existe |
| `t-handlers2.js` | idem, para os botões gerados dentro de strings JS |
| `t-hab-nao-enviou.js` | status "não enviou os documentos" na Habilitação |
| `t-hab-obs-e-obs-conclusao.js` | observação por empresa, e some ao concluir |
| `t-hab-doc-recusado-nao-desclassifica.js` | recusar 1 documento não desclassifica o ranking sozinho |
| `t-hab-desfazer-inabilitacao.js` | desfazer a inabilitação devolve as propostas |
| `t-venc-sempre-aberto.js` | tela pública de Vencedores: itens abertos, frase legível |
| `t-venc-rolagem-unificada.js` | link da secretaria: o topo rola junto, só o rodapé é fixo |
| `t-venc-painel-interno.js` | painel interno de Vencedores: mesma frase legível, sem tabela |
| `t-editar-valor-forn.js` | edição de Valor/Modelo/Marca na colocação |
| `t-editar-atalho-status.js` | edição dos botões de mensagem rápida |
| `t-pdf-cabecalho-enxuto.js` | cabeçalho do PDF de Decisão/Diligência |
| `t-pdf-unificado.js` | Decisão e Diligência saem do mesmo gerador, sem se misturar |
| `t-editais.js` | módulo de editais: 3 cenários de marcação |
| `t-itens.js` | tabela de itens colada preenche TR e Anexo I |
| `t-dotacao.js` | dotação orçamentária nas duas tabelas |
| `t-artigo-objeto.js` | concordância "a/o" na frente do objeto |
| `verificar-odt.py` | confere os `.odt` gerados: ODF válido, blocos certos |
| `t-agenda-busca-itens.js` | busca de itens já licitados na agenda |
| `t-proximos-objeto.js` | objeto inteiro nos Próximos Processos |
| `t-lista-celular.js` | agenda no celular: só Lista, objeto sem corte |
| `t-repro-naoenviou-propostas.js` | "não enviou" não mexe nas propostas |
| `t-contratos.js` | contratos: dados fora do HTML, tela intacta |

## Escrevendo um teste novo

Copie o mais parecido e ajuste. O padrão é sempre o mesmo:

1. `SEED` com os dados mínimos do cenário
2. abre a página com `?venc=`, `?hab=` ou direto, conforme o caso
3. chama as funções do sistema por `pg.evaluate()`
4. confere o resultado com `t('descrição', condição, valorSeFalhar)`

Descreva o que o teste protege em português, na primeira linha do arquivo —
daqui a seis meses é isso que vai dizer se ele ainda faz sentido.

## Limite conhecido

Os testes conferem comportamento e estrutura, não aparência. Um PDF pode passar
em todas as conferências e ainda sair com a margem errada; um `.odt` pode ser
válido e abrir torto. Para isso, ainda é preciso abrir o arquivo e olhar.
