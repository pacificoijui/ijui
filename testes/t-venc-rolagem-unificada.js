/* Pedido: no link de Vencedores pra secretaria (?venc=ID), o cabeçalho, o
   objeto, as estatísticas e a busca ficavam sempre fixos no topo — só a
   lista de itens rolava por baixo deles. No celular isso tomava boa parte
   da tela e sobrava pouco espaço pros itens. Agora o topo rola junto com a
   lista; só o rodapé (valor total + Compartilhar) fica fixo. */
const {chromium, executablePath} = require('./navegador');
const fs=require('fs');
const stub=fs.readFileSync('fbstub3.js','utf8');
let ok=0,mau=0;
function t(n,c,e){ if(c){console.log('  ✓',n);ok++;} else {console.log('  ✗',n,e!==undefined?'\n       '+JSON.stringify(e):'');mau++;process.exitCode=1;} }

/* Itens de sobra pra garantir conteúdo mais alto que a tela e forçar rolagem
   de verdade, não só medir CSS. */
function itensDe(n, prefixo){
  var arr=[];
  for(var i=1;i<=n;i++){
    arr.push({num:String(i), desc:'Item '+i+' — material de escritório diverso, descrição mais longa pra ocupar espaço',
      qtde:10, unidade:'UN', fornecedores:[{nome:prefixo, cnpj:'11.111.111/0001-11', marca:'Marca', modelo:'Modelo', valor:'10,00'}]});
  }
  return arr;
}
var estados={};
itensDe(20,'x').forEach(function(it,i){ estados[it.num+'-0']='aprovado'; });

const SEED={
  processos:{ p1:{numero:'PE 210/2026', objeto:'Registro de preços para material de escritório do exercício de 2026, conforme edital e anexos', status:'concluido', dataLicit:'2026-08-01', horarioAbertura:'09:00', link:'', responsavel:'PEDRO', contato:''} },
  rankings:{ p1:{ numero:'PE 210/2026', itens:itensDe(20,'COMERCIAL ESCRITORIO LTDA'), estados:estados } }
};

(async()=>{
  const b=await chromium.launch(executablePath?{executablePath}:{});
  const pg=await b.newPage({viewport:{width:390,height:700},hasTouch:false});
  const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
  await pg.route('**/firebasejs/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:r.request().url().includes('firestore')?stub:'/*noop*/'}));
  await pg.route('**/fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await pg.route('**/cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:'window.jspdf={jsPDF:function(){}};'}));
  await pg.addInitScript((sd)=>{ window.__SEED=sd; }, SEED);
  await pg.goto('http://127.0.0.1:8099/pregoeiro/index.html?venc=p1',{waitUntil:'networkidle'});
  await pg.waitForTimeout(900);

  console.log('1) Existe um único contêiner de rolagem, com o cabeçalho DENTRO dele');
  const estrutura=await pg.evaluate(()=>{
    var scroll=document.querySelector('.vcs-scroll');
    var header=document.querySelector('.vcs-header');
    var footer=document.getElementById('vcsFooter');
    return {
      temScroll: !!scroll,
      headerDentroDoScroll: !!(scroll && scroll.contains(header)),
      footerForaDoScroll: !!(scroll && footer && !scroll.contains(footer)),
      overflowScroll: scroll?getComputedStyle(scroll).overflowY:null,
      overflowBody: getComputedStyle(document.getElementById('vcsBody')).overflowY
    };
  });
  console.log('  ', estrutura);
  t('existe o wrapper .vcs-scroll', estrutura.temScroll, estrutura);
  t('o cabeçalho está dentro do wrapper que rola', estrutura.headerDentroDoScroll, estrutura);
  t('o rodapé (total + Compartilhar) NÃO está dentro do wrapper que rola', estrutura.footerForaDoScroll, estrutura);
  t('quem tem overflow-y:auto é o wrapper, não mais o #vcsBody sozinho', estrutura.overflowScroll==='auto', estrutura);
  t('#vcsBody não rola mais por conta própria', estrutura.overflowBody!=='auto', estrutura);

  console.log('\n2) Rolar pra baixo tira o cabeçalho da tela (ele rola junto, não fica fixo)');
  const antes=await pg.evaluate(()=>document.querySelector('.vcs-header').getBoundingClientRect().top);
  await pg.evaluate(()=>{ document.querySelector('.vcs-scroll').scrollTop=400; });
  await pg.waitForTimeout(150);
  const depois=await pg.evaluate(()=>({
    scrollTop: document.querySelector('.vcs-scroll').scrollTop,
    headerTop: document.querySelector('.vcs-header').getBoundingClientRect().top
  }));
  console.log('   header antes:', antes, '| depois de rolar 400px:', depois);
  t('a rolagem realmente aconteceu (scrollTop>0)', depois.scrollTop>300, depois);
  t('o cabeçalho saiu de vista rolando pra cima (não ficou fixo no topo)', depois.headerTop<antes-300, {antes:antes, depois:depois});

  console.log('\n3) O rodapé continua visível e fixo depois de rolar');
  const rodape=await pg.evaluate(()=>{
    var r=document.getElementById('vcsFooter').getBoundingClientRect();
    return {bottom:r.bottom, dentroDaTela: r.bottom<=700+1 && r.top>=0};
  });
  console.log('  ', rodape);
  t('o rodapé continua dentro da tela depois de rolar', rodape.dentroDaTela, rodape);

  console.log('\nerros JS:', errs.length?errs:'nenhum');
  console.log(`\n${ok} passaram, ${mau} falharam.`);
  await b.close();
})();
