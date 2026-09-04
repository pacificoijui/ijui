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
    linhas:document.querySelectorAll('.tab tbody tr').length,
    secs:document.getElementById('fSec').options.length,
    anos:document.getElementById('fAno').options.length,
  }));
  t('os 1.264 contratos chegaram na página', est.total===1264, est);
  t('a fonte é o arquivo local (sem Firebase configurado)', est.fonte==='arquivo', est);
  t('o vencimento foi pré-processado em todos', est.comData===1264, est);
  t('a tarja do cabeçalho diz de onde vieram', /1264 CONTRATOS · ARQUIVO LOCAL/.test(est.chip||''), est.chip);
  t('as linhas da tabela foram renderizadas', est.linhas>0 && est.linhas<=100, est);
  t('o select de secretarias foi preenchido', est.secs>5, est);
  t('o select de anos foi preenchido', est.anos>5, est);

  console.log('\n2b) A lista é UMA tabela, no mesmo estilo do licitacon');
  const forma=await pg.evaluate(()=>({
    tabelas: document.querySelectorAll('table').length,
    linhasCabecalho: document.querySelectorAll('.tab thead tr').length,
    cards: document.querySelectorAll('.ccard, .cards').length,
    semStats: !document.querySelector('.stats-bar') && !document.getElementById('statsBar'),
    semDash: !document.getElementById('painelDash') && typeof window.renderDash==='undefined',
    colunas: [...document.querySelectorAll('.tab .th-titulos th')].map(th=>th.textContent.trim()),
    filtrosColuna: [...document.querySelectorAll('.cf')].map(i=>i.dataset.col),
  }));
  console.log('   colunas:', forma.colunas.join(' | '));
  t('existe exatamente 1 tabela', forma.tabelas===1, forma);
  t('o cabeçalho tem 2 linhas: títulos e busca por coluna', forma.linhasCabecalho===2, forma);
  t('não há mais cards', forma.cards===0, forma);
  t('a barra de números saiu', forma.semStats, forma);
  t('o painel dinâmico saiu', forma.semDash, forma);
  t('as 9 colunas são as esperadas',
    forma.colunas.join('|')==='Contrato|Empresa|Objeto|Secretaria|Tipo|Fiscais|Situação|Vencimento|Valor', forma.colunas);
  t('todas as colunas têm busca própria',
    forma.filtrosColuna.join('|')==='num|emp|obj|sec|tipo|fis|sit|venc|valor', forma.filtrosColuna);

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

  console.log('\n3b) Busca por coluna e ordenação no cabeçalho');
  const porEmpresa=await pg.evaluate(()=>{
    limparFiltros();
    document.querySelector('.cf[data-col="emp"]').value='bripav';
    aplicarFiltros();
    return {n:filtrados.length, todas:filtrados.every(c=>c.empresa.toLowerCase().includes('bripav')),
            chips:document.getElementById('chipsAtivos').textContent.trim()};
  });
  t('buscar na coluna Empresa filtra de verdade', porEmpresa.n>0 && porEmpresa.todas, porEmpresa);
  t('o filtro de coluna vira chip', /Empresa: bripav/.test(porEmpresa.chips), porEmpresa.chips);

  const porObjeto=await pg.evaluate(()=>{
    limparFiltros();
    document.querySelector('.cf[data-col="obj"]').value='pavimenta';
    aplicarFiltros();
    return {n:filtrados.length, todas:filtrados.every(c=>c.objeto.toLowerCase().includes('pavimenta'))};
  });
  t('buscar na coluna Objeto só traz o que bate', porObjeto.n>0 && porObjeto.todas, porObjeto);

  const limpou=await pg.evaluate(()=>{
    limparFiltros();
    return {campos:[...document.querySelectorAll('.cf')].every(i=>i.value===''), n:filtrados.length};
  });
  t('limpar filtros esvazia também os campos de coluna', limpou.campos && limpou.n===436, limpou);

  const clique = campo => pg.evaluate(c=>{
    ordenarPor(c);
    const th=document.querySelector('.th-titulos th[data-ord="'+c+'"]');
    return {sort:F.sort, sel:document.getElementById('fSort').value, classe:th.className,
            primeiro:filtrados[0].valor, segundo:filtrados[1].valor,
            emp1:filtrados[0].empresa, emp2:filtrados[1].empresa};
  }, campo);

  const v1=await clique('valor');
  t('1º clique em "Valor" põe o maior primeiro', v1.sort==='valor-desc' && v1.primeiro>=v1.segundo, v1);
  t('a seta ▼ marca a coluna', /ord-desc/.test(v1.classe), v1.classe);
  t('o seletor ORDENAR acompanha', v1.sel==='valor-desc', v1.sel);
  const v2=await clique('valor');
  t('2º clique inverte', v2.sort==='valor-asc' && (v2.primeiro||0)<=(v2.segundo||0), v2);
  t('a seta vira ▲', /ord-asc/.test(v2.classe), v2.classe);
  const e1=await clique('emp');
  t('coluna de texto começa em A–Z', e1.sort==='emp-asc' && e1.emp1.localeCompare(e1.emp2,'pt-BR')<=0, e1);
  const soUma=await pg.evaluate(()=>document.querySelectorAll('.th-titulos th.ord-asc, .th-titulos th.ord-desc').length);
  t('só uma coluna fica marcada por vez', soUma===1, soUma);

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

  console.log('\n5) Os relatórios em PDF continuam funcionando');
  const jspdf=fs.readFileSync('node_modules/jspdf/dist/jspdf.umd.min.js','utf8');
  const pgp=await b.newPage({viewport:{width:1280,height:900}});
  const errsPdf=[]; pgp.on('pageerror',e=>errsPdf.push(e.message));
  await pgp.route('**/cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:jspdf}));
  await pgp.goto('http://127.0.0.1:8099/contratos/index.html',{waitUntil:'networkidle'});
  await pgp.waitForTimeout(800);
  const pdfs=await pgp.evaluate(()=>{
    let salvo=null;
    const O=window.jspdf.jsPDF;
    window.jspdf.jsPDF=function(...a){ const d=new O(...a); d.save=n=>{salvo=n;}; return d; };
    pdfDoFiltro();            const a=salvo; salvo=null;
    abrirDet(1); pdfContratoAtual(); const c=salvo; salvo=null;
    gerarRelatorio('geral','todos');
    window.jspdf.jsPDF=O;
    return {filtro:a, ficha:c, geral:salvo};
  });
  console.log('  ', pdfs);
  t('o "PDF do filtro atual" gera arquivo', /^contratos_filtro_/.test(pdfs.filtro||''), pdfs);
  t('a ficha do contrato em PDF gera arquivo', /^contrato_137-2008/.test(pdfs.ficha||''), pdfs);
  t('o relatório geral gera arquivo', /^contratos_geral_/.test(pdfs.geral||''), pdfs);

  console.log('\n6) No celular a tabela vira blocos e a busca já vem aberta');
  const cel=await b.newPage({viewport:{width:390,height:844}});
  await cel.route('**/cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:'window.jspdf={jsPDF:function(){}};'}));
  await cel.goto('http://127.0.0.1:8099/contratos/index.html',{waitUntil:'networkidle'});
  await cel.waitForTimeout(700);
  const noCel=await cel.evaluate(()=>{
    const tr=document.querySelector('.tab tbody tr');
    const px=c=>parseFloat(getComputedStyle(tr.querySelector('.'+c)).fontSize);
    return {
      escondido: document.getElementById('filtrosBody').classList.contains('hide'),
      colunas: getComputedStyle(document.querySelector('.tab thead')).display,
      linha: getComputedStyle(tr).display,
      fEmp: px('c-emp'), fValor: px('c-valor'), fNum: px('c-num'),
      larguraPagina: document.documentElement.scrollWidth,
      larguraTela: document.documentElement.clientWidth,
    };
  });
  console.log('  ', noCel);
  t('a busca NÃO começa recolhida', !noCel.escondido, noCel);
  t('a tabela vira blocos (não tabela espremida)', noCel.linha==='flex' && noCel.colunas==='none', noCel);
  t('o valor é o número em destaque do bloco', noCel.fValor>noCel.fEmp && noCel.fValor>=18, noCel);
  t('a empresa vem em segundo, acima do resto', noCel.fEmp>noCel.fNum, noCel);
  t('a página não estoura para os lados', noCel.larguraPagina<=noCel.larguraTela, noCel);

  console.log('\nerros JS:', errs.length||errsPdf.length?[...errs,...errsPdf]:'nenhum');
  console.log(`\n${ok} passaram, ${mau} falharam.`);
  await b.close();
})();
