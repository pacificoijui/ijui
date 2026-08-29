# Backup do sistema

O banco do sistema é o Firestore do projeto `processos-ijui`. Todo dia às **03:00
da manhã (horário de Brasília)** o GitHub roda sozinho o workflow
[`backup-firestore.yml`](../workflows/backup-firestore.yml), que baixa as 12
coleções e guarda o resultado.

## Onde está o backup de hoje

1. Abra o repositório no GitHub → aba **Actions**
2. Clique em **Backup diário do Firestore** na lista da esquerda
3. Abra a execução do dia
4. No fim da página, em **Artifacts**, baixe `backup-firestore-AAAA-MM-DD`

O GitHub guarda **90 dias** de backups. Passado esse prazo ele apaga sozinho.

Para rodar um backup na hora, sem esperar as 03:00: mesma tela, botão
**Run workflow**.

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

## Se aparecer uma coleção nova

A lista de coleções fica no topo de `backup-firestore.mjs`, na constante
`COLECOES`. Ela é escrita à mão porque a API do Firestore não lista coleções sem
credencial de administrador — uma coleção nova que não entrar nessa lista
**não é copiada**.

## Por que não precisa de senha nenhuma

O backup lê pela API REST do Firestore com a mesma chave web que já está no HTML
do site, e ela é pública por natureza. Não há service account, nem secret, nem
mudança de plano no Firebase envolvida.
