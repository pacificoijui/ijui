/* O backup diário copia coleção por coleção, de uma lista escrita à mão em
   .github/scripts/backup-firestore.mjs — a API REST do Firestore não lista
   coleções sem credencial de administrador do Google Cloud, então não há
   como descobri-las sozinho.

   Uma lista escrita à mão envelhece calada: coleção nova entra no sistema,
   ninguém lembra do backup, e o job continua verde copiando tudo MENOS ela.
   Já aconteceu duas vezes — com "editais" e com "requisicoes".

   Este teste é o alarme que faltava. A fonte da verdade de quais coleções
   existem são as REGRAS do Firestore: uma coleção sem regra é uma coleção
   que o site não usa, e toda coleção que o site usa tem um "match" ali. */
const fs=require('fs');
let ok=0,mau=0;
function t(n,c,e){ if(c){console.log('  ✓',n);ok++;} else {console.log('  ✗',n,e!==undefined?'\n       '+JSON.stringify(e):'');mau++;process.exitCode=1;} }

const regras  = fs.readFileSync('../firestore-processos-ijui.rules','utf8');
const script  = fs.readFileSync('../.github/scripts/backup-firestore.mjs','utf8');
const fluxo   = fs.readFileSync('../.github/workflows/backup-firestore.yml','utf8');
const doc     = fs.readFileSync('../CONTROLE-DE-ACESSO.md','utf8');

console.log('1) Toda coleção do sistema entra no backup');
/* "match /processos/{id}" no nível de cima; ignora os "match" aninhados
   dentro de outro (não há nenhum hoje, mas o dia em que houver, o nome do
   pai é que conta). */
const noBanco = [...regras.matchAll(/^\s{4}match \/([a-z_0-9]+)\/\{/gm)].map(m=>m[1]);
const noBackup = (() => {
  const bloco = script.match(/const LICITACOES = \[([\s\S]*?)\];/);
  return bloco ? [...bloco[1].matchAll(/"([a-z_0-9]+)"/g)].map(m=>m[1]) : [];
})();

t('as regras declaram as coleções do sistema', noBanco.length>10, noBanco.length);
t('e o script de backup tem a lista dele', noBackup.length>10, noBackup.length);

const faltando = noBanco.filter(c=>noBackup.indexOf(c)<0);
t('nenhuma coleção com regra ficou de fora do backup diário',
  faltando.length===0,
  {faltando, dica:'acrescente em LICITACOES, em .github/scripts/backup-firestore.mjs'});

/* O contrário também importa, mas é menos grave: copiar coleção que não
   existe mais só gasta um arquivo vazio. Ainda assim, avisa. */
const sobrando = noBackup.filter(c=>noBanco.indexOf(c)<0);
t('e o backup não copia coleção que o sistema não tem mais',
  sobrando.length===0, {sobrando});

/* As duas mais novas, nomeadas, porque foram exatamente as que escaparam. */
t('as requisições estão na lista (foi a última a escapar)', noBackup.indexOf('requisicoes')>=0);
t('o histórico dos contratos também', noBackup.indexOf('contratos_historico')>=0);
t('e o cadastro de contas, que é o que torna a conta de backup admin',
  noBackup.indexOf('usuarios_v2')>=0 && noBackup.indexOf('usuarios')>=0);

console.log('\n2) O backup entra com conta de e-mail/senha, não com a de quem administra');
/* Conta que entra pelo Google não tem senha no Firebase — não existe senha
   para pôr no secret. A conta de quem administra o sistema no dia a dia
   normalmente é essa, então NÃO serve aqui, e o código precisa dizer isso
   para ninguém perder a tarde tentando. */
t('o login é signInWithPassword (e-mail e senha)', /accounts:signInWithPassword/.test(script));
t('o script avisa que conta do Google não serve',
  /Google nao tem\s*\n?\s*\/\/ senha no Firebase|Google nao tem/.test(script)
  && /senha para por no secret/.test(script), script.indexOf('Google'));
t('e manda criar uma conta só para o backup', /\+backup@gmail\.com/.test(script));

console.log('\n3) Sem os secrets, o backup falha em vez de gravar um vazio');
/* Um backup vazio que passa é pior que um backup que falha: dá a impressão
   de que existe cópia. */
t('o script para com recado quando faltam os secrets',
  /sem BACKUP_EMAIL\/BACKUP_SENHA/.test(script));
t('e o upload falha se não houver arquivo nenhum',
  /if-no-files-found: error/.test(fluxo));
t('o fluxo passa os dois secrets para o script',
  /BACKUP_EMAIL: \$\{\{ secrets\.BACKUP_EMAIL \}\}/.test(fluxo)
  && /BACKUP_SENHA: \$\{\{ secrets\.BACKUP_SENHA \}\}/.test(fluxo));

console.log('\n4) O dump não pode voltar para este repositório, que é público');
/* Este repositório VIRA o site. Commitar o dump aqui publicaria o banco
   inteiro, coleção usuarios inclusa. */
t('a cópia permanente vai para um repositório à parte',
  /BACKUP_REPO/.test(fluxo) && /git clone .*BACKUP_TOKEN/.test(fluxo));
t('e é pulada enquanto o token não existir, em vez de quebrar o backup',
  /if: env\.BACKUP_TOKEN != ''/.test(fluxo));

console.log('\n5) O caminho está escrito onde se procura por ele');
t('CONTROLE-DE-ACESSO.md explica como criar a conta do backup',
  /## Backup diário/.test(doc) && /BACKUP_EMAIL/.test(doc) && /\+backup/.test(doc));

console.log(`\n${ok} passaram, ${mau} falharam.`);
