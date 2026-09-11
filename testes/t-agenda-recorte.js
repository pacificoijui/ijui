/* A Agenda mostra UM mês de cada vez — no calendário e na lista — e lia a
   coleção "processos" inteira para desenhá-lo. Ler e esconder é o pior dos
   dois mundos: paga-se o cadastro inteiro a cada F5 e não se vê nada a mais
   por isso, e piora sozinho — cada ano novo encarece todas as aberturas de
   todo mundo.

   Agora ela lê em levas: o futuro (que é o que a Agenda existe para
   mostrar), os processos sem data, e cada mês passado que alguém for ver.
   Este teste confere que o recorte existe de verdade (contando LEITURAS, não
   o que sobra na tela), que navegar traz só o que falta, que voltar a um mês
   já visto não custa nada, e que a busca — que promete o cadastro inteiro —
   abre o recorte. */
const {chromium, executablePath} = require('./navegador');
const fs=require('fs');
const stub=fs.readFileSync('fbstub3.js','utf8');
let ok=0,mau=0;
function t(n,c,e){ if(c){console.log('  ✓',n);ok++;} else {console.log('  ✗',n,e!==undefined?'\n       '+JSON.stringify(e):'');mau++;process.exitCode=1;} }

function iso(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function chaveMes(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }

(async()=>{
  const HOJE=new Date();
  const HOJE_ISO=iso(HOJE);
  const MES_HOJE=chaveMes(HOJE);

  /* Cadastro espalhado por três anos, como o de verdade: quatro processos
     por mês, do início de 2024 até um ano à frente. */
  const SEED={}; let n=1;
  const PROCS=[];
  for(let m=-20; m<=12; m++){
    const d=new Date(HOJE.getFullYear(), HOJE.getMonth()+m, 1);
    for(let k=0;k<4;k++){
      const dia=String(4+k*6).padStart(2,'0');
      const p={numero:'PE '+n+'/'+d.getFullYear(), objeto:'Objeto do processo '+n,
               status:'em-andamento', dataLicit:chaveMes(d)+'-'+dia,
               horarioAbertura:'09:00', link:'', responsavel:'PEDRO', contato:''};
      SEED['p'+n]=p; PROCS.push(p); n++;
    }
  }
  /* Um sem data: o formulário grava "" quando ninguém preenche. */
  SEED['pSemData']={numero:'PE 999/2026', objeto:'Ainda sem data marcada',
    status:'em-andamento', dataLicit:'', horarioAbertura:'', link:'', responsavel:'PEDRO', contato:''};
  const TOTAL=Object.keys(SEED).length;
  const FUTURO=PROCS.filter(p=>p.dataLicit>=HOJE_ISO).length + 1;   /* +1 = o sem data */
  /* "" é menor que qualquer data, então o sem-data cai no passado também. */
  const PASSADO=PROCS.filter(p=>p.dataLicit<HOJE_ISO).length + 1;

  async function abrir(b){
    const pg=await b.newPage({viewport:{width:1300,height:950}});
    await pg.route('**/firebasejs/**',r=>r.fulfill({status:200,contentType:'application/javascript',
      body:r.request().url().includes('firestore')||r.request().url().includes('auth')?stub:'/*noop*/'}));
    await pg.route('**/fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
    await pg.route('**/cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:'window.jspdf={jsPDF:function(){}};'}));
    await pg.addInitScript((sd)=>{ window.__SEED=sd; }, {processos:SEED});
    await pg.addInitScript((u)=>{ window.__AUTH_SEED=u; },
      {uid:'teste-admin', email:'pedrohhpacifico@gmail.com', displayName:'QA', photoURL:''});
    await pg.goto('http://127.0.0.1:8099/index.html',{waitUntil:'networkidle'});
    await pg.waitForTimeout(1100);
    return pg;
  }
  /* Quantos processos do cadastro caem dentro de um mês. */
  function noMes(chave){ return PROCS.filter(p=>p.dataLicit.slice(0,7)===chave).length; }

  const b=await chromium.launch(executablePath?{executablePath}:{});
  const pg=await abrir(b);
  const errs=[]; pg.on('pageerror',e=>errs.push(e.message));

  console.log('1) A abertura lê o futuro e o mês na tela, não a coleção');
  const ab=await pg.evaluate(()=>({
    lidos:(window.__LIDOS||{}).processos||0,
    naTela:(window.processos||[]).length,
    tudo:window.PROC_TUDO,
    levas:Object.keys(window.LEVAS_PROC||{}).sort()
  }));
  t('a abertura não lê a coleção inteira', ab.lidos < TOTAL, {lidos:ab.lidos, cadastro:TOTAL});
  t('mas lê tudo o que está por vir — é para isso que a Agenda existe',
    ab.naTela>=FUTURO, {naTela:ab.naTela, futuroMaisSemData:FUTURO});
  t('o processo sem data marcada não some do sistema',
    await pg.evaluate(()=>(window.processos||[]).some(p=>p.numero==='PE 999/2026')));
  t('a leva "futuro" e a "semData" sobem sozinhas na abertura',
    ab.levas.includes('futuro') && ab.levas.includes('semData'), ab.levas);
  t('e o recorte ainda está de pé (ninguém pediu o cadastro)', ab.tudo===false, ab);

  console.log('\n2) Navegar para trás traz o mês, e só o mês');
  /* A view do computador é o calendário; a grade dele toca até três meses. */
  await pg.evaluate(()=>window.__zerarLidos());
  const antes=new Date(HOJE.getFullYear(), HOJE.getMonth()-1, 1);
  const jaTinha=await pg.evaluate(()=>Object.keys(window.LEVAS_PROC));
  await pg.evaluate(()=>{ aplicarView('month'); mudarMes(-1); });
  await pg.waitForTimeout(600);
  const voltou=await pg.evaluate(()=>({
    lidos:(window.__LIDOS||{}).processos||0,
    titulo:document.getElementById('calTitulo').textContent,
    levasNovas:Object.keys(window.LEVAS_PROC)
  }));
  const novas=voltou.levasNovas.filter(k=>!jaTinha.includes(k));
  t('o calendário foi mesmo para o mês anterior',
    new RegExp(String(antes.getFullYear())).test(voltou.titulo), voltou.titulo);
  t('e leu só os meses que ainda faltavam',
    voltou.lidos===novas.reduce((a,k)=>a+noMes(k.replace('mes:','')),0),
    {lidos:voltou.lidos, levasNovas:novas});
  t('os processos do mês anterior chegaram na tela',
    await pg.evaluate(ch=>(window.processos||[]).some(p=>p.dataLicit.slice(0,7)===ch), chaveMes(antes)),
    chaveMes(antes));

  console.log('\n3) Voltar a um mês já visto não custa leitura');
  await pg.evaluate(()=>window.__zerarLidos());
  await pg.evaluate(()=>{ mudarMes(1); });
  await pg.waitForTimeout(400);
  await pg.evaluate(()=>{ mudarMes(-1); });
  await pg.waitForTimeout(400);
  t('ir e voltar entre meses já abertos é de graça',
    (await pg.evaluate(()=>(window.__LIDOS||{}).processos||0))===0,
    await pg.evaluate(()=>(window.__LIDOS||{}).processos||0));

  console.log('\n3b) Navegar muito não acumula listener sem fim');
  /* Um listener por mês visitado cresce sem teto, e o Firestore corta em 100
     por cliente: quem segura a seta ‹ derruba a página, não só o mês. */
  await pg.evaluate(()=>{ for(let i=0;i<60;i++) mudarMes(-1); });
  await pg.waitForTimeout(900);
  const teto=await pg.evaluate(()=>({
    meses:Object.keys(window._desligarProc).filter(k=>k.startsWith('mes:')).length,
    max:window.MESES_PROC_MAX,
    fixas:Object.keys(window._desligarProc).filter(k=>!k.startsWith('mes:')).sort(),
    celulas:document.querySelectorAll('.cal-cell').length
  }));
  t('o número de meses abertos para no teto', teto.meses<=teto.max, teto);
  t('as levas fixas nunca entram na poda',
    teto.fixas.includes('futuro') && teto.fixas.includes('semData'), teto.fixas);
  t('e o mês que está na tela continua desenhado', teto.celulas>=28, teto);
  t('o mês aberto sobreviveu à poda',
    await pg.evaluate(()=>!!window._desligarProc['mes:'+_chaveMes(calRef)]));
  /* Volta ao mês de hoje para o resto do teste. */
  await pg.evaluate(()=>irHoje());
  await pg.waitForTimeout(600);

  console.log('\n4) A busca promete o cadastro inteiro — então traz o cadastro');
  await pg.evaluate(()=>window.__zerarLidos());
  const tinhaAntes=await pg.evaluate(()=>(window.processos||[]).length);
  await pg.evaluate(()=>abrirBusca());
  await pg.waitForFunction(()=>window.PROC_TUDO && (window.processos||[]).length>0, null, {timeout:20000});
  await pg.waitForTimeout(500);
  const busca=await pg.evaluate(()=>({
    tudo:window.PROC_TUDO, naTela:(window.processos||[]).length,
    lidos:(window.__LIDOS||{}).processos||0
  }));
  t('abrir a busca traz o cadastro inteiro', busca.naTela===TOTAL, {esperado:TOTAL, veio:busca.naTela});
  /* O ponto da leva "passado": ela lê o passado, não a coleção. O futuro já
     está na mão desde a abertura e não é relido — ler de novo o que está na
     tela é pagar duas vezes pela mesma coisa. */
  t('e lê o passado, não a coleção — o futuro não é relido',
    busca.lidos===PASSADO, {lidos:busca.lidos, passado:PASSADO, cadastro:TOTAL, jaTinha:tinhaAntes});
  /* As duas levas cobrem o cadastro inteiro e se encostam num único
     documento: o processo sem data, que casa com "" e também é menor que
     hoje. Um a mais lido é o preço de ele nunca sumir da tela. */
  t('as duas levas cobrem o cadastro, encostando só no processo sem data',
    PASSADO+FUTURO===TOTAL+1, {cadastro:TOTAL, passado:PASSADO, futuro:FUTURO});
  t('o filtro de Ano passa a oferecer todos os anos',
    (await pg.evaluate(()=>[...document.getElementById('bfAno').options].map(o=>o.value)))
      .filter(v=>v!=='todos').length>=3);
  await pg.evaluate(()=>fecharBusca());

  console.log('\n4b) Uma consulta que falha não congela a tela');
  /* As levas só entram juntas — é o que evita a lista piscar pela metade.
     Mas uma leva que ficasse eternamente "a caminho" travaria TODAS, e a
     Agenda pararia de atualizar ao vivo sem dizer nada. */
  const destravou=await pg.evaluate(()=>{
    const antes=(window.processos||[]).length;
    LEVAS_PROC['quebrada']=null;          /* como uma consulta que nunca responde */
    const doc=Object.assign({}, window.__STORE.processos.p1, {objeto:'MUDOU AO VIVO'});
    return firebase.firestore().collection('processos').doc('p1').set(doc)
      .then(()=>new Promise(r=>setTimeout(r,400)))
      .then(()=>{
        const travado=!(window.processos||[]).some(p=>p.objeto==='MUDOU AO VIVO');
        /* agora o que o tratamento de erro faz: entra vazia e solta as outras */
        LEVAS_PROC['quebrada']=[];
        _juntarProcessos();
        return {antes, travado,
                soltou:(window.processos||[]).some(p=>p.objeto==='MUDOU AO VIVO')};
      });
  });
  t('uma leva pendente realmente segura as outras (é o que o erro causaria)',
    destravou.travado, destravou);
  t('e entrar vazia solta a tela de novo', destravou.soltou, destravou);
  t('o tratamento de erro faz exatamente isso, em vez de deixar null',
    /LEVAS_PROC\[nome\]=\[\];/.test(fs.readFileSync('../index.html','utf8')));
  await pg.evaluate(()=>{ delete LEVAS_PROC['quebrada']; });

  console.log('\n5) Quem não tem acesso não dispara leitura nenhuma');
  /* As telas desenham antes de o portão abrir, e é delas que sai o pedido de
     cada mês — sem trava, o pedido sairia com o portão fechado. */
  const pgFora=await b.newPage({viewport:{width:1300,height:950}});
  await pgFora.route('**/firebasejs/**',r=>r.fulfill({status:200,contentType:'application/javascript',
    body:r.request().url().includes('firestore')||r.request().url().includes('auth')?stub:'/*noop*/'}));
  await pgFora.route('**/fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await pgFora.route('**/cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:'window.jspdf={jsPDF:function(){}};'}));
  await pgFora.addInitScript((sd)=>{ window.__SEED=sd; }, {
    processos:SEED,
    usuarios_v2:{'g-fora':{email:'fora@example.com', nome:'Fora', status:'pendente',
                           isAdmin:false, acessos:{agenda:'nenhum'}, provedor:'google.com'}}
  });
  await pgFora.addInitScript((u)=>{ window.__AUTH_SEED=u; },
    {uid:'g-fora', email:'fora@example.com', displayName:'Fora', photoURL:''});
  await pgFora.goto('http://127.0.0.1:8099/index.html',{waitUntil:'networkidle'});
  await pgFora.waitForTimeout(900);
  const fora=await pgFora.evaluate(()=>({
    lidos:(window.__LIDOS||{}).processos||0,
    naTela:(window.processos||[]).length,
    ligou:window._procLigados
  }));
  t('sem acesso confirmado, nenhuma leitura de processo sai', fora.lidos===0, fora);
  t('e nada aparece na tela', fora.naTela===0, fora);
  t('a trava é explícita, não um efeito colateral', fora.ligou===false, fora);

  console.log('\nerros JS:', errs.length?errs:'nenhum');
  t('nenhum erro de JavaScript', errs.length===0, errs);
  await b.close();
  console.log(`\n${ok} passaram, ${mau} falharam.`);
})();
