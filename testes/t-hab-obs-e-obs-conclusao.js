/* Dois pedidos juntos:
   1) Campo de observação por empresa na Habilitação (embaixo do checklist),
      tipo "falta alvará sanitário". Some quando a empresa é habilitada ou
      inabilitada (pelo botão OU pelo julgamento automático dos documentos).
   2) A observação do PROCESSO (a caixa que já existia no card principal)
      some quando o status vira Concluído — não faz sentido carregar um
      lembrete de algo que já terminou. */
const {chromium, executablePath} = require('./navegador');
const fs=require('fs');
const stub=fs.readFileSync('fbstub3.js','utf8');
let ok=0,mau=0;
function t(n,c,e){ if(c){console.log('  ✓',n);ok++;} else {console.log('  ✗',n,e!==undefined?'\n       '+JSON.stringify(e):'');mau++;process.exitCode=1;} }

const SEED={
  status:{
    s1:{id:'em-andamento',nome:'Em Andamento',cor:'amber',ordem:0},
    s2:{id:'finalizacao',nome:'Finalização',cor:'blue',ordem:1},
    s3:{id:'concluido',nome:'Concluído',cor:'green',ordem:2},
    s4:{id:'revogado',nome:'Revogado',cor:'pink',ordem:3}
  },
  processos:{
    p1:{numero:'PE 127/2026', objeto:'Teste', status:'em-andamento', dataLicit:'2026-08-01', horarioAbertura:'09:00', link:'', responsavel:'PEDRO', contato:'', observacao:'Ligar pra empresa cobrando o catálogo.'},
    p2:{numero:'PE 128/2026', objeto:'Teste 2', status:'em-andamento', dataLicit:'2026-08-02', horarioAbertura:'09:00', link:'', responsavel:'PEDRO', contato:'', observacao:'Nota que deve sumir ao concluir.'},
    p3:{numero:'PE 129/2026', objeto:'Teste 3', status:'em-andamento', dataLicit:'2026-08-03', horarioAbertura:'09:00', link:'', responsavel:'PEDRO', contato:'', observacao:'Nota que NÃO deve sumir (não é conclusão).'}
  },
  rankings:{ p1:{ numero:'PE 127/2026', itens:[
      {num:'2', desc:'Item 2', fornecedores:[{nome:'CASA MIX LTDA', cnpj:'37.429.301/0001-45'}]},
      {num:'3', desc:'Item 3', fornecedores:[{nome:'E. D. Azambuja & Cia Ltda', cnpj:'73.865.008/0001-94'}]}
    ], estados:{} } }
};

(async()=>{
  const b=await chromium.launch(executablePath?{executablePath}:{});
  const pg=await b.newPage({viewport:{width:500,height:900}});
  const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
  await pg.route('**/firebasejs/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:r.request().url().includes('firestore')?stub:'/*noop*/'}));
  await pg.route('**/fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await pg.route('**/cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:'window.jspdf={jsPDF:function(){}};'}));
  await pg.addInitScript(()=>localStorage.setItem('copam_auth',JSON.stringify({u:'teste',nome:'QA'})));
  await pg.addInitScript((sd)=>{ window.__SEED=sd; }, SEED);
  await pg.goto('http://127.0.0.1:8099/pregoeiro/index.html',{waitUntil:'networkidle'});
  await pg.waitForTimeout(700);

  console.log('══ PARTE 1: observação por empresa na Habilitação ══');
  await pg.evaluate(()=>abrirHabilitacao('p1'));
  await pg.waitForTimeout(400);

  console.log('\n1) O campo aparece embaixo do checklist, com o placeholder certo');
  const campos=await pg.evaluate(()=>[...document.querySelectorAll('.hab-obs-input')].map(el=>el.placeholder));
  t('existe 1 campo por empresa (2 empresas)', campos.length===2, campos);
  t('o placeholder dá o exemplo pedido (alvará sanitário)', campos.every(p=>/alvar[áa] sanit[áa]rio/i.test(p)), campos);

  console.log('\n2) Digitar salva a observação (no estado e no Firestore)');
  const k1=await pg.evaluate(()=>{
    const btn=document.querySelector('[data-naoenviou]');
    return btn.dataset.naoenviou;
  });
  await pg.fill('.hab-obs-input[data-obskey="'+k1+'"]','Falta alvará sanitário.');
  await pg.waitForTimeout(150);
  const memPos=await pg.evaluate((k)=>habObs[k], k1);
  t('ficou guardado em habObs', memPos==='Falta alvará sanitário.', memPos);
  await pg.waitForTimeout(1000);
  const persistido=await pg.evaluate(()=>window.__STORE.habilitacoes.p1.obs);
  t('foi gravado no Firestore (campo "obs")', persistido && persistido[k1]==='Falta alvará sanitário.', persistido);

  console.log('\n3) Declarar HABILITADA apaga a observação');
  await pg.evaluate((k)=>habDeclarar(k), k1);
  await pg.waitForTimeout(150);
  const aposHab=await pg.evaluate((k)=>({obs:habObs[k], campo:document.querySelector('.hab-obs-input[data-obskey="'+k+'"]').value}), k1);
  t('sumiu do estado (habObs)', aposHab.obs===undefined, aposHab);
  t('o campo na tela ficou vazio', aposHab.campo==='', aposHab);

  console.log('\n4) Declarar INABILITADA também apaga (em outra empresa)');
  const k2=await pg.evaluate(()=>{
    const btns=[...document.querySelectorAll('[data-naoenviou]')];
    return btns[0] ? btns[0].dataset.naoenviou : null;
  });
  await pg.fill('.hab-obs-input[data-obskey="'+k2+'"]','Nota antes de inabilitar.');
  await pg.waitForTimeout(150);
  pg.once('dialog', d=>d.accept());
  await pg.evaluate((k)=>habInabilitar(k), k2);
  await pg.waitForTimeout(150);
  const aposInab=await pg.evaluate((k)=>habObs[k], k2);
  t('sumiu depois de inabilitar', aposInab===undefined, aposInab);

  console.log('\n5) Julgamento automático dos documentos (sem clicar nos botões) também apaga');
  await pg.evaluate((k)=>{ habDesfazerInabilitacao(k); }, k2);
  await pg.waitForTimeout(100);
  await pg.fill('.hab-obs-input[data-obskey="'+k2+'"]','Falta um documento só.');
  await pg.waitForTimeout(150);
  /* aprova manualmente TODOS os documentos exigidos até o status virar habilitado sozinho */
  const antesAuto=await pg.evaluate((k)=>habObs[k], k2);
  t('a observação está lá antes de julgar os documentos', antesAuto==='Falta um documento só.', antesAuto);
  await pg.evaluate((k)=>{
    habSetDoc(k,'j_c','aprovado');
    ['f_a','f_b','f_c','f_d','f_e','f_f','f_g'].forEach(function(id){ habSetDoc(k,id,'aprovado'); });
    habSetDoc(k,'e_a','aprovado');
  }, k2);
  await pg.waitForTimeout(150);
  const statusAuto=await pg.evaluate((k)=>habCalcInfo(k).status, k2);
  const obsAuto=await pg.evaluate((k)=>habObs[k], k2);
  t('o status ficou habilitado automaticamente (todos os docs aprovados)', statusAuto==='habilitado', statusAuto);
  t('a observação sumiu sozinha, sem clicar em nenhum botão de declarar', obsAuto===undefined, obsAuto);

  console.log('\n6) Marcar "não enviou os documentos" NÃO apaga (ainda está pendente)');
  await pg.evaluate((k)=>{ habSetDoc(k,'j_c','aprovado'); /* desfaz aprovação -> volta a pendente */ }, k2);
  await pg.waitForTimeout(100);
  await pg.fill('.hab-obs-input[data-obskey="'+k2+'"]','Aguardando 2ª via.');
  await pg.waitForTimeout(150);
  await pg.evaluate((k)=>habMarcarNaoEnviou(k), k2);
  await pg.waitForTimeout(150);
  const obsNaoEnviou=await pg.evaluate((k)=>habObs[k], k2);
  t('a observação continua lá (não é decisão fechada)', obsNaoEnviou==='Aguardando 2ª via.', obsNaoEnviou);

  console.log('══ PARTE 2: observação do PROCESSO some ao concluir ══');

  console.log('\n7) mudarStatusRapido pra "concluido" limpa a observação no Firestore');
  await pg.evaluate(()=>{ mudarStatusRapido('p1','concluido'); });
  await pg.waitForTimeout(150);
  const p1depois=await pg.evaluate(()=>window.__STORE.processos.p1.observacao);
  t('a observação do processo p1 ficou vazia', p1depois==='', p1depois);

  console.log('\n8) salvarProcesso (modal de edição) também limpa ao mudar pra Concluído');
  await pg.evaluate(()=>{
    editarProcesso('p2');
  });
  await pg.waitForTimeout(150);
  await pg.evaluate(()=>{ document.getElementById('inputStatus').value='concluido'; });
  await pg.click('#btnSalvarProcesso');
  await pg.waitForTimeout(200);
  const p2depois=await pg.evaluate(()=>window.__STORE.processos.p2.observacao);
  t('a observação do processo p2 ficou vazia (salvo pelo modal)', p2depois==='', p2depois);

  console.log('\n9) Mudar pra outro status (não Concluído) NÃO mexe na observação');
  await pg.evaluate(()=>{
    editarProcesso('p3');
  });
  await pg.waitForTimeout(150);
  await pg.evaluate(()=>{ document.getElementById('inputStatus').value='finalizacao'; });
  await pg.click('#btnSalvarProcesso');
  await pg.waitForTimeout(200);
  const p3depois=await pg.evaluate(()=>window.__STORE.processos.p3.observacao);
  t('a observação do processo p3 continua a mesma', p3depois==='Nota que NÃO deve sumir (não é conclusão).', p3depois);

  console.log('\n10) Já concluído, salvar de novo (sem trocar status) não mexe em nada');
  await pg.evaluate(()=>{ mudarStatusRapido('p3','concluido'); });
  await pg.waitForTimeout(150);
  const p3jaConcluido=await pg.evaluate(()=>window.__STORE.processos.p3.observacao);
  t('ao concluir pela 1ª vez, a observação suma também via mudarStatusRapido', p3jaConcluido==='', p3jaConcluido);

  console.log('\nerros JS:', errs.length?errs:'nenhum');
  console.log(`\n${ok} passaram, ${mau} falharam.`);
  await b.close();
})();
