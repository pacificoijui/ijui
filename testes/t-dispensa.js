/* Novo tipo de processo "Dispensa": (1) aparece nos seletores de tipo da
   Agenda, (2) o cadastro grava com prefixo "DE", (3) o preenchimento
   automático a partir de um link do Portal de Compras Públicas detecta
   "Dispensa" (por texto da página e por fallback do prefixo do link) e
   preenche data/horário mesmo quando o rótulo da página não é exatamente
   um dos já conhecidos (fallback genérico), e (4) cadastrar um processo
   dispara automaticamente um e-mail de "Edital Publicado". */
const {chromium, executablePath} = require('./navegador');
const fs=require('fs');
const stub=fs.readFileSync('fbstub3.js','utf8');
let ok=0,mau=0;
function t(n,c,e){ if(c){console.log('  ✓',n);ok++;} else {console.log('  ✗',n,e!==undefined?'\n       '+JSON.stringify(e):'');mau++;process.exitCode=1;} }

const SEED={
  processos:{},
  agentes:{ ag1:{nomeAbrev:'PEDRO', nomeCompleto:'Pedro Henrique Pacifico', nomeCompleto2:''} },
  status:{ s1:{id:'em-andamento',nome:'Em Andamento',cor:'amber',ordem:0} },
  email_config:{
    config:{
      webAppUrl:'https://script.google.com/macros/s/FAKE/exec',
      token:'segredo',
      auto:true, autoPublicacao:true,
      destinatarios:[{nome:'Secretaria de Compras', email:'compras@ijui.rs.gov.br'}]
    }
  }
};

/* A linha do tempo "Datas" como ela aparece numa Dispensa do Portal de Compras
   Públicas: publicação, início das propostas, limite para recebimento e
   abertura. O horário vem em UTC no HTML do servidor (o JS do portal converte
   para Brasília no navegador), por isso os valores aqui são 3h à frente.

   É esta a página do bug: o sistema pegava 03/09 (a data de PUBLICAÇÃO) em vez
   de 10/09, porque procurava o rótulo "Limite p/ Recebimento", com barra, e
   aqui ele está escrito "Limite para Recebimento das Propostas". */
const HTML_DISPENSA_REAL = `
  <div>
    <span>Tipo:</span><span>Dispensa Eletrônica</span>
    <div class="datas">
      <div><p>Data de Publicação</p><p>03/09/2026 às 19:49</p></div>
      <div><p>Início das Propostas</p><p>04/09/2026 às 11:30</p></div>
      <div><p>Limite para
              Recebimento das Propostas</p><p>10/09/2026 às 11:30</p></div>
      <div><p>Início da Disputa</p><p>10/09/2026 às 12:00</p></div>
    </div>
    <span>Agente de Contratação</span><span>PEDRO HENRIQUE</span>
  </div>
  <h1>Aquisição de materiais de limpeza para as escolas municipais</h1>
`;

/* Mesma página, com a data e a hora partidas em pedaços separados e o rótulo
   escrito de outro jeito — o que muda de página para página no portal. */
const HTML_DISPENSA_PARTIDA = `
  <div>
    <span>Tipo:</span><span>Dispensa Eletrônica</span>
    <div><p>Data de Publicação</p><p>01/09/2026</p><p>às</p><p>10:00</p></div>
    <div><p>Acolhimento das Propostas</p><p>20/09/2026</p><p>às</p><p>20:00</p></div>
  </div>
  <h1>Contratação de serviços de manutenção predial</h1>
`;

(async()=>{
  const b=await chromium.launch(executablePath?{executablePath}:{});
  const pg=await b.newPage({viewport:{width:1400,height:950}});
  const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
  await pg.route('**/firebasejs/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:r.request().url().includes('firestore')?stub:'/*noop*/'}));
  await pg.route('**/fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await pg.route('**/cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:'window.jspdf={jsPDF:function(){}};'}));

  /* worker de proxy do portal: devolve o HTML combinado com a variável
     global window.__PORTAL_HTML, setada por página antes de cada chamada */
  await pg.route('**/proud-breeze-5444.pedrohhpacifico.workers.dev/**',async r=>{
    const html=await pg.evaluate(()=>window.__PORTAL_HTML||'');
    r.fulfill({status:200,contentType:'text/html',body:html});
  });

  const chamadasApps=[];
  await pg.route('**/script.google.com/**',async r=>{
    chamadasApps.push(JSON.parse(r.request().postData()));
    r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,enviados:1,falhas:[]})});
  });

  await pg.addInitScript(()=>localStorage.setItem('copam_auth',JSON.stringify({u:'teste',nome:'QA'})));
  await pg.addInitScript((sd)=>{ window.__SEED=sd; }, SEED);
  await pg.goto('http://127.0.0.1:8099/index.html',{waitUntil:'networkidle'});
  await pg.waitForTimeout(900);

  console.log('\n1) "Dispensa" existe como tipo em tipoLicitacao()');
  const tipos=await pg.evaluate(()=>({
    de:tipoLicitacao('DE 459/2026'),
    dispensaLonga:tipoLicitacao('DISPENSA 12/2026'),
    pregaoIntacto:tipoLicitacao('PE 45/2026'),
    concorrIntacta:tipoLicitacao('CC 16/2026')
  }));
  t('"DE NNN/AAAA" é reconhecido como Dispensa', tipos.de==='Dispensa', tipos);
  t('"DISPENSA ..." também é reconhecido', tipos.dispensaLonga==='Dispensa', tipos);
  t('Pregão continua funcionando', tipos.pregaoIntacto==='Pregão', tipos);
  t('Concorrência continua funcionando', tipos.concorrIntacta==='Concorrência', tipos);

  console.log('\n2) Dispensa aparece nos seletores da Agenda');
  const selects=await pg.evaluate(()=>({
    cTipo:[...document.getElementById('cTipo').options].map(o=>o.value),
    bfTipo:[...document.getElementById('bfTipo').options].map(o=>o.value)
  }));
  t('#cTipo (cadastro) tem a opção Dispensa', selects.cTipo.includes('Dispensa'), selects);
  t('#bfTipo (filtro de busca) tem a opção Dispensa', selects.bfTipo.includes('Dispensa'), selects);

  console.log('\n3) Cadastrar como Dispensa grava com prefixo "DE"');
  await pg.evaluate(()=>abrirCadastro());
  await pg.waitForTimeout(150);
  await pg.selectOption('#cTipo','Dispensa');
  await pg.fill('#cNumeroSeq','459/2026');
  await pg.fill('#cObjeto','Aquisição emergencial de materiais de limpeza');
  await pg.fill('#cData','2026-09-15');
  await pg.fill('#cHorario','11:30');
  await pg.click('#btnSalvarCad');
  await pg.waitForTimeout(400);
  const salvo=await pg.evaluate(()=>Object.values(window.__STORE.processos).find(p=>/459/.test(p.numero)));
  t('o processo foi salvo', !!salvo, salvo);
  t('o número usa o prefixo DE (não PE)', !!salvo && /^DE\s*459\/2026$/.test(salvo.numero), salvo&&salvo.numero);
  t('o tipo gravado é Dispensa', !!salvo && salvo.tipo==='Dispensa', salvo&&salvo.tipo);

  console.log('\n4) Cadastrar dispara e-mail automático de "Edital Publicado"');
  await pg.waitForTimeout(300);
  t('chamou o Apps Script exatamente uma vez', chamadasApps.length===1, chamadasApps.length);
  if(chamadasApps.length){
    const req=chamadasApps[0];
    t('assunto menciona "Edital Publicado"', /Edital Publicado/.test(req.assunto), req.assunto);
    t('assunto cita o processo (Dispensa 459/2026)', /Dispensa 459\/2026/.test(req.assunto), req.assunto);
    t('html contém o objeto cadastrado', /Aquisi.{0,3}o emergencial de materiais de limpeza/.test(req.html), req.html.slice(0,200));
    t('html contém a abertura do certame (data)', /15\/09\/2026/.test(req.html), req.html.slice(0,400));
    t('html contém o horário', /11:30/.test(req.html), req.html.slice(0,400));
    t('foi para o destinatário configurado', req.destinatarios.some(d=>d.email==='compras@ijui.rs.gov.br'), req.destinatarios);
  }
  const emailMarcado=await pg.evaluate(()=>Object.values(window.__STORE.processos).find(p=>/459/.test(p.numero)).emailPublicadoEm);
  t('o processo foi marcado com emailPublicadoEm', !!emailMarcado, emailMarcado);

  console.log('\n5) Autofill do link do portal: a data é a da SESSÃO, não a da publicação');
  await pg.evaluate(()=>abrirCadastro());
  await pg.waitForTimeout(150);
  await pg.evaluate((html)=>{ window.__PORTAL_HTML=html; },HTML_DISPENSA_REAL);
  await pg.fill('#cLink','https://www.portaldecompraspublicas.com.br/processos/rs/municipio-de-ijui-poder-executivo-1164/de-460-2026-2026-509198');
  await pg.waitForTimeout(700);
  const auto1=await pg.evaluate(()=>({
    tipo:document.getElementById('cTipo').value,
    numero:document.getElementById('cNumeroSeq').value,
    objeto:document.getElementById('cObjeto').value,
    data:document.getElementById('cData').value,
    horario:document.getElementById('cHorario').value,
    status:document.getElementById('portalStatus').textContent
  }));
  t('detecta o tipo Dispensa pelo texto "Tipo:" da página', auto1.tipo==='Dispensa', auto1);
  t('preenche o número a partir do link (460/2026)', auto1.numero==='460/2026', auto1);
  t('pega o "Limite para Recebimento das Propostas" (10/09)', auto1.data==='2026-09-10', auto1);
  t('NÃO pega a data de publicação (03/09), que era o bug', auto1.data!=='2026-09-03', auto1);
  t('o horário vem do mesmo campo, convertido para Brasília (11:30 UTC → 08:30)', auto1.horario==='08:30', auto1);
  t('avisa que preencheu com sucesso', /preenchidos automaticamente/.test(auto1.status), auto1.status);

  console.log('\n6) Autofill detecta Dispensa mesmo só pelo prefixo do link (sem "Tipo:" na página)');
  await pg.evaluate(()=>abrirCadastro());
  await pg.waitForTimeout(150);
  await pg.evaluate(()=>{ window.__PORTAL_HTML='<h1>Objeto qualquer sem rótulo de Tipo</h1>'; });
  await pg.fill('#cLink','https://www.portaldecompraspublicas.com.br/processos/rs/municipio-de-ijui-poder-executivo-1164/de-461-2026-2026-509199');
  await pg.waitForTimeout(700);
  const auto2=await pg.evaluate(()=>document.getElementById('cTipo').value);
  t('fallback pelo prefixo "DE-" do link também marca Dispensa', auto2==='Dispensa', auto2);

  console.log('\n7) Data e hora partidas em pedaços, e outro rótulo de sessão');
  await pg.evaluate(()=>abrirCadastro());
  await pg.waitForTimeout(150);
  await pg.evaluate((html)=>{ window.__PORTAL_HTML=html; },HTML_DISPENSA_PARTIDA);
  await pg.fill('#cLink','https://www.portaldecompraspublicas.com.br/processos/rs/municipio-de-ijui-poder-executivo-1164/de-462-2026-2026-509200');
  await pg.waitForTimeout(700);
  const auto3=await pg.evaluate(()=>({
    data:document.getElementById('cData').value,
    horario:document.getElementById('cHorario').value
  }));
  t('acha a data mesmo com "às" e a hora em pedaços separados', auto3.data==='2026-09-20', auto3);
  t('e o horário do mesmo campo (20:00 UTC → 17:00)', auto3.horario==='17:00', auto3);
  t('continua ignorando a data de publicação (01/09)', auto3.data!=='2026-09-01', auto3);

  console.log('\n8) Pregão continua sendo detectado normalmente (sem regressão)');
  await pg.evaluate(()=>abrirCadastro());
  await pg.waitForTimeout(150);
  /* Pregão escreve o rótulo com barra ("p/"); a página de dispensa escreve
     "para". Os dois têm de cair no mesmo lugar, e nenhum na publicação. */
  await pg.evaluate(()=>{ window.__PORTAL_HTML=`
    <div>
      <span>Tipo:</span><span>Pregão Eletrônico</span>
      <span>Data de Publicação</span><span>02/10/2026 às 15:00</span>
      <span>Limite p/ Recebimento das Propostas</span><span>10/10/2026 12:00</span>
    </div>
    <h1>Registro de preços para combustíveis</h1>`; });
  await pg.fill('#cLink','https://www.portaldecompraspublicas.com.br/processos/rs/municipio-de-ijui-poder-executivo-1164/pe-88-2026-2026-509201');
  await pg.waitForTimeout(700);
  const auto4=await pg.evaluate(()=>({
    tipo:document.getElementById('cTipo').value,
    data:document.getElementById('cData').value,
    horario:document.getElementById('cHorario').value
  }));
  t('Pregão ainda é detectado', auto4.tipo==='Pregão', auto4);
  t('data do Pregão ainda preenche certo', auto4.data==='2026-10-10', auto4);
  t('horário do Pregão ainda converte certo (12:00 UTC → 09:00)', auto4.horario==='09:00', auto4);

  console.log('\nerros JS:', errs.length?errs:'nenhum');
  console.log(`\n${ok} passaram, ${mau} falharam.`);
  await b.close();
})();
