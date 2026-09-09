/* A Agenda de Contratos (/contratos/agenda/) é o calendário de vencimentos.
   Ela não tem cadastro nenhum: mostra, no dia em que cada contrato vence,
   só "Contrato 74/2022" — e quem clica abre a ficha. Feriados, pontos
   facultativos, aniversários e a observação do dia vêm das MESMAS coleções
   da Agenda de Licitações, para não existirem dois cadastros da mesma coisa.

   Este teste confere que ela abre atrás do mesmo portão do sistema de
   contratos, que o calendário mostra o que deve e nada além, e que o
   caminho de ida e volta entre as duas telas funciona. */
const {chromium, executablePath} = require('./navegador');
const fs=require('fs');
let ok=0,mau=0;
function t(n,c,e){ if(c){console.log('  ✓',n);ok++;} else {console.log('  ✗',n,e!==undefined?'\n       '+JSON.stringify(e):'');mau++;process.exitCode=1;} }

(async()=>{
  const stub=fs.readFileSync('fbstub3.js','utf8');
  const jspdf=fs.readFileSync('node_modules/jspdf/dist/jspdf.umd.min.js','utf8');
  const html=fs.readFileSync('../contratos/agenda/index.html','utf8');

  console.log('1) A página é de leitura — não cadastra nada');
  t('não grava contrato', !/collection\('contratos'\)\.doc\([^)]*\)\.set|batch\(\)/.test(html));
  t('não grava ponto facultativo, aniversário nem observação',
    !/(pontos_facultativos|aniversarios|observacoes)'\)\.(doc|add)/.test(html));
  t('o feriado é o mesmo cálculo da Agenda de Licitações',
    /function _pascoa\(ano\)\{/.test(html) && /Corpus Christi/.test(html));
  t('usa o mesmo projeto e o mesmo cadastro de contas',
    /projectId: "processos-ijui"/.test(html) && /usuarios_v2/.test(html));
  t('e o mesmo painel de permissão dos contratos', /acessos\.contratos/.test(html));

  /* Vencimentos plantados de propósito: um no dia 10, dois no dia 20 (para
     conferir que os dois aparecem), e um num sábado — que na Agenda de
     Licitações nem existe na tela, e aqui não pode sumir. */
  const CONTRATOS=[
    {id:1, contr:74,  ano:2022, empresa:'V. J CENTRO TERAPEUTICO LTDA', objeto:'Serviço X',
     situacao:'ATIVO', vencimento:'2026-10-20', valor:1000, modalidade:'PREGÃO', tipo:'SERVIÇO',
     palavra:'', obs:'', secretarias:['SMS'], fiscalAdm:['Serli'], fiscalTec:[]},
    {id:2, contr:9,   ano:2025, empresa:'EMPRESA DOIS', objeto:'Serviço Y',
     situacao:'ATIVO', vencimento:'2026-10-20', valor:2000, modalidade:'', tipo:'',
     palavra:'', obs:'', secretarias:[], fiscalAdm:[], fiscalTec:[]},
    {id:3, contr:150, ano:2021, empresa:'EMPRESA TRES', objeto:'Serviço Z',
     situacao:'INATIVO', vencimento:'2026-10-10', valor:300, modalidade:'', tipo:'',
     palavra:'', obs:'', secretarias:[], fiscalAdm:[], fiscalTec:[]},
    {id:4, contr:200, ano:2026, empresa:'EMPRESA SABADO', objeto:'Serviço no fim de semana',
     situacao:'ATIVO', vencimento:'2026-10-24', valor:500, modalidade:'', tipo:'',
     palavra:'', obs:'', secretarias:[], fiscalAdm:[], fiscalTec:[]},
    {id:5, contr:1,   ano:2019, empresa:'SEM DATA', objeto:'', situacao:'INATIVO',
     vencimento:null, valor:null, modalidade:'', tipo:'', palavra:'', obs:'',
     secretarias:[], fiscalAdm:[], fiscalTec:[]}
  ];
  const seedContratos={}; CONTRATOS.forEach(c=>{ seedContratos[String(c.id)]=c; });

  function seed(nivel){
    return {
      contratos: seedContratos,
      pontos_facultativos: {pf1:{data:'2026-10-15', nome:'Aniversário da cidade'}},
      aniversarios: {a1:{servidor:'Julieta', dia:22, mes:10}},
      /* A observação do dia é da Agenda de Licitações; aqui não deve aparecer */
      observacoes: {'2026-10-05':{texto:'PE 131 PEDR'}},
      usuarios_v2: {'g-pedro':{email:'pedrohhpacifico@gmail.com', nome:'Pedro', status:'aprovado',
                               isAdmin:false, acessos:{agenda:'nenhum', pregoeiro:'nenhum', contratos:nivel},
                               provedor:'google.com'}}
    };
  }
  async function abrir(pg, nivel, logado){
    await pg.route('**/firebasejs/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:stub}));
    await pg.route('**/cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:jspdf}));
    await pg.route('**/fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
    await pg.addInitScript((sd)=>{ window.__SEED=sd; }, seed(nivel));
    if(logado!==false) await pg.addInitScript((u)=>{ window.__AUTH_SEED=u; },
      {uid:'g-pedro', email:'pedrohhpacifico@gmail.com', displayName:'Pedro', photoURL:''});
    await pg.addInitScript(()=>{
      window.__LOGIN_APARECEU=false;
      setInterval(()=>{ const e=document.getElementById('authEntradaBox');
        if(e && getComputedStyle(e).display!=='none' && e.offsetParent!==null) window.__LOGIN_APARECEU=true; }, 15);
    });
    await pg.goto('http://127.0.0.1:8099/contratos/agenda/index.html',{waitUntil:'networkidle'});
    await pg.waitForTimeout(900);
  }

  const b=await chromium.launch(executablePath?{executablePath}:{});
  const pg=await b.newPage({viewport:{width:1280,height:900}});
  const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
  await abrir(pg, 'ver');
  /* outubro de 2026: onde estão os vencimentos plantados acima */
  await pg.evaluate(()=>{ calRef=new Date(2026,9,1); renderCalendario(); });

  console.log('\n2) O calendário mostra os vencimentos, e só isso');
  const cal=await pg.evaluate(()=>({
    titulo: document.getElementById('calTitulo').textContent,
    eventos: [...document.querySelectorAll('.cal-ev')].map(e=>e.textContent),
    colunas: getComputedStyle(document.querySelector('.cal-grid')).gridTemplateColumns.split(' ').length,
    cabecalhos: [...document.querySelectorAll('.cal-weekdays div')].map(e=>e.textContent)
  }));
  t('abre no mês pedido', /outubro de 2026/.test(cal.titulo), cal.titulo);
  t('o contrato aparece pelo número, sem mais nada',
    cal.eventos.includes('Contrato 74/2022'), cal.eventos);
  t('dois vencimentos no mesmo dia aparecem os dois',
    cal.eventos.filter(e=>/Contrato (74\/2022|9\/2025)/.test(e)).length===2, cal.eventos);
  t('nenhum evento traz empresa, valor ou situação junto',
    cal.eventos.every(e=>/^Contrato \d+\/\d{4}$/.test(e)), cal.eventos);
  t('contrato sem data de vencimento não entra no calendário',
    !cal.eventos.some(e=>/Contrato 1\/2019/.test(e)), cal.eventos);

  console.log('\n3) O fim de semana existe — vencimento cai no dia que cai');
  t('a semana tem sete colunas', cal.colunas===7, cal.colunas);
  t('sábado e domingo estão no cabeçalho',
    cal.cabecalhos.includes('Sábado') && cal.cabecalhos.includes('Domingo'), cal.cabecalhos);
  /* 24/10/2026 é um sábado: na Agenda de Licitações esse dia nem aparece */
  t('contrato que vence no sábado aparece', cal.eventos.includes('Contrato 200/2026'), cal.eventos);

  console.log('\n4) As camadas da Agenda de Licitações, lidas do mesmo lugar');
  const camadas=await pg.evaluate(()=>({
    feriado: [...document.querySelectorAll('.cal-holiday-name')].map(e=>e.textContent),
    aniv: [...document.querySelectorAll('.cal-aniv')].map(e=>e.textContent),
    tudo: document.querySelector('.cal-grid').textContent
  }));
  t('feriado nacional aparece', camadas.feriado.some(f=>/Nossa Senhora|N\. Sra\. Aparecida/i.test(f)), camadas.feriado);
  t('ponto facultativo cadastrado na Agenda aparece aqui',
    camadas.feriado.some(f=>/Aniversário da cidade/.test(f)), camadas.feriado);
  t('aniversário do servidor aparece', camadas.aniv.some(a=>/Julieta/.test(a)), camadas.aniv);
  /* "PE 131 PEDR", "leilão 09:30": recado de licitação, que não diz nada a
     quem está olhando vencimento de contrato. Fica só na Agenda. */
  t('a observação do dia NÃO vem para o calendário de contratos',
    !/PE 131 PEDR/.test(camadas.tudo), camadas.tudo.slice(0,120));
  t('e a página nem lê a coleção de observações', !/collection\('observacoes'\)/.test(html));

  console.log('\n5) Dia cheio: mostra todos, a linha é que cresce');
  /* Antes o dia cortava em seis e oferecia "+4 mais". Quem abre a agenda
     quer justamente saber o que vence naquele dia — e o dia com dez
     contratos é exatamente aquele em que esconder quatro atrapalha. */
  await pg.evaluate(()=>{
    for(let i=0;i<10;i++) CONTRATOS.push(Object.assign({}, CONTRATOS[0],
      {id:100+i, contr:300+i, ano:2016, vencimento:'2026-10-13'}));
    CONTRATOS.forEach(prepararContrato); renderCalendario();
  });
  const cheio=await pg.evaluate(()=>{
    const cel=[...document.querySelectorAll('.cal-cell')]
      .find(c=>c.querySelector('.cal-daynum') && c.querySelector('.cal-daynum').textContent==='13');
    return {eventos: cel.querySelectorAll('.cal-ev').length,
            temMais: /mais/.test(cel.textContent),
            altura: Math.round(cel.getBoundingClientRect().height)};
  });
  t('os dez vencimentos do dia aparecem, todos', cheio.eventos===10, cheio);
  t('sem "+N mais" escondendo nada', !cheio.temMais, cheio);
  t('e a célula cresce para caber', cheio.altura>200, cheio);

  console.log('\n6) Trocar de mês continua ao alcance depois de rolar');
  /* Com um dia de dez vencimentos a grade fica alta; se o cabeçalho do mês
     rolasse junto, trocar de mês obrigaria a voltar ao topo. */
  const grudado=await pg.evaluate(()=>({
    posicao: getComputedStyle(document.querySelector('.cal-head')).position,
    topo: getComputedStyle(document.querySelector('.cal-head')).top,
    diasPosicao: getComputedStyle(document.querySelector('.cal-weekdays')).position
  }));
  t('o mês e as setas ficam grudados no topo', grudado.posicao==='sticky', grudado);
  t('abaixo do cabeçalho do site, pela altura medida', /^\d+(\.\d+)?px$/.test(grudado.topo), grudado);
  t('e os nomes dos dias também', grudado.diasPosicao==='sticky', grudado);
  await pg.evaluate(()=>window.scrollTo(0, 1200));
  await pg.waitForTimeout(200);
  const aposRolar=await pg.evaluate(()=>{
    const r=document.querySelector('.cal-head').getBoundingClientRect();
    return {visivel: r.top>=0 && r.bottom<=window.innerHeight, topo:Math.round(r.top)};
  });
  t('depois de rolar, o controle do mês continua na tela', aposRolar.visivel, aposRolar);
  await pg.evaluate(()=>window.scrollTo(0,0));

  console.log('\n7) Clicar no contrato abre a ficha');
  await pg.click('.cal-ev >> text=Contrato 74/2022');
  await pg.waitForTimeout(300);
  const ficha=await pg.evaluate(()=>({
    aberto: document.getElementById('ovDet').classList.contains('open'),
    titulo: document.getElementById('detTitle').textContent,
    corpo: document.getElementById('detBody').textContent,
    link: document.getElementById('detAbrirNoSistema').getAttribute('href')
  }));
  t('a ficha abre no contrato certo', ficha.aberto && /74\/2022/.test(ficha.titulo), ficha.titulo);
  t('e traz o que a ficha do sistema traz',
    /V\. J CENTRO TERAPEUTICO/.test(ficha.corpo) && /Serli/.test(ficha.corpo)
    && /1\.000,00/.test(ficha.corpo), ficha.corpo.slice(0,160));
  t('o botão leva ao mesmo contrato no sistema', ficha.link==='../?contrato=1', ficha.link);
  /* A ficha em PDF é a mesma do sistema: quem está na agenda não precisa
     atravessar para o outro lado só para imprimir um contrato. */
  const antesPdf=errs.length;
  await pg.evaluate(()=>pdfContratoAtual());
  await pg.waitForTimeout(600);
  t('a ficha em PDF sai daqui mesmo, sem erro', errs.length===antesPdf, errs.slice(antesPdf));
  t('e o botão está no rodapé da ficha', /Ficha em PDF/.test(html));

  console.log('\n8) O portão é o mesmo do sistema de contratos');
  const pgSem=await b.newPage({viewport:{width:1280,height:900}});
  await abrir(pgSem, 'nenhum');
  const semAcesso=await pgSem.evaluate(()=>({
    portaoAberto: getComputedStyle(document.getElementById('authGate')).display!=='none',
    esperando: document.getElementById('authPendenteCard').style.display==='block',
    semDados: typeof CONTRATOS==='undefined' || CONTRATOS.length===0
  }));
  t('sem o painel Contratos a pessoa fica na tela de espera',
    semAcesso.portaoAberto && semAcesso.esperando, semAcesso);
  t('e a agenda não recebe contrato nenhum', semAcesso.semDados, semAcesso);

  const pgFora=await b.newPage({viewport:{width:1280,height:900}});
  await abrir(pgFora, 'ver', false);
  const deslogado=await pgFora.evaluate(()=>({
    portaoAberto: getComputedStyle(document.getElementById('authGate')).display!=='none',
    pedeEntrar: document.getElementById('authEntradaBox').style.display!=='none'
  }));
  t('quem não entrou vê o portão pedindo login',
    deslogado.portaoAberto && deslogado.pedeEntrar, deslogado);
  t('mas quem já entrou não vê o login piscar', !(await pg.evaluate(()=>window.__LOGIN_APARECEU)));

  console.log('\n9) No celular a página não estoura para os lados');
  const pgCel=await b.newPage({viewport:{width:390,height:800}});
  await abrir(pgCel, 'ver');
  await pgCel.evaluate(()=>{ calRef=new Date(2026,9,1); renderCalendario(); });
  const celular=await pgCel.evaluate(()=>({
    largura: document.documentElement.scrollWidth,
    tela: window.innerWidth,
    estouram: [...document.querySelectorAll('*')].filter(el=>{
      const r=el.getBoundingClientRect();
      return r.width>0 && r.right>window.innerWidth+1 && getComputedStyle(el).display!=='none';
    }).map(el=>el.tagName+'.'+(el.className||'').toString().slice(0,30)).slice(0,5)
  }));
  t('a página cabe na largura do celular', celular.largura<=celular.tela+1, celular);
  t('e o calendário continua mostrando os vencimentos',
    (await pgCel.evaluate(()=>document.querySelectorAll('.cal-ev').length))>0);

  console.log('\n10) A ida e a volta entre as duas telas');
  const sistema=fs.readFileSync('../contratos/index.html','utf8');
  t('o sistema de contratos tem o botão Agenda', /id="btnAgenda"[^>]*href="agenda\/"/.test(sistema));
  t('a agenda tem o botão de voltar para o sistema',
    /class="btn-gold btn-voltar" href="\.\.\/"/.test(html) && /Voltar ao sistema de/.test(html));
  t('o sistema abre a ficha quando a agenda manda ?contrato=',
    /function abrirContratoDaURL\(\)/.test(sistema) && /get\('contrato'\)/.test(sistema));

  const regras=fs.readFileSync('../firestore-processos-ijui.rules','utf8');
  t('as regras deixam quem só tem Contratos ler o calendário',
    /function algumCalendario\(\) \{ return algum\(\) \|\| contratos\(\); \}/.test(regras));
  t('mas escrever no calendário continua com quem cuida da Agenda',
    /match \/aniversarios\/\{id\}\s+\{ allow read: if algumCalendario\(\); allow write: if algumEdit\(\); \}/.test(regras));

  console.log('\nerros JS:', errs.length?errs:'nenhum');
  t('nenhum erro de JavaScript', errs.length===0, errs);
  console.log(`\n${ok} passaram, ${mau} falharam.`);
  await b.close();
})();
