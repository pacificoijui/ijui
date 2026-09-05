# Backup do sistema

O banco do sistema é o Firestore do projeto `processos-ijui`. Todo dia o GitHub
roda sozinho o workflow [`backup-firestore.yml`](../workflows/backup-firestore.yml),
que baixa as 12 coleções e guarda o resultado.

O agendamento é para as **03:00 da manhã (horário de Brasília)**, mas o GitHub
atrasa execuções agendadas quando os runners estão concorridos: na prática as
últimas rodaram entre 07:50 e 10:00. Não há o que ajustar — é assim que o cron
do Actions funciona, e o que importa é rodar uma vez por dia, longe do horário
de expediente.

## Onde está o backup de hoje

1. Abra o repositório no GitHub → aba **Actions**
2. Clique em **Backup diário do Firestore** na lista da esquerda
3. Abra a execução do dia
4. No fim da página, em **Artifacts**, baixe `backup-firestore-AAAA-MM-DD`

O GitHub guarda **90 dias** de backups. Passado esse prazo ele apaga sozinho —
por isso existe também a cópia permanente descrita abaixo.

Para rodar um backup na hora, sem esperar as 03:00: mesma tela, botão
**Run workflow**.

## Cópia permanente, num repositório privado

O artifact morre em 90 dias, e o dump **não pode** ser commitado neste
repositório: ele é público e vira o site ijui.net — publicaria o banco inteiro,
inclusive a coleção `usuarios`, numa URL fixa. A cópia de longa duração vai para
um repositório **privado**, um commit por dia, sempre nos mesmos arquivos: o
estado atual é o backup de hoje, o histórico do git guarda todos os dias
anteriores, e o diff de cada dia mostra o que mudou no banco.

Enquanto o secret `BACKUP_TOKEN` não existir, esse passo é pulado e o backup
diário continua funcionando normalmente pelo artifact.

### Como ligar (uma vez só, tudo pelo site do GitHub)

1. **Criar o repositório privado.** Em <https://github.com/new>: nome
   `ijui-backups`, dono a mesma conta do repositório do site, marcar
   **Private** e marcar **Add a README file**. Se usar outro nome, crie depois
   a variável `BACKUP_REPO` (passo 3) com `dono/nome`.

2. **Criar o token que dá acesso a ele.** Em
   <https://github.com/settings/personal-access-tokens/new> (token *fine-grained*):
   - Token name: `backup-ijui`
   - Expiration: **No expiration** (se puser prazo, no dia em que vencer o
     backup para de subir para o repositório privado)
   - Repository access: **Only select repositories** → `ijui-backups`
   - Permissions → Repository permissions → **Contents: Read and write**
   - **Generate token** e copiar o valor (começa com `github_pat_`); ele só
     aparece uma vez.

3. **Guardar o token neste repositório.** Em
   `Settings → Secrets and variables → Actions` do repositório do site, aba
   **Secrets**, botão **New repository secret**:
   - Name: `BACKUP_TOKEN` (exatamente assim)
   - Secret: colar o token

   Só se o repositório privado tiver outro nome: na aba **Variables**, criar
   `BACKUP_REPO` com `dono/nome`.

4. **Conferir.** Aba **Actions** → *Backup diário do Firestore* → **Run
   workflow**. Ao terminar, o repositório privado deve ter o commit
   `Backup de AAAA-MM-DD` e a pasta `atual/`.

O token dá acesso de escrita **só** ao repositório de backups: mesmo vazado, não
alcança o repositório do site nem o Firebase.

### Restaurar a partir dele

A pasta `atual/` tem o mesmo formato do artifact, então o comando é o mesmo,
apontando para dentro do clone do repositório privado:

```bash
git clone git@github.com:pacificoijui/ijui-backups.git
node .github/scripts/restaurar-firestore.mjs ../ijui-backups/atual/processos-ijui --colecao processos
```

Para voltar a um dia anterior, é o git que guarda: `git log` no repositório de
backups mostra um commit por dia; `git checkout <commit>` deixa `atual/` com o
conteúdo daquele dia, e daí o comando acima é igual.

## O que tem dentro

```
backup/AAAA-MM-DD/
  manifest.json          data, total e contagem por coleção
  processos.json         legível, valores já convertidos
  rankings.json
  ...
  raw/                   o formato exato da API, usado para restaurar
```

Se o backup vier vazio o workflow falha de propósito — backup vazio marcado como
"sucesso" é pior do que backup nenhum, porque passa a impressão de que está tudo
guardado.

## Como restaurar

Baixe e descompacte o artifact, depois, dentro da pasta do repositório:

```bash
# 1. Veja o que seria feito (não grava nada)
node .github/scripts/restaurar-firestore.mjs caminho/do/backup/2026-08-29 --colecao processos

# 2. Se estiver certo, grave de verdade
node .github/scripts/restaurar-firestore.mjs caminho/do/backup/2026-08-29 --colecao processos --confirmar
```

Restaurar **sobrescreve o documento inteiro** pelo que está no backup. Se alguém
mexeu naquele processo depois da data do backup, essa alteração se perde. Por
isso o normal é restaurar só a coleção que quebrou (`--colecao`), e não o banco
todo de uma vez.

Sem `--confirmar` o script apenas simula, então é seguro rodar para conferir.

## Se aparecer uma coleção ou um módulo novo

A tabela `MODULOS`, no topo de `backup-firestore.mjs`, diz de quais projetos
copiar e quais coleções cada um tem. Ela é escrita à mão porque a API do
Firestore não lista coleções sem credencial de administrador — **coleção que não
estiver nessa tabela não é copiada, e nada avisa.**

Hoje ela cobre três módulos: licitações (`pregoeiro/index.html`, 12 coleções),
contratos (`contratos/index.html`) e editais (`editais/index.html`). Os dois
últimos ainda não têm projeto Firebase: enquanto o `FIREBASE_CONFIG` deles
estiver vazio o backup apenas os pula, e no dia em que forem preenchidos passa a
copiá-los sozinho, cada um na sua pasta.

Módulo novo = mais uma linha nessa tabela. É a única manutenção que este backup
pede, e esquecer dela é a falha mais provável — foi o que aconteceu com editais,
que existiu por um tempo fora da lista.

## O que este backup NÃO cobre

Vale saber de antemão, para ninguém descobrir na hora do aperto:

- **As regras do Firestore.** Não são copiadas. Se o projeto for apagado, elas
  vão junto e precisam ser reescritas à mão no console.
- **O projeto do Firebase em si.** Apagou, o `projectId` não volta: um projeto
  novo tem outro id e outra chave, e aí o `apiKey`/`projectId` do HTML tem de ser
  atualizado antes de restaurar.
- **Até 24 horas de alterações.** O backup roda uma vez por dia; o que mudou
  depois da última execução não está em lugar nenhum.
- **O próprio GitHub.** Se a conta for comprometida, o repositório de backups
  está lá dentro. Baixar uma cópia para fora de tempos em tempos (o artifact ou
  um `git clone` do repositório privado) é o que cobre esse caso.

Um detalhe que é os dois lados da mesma moeda: o sistema grava direto do
navegador, sem autenticação do Firebase, então a regra de escrita do Firestore
está necessariamente aberta. É por isso que a restauração funciona só com a
chave pública — e é também por isso que o cenário "alguém apagou tudo" é
plausível. Se um dia a regra de escrita for fechada, a restauração passa a
precisar de credencial de administrador.

## Por que não precisa de senha nenhuma

O backup lê pela API REST do Firestore com a mesma chave web que já está no HTML
do site, e ela é pública por natureza. Não há service account, nem secret, nem
mudança de plano no Firebase envolvida.
