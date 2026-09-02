/* O módulo de contratos tinha os 1.264 registros embutidos numa única linha
   de 724 KB dentro do index.html: 850 KB baixados a cada visita, e corrigir
   um contrato era editar o código-fonte.

   Agora a lista vem de dados/contratos.json (ou do Firestore próprio dos
   contratos, quando FIREBASE_CONFIG estiver preenchido). Este teste confere
   que a tela continua fazendo exatamente o que fazia: filtros, painel,
   contagens e a ficha do contrato. */
const {chromium, executablePath} = require('./navegador');
const fs=require('fs');
let ok=0,mau=0;
function t(n,c,e){ if(c){console.log('  ✓',n);ok++;} else {console.log('  ✗',n,e!==undefined?'\n       '+JSON.stringify(e):'');mau++;process.exitCode=1;} }

(async()=>{
  console.log('1) Os dados saíram do HTML e viraram arquivo');
  const html=fs.readFileSync('../contratos/index.html','utf8');
  const json=fs.readFileSync('../contratos/dados/contratos.json','utf8');
  const dados=JSON.parse(json);
  t('o index.html encolheu para menos de 150 KB', html.length<150*1024, {kb:Math.round(html.length/1024)});
  /* A única linha longa que sobra é o brasão em base64, que é imagem e não
     dado — o que não pode voltar é contrato dentro do HTML. */
  t('nenhum contrato ficou embutido no HTML', html.indexOf('"contr":')<0 && html.indexOf('MEDIANEIRA')<0);
  t('a única linha longa que sobrou é o brasão em base64',
    html.split('\n').filter(l=>l.length>5000).every(l=>l.indexOf('data:image/png;base64')>=0),
    html.split('\n').filter(l=>l.length>5000).map(l=>l.slice(0,60)));
  t('o arquivo tem os 1.264 contratos', dados.length===1264, dados.length);
  t('todo contrato tem id numérico', dados.every(c=>typeof c.id==='number'), dados.filter(c=>typeof c.id!=='number').slice(0,3));
  t('os ids não se repetem', new Set(dados.map(c=>c.id)).size===dados.length);
  t('o JSON é uma linha por contrato (diff legível)', json.split('\n').length===dados.length+3, json.split('\n').length);
  t('o config do Firebase começa vazio, e é dos contratos',
    /const FIREBASE_CONFIG = \{\};/.test(html) && /projeto SEPARADO do das licitações/.test(html));
  t('o módulo não fala com o Firestore das licitações',
    html.indexOf('processos-ijui')<0 && html.indexOf('licitacoes')<0);

  const b=await chromium.launch(executablePath?{executablePath}:{});
  const pg=await b.newPage({viewport:{width:1280,height:900}});
  const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
  await pg.route('**/cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:'window.jspdf={jsPDF:function(){}};'}));
  await pg.goto('http://127.0.0.1:8099/contratos/index.html',{waitUntil:'networkidle'});
  await pg.waitForTimeout(600);

  console.log('\n2) A tela carrega a lista de fora e monta tudo');
  const est=await pg.evaluate(()=>({
    total:CONTRATOS.length, fonte:FONTE_DADOS,
    comData:CONTRATOS.filter(c=>c._d!==undefined).length,
    chip:(document.querySelector('.proto-chip')||{}).textContent,
    cards:document.querySelectorAll('#cardsList .card, #cardsList [onclick^="abrirDet"]').length,
    secs:document.getElementById('fSec').options.length,
    anos:document.getElementById('fAno').options.length,
    stats:document.getElementById('statsBar').children.length,
    dash:document.body.innerHTML.indexOf('bar-row')>=0
  }));
  t('os 1.264 contratos chegaram na página', est.total===1264, est);
  t('a fonte é o arquivo local (sem Firebase configurado)', est.fonte==='arquivo', est);
  t('o vencimento foi pré-processado em todos', est.comData===1264, est);
  t('a tarja do cabeçalho diz de onde vieram', /1264 CONTRATOS · ARQUIVO LOCAL/.test(est.chip||''), est.chip);
  t('os cards foram renderizados', est.cards>0, est);
  t('o select de secretarias foi preenchido', est.secs>5, est);
  t('o select de anos foi preenchido', est.anos>5, est);
  t('a barra de estatísticas foi montada', est.stats>0, est);
  t('o painel por secretaria foi montado', est.dash, est);

  console.log('\n3) Os filtros continuam filtrando');
  const ativos=await pg.evaluate(()=>filtrados.length);
  t('o filtro padrão (Ativos) traz os 436 ativos e paralisados', ativos===436, ativos);

  const porTipo=await pg.evaluate(()=>{
    document.getElementById('fTipo').value='OBRA';
    aplicarFiltros();
    return {n:filtrados.length, sóObra:filtrados.every(c=>c.tipo==='OBRA')};
  });
  t('filtrar por tipo OBRA devolve só obras', porTipo.sóObra && porTipo.n>0, porTipo);

  const busca=await pg.evaluate(()=>{
    document.getElementById('fTipo').value='';
    document.getElementById('fBusca').value='PAVIMENTA';
    aplicarFiltros();
    return {n:filtrados.length, bate:filtrados.every(c=>
      (c.objeto+' '+c.empresa+' '+c.palavra+' '+c.modalidade).toLowerCase().indexOf('pavimenta')>=0)};
  });
  t('a busca por texto encontra e só traz o que bate', busca.n>0 && busca.bate, busca);

  const todos=await pg.evaluate(()=>{ limparFiltros(); return filtrados.length; });
  t('limpar os filtros volta para os ativos', todos===436, todos);

  console.log('\n4) A ficha do contrato abre pelo id numérico');
  const ficha=await pg.evaluate(()=>{
    abrirDet(1);
    return {titulo:document.getElementById('detTitle').textContent,
            aberto:document.getElementById('ovDet').classList.contains('open'),
            corpo:document.getElementById('detBody').textContent.slice(0,400)};
  });
  t('o modal abriu', ficha.aberto, ficha);
  t('é o contrato 137/2008', /137\/2008/.test(ficha.titulo), ficha.titulo);
  t('a empresa aparece na ficha', /MEDIANEIRA/.test(ficha.corpo), ficha.corpo.slice(0,120));
  const semId=await pg.evaluate(()=>{ fecharDet(); abrirDet(999999); return document.getElementById('ovDet').classList.contains('open'); });
  t('id inexistente não abre nada nem quebra', semId===false);

  console.log('\nerros JS:', errs.length?errs:'nenhum');
  console.log(`\n${ok} passaram, ${mau} falharam.`);
  await b.close();
})();
