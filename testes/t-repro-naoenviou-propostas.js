/* Reprodução do relato do usuário: "quando eu marco em não enviou os docs,
   aparece como empresa inabilitada nas propostas". Testa se marcar "não
   enviou" mexe em QUALQUER COISA na tela de Ranking/Propostas (rkEstados,
   badges, % do card) além do próprio painel de Habilitação. */
const {chromium, executablePath} = require('./navegador');
const fs=require('fs');
const stub=fs.readFileSync('fbstub3.js','utf8');
let ok=0,mau=0;
function t(n,c,e){ if(c){console.log('  ✓',n);ok++;} else {console.log('  ✗',n,e!==undefined?'\n       '+JSON.stringify(e):'');mau++;process.exitCode=1;} }

const SEED={
  processos:{ p1:{numero:'PE 127/2026', objeto:'Teste', status:'em-andamento', dataLicit:'2026-08-01', horarioAbertura:'09:00', link:'', responsavel:'PEDRO', contato:''} },
  rankings:{ p1:{ numero:'PE 127/2026', itens:[
      {num:'2', desc:'Item 2', fornecedores:[{nome:'CASA MIX LTDA', cnpj:'37.429.301/0001-45', valor:'100,00'}]},
      {num:'12', desc:'Item 12', fornecedores:[{nome:'CASA MIX LTDA', cnpj:'37.429.301/0001-45', valor:'50,00'}]}
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
  await pg.addInitScript((u)=>{ window.__AUTH_SEED=u; }, {uid:'teste-admin', email:'pedrohhpacifico@gmail.com', displayName:'QA', photoURL:''});
  await pg.goto('http://127.0.0.1:8099/pregoeiro/index.html',{waitUntil:'networkidle'});
  await pg.waitForTimeout(700);

  console.log('1) Marca "não enviou os documentos" pra CASA MIX');
  await pg.evaluate(()=>abrirHabilitacao('p1'));
  await pg.waitForTimeout(400);
  const empKey=await pg.evaluate(()=>{
    const btn=document.querySelector('[data-naoenviou]');
    const k=btn.dataset.naoenviou;
    habMarcarNaoEnviou(k);
    return k;
  });
  await pg.waitForTimeout(200);

  console.log('\n2) rkEstados dos itens da empresa continuam intocados (não reprovados)');
  const estadosItens=await pg.evaluate(()=>({...rkEstados}));
  t('nenhum item foi marcado como reprovado', Object.values(estadosItens).every(v=>v!=='reprovado'), estadosItens);
  t('rkEstados está vazio (nada mudou)', Object.keys(estadosItens).length===0, estadosItens);

  console.log('\n3) Abre o painel de Ranking (Propostas) do mesmo processo');
  await pg.evaluate(()=>{ fecharHabilitacao(); });
  await pg.evaluate((pid)=>abrirRanking(pid), 'p1');
  await pg.waitForTimeout(400);

  const rkTela=await pg.evaluate(()=>{
    const txt=document.getElementById('rkRanking')?document.getElementById('rkRanking').innerText:'';
    return {
      temInabilitada: /inabilitad/i.test(txt),
      temReprovado: /reprovad/i.test(txt),
      corpoCompleto: txt.slice(0,400)
    };
  });
  t('a palavra "inabilitada" NÃO aparece na tela de Propostas', !rkTela.temInabilitada, rkTela.corpoCompleto);
  t('nenhum item aparece como Reprovado', !rkTela.temReprovado, rkTela.corpoCompleto);

  console.log('\n4) O card do processo na tela inicial (dashboard) também não mostra nada de inabilitada');
  await pg.evaluate(()=>{ fecharRanking&&fecharRanking(); });
  await pg.evaluate(()=>renderizar());
  await pg.waitForTimeout(300);
  const cardTxt=await pg.evaluate(()=>{
    const card=document.querySelector('.card[data-pid="p1"]');
    return card?card.innerText:'(sem card)';
  });
  t('o card do processo não menciona "inabilitada"', !/inabilitad/i.test(cardTxt), cardTxt);

  console.log('\n5) cardProgresso() conta a empresa "não enviou" como julgada corretamente (não como inabilitada)');
  const prog=await pg.evaluate(()=>{
    const ex=procExtras['p1']||{};
    return cardProgresso(ex);
  });
  console.log('   cardProgresso:', prog);

  console.log('\nerros JS:', errs.length?errs:'nenhum');
  console.log(`\n${ok} passaram, ${mau} falharam.`);
  await b.close();
})();
