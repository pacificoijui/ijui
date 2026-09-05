/* A busca saiu do painel lateral (que ficou só com Próximos Processos) e virou
   um botão na barra da agenda, abrindo um modal com duas abas. A aba nova,
   "Itens licitados", responde a pergunta que mais aparece na hora de montar
   preço de referência: "arroz já foi comprado? por quanto e de quem?". */
const {chromium, executablePath} = require('./navegador');
const fs=require('fs');
const stub=fs.readFileSync('fbstub3.js','utf8');
let ok=0,mau=0;
function t(n,c,e){ if(c){console.log('  ✓',n);ok++;} else {console.log('  ✗',n,e!==undefined?'\n       '+JSON.stringify(e):'');mau++;process.exitCode=1;} }

/* rankings: um doc por processo, com itens, fornecedores e estados */
const SEED={
  processos:{
    p1:{numero:'PE 75/2026', objeto:'Registro de preços para gêneros alimentícios.', status:'em-andamento', dataLicit:'2026-08-01', horarioAbertura:'09:00', link:'', responsavel:'PEDRO', contato:''},
    p2:{numero:'PE 40/2025', objeto:'Aquisição de material de expediente.', status:'concluido', dataLicit:'2025-05-10', horarioAbertura:'09:00', link:'', responsavel:'LUCILDA', contato:''}
  },
  rankings:{
    p1:{ numero:'PE 75/2026',
      itens:[
        {num:'1', desc:'Arroz branco tipo 1, pacote de 5kg', fornecedores:[
          {nome:'ALIMENTOS BOM PRATO LTDA', valor:'24,90', marca:'TIO JOAO'},
          {nome:'DISTRIBUIDORA SUL LTDA', valor:'26,40', marca:'CAMIL'}]},
        {num:'2', desc:'Feijão preto tipo 1, pacote de 1kg', fornecedores:[
          {nome:'DISTRIBUIDORA SUL LTDA', valor:'8,20', marca:'KICALDO'}]},
        {num:'3', desc:'Arroz parboilizado, pacote de 5kg', fornecedores:[
          {nome:'ALIMENTOS BOM PRATO LTDA', valor:'22,00', marca:'PRATO FINO'},
          {nome:'COMERCIAL NORTE ME', valor:'23,50', marca:'BLUE VILLE'}]},
        {num:'4', desc:'Óleo de soja refinado 900ml', fornecedores:[]}
      ],
      estados:{ '1-0':'aprovado', '3-0':'reprovado' }
    },
    p2:{ numero:'PE 40/2025',
      itens:[
        {num:'7', desc:'Caneta esferográfica azul', fornecedores:[
          {nome:'PAPELARIA CENTRAL LTDA', valor:'1,25', marca:'BIC'}]},
        {num:'8', desc:'Arroz agulhinha 5kg para merenda', fornecedores:[
          {nome:'COMERCIAL NORTE ME', valor:'21,80', marca:'PRATO FINO'}]}
      ],
      estados:{ '7-0':'aprovado', '8-0':'aprovado' }
    }
  }
};

(async()=>{
  const b=await chromium.launch(executablePath?{executablePath}:{});
  const pg=await b.newPage({viewport:{width:1500,height:950}});
  const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
  await pg.route('**/firebasejs/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:r.request().url().includes('firestore')?stub:'/*noop*/'}));
  await pg.route('**/fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await pg.route('**/cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:'window.jspdf={jsPDF:function(){}};'}));
  await pg.addInitScript(()=>localStorage.setItem('copam_auth',JSON.stringify({u:'teste',nome:'QA'})));
  await pg.addInitScript((sd)=>{ window.__SEED=sd; }, SEED);
  await pg.addInitScript((u)=>{ window.__AUTH_SEED=u; }, {uid:'teste-admin', email:'pedrohhpacifico@gmail.com', displayName:'QA', photoURL:''});
  await pg.goto('http://127.0.0.1:8099/index.html',{waitUntil:'networkidle'});
  await pg.waitForTimeout(900);

  console.log('\n1) O painel lateral ficou só com os Próximos Processos');
  const lateral=await pg.evaluate(()=>({
    temBusca:!!document.getElementById('buscaSection'),
    temProximos:!!document.getElementById('proximosSection'),
    proximosVisivel:!!document.querySelector('#proximosSection .section-body')
  }));
  t('a seção de busca saiu do painel lateral', lateral.temBusca===false, lateral);
  t('os Próximos Processos continuam lá', lateral.temProximos && lateral.proximosVisivel, lateral);

  console.log('\n2) Botão de busca na barra da agenda');
  const btn=await pg.evaluate(()=>{
    const bs=[...document.querySelectorAll('.busca-abrir-btn')];
    return {qtd:bs.length, texto:bs.map(x=>x.textContent.trim()), visivel:bs.some(x=>x.offsetParent!==null)};
  });
  t('existe botão de busca (calendário e lista)', btn.qtd===2, btn);
  t('o botão está visível na tela', btn.visivel, btn);
  t('o botão diz "Buscar"', btn.texto.every(x=>/Buscar/.test(x)), btn.texto);

  console.log('\n3) O botão abre o modal, já na aba de Processos');
  const fechadoAntes=await pg.evaluate(()=>document.getElementById('modalBusca').classList.contains('open'));
  t('o modal começa fechado', !fechadoAntes, fechadoAntes);
  await pg.evaluate(()=>abrirBusca());
  await pg.waitForTimeout(200);
  const aberto=await pg.evaluate(()=>({
    aberto:document.getElementById('modalBusca').classList.contains('open'),
    abaProc:document.getElementById('abaProc').classList.contains('ativa'),
    painelProc:document.getElementById('painelBuscaProc').style.display!=='none',
    painelItens:document.getElementById('painelBuscaItens').style.display
  }));
  t('o modal abriu', aberto.aberto, aberto);
  t('abre na aba Processos', aberto.abaProc && aberto.painelProc && aberto.painelItens==='none', aberto);

  console.log('\n4) A busca de processos continua funcionando dentro do modal');
  await pg.fill('#bfObjeto','alimenticios');
  await pg.waitForTimeout(250);
  const proc=await pg.evaluate(()=>({
    qtd:document.querySelectorAll('#buscaResultados .mini-card').length,
    hint:document.getElementById('buscaHint').textContent
  }));
  t('acha o processo pelo objeto (sem acento, como foi digitado)', proc.qtd===1, proc);
  t('mostra quantos achou', /1 processo/.test(proc.hint), proc.hint);

  console.log('\n5) Aba de Itens: "arroz" acha os itens e traz vencedor e valor');
  await pg.evaluate(()=>buscaAba('itens'));
  await pg.waitForTimeout(150);
  await pg.fill('#biTexto','arroz');
  await pg.waitForTimeout(600);
  const itens=await pg.evaluate(()=>{
    const cards=[...document.querySelectorAll('#itensResultados .it-card')];
    return {
      qtd:cards.length,
      hint:document.getElementById('itensHint').textContent,
      textos:cards.map(c=>c.textContent.replace(/\s+/g,' ').trim())
    };
  });
  t('achou os 3 itens de arroz (e não o feijão nem a caneta)', itens.qtd===3, itens);
  t('nenhum resultado é de item que não é arroz', !itens.textos.some(x=>/Feij|Caneta|leo de soja/i.test(x)), itens.textos);

  const arrozBranco=itens.textos.find(x=>/Arroz branco/.test(x));
  /* o número vem no próprio selo .it-num, não no texto colado do cartão */
  const selos=await pg.evaluate(()=>[...document.querySelectorAll('#itensResultados .it-card')]
    .map(c=>({num:(c.querySelector('.it-num')||{}).textContent||'', desc:(c.querySelector('.it-desc')||{}).textContent||''})));
  const seloBranco=selos.find(x=>/Arroz branco/.test(x.desc));
  t('mostra o número do item', seloBranco && seloBranco.num.trim()==='Item 1', selos);
  t('mostra a licitação vinculada', /Pregão 75/.test(arrozBranco||''), arrozBranco);
  t('mostra o vencedor', /ALIMENTOS BOM PRATO/.test(arrozBranco||''), arrozBranco);
  t('mostra o valor vencedor (24,90 — e não o 26,40 do 2º colocado)',
    /R\$ 24,90/.test(arrozBranco||'') && !/26,40/.test(arrozBranco||''), arrozBranco);

  console.log('\n6) Item de outra licitação também aparece (histórico entre anos)');
  const agulhinha=itens.textos.find(x=>/agulhinha/.test(x));
  t('acha o arroz do PE 40/2025', !!agulhinha, itens.textos);
  t('com a licitação e o valor certos', /Pregão 40/.test(agulhinha||'') && /R\$ 21,80/.test(agulhinha||''), agulhinha);

  console.log('\n7) Item ainda sem vencedor não inventa vencedor');
  const parbo=itens.textos.find(x=>/parboilizado/.test(x));
  t('item em julgamento aparece como "Ainda em julgamento"', /Ainda em julgamento/.test(parbo||''), parbo);
  t('mostra quem está na vez, pulando o reprovado (COMERCIAL NORTE, não BOM PRATO)',
    /COMERCIAL NORTE/.test(parbo||'') && !/na vez: ALIMENTOS BOM PRATO/.test(parbo||''), parbo);

  console.log('\n8) Busca dinâmica: erro de digitação e plural ainda acham');
  for(const termo of ['arros','ARROZ','arroz branco']){
    await pg.fill('#biTexto',termo);
    await pg.waitForTimeout(400);
    const n=await pg.evaluate(()=>document.querySelectorAll('#itensResultados .it-card').length);
    t('"'+termo+'" ainda acha item(ns)', n>0, n);
  }

  console.log('\n9) Filtro "só com vencedor"');
  await pg.fill('#biTexto','arroz');
  await pg.waitForTimeout(400);
  await pg.check('#biSoVencedor');
  await pg.waitForTimeout(400);
  const soVenc=await pg.evaluate(()=>{
    const cards=[...document.querySelectorAll('#itensResultados .it-card')];
    return {qtd:cards.length, textos:cards.map(c=>c.textContent.replace(/\s+/g,' ').trim())};
  });
  t('some o item que ainda está em julgamento', soVenc.qtd===2 && !soVenc.textos.some(x=>/julgamento/.test(x)), soVenc);
  await pg.uncheck('#biSoVencedor');
  await pg.waitForTimeout(300);

  console.log('\n10) Termo sem resultado avisa, não fica em branco');
  await pg.fill('#biTexto','bicicleta ergométrica');
  await pg.waitForTimeout(500);
  const vazio=await pg.evaluate(()=>({
    qtd:document.querySelectorAll('#itensResultados .it-card').length,
    hint:document.getElementById('itensHint').textContent
  }));
  t('não mostra resultado nenhum', vazio.qtd===0, vazio);
  t('avisa que não achou', /Nenhum item parecido/.test(vazio.hint), vazio.hint);

  console.log('\n11) Clicar num item abre o processo');
  await pg.fill('#biTexto','arroz');
  await pg.waitForTimeout(450);
  await pg.click('#itensResultados .it-card');
  await pg.waitForTimeout(350);
  const detalhe=await pg.evaluate(()=>({
    buscaFechou:!document.getElementById('modalBusca').classList.contains('open'),
    detalheAberto:document.getElementById('modalDetalhe').classList.contains('open')
  }));
  t('o modal de busca fecha', detalhe.buscaFechou, detalhe);
  t('e o detalhe do processo abre', detalhe.detalheAberto, detalhe);

  console.log('\n12) Esc fecha a busca');
  await pg.evaluate(()=>{ fecharDetalhe(); abrirBusca(); });
  await pg.waitForTimeout(200);
  await pg.keyboard.press('Escape');
  await pg.waitForTimeout(200);
  const esc=await pg.evaluate(()=>document.getElementById('modalBusca').classList.contains('open'));
  t('Esc fecha o modal', !esc, esc);

  console.log('\n13) No celular a busca fica alcançável no topo, sem rolar');
  const cel=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  await cel.route('**/firebasejs/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:r.request().url().includes('firestore')?stub:'/*noop*/'}));
  await cel.route('**/fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await cel.route('**/cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:'window.jspdf={jsPDF:function(){}};'}));
  await cel.addInitScript(()=>localStorage.setItem('copam_auth',JSON.stringify({u:'teste',nome:'QA'})));
  await cel.addInitScript((sd)=>{ window.__SEED=sd; }, SEED);
  await cel.addInitScript((u)=>{ window.__AUTH_SEED=u; }, {uid:'teste-admin', email:'pedrohhpacifico@gmail.com', displayName:'QA', photoURL:''});
  await cel.goto('http://127.0.0.1:8099/index.html',{waitUntil:'networkidle'});
  await cel.waitForTimeout(900);

  const topo=await cel.evaluate(()=>{
    const b=document.querySelector('.busca-topo-btn');
    if(!b) return {existe:false};
    const r=b.getBoundingClientRect();
    return {existe:true, visivel:b.offsetParent!==null, topo:Math.round(r.top),
            dentroDaTela:r.top>=0 && r.bottom<=window.innerHeight, alt:window.innerHeight};
  });
  t('existe botão de busca no topo do celular', topo.existe && topo.visivel, topo);
  t('ele aparece na primeira tela, sem precisar rolar', topo.dentroDaTela, topo);

  await cel.click('.busca-topo-btn');
  await cel.waitForTimeout(300);
  const abriuCel=await cel.evaluate(()=>document.getElementById('modalBusca').classList.contains('open'));
  t('tocar nele abre a busca', abriuCel, abriuCel);

  /* a busca por item precisa funcionar igual no celular */
  await cel.evaluate(()=>buscaAba('itens'));
  await cel.waitForTimeout(200);
  await cel.fill('#biTexto','arroz');
  await cel.waitForTimeout(700);
  const itensCel=await cel.evaluate(()=>({
    n:document.querySelectorAll('#itensResultados .it-card').length,
    modal:(()=>{ const r=document.querySelector('#modalBusca .modal').getBoundingClientRect();
                 return {larg:Math.round(r.width), cabe:r.width<=window.innerWidth}; })()
  }));
  t('a busca por item funciona no celular', itensCel.n>0, itensCel);
  t('o modal cabe na largura do celular', itensCel.modal.cabe, itensCel.modal);
  await cel.close();

  console.log('\n14) No desktop o botão do topo não duplica o da barra');
  const desk=await pg.evaluate(()=>{
    const b=document.querySelector('.busca-topo-btn');
    return {existe:!!b, visivel:b?b.offsetParent!==null:false, display:b?getComputedStyle(b).display:null};
  });
  t('no desktop o botão do topo fica escondido', desk.existe && !desk.visivel && desk.display==='none', desk);

  console.log('\nerros JS:', errs.length?errs:'nenhum');
  console.log(`\n${ok} passaram, ${mau} falharam.`);
  await b.close();
})();
