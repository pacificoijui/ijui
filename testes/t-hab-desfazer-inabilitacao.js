/* Bug encontrado na revisão geral: "Desfazer declaração de inabilitada" tirava
   a marca mas NÃO devolvia as propostas ao ranking. Como a tela de Habilitação
   só lista quem está arrematando algum item, a empresa sumia da tela e ficava
   desclassificada para sempre — sem caminho de volta pela interface.

   Confere também o limite da correção: proposta reprovada por OUTRO motivo
   continua reprovada, porque não foi a inabilitação que a reprovou. */
const {chromium, executablePath} = require('./navegador');
const fs=require('fs');
const stub=fs.readFileSync('fbstub3.js','utf8');
let ok=0,mau=0;
function t(n,c,e){ if(c){console.log('  ✓',n);ok++;} else {console.log('  ✗',n,e!==undefined?'\n       '+JSON.stringify(e):'');mau++;process.exitCode=1;} }

const SEED={
  processos:{ p1:{numero:'PE 200/2026', objeto:'Teste', status:'em-andamento', dataLicit:'2026-08-01', horarioAbertura:'09:00', link:'', responsavel:'PEDRO', contato:''} },
  rankings:{ p1:{ numero:'PE 200/2026', itens:[
      {num:'1', desc:'Item 1', qtde:10, unidade:'UN', fornecedores:[
        {nome:'ALFA COMERCIO LTDA', cnpj:'11.111.111/0001-11', valor:'10,00'}]},
      {num:'2', desc:'Item 2', qtde:5, unidade:'UN', fornecedores:[
        {nome:'ALFA COMERCIO LTDA', cnpj:'11.111.111/0001-11', valor:'20,00'}]},
      /* item 3: já reprovado ANTES, por motivo próprio — não pode ser devolvido */
      {num:'3', desc:'Item 3', qtde:1, unidade:'UN', fornecedores:[
        {nome:'ALFA COMERCIO LTDA', cnpj:'11.111.111/0001-11', valor:'99,00'}]},
      {num:'4', desc:'Item 4', qtde:2, unidade:'UN', fornecedores:[
        {nome:'BETA DISTRIBUIDORA LTDA', cnpj:'22.222.222/0001-22', valor:'30,00'}]}
    ],
    estados:{'3-0':'reprovado'},
    motivos:{'3-0':'Catálogo não atende à especificação do edital.'} } }
};

(async()=>{
  const b=await chromium.launch(executablePath?{executablePath}:{});
  const pg=await b.newPage({viewport:{width:1200,height:900}});
  const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
  await pg.route('**/firebasejs/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:r.request().url().includes('firestore')?stub:'/*noop*/'}));
  await pg.route('**/fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await pg.route('**/cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:'window.jspdf={jsPDF:function(){}};'}));
  await pg.addInitScript(()=>localStorage.setItem('copam_auth',JSON.stringify({u:'teste',nome:'QA'})));
  await pg.addInitScript((sd)=>{ window.__SEED=sd; }, SEED);
  await pg.goto('http://127.0.0.1:8099/pregoeiro/index.html',{waitUntil:'networkidle'});
  await pg.waitForTimeout(700);

  await pg.evaluate(()=>abrirHabilitacao('p1'));
  await pg.waitForTimeout(500);

  console.log('1) Estado inicial: 2 empresas arrematando');
  const inicio=await pg.evaluate(()=>habEmpresas.map(e=>e.nome).sort());
  t('ALFA e BETA aparecem na Habilitação', inicio.length===2, inicio);

  console.log('\n2) Declara ALFA inabilitada — propostas dela saem do ranking');
  pg.once('dialog', d=>d.accept());
  await pg.evaluate(()=>habInabilitar('ALFA COMERCIO LTDA'));
  await pg.waitForTimeout(400);
  const depoisInab=await pg.evaluate(()=>({
    estados:{...window.__STORE.rankings.p1.estados},
    empresas:habEmpresas.map(e=>e.nome)
  }));
  t('item 1 desclassificado', depoisInab.estados['1-0']==='reprovado', depoisInab.estados);
  t('item 2 desclassificado', depoisInab.estados['2-0']==='reprovado', depoisInab.estados);
  t('ALFA sumiu da lista (não arremata mais nada)', depoisInab.empresas.indexOf('ALFA COMERCIO LTDA')<0, depoisInab.empresas);

  console.log('\n3) Desfaz a inabilitação — as propostas têm de voltar');
  await pg.evaluate(()=>habDesfazerInabilitacao('ALFA COMERCIO LTDA'));
  await pg.waitForTimeout(500);
  const depoisDesfazer=await pg.evaluate(()=>({
    estados:{...window.__STORE.rankings.p1.estados},
    motivos:{...(window.__STORE.rankings.p1.motivos||{})},
    empresas:habEmpresas.map(e=>e.nome).sort()
  }));
  t('FIX: item 1 voltou ao ranking', depoisDesfazer.estados['1-0']==='neutro', depoisDesfazer.estados);
  t('FIX: item 2 voltou ao ranking', depoisDesfazer.estados['2-0']==='neutro', depoisDesfazer.estados);
  t('FIX: o motivo da inabilitação foi limpo', !depoisDesfazer.motivos['1-0'], depoisDesfazer.motivos);
  t('FIX: ALFA voltou a aparecer na Habilitação', depoisDesfazer.empresas.indexOf('ALFA COMERCIO LTDA')>=0, depoisDesfazer.empresas);

  console.log('\n4) Limite da correção: reprovação por OUTRO motivo continua de pé');
  t('item 3 segue reprovado', depoisDesfazer.estados['3-0']==='reprovado', depoisDesfazer.estados);
  t('o motivo original do item 3 foi preservado',
    depoisDesfazer.motivos['3-0']==='Catálogo não atende à especificação do edital.', depoisDesfazer.motivos);

  console.log('\n5) A empresa que nunca foi inabilitada não foi tocada');
  t('item 4 (BETA) segue intocado', !depoisDesfazer.estados['4-0'], depoisDesfazer.estados);

  console.log('\nerros JS:', errs.length?errs:'nenhum');
  console.log(`\n${ok} passaram, ${mau} falharam.`);
  await b.close();
})();
