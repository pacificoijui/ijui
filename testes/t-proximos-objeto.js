/* Nos Próximos Processos o objeto era cortado em 2 linhas (-webkit-line-clamp),
   escondendo justamente o fim da descrição. Agora sai inteiro, no computador e
   no celular. Este teste compara a altura renderizada com a altura natural do
   texto: se estiver cortado, a primeira é menor que a segunda. */
const {chromium, executablePath} = require('./navegador');
const fs=require('fs');
const stub=fs.readFileSync('fbstub3.js','utf8');
let ok=0,mau=0;
function t(n,c,e){ if(c){console.log('  ✓',n);ok++;} else {console.log('  ✗',n,e!==undefined?'\n       '+JSON.stringify(e):'');mau++;process.exitCode=1;} }

/* objeto propositalmente longo, do tamanho dos que aparecem de verdade */
const OBJ_LONGO='Registro de preços para futura e eventual contratação de empresa especializada na prestação de serviços de manutenção preventiva e corretiva de equipamentos hospitalares, com fornecimento de peças, para atender às necessidades da Secretaria Municipal de Saúde do Município de Ijuí/RS.';

function hoje(d){ const x=new Date(); x.setDate(x.getDate()+d);
  return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0'); }

const SEED={ processos:{
  p1:{numero:'PE 75/2026', objeto:OBJ_LONGO, status:'em-andamento', dataLicit:hoje(1), horarioAbertura:'09:00', link:'', responsavel:'PEDRO', contato:''},
  p2:{numero:'PE 76/2026', objeto:'Aquisição de material de expediente.', status:'em-andamento', dataLicit:hoje(2), horarioAbertura:'14:00', link:'', responsavel:'LUCILDA', contato:''}
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

/* mede o bloco do objeto: altura mostrada x altura que o texto ocuparia solto */
async function medir(pg, textoEsperado){
  return await pg.evaluate((txt)=>{
    const els=[...document.querySelectorAll('#proximosLista .up-obj')];
    const el=els.find(e=>e.textContent.trim().startsWith(txt.slice(0,40)));
    if(!el) return null;
    const cs=getComputedStyle(el);
    /* clone solto, mesma largura e fonte, sem limite de linhas */
    const clone=el.cloneNode(true);
    clone.style.cssText='position:absolute;visibility:hidden;width:'+el.clientWidth+'px;'
      +'font:'+cs.font+';line-height:'+cs.lineHeight+';white-space:normal;';
    clone.style.webkitLineClamp='unset'; clone.style.display='block'; clone.style.overflow='visible';
    document.body.appendChild(clone);
    const alturaLivre=clone.scrollHeight;
    clone.remove();
    return {
      textoCompleto: el.textContent.trim()===txt,
      mostrada: el.clientHeight,
      livre: alturaLivre,
      clamp: cs.webkitLineClamp,
      overflow: cs.overflow,
      linhas: Math.round(el.clientHeight/parseFloat(cs.lineHeight))
    };
  }, textoEsperado);
}

(async()=>{
  const b=await chromium.launch(executablePath?{executablePath}:{});
  const errs=[];

  for(const [nome, vp, mob] of [['Computador',{width:1500,height:950},false],['Celular',{width:390,height:844},true]]){
    console.log('\n── '+nome+' ──');
    const pg=await abrir(b, vp, mob);
    pg.on('pageerror',e=>errs.push(nome+': '+e.message));
    const m=await medir(pg, OBJ_LONGO);
    t(nome+': achou o card do processo nos Próximos', !!m, m);
    t(nome+': o texto do objeto está inteiro no HTML', m && m.textoCompleto, m);
    t(nome+': nada de corte em 2 linhas (sem line-clamp ativo)',
      m && (m.clamp==='none'||m.clamp==='unset'||!m.clamp), m && m.clamp);
    t(nome+': o objeto aparece inteiro (altura mostrada = altura do texto solto)',
      m && Math.abs(m.mostrada-m.livre)<=2, m);
    t(nome+': ocupa mais de 2 linhas, como o texto pede', m && m.linhas>2, m);

    /* o objeto curto não pode ter ganhado espaço à toa */
    const curto=await pg.evaluate(()=>{
      const el=[...document.querySelectorAll('#proximosLista .up-obj')].find(e=>/material de expediente/.test(e.textContent));
      if(!el) return null;
      const cs=getComputedStyle(el);
      return {linhas:Math.round(el.clientHeight/parseFloat(cs.lineHeight)), texto:el.textContent.trim()};
    });
    t(nome+': objeto curto continua em 1 linha (não inchou o card)', curto && curto.linhas===1, curto);
    await pg.screenshot({path:'/tmp/prox-'+(mob?'celular':'desktop')+'.png'});
    await pg.close();
  }

  console.log('\nerros JS:', errs.length?errs:'nenhum');
  console.log(`\n${ok} passaram, ${mau} falharam.`);
  await b.close();
})();
