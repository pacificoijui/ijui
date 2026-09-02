/* Pedido: na Habilitação, um novo botão "Não enviou os documentos" — vira um
   status próprio (cinza escuro), diferente de Habilitado/Inabilitado/Pendente,
   e libera um botão de copiar o texto de diligência (2ª solicitação) já pronto
   com o nome da empresa. */
const {chromium, executablePath} = require('./navegador');
const fs=require('fs');
const stub=fs.readFileSync('fbstub3.js','utf8');
let ok=0,mau=0;
function t(n,c,e){ if(c){console.log('  ✓',n);ok++;} else {console.log('  ✗',n,e!==undefined?'\n       '+JSON.stringify(e):'');mau++;process.exitCode=1;} }

const SEED={
  processos:{ p1:{numero:'PE 127/2026', objeto:'Teste', status:'em-andamento', dataLicit:'2026-08-01', horarioAbertura:'09:00', link:'', responsavel:'PEDRO', contato:''} },
  rankings:{ p1:{ numero:'PE 127/2026', itens:[
      {num:'2', desc:'Item 2', fornecedores:[{nome:'CASA MIX LTDA', cnpj:'37.429.301/0001-45'}]},
      {num:'12', desc:'Item 12', fornecedores:[{nome:'CASA MIX LTDA', cnpj:'37.429.301/0001-45'}]},
      {num:'3', desc:'Item 3', fornecedores:[{nome:'E. D. Azambuja & Cia Ltda', cnpj:'73.865.008/0001-94'}]}
    ], estados:{} } }
};

(async()=>{
  const b=await chromium.launch(executablePath?{executablePath}:{});
  const pg=await b.newPage({viewport:{width:500,height:900},hasTouch:false,permissions:['clipboard-read','clipboard-write']});
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

  console.log('\n1) O botão "Não enviou os documentos" aparece nos cards pendentes');
  const botoes=await pg.evaluate(()=>[...document.querySelectorAll('[data-naoenviou]')].length);
  t('aparece em cada empresa pendente (2)', botoes===2, botoes);

  console.log('\n2) Clicar nele marca a empresa com um status novo (não Habilitado/Inabilitado)');
  const empKey=await pg.evaluate(()=>{
    const btn=document.querySelector('[data-naoenviou]');
    const k=btn.dataset.naoenviou;
    habMarcarNaoEnviou(k);
    return k;
  });
  await pg.waitForTimeout(150);
  const info=await pg.evaluate((k)=>habCalcInfo(k), empKey);
  t('o status calculado é "nao-enviou"', info.status==='nao-enviou', info);
  t('não virou habilitado nem inabilitado', info.status!=='habilitado' && info.status!=='inabilitado', info);

  console.log('\n3) O card mostra o selo cinza-escuro certo');
  const card=await pg.evaluate((k)=>{
    const btn=[...document.querySelectorAll('.hab-card')].find(c=>c.textContent.includes('CASA MIX'));
    const badge=btn.querySelector('.hab-badge');
    return {
      badgeTxt: badge.textContent.trim(),
      badgeClasses: badge.className,
      cardClasses: btn.className,
      corFundo: getComputedStyle(badge).backgroundColor,
      corTexto: getComputedStyle(badge).color
    };
  }, empKey);
  t('o texto do selo é "Não enviou os docs."', card.badgeTxt==='Não enviou os docs.', card.badgeTxt);
  t('tem a classe "naoenviou" no selo e no card', card.badgeClasses.includes('naoenviou') && card.cardClasses.includes('naoenviou'), card);
  t('o fundo do selo é cinza escuro (rgb 55,65,81) e o texto branco', card.corFundo==='rgb(55, 65, 81)' && card.corTexto==='rgb(255, 255, 255)', card);

  console.log('\n4) Some o par Habilitada/Inabilitada e aparece Desfazer + Copiar texto');
  const acoes=await pg.evaluate((k)=>{
    const card=[...document.querySelectorAll('.hab-card')].find(c=>c.textContent.includes('CASA MIX'));
    return {
      temDeclarar: !!card.querySelector('[data-declare]'),
      temInab: !!card.querySelector('[data-inab]'),
      temNaoEnviouDeNovo: !!card.querySelector('[data-naoenviou]'),
      temDesfazer: !!card.querySelector('[data-undonaoenv]'),
      temCopiar: !!card.querySelector('[data-copynaoenv]'),
      textoCopiar: card.querySelector('[data-copynaoenv]').textContent.trim()
    };
  }, empKey);
  t('some o botão Declarar HABILITADA', !acoes.temDeclarar, acoes);
  t('some o botão Declarar INABILITADA', !acoes.temInab, acoes);
  t('some o próprio botão "Não enviou" (já está marcado)', !acoes.temNaoEnviouDeNovo, acoes);
  t('aparece o botão de Desfazer', acoes.temDesfazer, acoes);
  t('aparece o botão de Copiar texto de diligência', acoes.temCopiar, acoes);
  t('o texto do botão menciona "diligência"', /diligência/i.test(acoes.textoCopiar), acoes.textoCopiar);

  console.log('\n5) Copiar leva o nome certo da empresa e o texto pedido');
  await pg.evaluate((k)=>habCopiarTextoNaoEnviou(k), empKey);
  await pg.waitForTimeout(150);
  const clip=await pg.evaluate(()=>navigator.clipboard.readText());
  t('menciona "pela segunda vez"', /pela segunda vez/.test(clip), clip);
  t('tem o nome da empresa (CASA MIX LTDA)', clip.includes('CASA MIX LTDA'), clip);
  t('avisa que será INABILITADA se não enviar de novo', /ser[áa] INABILITADA/.test(clip), clip);

  console.log('\n6) Desfazer volta a mostrar os botões normais');
  await pg.evaluate((k)=>habDesfazerNaoEnviou(k), empKey);
  await pg.waitForTimeout(150);
  const depoisDesfazer=await pg.evaluate((k)=>({
    status: habCalcInfo(k).status,
    temDeclarar: !!document.querySelector('[data-declare="'+k+'"]'),
    temNaoEnviou: !!document.querySelector('[data-naoenviou="'+k+'"]')
  }), empKey);
  t('o status voltou a ser pendente (vazio)', depoisDesfazer.status==='', depoisDesfazer);
  t('os botões normais voltaram', depoisDesfazer.temDeclarar && depoisDesfazer.temNaoEnviou, depoisDesfazer);

  console.log('\n7) Mutuamente exclusivo: declarar HABILITADA depois de "não enviou" limpa a marca');
  await pg.evaluate((k)=>habMarcarNaoEnviou(k), empKey);
  await pg.waitForTimeout(100);
  await pg.evaluate((k)=>habDeclarar(k), empKey);
  await pg.waitForTimeout(100);
  const viradoHab=await pg.evaluate((k)=>({status:habCalcInfo(k).status, naoEnviouAinda: !!habDeclaradosNaoEnviou[k]}), empKey);
  t('virou habilitado', viradoHab.status==='habilitado', viradoHab);
  t('a marca de "não enviou" foi limpa', !viradoHab.naoEnviouAinda, viradoHab);
  await pg.evaluate((k)=>habDesfazerDeclaracao(k), empKey);

  console.log('\n8) Mutuamente exclusivo: INABILITAR depois de "não enviou" também limpa a marca');
  await pg.evaluate((k)=>habMarcarNaoEnviou(k), empKey);
  await pg.waitForTimeout(100);
  pg.once('dialog', d=>d.accept());
  await pg.evaluate((k)=>habInabilitar(k), empKey);
  await pg.waitForTimeout(150);
  const viradoInab=await pg.evaluate((k)=>({status:habCalcInfo(k).status, naoEnviouAinda: !!habDeclaradosNaoEnviou[k]}), empKey);
  t('virou inabilitado', viradoInab.status==='inabilitado', viradoInab);
  t('a marca de "não enviou" foi limpa', !viradoInab.naoEnviouAinda, viradoInab);
  await pg.evaluate((k)=>habDesfazerInabilitacao(k), empKey);
  await pg.waitForTimeout(100);

  console.log('\n9) Contagem de "Pendentes" no topo continua contando quem está "não enviou"');
  await pg.evaluate((k)=>habMarcarNaoEnviou(k), empKey);
  await pg.waitForTimeout(150);
  const stats=await pg.evaluate(()=>({
    total: document.getElementById('hbs-total').textContent,
    hab: document.getElementById('hbs-hab').textContent,
    inab: document.getElementById('hbs-inab').textContent,
    pend: document.getElementById('hbs-pend').textContent
  }));
  t('total continua 2', stats.total==='2', stats);
  t('habilitados 0', stats.hab==='0', stats);
  t('inabilitados 0', stats.inab==='0', stats);
  t('pendentes conta a que está "não enviou" (2)', stats.pend==='2', stats);

  console.log('\n10) O filtro "Pendentes" também mostra quem está "não enviou"');
  await pg.evaluate(()=>{ habFiltroAtivo='pendente'; habRenderLista(); });
  await pg.waitForTimeout(150);
  const filtrados=await pg.evaluate(()=>document.querySelectorAll('.hab-card').length);
  t('o filtro Pendentes mostra as 2 empresas (uma "não enviou", outra pendente de verdade)', filtrados===2, filtrados);
  await pg.evaluate(()=>{ habFiltroAtivo=null; habRenderLista(); });

  console.log('\n11) Grava e recarrega do Firestore (persistência)');
  /* habSalvarFirestore tem um "eco" de 800ms de debounce + ~2,5s ignorando a
     própria gravação (habOwn) — preciso passar desse período pra reabrir
     "de verdade", como faria alguém fechando e voltando minutos depois. */
  await pg.waitForTimeout(3600);
  const salvo=await pg.evaluate(()=>window.__STORE.habilitacoes.p1.declaradosNaoEnviou);
  t('gravou a marca no Firestore', salvo && Object.keys(salvo).length===1, salvo);
  await pg.evaluate(()=>{ fecharHabilitacao(); abrirHabilitacao('p1'); });
  await pg.waitForTimeout(400);
  const recarregado=await pg.evaluate((k)=>habCalcInfo(k).status, empKey);
  t('depois de fechar e reabrir, o status "não enviou" persiste', recarregado==='nao-enviou', recarregado);

  console.log('\nerros JS:', errs.length?errs:'nenhum');
  console.log(`\n${ok} passaram, ${mau} falharam.`);
  await b.close();
})();
