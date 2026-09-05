/* Pedido: na Lista da agenda, no celular, o objeto deve sair inteiro (igual
   já foi feito nos Próximos Processos), e a opção Calendário deve sumir —
   no celular só existe Lista, com o botão Buscar no lugar do alternador. */
const {chromium, executablePath} = require('./navegador');
const fs=require('fs');
const stub=fs.readFileSync('fbstub3.js','utf8');
let ok=0,mau=0;
function t(n,c,e){ if(c){console.log('  ✓',n);ok++;} else {console.log('  ✗',n,e!==undefined?'\n       '+JSON.stringify(e):'');mau++;process.exitCode=1;} }

const OBJ_LONGO='Registro de preços para futura e eventual contratação de empresa especializada na prestação de serviços de manutenção preventiva e corretiva de equipamentos hospitalares, com fornecimento de peças, para atender às necessidades da Secretaria Municipal de Saúde do Município de Ijuí/RS.';
function data(d){ const x=new Date(); x.setDate(x.getDate()+d);
  return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0'); }
const SEED={ processos:{
  p1:{numero:'PE 75/2026', objeto:OBJ_LONGO, status:'em-andamento', dataLicit:data(3), horarioAbertura:'09:00', link:'', responsavel:'PEDRO', contato:''},
  p2:{numero:'PE 76/2026', objeto:'Aquisição de material de expediente.', status:'em-andamento', dataLicit:data(4), horarioAbertura:'14:00', link:'', responsavel:'LUCILDA', contato:''}
}};

async function abrir(b, viewport, mobile){
  const pg=await b.newPage({viewport, deviceScaleFactor:2, isMobile:!!mobile, hasTouch:!!mobile});
  await pg.route('**/firebasejs/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:r.request().url().includes('firestore')?stub:'/*noop*/'}));
  await pg.route('**/fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await pg.route('**/cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:'window.jspdf={jsPDF:function(){}};'}));
  await pg.addInitScript(()=>localStorage.setItem('copam_auth',JSON.stringify({u:'teste',nome:'QA'})));
  await pg.addInitScript((sd)=>{ window.__SEED=sd; }, SEED);
  await pg.addInitScript((u)=>{ window.__AUTH_SEED=u; }, {uid:'teste-admin', email:'pedrohhpacifico@gmail.com', displayName:'QA', photoURL:''});
  await pg.goto('http://127.0.0.1:8099/index.html',{waitUntil:'networkidle'});
  await pg.waitForTimeout(900);
  return pg;
}

(async()=>{
  const b=await chromium.launch(executablePath?{executablePath}:{});
  const errs=[];

  console.log('── Celular ──');
  const cel=await abrir(b,{width:390,height:844},true);
  cel.on('pageerror',e=>errs.push('celular: '+e.message));

  const estado=await cel.evaluate(()=>({
    viewAtiva:_viewAtual,
    listaAtiva:document.getElementById('listPanel').classList.contains('active'),
    calAtiva:document.getElementById('calPanel').classList.contains('active')
  }));
  t('no celular a agenda já abre em Lista', estado.viewAtiva==='list' && estado.listaAtiva && !estado.calAtiva, estado);

  const toggle=await cel.evaluate(()=>{
    const vt=document.querySelector('.side-brand .view-toggle');
    return {existe:!!vt, visivel: vt ? vt.offsetParent!==null : false};
  });
  t('o alternador Calendário/Lista sumiu no celular', toggle.existe && !toggle.visivel, toggle);

  const buscaTopo=await cel.evaluate(()=>{
    const b=document.querySelector('.busca-topo-btn');
    return {existe:!!b, visivel:b?b.offsetParent!==null:false};
  });
  t('o botão Buscar continua no lugar dele', buscaTopo.existe && buscaTopo.visivel, buscaTopo);

  const obj=await cel.evaluate((txt)=>{
    const els=[...document.querySelectorAll('.list-card-obj')];
    const el=els.find(e=>e.textContent.trim().startsWith(txt.slice(0,40)));
    if(!el) return null;
    const cs=getComputedStyle(el);
    const clone=el.cloneNode(true);
    clone.style.cssText='position:absolute;visibility:hidden;width:'+el.clientWidth+'px;font:'+cs.font+';line-height:'+cs.lineHeight+';white-space:normal;';
    clone.style.webkitLineClamp='unset'; clone.style.display='block'; clone.style.overflow='visible';
    document.body.appendChild(clone);
    const livre=clone.scrollHeight; clone.remove();
    return {textoCompleto:el.textContent.trim()===txt, mostrada:el.clientHeight, livre, clamp:cs.webkitLineClamp};
  }, OBJ_LONGO);
  t('achou o card na Lista', !!obj, obj);
  t('o objeto longo sai inteiro (sem corte de 2 linhas)',
    obj && obj.textoCompleto && Math.abs(obj.mostrada-obj.livre)<=2, obj);

  const objCurto=await cel.evaluate(()=>{
    const el=[...document.querySelectorAll('.list-card-obj')].find(e=>/material de expediente/.test(e.textContent));
    if(!el) return null;
    const cs=getComputedStyle(el);
    return {linhas:Math.round(el.clientHeight/parseFloat(cs.lineHeight))};
  });
  t('objeto curto continua em 1 linha só', objCurto && objCurto.linhas===1, objCurto);

  /* defesa: se por algum motivo a tela chegasse em modo mês, forçar volta pra lista */
  await cel.evaluate(()=>{ _viewAtual='month'; document.getElementById('calPanel').classList.add('active'); document.getElementById('listPanel').classList.remove('active'); });
  await cel.setViewportSize({width:1200,height:900});
  await cel.waitForTimeout(150);
  await cel.setViewportSize({width:390,height:844});
  await cel.waitForTimeout(150);
  const forcado=await cel.evaluate(()=>({view:_viewAtual, lista:document.getElementById('listPanel').classList.contains('active')}));
  t('se cair em modo mês e a tela voltar a ser de celular, força a Lista de volta', forcado.view==='list'&&forcado.lista, forcado);

  await cel.close();

  console.log('\n── Computador ──');
  const desk=await abrir(b,{width:1500,height:950},false);
  desk.on('pageerror',e=>errs.push('desktop: '+e.message));
  const estadoDesk=await desk.evaluate(()=>_viewAtual);
  t('no desktop continua abrindo em Calendário (padrão de sempre)', estadoDesk==='month', estadoDesk);
  const toggleDesk=await desk.evaluate(()=>{
    const vt=document.querySelector('.side-brand .view-toggle');
    return vt ? vt.offsetParent!==null : false;
  });
  t('o alternador Calendário/Lista continua visível no desktop', toggleDesk, toggleDesk);
  await desk.evaluate(()=>aplicarView('list'));
  await desk.waitForTimeout(200);
  const clampDesk=await desk.evaluate(()=>{
    const el=document.querySelector('.list-card-obj');
    return el ? getComputedStyle(el).webkitLineClamp : null;
  });
  t('no desktop a Lista continua cortando em 2 linhas (não mexi lá)', clampDesk==='2', clampDesk);
  await desk.close();

  console.log('\nerros JS:', errs.length?errs:'nenhum');
  console.log(`\n${ok} passaram, ${mau} falharam.`);
  await b.close();
})();
