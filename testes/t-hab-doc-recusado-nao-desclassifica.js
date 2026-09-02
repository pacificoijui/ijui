/* Bug relatado: "quando eu marco em não enviou os docs, aparece como empresa
   inabilitada nas propostas, mas não é isso... pra inabilitar, somente no
   botão inabilitado".

   Causa raiz encontrada (não era o botão "não enviou" em si): rejeitar UM
   único documento na conferência já calculava a empresa como "Inabilitado" e
   habSetDoc desclassificava sozinho, na hora, todas as propostas dela no
   Ranking — sem o pregoeiro nunca ter clicado no botão vermelho "Declarar
   empresa INABILITADA". Clicar depois em "Não enviou os documentos" não
   desfazia essa desclassificação já feita, e por isso a empresa aparecia
   como inabilitada nas Propostas.

   Fix: habSetDoc não desclassifica mais sozinho. Só o botão explícito
   "Declarar empresa INABILITADA" (habInabilitar) mexe no Ranking agora — e
   esse botão continua visível/clicável mesmo depois de um doc recusado, pra
   a declaração explícita continuar possível quando o pregoeiro decidir. */
const {chromium, executablePath} = require('./navegador');
const fs=require('fs');
const stub=fs.readFileSync('fbstub3.js','utf8');
let ok=0,mau=0;
function t(n,c,e){ if(c){console.log('  ✓',n);ok++;} else {console.log('  ✗',n,e!==undefined?'\n       '+JSON.stringify(e):'');mau++;process.exitCode=1;} }

const SEED={
  processos:{ p1:{numero:'PE 127/2026', objeto:'Teste', status:'em-andamento', dataLicit:'2026-08-01', horarioAbertura:'09:00', link:'', responsavel:'PEDRO', contato:''} },
  rankings:{ p1:{ numero:'PE 127/2026', itens:[
      {num:'2', desc:'Item 2', fornecedores:[{nome:'CASA MIX LTDA', cnpj:'37.429.301/0001-45', valor:'100,00'}]}
    ], estados:{} } }
};

(async()=>{
  const b=await chromium.launch(executablePath?{executablePath}:{});
  const pg=await b.newPage({viewport:{width:1200,height:900},hasTouch:false,permissions:['clipboard-read','clipboard-write']});
  const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
  await pg.route('**/firebasejs/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:r.request().url().includes('firestore')?stub:'/*noop*/'}));
  await pg.route('**/fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await pg.route('**/cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:'window.jspdf={jsPDF:function(){}};'}));
  await pg.addInitScript(()=>localStorage.setItem('copam_auth',JSON.stringify({u:'teste',nome:'QA'})));
  await pg.addInitScript((sd)=>{ window.__SEED=sd; }, SEED);
  await pg.goto('http://127.0.0.1:8099/pregoeiro/index.html',{waitUntil:'networkidle'});
  await pg.waitForTimeout(700);

  await pg.evaluate(()=>abrirHabilitacao('p1'));
  await pg.waitForTimeout(400);
  const empKey=await pg.evaluate(()=>habKeyEmpresa(habEmpresas[0].nome));

  console.log('1) Rejeitar 1 documento na conferência (fluxo normal, sem clicar em nada mais)');
  await pg.evaluate((k)=>habSetDoc(k,'f_c','recusado'), empKey);
  await pg.waitForTimeout(300);

  const statusBadge=await pg.evaluate((k)=>habCalcInfo(k).status, empKey);
  t('o selo mostra "Inabilitado" (alerta pro pregoeiro — isso é informativo, não some)', statusBadge==='inabilitado', statusBadge);

  const store1=await pg.evaluate(()=>window.__STORE.rankings.p1);
  t('FIX: nada foi desclassificado no Ranking sozinho (estados vazio)', !store1.estados || Object.keys(store1.estados).length===0, store1.estados);
  t('FIX: nenhum campo "estados.2-0" solto foi gravado', !('estados.2-0' in store1), store1);

  console.log('\n2) O botão "Declarar empresa INABILITADA" continua disponível mesmo com o selo já "Inabilitado"');
  const temBotaoInab=await pg.evaluate((k)=>!!document.querySelector('[data-inab="'+k+'"]'), empKey);
  t('FIX: o botão vermelho continua clicável (não sumiu por já estar "Inabilitado")', temBotaoInab, temBotaoInab);

  console.log('\n3) Marcar "Não enviou os documentos" — mantém o Ranking intocado');
  await pg.evaluate((k)=>habMarcarNaoEnviou(k), empKey);
  await pg.waitForTimeout(300);
  const statusNaoEnv=await pg.evaluate((k)=>habCalcInfo(k).status, empKey);
  t('o status vira "nao-enviou"', statusNaoEnv==='nao-enviou', statusNaoEnv);
  const store2=await pg.evaluate(()=>window.__STORE.rankings.p1);
  t('o Ranking segue sem nenhuma desclassificação', !store2.estados || Object.keys(store2.estados).length===0, store2.estados);

  console.log('\n4) Confirma na tela de Propostas: o item continua "1 pendente", sem Reprovado');
  await pg.evaluate(()=>{ fecharHabilitacao(); });
  await pg.evaluate((pid)=>abrirRanking(pid), 'p1');
  await pg.waitForTimeout(400);
  const telaTxt=await pg.evaluate(()=>document.getElementById('rkRanking').innerText);
  t('a tela mostra "pendente", não "Fracassado"', /pendente/i.test(telaTxt) && !/Fracassado/i.test(telaTxt), telaTxt);
  t('a palavra "inabilitada" não aparece na tela', !/inabilitada/i.test(telaTxt), telaTxt);

  console.log('\n5) Só o botão explícito "Declarar empresa INABILITADA" desclassifica de verdade');
  await pg.evaluate(()=>{ fecharRanking&&fecharRanking(); });
  await pg.evaluate(()=>abrirHabilitacao('p1'));
  await pg.waitForTimeout(300);
  pg.once('dialog', d=>d.accept());
  await pg.evaluate((k)=>habInabilitar(k), empKey);
  await pg.waitForTimeout(300);
  const store3=await pg.evaluate(()=>window.__STORE.rankings.p1);
  t('agora sim o Ranking foi desclassificado, pela declaração explícita', store3.estados&&store3.estados['2-0']==='reprovado', store3.estados);
  t('o motivo gravado é o padrão de inabilitação', store3.motivos&&store3.motivos['2-0']==='Empresa inabilitada do certame.', store3.motivos);

  console.log('\nerros JS:', errs.length?errs:'nenhum');
  console.log(`\n${ok} passaram, ${mau} falharam.`);
  await b.close();
})();
