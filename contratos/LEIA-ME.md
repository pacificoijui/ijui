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
impede. O banco das licitações hoje está aberto para leitura com a chave pública
— inclusive `usuarios`, que guarda hash de senha. Ao criar o projeto dos
contratos, vale já nascer com regra restritiva em vez de repetir o problema.

## Como está hoje

`FIREBASE_CONFIG` em `contratos/index.html` está **vazio**. Enquanto estiver, a
tela carrega de `dados/contratos.json` — os mesmos 1.264 contratos, versionados
aqui no repositório. Tudo funciona: filtros, painel, relatórios em PDF. O que não
existe ainda é alteração ao vivo. A tarja do cabeçalho diz qual das duas fontes
está no ar.

## Como ligar o Firestore

1. No console do Firebase, **criar um projeto novo** (ex.: `contratos-ijui`).
   Não reaproveitar o `processos-ijui`.
2. Criar o Firestore. Nas regras, começar fechado e abrir só o necessário — não
   copiar as regras das licitações.
3. Registrar um app Web e copiar o objeto de configuração.
4. Colar em `FIREBASE_CONFIG`, em `contratos/index.html`.
5. Subir os dados:

   ```bash
   node contratos/ferramentas/importar.mjs              # ensaio, não grava nada
   node contratos/ferramentas/importar.mjs --confirmar  # grava de verdade
   ```

   O id de cada documento é o `id` numérico do contrato em texto, então rodar de
   novo atualiza os mesmos documentos em vez de duplicar.

6. Conferir: a tarja do cabeçalho deve passar a dizer `DADOS AO VIVO`.

A partir daí o backup diário passa a incluir o projeto de contratos sozinho —
ele lê o `FIREBASE_CONFIG` daqui e, enquanto estiver vazio, simplesmente pula.

## Arquivos

| | |
|---|---|
| `index.html` | a tela: busca + uma tabela única (mesmo desenho do módulo licitacon) |
| `dados/contratos.json` | os 1.264 contratos, um por linha |
| `ferramentas/importar.mjs` | sobe o JSON para o Firestore dos contratos |
| `../testes/t-contratos.js` | confere que a tela continua fazendo o que fazia |
