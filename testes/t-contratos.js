/* O módulo de contratos tinha os 1.264 registros embutidos numa única linha
   de 724 KB dentro do index.html: 850 KB baixados a cada visita, e corrigir
   um contrato era editar o código-fonte.

   Agora a lista vem do Firestore (coleção "contratos" do mesmo projeto das
   licitações, atrás do portão de acesso) e, só enquanto não houver Firebase
   configurado, de dados/contratos.json. Este teste confere que a tela
   continua fazendo exatamente o que fazia — filtros, painel, contagens e a
   ficha do contrato — e que o portão faz o seu papel: sem acesso não entra,
   com "Visualizar" entra mas não grava, e o que uma pessoa salva aparece na
   tela da outra sem recarregar. */
const {chromium, executablePath} = require('./navegador');
const fs=require('fs');
let ok=0,mau=0;
function t(n,c,e){ if(c){console.log('  ✓',n);ok++;} else {console.log('  ✗',n,e!==undefined?'\n       '+JSON.stringify(e):'');mau++;process.exitCode=1;} }

(async()=>{
  console.log('1) Os dados saíram do HTML e viraram arquivo');
  const html=fs.readFileSync('../contratos/index.html','utf8');
  const json=fs.readFileSync('../contratos/dados/contratos.json','utf8');
  const dados=JSON.parse(json);
  /* Quantos são muda a cada planilha nova que o setor manda — o teste
     confere que TODOS chegam na tela, não um número decorado. */
  const N=dados.length, PROXIMO_ID=Math.max(...dados.map(c=>c.id))+1;
  t('o index.html continua pequeno (sem contrato embutido)', html.length<180*1024, {kb:Math.round(html.length/1024)});
  /* A única linha longa que sobra é o brasão em base64, que é imagem e não
     dado — o que não pode voltar é contrato dentro do HTML. */
  t('nenhum contrato ficou embutido no HTML', html.indexOf('"contr":')<0 && html.indexOf('MEDIANEIRA')<0);
  t('a única linha longa que sobrou é o brasão em base64',
    html.split('\n').filter(l=>l.length>5000).every(l=>l.indexOf('data:image/png;base64')>=0),
    html.split('\n').filter(l=>l.length>5000).map(l=>l.slice(0,60)));
  t('o arquivo tem contrato pra valer (mais de mil)', N>1000, N);
  t('todo contrato tem id numérico', dados.every(c=>typeof c.id==='number'), dados.filter(c=>typeof c.id!=='number').slice(0,3));
  t('os ids não se repetem', new Set(dados.map(c=>c.id)).size===dados.length);
  t('o JSON é uma linha por contrato (diff legível)', json.split('\n').length===dados.length+3, json.split('\n').length);
  t('o config aponta para o mesmo projeto do resto do sistema',
    /projectId: "processos-ijui"/.test(html) && /usuarios_v2/.test(html));
  t('a leitura não cai no arquivo quando o Firebase está ligado (isso furaria a proteção)',
    /o fallback só existe enquanto não/.test(html));

  /* Daqui pra frente a tela roda como em produção: Firestore e Firebase Auth
     falsos (fbstub3.js), a coleção "contratos" semeada com o mesmo arquivo
     versionado, e uma conta já logada com o painel Contratos liberado. */
  const stub=fs.readFileSync('fbstub3.js','utf8');
  const contratosSeed={}; dados.forEach(c => { contratosSeed[String(c.id)]=c; });
  function seedCom(nivel){
    return {
      contratos: contratosSeed,
      usuarios_v2: {'g-pedro':{email:'pedrohhpacifico@gmail.com', nome:'Pedro', status:'aprovado',
                               isAdmin:false, acessos:{agenda:'nenhum', pregoeiro:'nenhum', contratos:nivel},
                               provedor:'google.com'}}
    };
  }
  async function abrirContratos(pg, nivel, corpoJspdf){
    await pg.route('**/firebasejs/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:stub}));
    await pg.route('**/cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:corpoJspdf||'window.jspdf={jsPDF:function(){}};'}));
    await pg.route('**/fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
    await pg.addInitScript((sd)=>{ window.__SEED=sd; }, seedCom(nivel));
    await pg.addInitScript((u)=>{ window.__AUTH_SEED=u; }, {uid:'g-pedro', email:'pedrohhpacifico@gmail.com', displayName:'Pedro', photoURL:''});
    await pg.goto('http://127.0.0.1:8099/contratos/index.html',{waitUntil:'networkidle'});
    await pg.waitForTimeout(900);
  }

  const b=await chromium.launch(executablePath?{executablePath}:{});
  const pg=await b.newPage({viewport:{width:1280,height:900}});
  const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
  await abrirContratos(pg, 'editar');

  console.log('\n2) A tela carrega a lista de fora e monta tudo');
  const est=await pg.evaluate(()=>({
    total:CONTRATOS.length, fonte:FONTE_DADOS,
    comData:CONTRATOS.filter(c=>c._d!==undefined).length,
    chip:(document.querySelector('.proto-chip')||{}).textContent,
    linhas:document.querySelectorAll('.tab tbody tr').length,
  }));
  t('todos os contratos do arquivo chegaram na página', est.total===N, {esperado:N, veio:est.total});
  t('a fonte é o Firestore, ao vivo', est.fonte==='firestore', est);
  t('o vencimento foi pré-processado em todos', est.comData===N, est);
  t('a tarja do cabeçalho diz de onde vieram', new RegExp(N+' CONTRATOS · DADOS AO VIVO').test(est.chip||''), est.chip);
  t('as linhas da tabela foram renderizadas', est.linhas>0 && est.linhas<=100, est);

  console.log('\n2b) Uma busca só em cima; os filtros moram dentro da tabela');
  const forma=await pg.evaluate(()=>({
    tabelas: document.querySelectorAll('table').length,
    linhasCabecalho: document.querySelectorAll('.tab thead tr').length,
    cards: document.querySelectorAll('.ccard, .cards').length,
    semStats: !document.querySelector('.stats-bar') && !document.getElementById('statsBar'),
    semDash: !document.getElementById('painelDash') && typeof window.renderDash==='undefined',
    colunas: [...document.querySelectorAll('.tab .th-titulos th')].map(th=>th.textContent.trim()),
    filtrosColuna: [...document.querySelectorAll('.cf')].map(i=>i.dataset.col),
    /* o painel de filtros de cima deixou de existir */
    semPainel: !document.querySelector('.panel') && !document.getElementById('filtrosBody'),
    camposSoltos: ['fSec','fFiscal','fTipo','fAno','fVenc','fPalavra'].filter(id=>document.getElementById(id)),
    buscas: document.querySelectorAll('.busca-box input').length,
    ph: document.getElementById('fBusca').placeholder,
  }));
  console.log('   colunas:', forma.colunas.join(' | '));
  t('existe exatamente 1 tabela', forma.tabelas===1, forma);
  t('o cabeçalho tem 2 linhas: títulos e filtro por coluna', forma.linhasCabecalho===2, forma);
  t('não há mais cards', forma.cards===0, forma);
  t('a barra de números saiu', forma.semStats, forma);
  t('o painel dinâmico saiu', forma.semDash, forma);
  t('o painel de filtros de cima saiu', forma.semPainel, forma);
  t('os campos soltos de filtro sumiram junto', forma.camposSoltos.length===0, forma.camposSoltos);
  t('sobrou UMA barra de busca', forma.buscas===1, forma);
  t('ela diz que procura em tudo', /Pesquisar em tudo/.test(forma.ph), forma.ph);
  t('as 9 colunas são as esperadas',
    forma.colunas.join('|')==='Contrato|Empresa|Objeto|Secretaria|Tipo|Fiscais|Situação|Vencimento|Valor', forma.colunas);

  /* A leitura da lista é o que mais se faz aqui: letra preta e o Objeto com
     espaço, que é o texto que realmente precisa ser lido. */
  const leitura=await pg.evaluate(()=>{
    const tr=document.querySelector('.tab tbody tr');
    const cor=c=>getComputedStyle(tr.querySelector('.'+c)).color;
    const larg=c=>tr.querySelector('.'+c).getBoundingClientRect().width;
    const outras=['c-num','c-emp','c-sec','c-tipo','c-fis','c-sit','c-venc','c-valor'].map(larg);
    return {cores:['c-num','c-emp','c-obj','c-sec','c-tipo','c-fis','c-valor'].map(cor),
            corSelo:getComputedStyle(tr.querySelector('.badge')).color,
            objeto:larg('c-obj'), empresa:larg('c-emp'), maiorOutra:Math.max(...outras),
            alturaLinha:tr.getBoundingClientRect().height,
            padding:getComputedStyle(tr.querySelector('.c-obj')).padding};
  });
  t('o texto da tabela é preto', leitura.cores.every(c=>c==='rgb(0, 0, 0)'), leitura.cores);
  t('os selos seguem coloridos (neles a cor é a informação)',
    leitura.corSelo!=='rgb(0, 0, 0)', leitura.corSelo);
  /* O Vencimento é a segunda mais larga e não encolhe (o selo é uma linha só,
     "VENCIDO há 3399d · 16/05/2017"); o que dá para exigir é que o Objeto
     passe dela e sobre o dobro da Empresa. */
  t('o Objeto é a coluna mais larga, com o dobro da Empresa',
    leitura.objeto>leitura.maiorOutra && leitura.objeto>leitura.empresa*2, leitura);
  t('as linhas estão compactas (pouco respiro por célula)',
    leitura.padding==='5px 6px', leitura.padding);
  t('todas as colunas têm o próprio menu de filtro',
    forma.filtrosColuna.join('|')==='num|emp|obj|sec|tipo|fis|sit|venc|valor', forma.filtrosColuna);

  console.log('\n3) Ao abrir, mostra o que precisa de atenção agora: ativo, vencendo em 30 dias, mais próximo primeiro');
  const padraoAbertura=await pg.evaluate(()=>{
    const esperado=CONTRATOS.filter(c=>c.situacao==='ATIVO' && c._d!==null && c._d>=0 && c._d<=30);
    const vencimentosNaTela=filtrados.map(c=>c.vencimento);
    const ordenado=vencimentosNaTela.every((v,i)=>i===0||v>=vencimentosNaTela[i-1]);
    return {
      n:filtrados.length, esperado:esperado.length,
      todosAtivos:filtrados.every(c=>c.situacao==='ATIVO'),
      todosDentroDe30d:filtrados.every(c=>c._d!==null && c._d>=0 && c._d<=30),
      ordenadoPorVencimento:ordenado,
      chips:document.getElementById('chipsAtivos').textContent.trim(),
      sort:F.sort
    };
  });
  t('mostra exatamente os contratos ativos vencendo em até 30 dias',
    padraoAbertura.n===padraoAbertura.esperado && padraoAbertura.todosAtivos && padraoAbertura.todosDentroDe30d, padraoAbertura);
  t('do vencimento mais próximo pro mais distante', padraoAbertura.sort==='venc-asc' && padraoAbertura.ordenadoPorVencimento, padraoAbertura);
  t('e os dois filtros aparecem como chip, pra ficar claro que a tela não está mostrando tudo',
    /Situação: ATIVO/.test(padraoAbertura.chips) && /Prazo: Vence em até 30 dias/.test(padraoAbertura.chips), padraoAbertura.chips);
  const N_PADRAO = padraoAbertura.esperado;   /* quantos contratos o padrão de abertura traz hoje */

  console.log('\n4) A busca única procura em qualquer informação (sem os filtros do padrão de abertura atrapalhando)');
  const ativos=await pg.evaluate(()=>{ limparColuna('sit'); limparColuna('venc'); return filtrados.length; });
  t('sem filtro de situação nem de prazo, mostra todos os contratos', ativos===N, {esperado:N, veio:ativos});

  const buscar = termo => pg.evaluate(async q=>{
    document.getElementById('fBusca').value=q;
    aplicarFiltros();
    return {n:filtrados.length, achou:filtrados[0]};
  }, termo);

  const bEmpresa=await buscar('bripav');
  t('acha pela empresa', bEmpresa.n>0 && /BRIPAV/i.test(bEmpresa.achou.empresa), bEmpresa.n);
  const bObjeto=await buscar('pavimentacao');
  t('acha pelo objeto mesmo digitando sem acento', bObjeto.n>0, bObjeto.n);
  const bAcento=await buscar('pavimentação');
  t('com acento dá o mesmo resultado', bAcento.n===bObjeto.n, [bAcento.n, bObjeto.n]);
  const bData=await buscar('16/05/2017');
  t('acha pela data de vencimento', bData.n>0 && bData.achou.vencimento==='2017-05-16', bData.n);
  const bValor=await buscar('86.069.210');
  t('acha pelo valor', bValor.n>0 && bValor.achou.valor===86069210.4, bValor.n);
  const bDuas=await buscar('pavimenta bripav');
  t('duas palavras exigem as duas', bDuas.n>0 && bDuas.n<bObjeto.n, {duas:bDuas.n, uma:bObjeto.n});
  const bNada=await buscar('bicicleta ergométrica');
  t('termo sem resultado não quebra a tela', bNada.n===0, bNada.n);

  const todos=await pg.evaluate(()=>{ limparFiltros(); return {n:filtrados.length, busca:document.getElementById('fBusca').value}; });
  t('limpar os filtros zera a busca e volta ao padrão de abertura', todos.n===N_PADRAO && todos.busca==='', {todos, N_PADRAO});

  console.log('\n3b) Menu da coluna: as opções para marcar, como numa planilha');
  const abrir = col => pg.evaluate(c=>{
    document.querySelector('.cf[data-col="'+c+'"]').click();
    return {
      aberto: document.getElementById('popFiltro').classList.contains('open'),
      titulo: document.getElementById('popTit').textContent,
      grupos: [...document.querySelectorAll('#popLista .pop-grupo')].map(g=>g.textContent),
      opcoes: [...document.querySelectorAll('#popLista .pop-op:not(.todos) .op-txt')].map(o=>o.textContent),
      contagens: [...document.querySelectorAll('#popLista .pop-op:not(.todos) .op-n')].map(o=>+o.textContent),
    };
  }, col);

  const mTipo=await abrir('tipo');
  t('o menu da coluna abre com as opções dela', mTipo.aberto && mTipo.opcoes.length>3, mTipo);
  t('as opções são os tipos que existem', mTipo.opcoes.includes('OBRA') && mTipo.opcoes.includes('SERVIÇO'), mTipo.opcoes);
  t('cada opção mostra quantos contratos traz', mTipo.contagens.every(n=>n>0), mTipo.contagens);
  t('a soma das contagens fecha com a tela',
    mTipo.contagens.reduce((a,x)=>a+x,0)===N_PADRAO, {contagens:mTipo.contagens, N_PADRAO});

  const marcar = (col, valor) => pg.evaluate(([c,v])=>{
    document.querySelector('.cf[data-col="'+c+'"]').click();          /* garante aberto */
    if(!document.getElementById('popFiltro').classList.contains('open')) document.querySelector('.cf[data-col="'+c+'"]').click();
    const alvo=[...document.querySelectorAll('#popLista .pop-op:not(.todos)')].find(o=>o.querySelector('.op-txt').textContent===v);
    alvo.querySelector('input').click();
    return {n:filtrados.length, botao:document.querySelector('.cf[data-col="'+c+'"] .cf-txt').textContent,
            aceso:document.querySelector('.cf[data-col="'+c+'"]').classList.contains('ativo'),
            chips:document.getElementById('chipsAtivos').textContent.trim()};
  }, [col, valor]);

  await pg.evaluate(()=>{ fecharPop(); limparFiltros(); limparColuna('sit'); limparColuna('venc'); });
  const soObra=await marcar('tipo','OBRA');
  const conferObra=await pg.evaluate(()=>filtrados.every(c=>c.tipo==='OBRA'));
  t('marcar OBRA deixa só as obras', soObra.n>0 && conferObra, soObra);
  t('o botão da coluna passa a mostrar a escolha', soObra.botao==='OBRA' && soObra.aceso, soObra);
  t('a escolha vira chip', /Tipo: OBRA/.test(soObra.chips), soObra.chips);

  const duasSecs=await pg.evaluate(()=>{
    fecharPop(); limparFiltros(); limparColuna('sit'); limparColuna('venc');
    document.querySelector('.cf[data-col="sec"]').click();
    ['SMMA','SMED'].forEach(s=>{
      [...document.querySelectorAll('#popLista .pop-op:not(.todos)')]
        .find(o=>o.querySelector('.op-txt').textContent===s).querySelector('input').click();
    });
    return {n:filtrados.length, botao:document.querySelector('.cf[data-col="sec"] .cf-txt').textContent,
            todas:filtrados.every(c=>c.secretarias.includes('SMMA')||c.secretarias.includes('SMED'))};
  });
  t('dá para marcar mais de uma opção (SMMA ou SMED)', duasSecs.n>0 && duasSecs.todas, duasSecs);
  t('o botão resume quantas foram marcadas', duasSecs.botao==='2 opções', duasSecs.botao);

  const digitado=await pg.evaluate(()=>{
    fecharPop(); limparFiltros(); limparColuna('sit'); limparColuna('venc');
    document.querySelector('.cf[data-col="obj"]').click();
    document.getElementById('popBusca').value='pavimenta';
    popDigitou();
    return {n:filtrados.length, todas:filtrados.every(c=>c.objeto.toLowerCase().includes('pavimenta')),
            chips:document.getElementById('chipsAtivos').textContent.trim()};
  });
  t('digitar no menu da coluna filtra por aquela coluna', digitado.n>0 && digitado.todas, digitado);
  t('o texto digitado também vira chip', /Objeto: pavimenta/.test(digitado.chips), digitado.chips);

  const faixa=await pg.evaluate(()=>{
    fecharPop(); limparFiltros(); limparColuna('sit'); limparColuna('venc');
    document.querySelector('.cf[data-col="valor"]').click();
    [...document.querySelectorAll('#popLista .pop-op:not(.todos)')]
      .find(o=>/Acima de R\$ 5/.test(o.querySelector('.op-txt').textContent)).querySelector('input').click();
    return {n:filtrados.length, todas:filtrados.every(c=>c.valor>5e6)};
  });
  t('Valor filtra por faixa, não por texto', faixa.n>0 && faixa.todas, faixa);

  const prazo=await pg.evaluate(()=>{
    fecharPop(); limparFiltros(); limparColuna('sit'); limparColuna('venc');
    document.querySelector('.cf[data-col="venc"]').click();
    [...document.querySelectorAll('#popLista .pop-op:not(.todos)')]
      .find(o=>o.querySelector('.op-txt').textContent==='Vencidos').querySelector('input').click();
    return {n:filtrados.length, todos:filtrados.every(c=>c._d!==null && c._d<0),
            grupos:[...document.querySelectorAll('#popLista .pop-grupo')].map(g=>g.textContent)};
  });
  t('Vencimento filtra por prazo', prazo.n>0 && prazo.todos, prazo);
  t('e ainda oferece o ano do vencimento em outro grupo',
    prazo.grupos.join('|')==='Prazo|Ano do vencimento', prazo.grupos);

  console.log('\n3d) Fiscal Administrativo e Fiscal Técnico são grupos separados no mesmo menu');
  /* pega a opção pelo NOME dentro de um grupo específico — os dois grupos
     podem ter a mesma pessoa (ex.: alguém que já foi fiscal dos dois tipos),
     então procurar em todas as opções sem saber o grupo pegaria a errada */
  const marcarNoGrupo = (indiceGrupo, nome) => pg.evaluate(([i,n])=>{
    const grupos=[...document.querySelectorAll('#popLista .pop-grupo')];
    let el=grupos[i].nextElementSibling; const ops=[];
    while(el && !el.classList.contains('pop-grupo')){ if(el.classList.contains('pop-op') && !el.classList.contains('todos')) ops.push(el); el=el.nextElementSibling; }
    const alvo=ops.find(o=>o.querySelector('.op-txt').textContent===n);
    if(!alvo) return {achou:false, opcoes:ops.map(o=>o.querySelector('.op-txt').textContent)};
    alvo.querySelector('input').click();
    return {achou:true, n:filtrados.length, botao:document.querySelector('.cf[data-col="fis"] .cf-txt').textContent};
  }, [indiceGrupo, nome]);

  const menuFiscal=await pg.evaluate(()=>{
    fecharPop(); limparFiltros(); limparColuna('sit'); limparColuna('venc');
    document.querySelector('.cf[data-col="fis"]').click();
    return {titulo:document.getElementById('popTit').textContent,
            grupos:[...document.querySelectorAll('#popLista .pop-grupo')].map(g=>g.textContent)};
  });
  t('o menu continua único ("Fiscais"), com dois grupos dentro', menuFiscal.titulo==='Fiscais', menuFiscal.titulo);
  t('um grupo para Fiscal Administrativo e outro para Fiscal Técnico',
    menuFiscal.grupos.join('|')==='Fiscal Administrativo|Fiscal Técnico', menuFiscal.grupos);

  const soAdm=await marcarNoGrupo(0,'Erlon');
  const confereAdm=await pg.evaluate(()=>filtrados.every(c=>c.fiscalAdm.includes('Erlon')));
  t('marcar "Erlon" no grupo Administrativo filtra só quem tem ele como fiscal ADMINISTRATIVO',
    soAdm.achou && soAdm.n>0 && confereAdm, {soAdm, confereAdm});
  t('não filtra por quem tem "Erlon" só como fiscal técnico',
    !(await pg.evaluate(()=>filtrados.some(c=>!c.fiscalAdm.includes('Erlon') && c.fiscalTec.includes('Erlon'))))
  );

  await pg.evaluate(()=>{ fecharPop(); limparFiltros(); limparColuna('sit'); limparColuna('venc'); document.querySelector('.cf[data-col="fis"]').click(); });
  const soTec=await marcarNoGrupo(1,'Erlon');
  const confereTec=await pg.evaluate(()=>filtrados.every(c=>c.fiscalTec.includes('Erlon')));
  t('marcar "Erlon" no grupo Técnico filtra só quem tem ele como fiscal TÉCNICO',
    soTec.achou && soTec.n>0 && confereTec, {soTec, confereTec});
  t('e é um resultado diferente do filtro por Administrativo (são papéis distintos)',
    soTec.n!==soAdm.n, {administrativo:soAdm.n, tecnico:soTec.n});

  /* A tabela em si também separa os dois — não só o filtro. Mesma coluna,
     mas cada papel na sua linha, pra não virar uma lista de nomes solta
     onde não dá pra saber quem é administrativo e quem é técnico. */
  const celulaFiscal=await pg.evaluate(()=>{
    fecharPop(); limparFiltros(); limparColuna('sit'); limparColuna('venc');
    const alvo=CONTRATOS.find(c=>c.fiscalAdm.length && c.fiscalTec.length);
    document.getElementById('fBusca').value=alvo.empresa;
    aplicarFiltros();
    const td=document.querySelector('.tab tbody tr .c-fis');
    const r={
      linhas: [...td.querySelectorAll('.fis-linha')].map(el=>el.textContent.trim()),
      admEsperado: alvo.fiscalAdm[0], tecEsperado: alvo.fiscalTec[0]
    };
    document.getElementById('fBusca').value=''; aplicarFiltros();
    return r;
  });
  t('a célula mostra o Administrativo e o Técnico em linhas separadas',
    celulaFiscal.linhas.length===2 &&
    new RegExp('Adm.*'+celulaFiscal.admEsperado.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).test(celulaFiscal.linhas[0]) &&
    new RegExp('Téc.*'+celulaFiscal.tecEsperado.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).test(celulaFiscal.linhas[1]),
    celulaFiscal);

  const contagemViva=await pg.evaluate(()=>{
    fecharPop(); limparFiltros(); limparColuna('sit'); limparColuna('venc');
    document.querySelector('.cf[data-col="tipo"]').click();
    const antes=[...document.querySelectorAll('#popLista .pop-op:not(.todos) .op-n')].map(o=>+o.textContent);
    fecharPop();
    document.querySelector('.cf[data-col="sec"]').click();
    [...document.querySelectorAll('#popLista .pop-op:not(.todos)')]
      .find(o=>o.querySelector('.op-txt').textContent==='SMMA').querySelector('input').click();
    fecharPop();
    document.querySelector('.cf[data-col="tipo"]').click();
    const depois=[...document.querySelectorAll('#popLista .pop-op:not(.todos) .op-n')].map(o=>+o.textContent);
    return {antes:antes.reduce((a,x)=>a+x,0), depois:depois.reduce((a,x)=>a+x,0)};
  });
  t('as contagens acompanham os filtros das outras colunas',
    contagemViva.depois<contagemViva.antes && contagemViva.depois>0, contagemViva);

  const limpou=await pg.evaluate(()=>{
    fecharPop(); limparFiltros();
    return {acesos:[...document.querySelectorAll('.cf')].filter(b=>b.classList.contains('ativo')).map(b=>b.dataset.col),
            n:filtrados.length, chips:document.getElementById('chipsAtivos').textContent.trim()};
  });
  t('limpar filtros apaga os outros menus de coluna, mantendo só o padrão de abertura',
    limpou.acesos.join('|')==='sit|venc', limpou);
  t('e volta ao padrão de abertura (ativo, vencendo em 30 dias)', limpou.n===N_PADRAO, {limpou, N_PADRAO});
  t('os chips que sobram são os do padrão (Situação e Prazo)',
    /Situação/.test(limpou.chips) && /Prazo/.test(limpou.chips), limpou.chips);

  console.log('\n3c) Ordenação pelo cabeçalho e pelo menu');
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

  const ordMenu=await pg.evaluate(()=>{
    fecharPop();
    document.querySelector('.cf[data-col="valor"]').click();
    document.getElementById('popOrdDesc').click();
    return {sort:F.sort, p:filtrados[0].valor, s:filtrados[1].valor,
            on:document.getElementById('popOrdDesc').classList.contains('on'),
            seta:document.querySelector('.th-titulos th[data-ord="valor"]').className};
  });
  t('o menu da coluna também ordena', ordMenu.sort==='valor-desc' && ordMenu.p>=ordMenu.s, ordMenu);
  t('e mostra qual ordem está valendo', ordMenu.on && /ord-desc/.test(ordMenu.seta), ordMenu);
  await pg.evaluate(()=>{ fecharPop(); limparFiltros(); limparColuna('sit'); limparColuna('venc'); });

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
  await abrirContratos(pgp, 'editar', jspdf);
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

  console.log('\n6) No celular a tabela vira blocos e a busca fica à vista');
  const cel=await b.newPage({viewport:{width:390,height:844}});
  await abrirContratos(cel, 'editar');
  const noCel=await cel.evaluate(()=>{
    const tr=document.querySelector('.tab tbody tr');
    const px=c=>parseFloat(getComputedStyle(tr.querySelector('.'+c)).fontSize);
    const btn=document.querySelector('.btn-filtros');
    return {
      buscaVisivel: document.getElementById('fBusca').offsetParent!==null,
      colunas: getComputedStyle(document.querySelector('.tab thead')).display,
      linha: getComputedStyle(tr).display,
      btnFiltros: !!btn && btn.offsetParent!==null,
      fEmp: px('c-emp'), fValor: px('c-valor'), fNum: px('c-num'),
      larguraPagina: document.documentElement.scrollWidth,
      larguraTela: document.documentElement.clientWidth,
    };
  });
  console.log('  ', noCel);
  t('a busca fica à vista, sem precisar abrir nada', noCel.buscaVisivel, noCel);
  t('a tabela vira blocos (não tabela espremida)', noCel.linha==='flex' && noCel.colunas==='none', noCel);
  t('o valor é o número em destaque do bloco', noCel.fValor>noCel.fEmp && noCel.fValor>=18, noCel);
  t('a empresa vem em segundo, acima do resto', noCel.fEmp>noCel.fNum, noCel);
  t('a página não estoura para os lados', noCel.larguraPagina<=noCel.larguraTela, noCel);
  /* Sem cabeçalho de tabela para clicar, os filtros de coluna precisam de
     outra porta de entrada — senão no celular só sobraria a busca. */
  t('existe o botão "Filtros e ordem"', noCel.btnFiltros, noCel);

  const folha=await cel.evaluate(()=>{
    document.querySelector('.btn-filtros').click();
    return {aberta:document.getElementById('ovFiltros').classList.contains('open'),
            colunas:[...document.querySelectorAll('.fm-linha')].map(l=>l.dataset.col),
            temOrdem:!!document.getElementById('fSort'),
            ver:document.getElementById('fmVer').textContent};
  });
  t('a folha de filtros abre com as 9 colunas',
    folha.aberta && folha.colunas.join('|')==='num|emp|obj|sec|tipo|fis|sit|venc|valor', folha);
  t('e traz a ordenação junto', folha.temOrdem, folha);
  const nPadraoCel=await cel.evaluate(()=>filtrados.length);
  t('o botão de fechar diz quantos contratos ficaram', folha.ver==='Ver '+nPadraoCel+' contratos', {folha:folha.ver, nPadraoCel});

  const menuCel=await cel.evaluate(()=>{
    document.querySelector('.fm-linha[data-col="tipo"]').click();
    const pop=document.getElementById('popFiltro');
    const r=pop.getBoundingClientRect();
    const alvo=[...document.querySelectorAll('#popLista .pop-op:not(.todos)')]
      .find(o=>o.querySelector('.op-txt').textContent==='OBRA');
    alvo.querySelector('input').click();
    return {aberto:pop.classList.contains('open'), n:filtrados.length,
            sóObra:filtrados.every(c=>c.tipo==='OBRA'),
            cabe:r.left>=0 && r.right<=window.innerWidth,
            resumo:document.querySelector('.fm-linha[data-col="tipo"] .fm-val').textContent};
  });
  t('tocar numa coluna abre o mesmo menu de opções', menuCel.aberto && menuCel.cabe, menuCel);
  t('e marcar OBRA filtra igual ao computador', menuCel.n>0 && menuCel.sóObra, menuCel);
  t('a folha passa a mostrar o que ficou marcado', menuCel.resumo==='OBRA', menuCel.resumo);

  console.log('\n7) Cadastrar, editar e aditivar contratos');
  /* Sem o Firebase dos contratos ligado não existe onde gravar de verdade: o
     que se salva fica no navegador e a tela precisa dizer isso. */
  const cadastrou=await pg.evaluate(()=>{
    novoContrato();
    const set=(id,v)=>{ document.getElementById(id).value=v; };
    set('fcContr','900'); set('fcAno','2026'); set('fcModalidade','PE 12/2026');
    set('fcEmpresa','teste engenharia ltda'); set('fcObjeto','Reforma da praça central.');
    set('fcTipo','obra'); set('fcSecretarias','SMMA, SMED'); set('fcFiscalAdm','Ana, Bruno');
    set('fcVencimento','2027-03-31'); set('fcValor','250000'); set('fcPalavra','reforma praça');
    const avisoNoForm=document.getElementById('formAviso').textContent;
    salvarForm();
    return {avisoNoForm};
  });
  await pg.waitForTimeout(400);
  const novo=await pg.evaluate(()=>{
    const c=CONTRATOS.find(x=>x.contr===900&&x.ano===2026);
    return {achou:!!c, id:c&&c.id, empresa:c&&c.empresa, secs:c&&c.secretarias.join('|'),
            fis:c&&c.fiscalAdm.join('|'), total:CONTRATOS.length,
            fechou:!document.getElementById('ovForm').classList.contains('open'),
            aviso:document.getElementById('avisoRascunho').textContent,
            naBusca:(()=>{ document.getElementById('fBusca').value='teste engenharia'; aplicarFiltros(); return filtrados.length; })()};
  });
  t('com o banco ligado, o formulário não avisa mais nada de rascunho',
    cadastrou.avisoNoForm.trim()==='', cadastrou.avisoNoForm.slice(0,80));
  t('o contrato novo entrou na lista', novo.achou && novo.total===N+1, novo);
  t('ganhou id próprio, sem pisar em ninguém', novo.id===PROXIMO_ID, {esperado:PROXIMO_ID, veio:novo.id});
  t('empresa e tipo entram em maiúsculas, como o resto do cadastro', novo.empresa==='TESTE ENGENHARIA LTDA', novo.empresa);
  t('secretarias e fiscais viram lista pela vírgula', novo.secs==='SMMA|SMED' && novo.fis==='Ana|Bruno', novo);
  t('o formulário fecha ao salvar', novo.fechou, novo);
  t('e a tela também não fala em rascunho — foi gravado de verdade', novo.aviso.trim()==='', novo.aviso.slice(0,60));
  t('o contrato novo já aparece na busca', novo.naBusca===1, novo.naBusca);

  const editou=await pg.evaluate(()=>{
    const c=CONTRATOS.find(x=>x.contr===900);
    abrirDet(c.id); editarContrato();
    document.getElementById('fcValor').value='300000';
    document.getElementById('fcSituacao').value='ATIVO-PARALIZADO';
    salvarForm();
    return true;
  });
  await pg.waitForTimeout(400);
  const depoisEdicao=await pg.evaluate(()=>{
    const c=CONTRATOS.find(x=>x.contr===900);
    return {valor:c.valor, sit:c.situacao, total:CONTRATOS.length,
            fichaAberta:document.getElementById('ovDet').classList.contains('open'),
            fichaMostra:document.getElementById('detBody').textContent.includes('300.000')};
  });
  t('editar altera o contrato em vez de criar outro', depoisEdicao.valor===300000 && depoisEdicao.total===N+1, depoisEdicao);
  t('a situação também muda', depoisEdicao.sit==='ATIVO-PARALIZADO', depoisEdicao);
  t('a ficha aberta se atualiza sozinha', depoisEdicao.fichaAberta && depoisEdicao.fichaMostra, depoisEdicao);

  const aditivou=await pg.evaluate(()=>{
    novoAditivo();
    const nSugerido=document.getElementById('faN').value;
    document.getElementById('faTipo').value='PRAZO E VALOR';
    document.getElementById('faData').value='2026-10-01';
    document.getElementById('faVenc').value='2028-03-31';
    document.getElementById('faValor').value='50000';
    document.getElementById('faObs').value='Prorrogação de 12 meses.';
    aditNota();
    const nota=document.getElementById('faNota').textContent;
    salvarAdit();
    return {nSugerido, nota};
  });
  await pg.waitForTimeout(400);
  const comAditivo=await pg.evaluate(()=>{
    const c=CONTRATOS.find(x=>x.contr===900);
    const tr=[...document.querySelectorAll('.tab tbody tr')].find(t=>t.textContent.includes('TESTE ENGENHARIA'));
    return {n:c.aditivos.length, valor:c.valor, valorBase:c.valorBase, venc:c.vencimento,
            vencBase:c.vencimentoBase, dias:c._d,
            linha:tr?tr.textContent.replace(/\s+/g,' '):'',
            ficha:document.getElementById('detBody').textContent.replace(/\s+/g,' ')};
  });
  t('o número do aditivo já vem sugerido', aditivou.nSugerido==='1', aditivou.nSugerido);
  t('antes de salvar, o formulário diz o que vai mudar no contrato',
    /vencimento passa de 31\/03\/2027 para 31\/03\/2028/.test(aditivou.nota) &&
    /valor passa de R\$\s300.000,00 para R\$\s350.000,00/.test(aditivou.nota), aditivou.nota);
  t('o aditivo foi registrado', comAditivo.n===1, comAditivo);
  t('o valor do contrato passa a ser o original + o aditivo',
    comAditivo.valor===350000 && comAditivo.valorBase===300000, comAditivo);
  t('e o vencimento passa a ser o do aditivo, guardando o original',
    comAditivo.venc==='2028-03-31' && comAditivo.vencBase==='2027-03-31', comAditivo);
  t('a lista mostra o valor e o vencimento já com o aditivo',
    /R\$\s350.000,00/.test(comAditivo.linha) && /31\/03\/2028/.test(comAditivo.linha), comAditivo.linha.slice(0,140));
  t('a ficha mostra a conta aberta (contrato + aditivos)',
    /contrato R\$\s300.000,00 \+ aditivos R\$\s50.000,00/.test(comAditivo.ficha), comAditivo.ficha.slice(0,300));
  t('e lista o aditivo com o que ele mudou',
    /Aditivo nº 1/.test(comAditivo.ficha) && /Prorrogação de 12 meses/.test(comAditivo.ficha), comAditivo.ficha.slice(0,400));

  const reeditou=await pg.evaluate(()=>{
    abrirAdit(0);
    document.getElementById('faValor').value='80000';
    salvarAdit();
    return true;
  });
  await pg.waitForTimeout(400);
  const depoisReedicao=await pg.evaluate(()=>{
    const c=CONTRATOS.find(x=>x.contr===900);
    return {valor:c.valor, n:c.aditivos.length};
  });
  t('editar o aditivo recalcula o contrato, sem somar duas vezes',
    depoisReedicao.valor===380000 && depoisReedicao.n===1, depoisReedicao);

  pg.on('dialog', d=>d.accept());
  await pg.evaluate(()=>{ abrirAdit(0); excluirAditivo(); });
  await pg.waitForTimeout(400);
  const semAditivo=await pg.evaluate(()=>{
    const c=CONTRATOS.find(x=>x.contr===900);
    return {valor:c.valor, venc:c.vencimento, n:(c.aditivos||[]).length,
            base:c.valorBase===undefined && c.vencimentoBase===undefined};
  });
  t('excluir o aditivo devolve o valor e o prazo de origem',
    semAditivo.valor===300000 && semAditivo.venc==='2027-03-31' && semAditivo.n===0, semAditivo);
  t('e não deixa resto de "valor original" para trás', semAditivo.base, semAditivo);

  const exportado=await pg.evaluate(()=>{
    const txt=textoJSON();
    const lista=JSON.parse(txt);
    const c=lista.find(x=>x.contr===900);
    return {linhas:txt.split('\n').length, itens:lista.length,
            campos:Object.keys(c).join(','), temInterno:/"_/.test(txt)};
  });
  t('o JSON exportado tem todos os contratos, um por linha',
    exportado.itens===N+1 && exportado.linhas===N+1+3, exportado);
  t('e não leva os campos internos da tela', !exportado.temInterno, exportado.campos);

  /* O que a tela salvou tem de estar no banco, não num rascunho de
     navegador: é o que faz a alteração valer para todo mundo. */
  const noBanco=await pg.evaluate(()=>{
    const c=CONTRATOS.find(x=>x.contr===900&&x.ano===2026);
    const doc=window.__STORE.contratos[String(c.id)];
    return {gravou:!!doc, valor:doc&&doc.valor, temCampoInterno:doc?Object.keys(doc).some(k=>k[0]==='_'):null,
            rascunhoVazio:Object.keys(JSON.parse(localStorage.getItem('contratos_ijui_rascunho')||'{}')).length===0};
  });
  t('o contrato salvo foi para o banco, e não para um rascunho local',
    noBanco.gravou && noBanco.valor===300000 && noBanco.rascunhoVazio, noBanco);
  t('e foi gravado sem os campos internos da tela', noBanco.temCampoInterno===false, noBanco);

  console.log('\n8) Tempo real: o que uma pessoa salva aparece na tela da outra');
  /* Grava direto no banco, como se fosse a outra pessoa em outro
     computador, e confere que a tela reage sozinha — sem F5. */
  await pg.evaluate(()=>{
    const c=CONTRATOS.find(x=>x.contr===900&&x.ano===2026);
    const doc=Object.assign({}, window.__STORE.contratos[String(c.id)], {empresa:'OUTRA PESSOA SALVOU LTDA'});
    return firebase.firestore().collection('contratos').doc(String(c.id)).set(doc);
  });
  await pg.waitForTimeout(500);
  const aoVivo=await pg.evaluate(()=>{
    const c=CONTRATOS.find(x=>x.contr===900&&x.ano===2026);
    return {empresa:c&&c.empresa, total:CONTRATOS.length};
  });
  t('a alteração da outra pessoa entra na lista sozinha',
    aoVivo.empresa==='OUTRA PESSOA SALVOU LTDA' && aoVivo.total===N+1, aoVivo);

  console.log('\n9) O portão: sem acesso não entra, e "Visualizar" não grava');
  const pgVer=await b.newPage({viewport:{width:1280,height:900}});
  await abrirContratos(pgVer, 'ver');
  const soVer=await pgVer.evaluate(()=>({
    entrou: document.getElementById('authGate').style.display==='none',
    total: CONTRATOS.length,
    botaoNovo: getComputedStyle(document.querySelector('.header-actions .so-editor')).display,
    chip: document.getElementById('authUserChip').textContent
  }));
  t('quem tem "Visualizar" entra e enxerga os contratos', soVer.entrou && soVer.total===N, soVer);
  t('mas não vê os botões de cadastro', soVer.botaoNovo==='none', soVer);
  t('e o cabeçalho avisa que é só visualização', /só visualização/.test(soVer.chip), soVer.chip);
  const tentouGravar=await pgVer.evaluate(()=>
    salvarContrato({id:1, contr:1, ano:2020, empresa:'INVASOR'})
      .then(()=>({bloqueou:false})).catch(e=>({bloqueou:true, msg:e.message})));
  t('gravar é recusado antes mesmo de tentar o banco', tentouGravar.bloqueou, tentouGravar);

  const pgSem=await b.newPage({viewport:{width:1280,height:900}});
  await abrirContratos(pgSem, 'nenhum');
  const semAcesso=await pgSem.evaluate(()=>({
    portaoAberto: document.getElementById('authGate').style.display==='flex',
    esperando: document.getElementById('authPendenteCard').style.display==='block',
    semDados: CONTRATOS.length===0
  }));
  t('quem não tem o painel liberado fica na tela de espera', semAcesso.portaoAberto && semAcesso.esperando, semAcesso);
  t('e nem chega a receber a lista de contratos', semAcesso.semDados, semAcesso);

  console.log('\n10) A estreia: banco vazio, o administrador importa pela tela');
  const pgVazio=await b.newPage({viewport:{width:1280,height:900}});
  await pgVazio.route('**/firebasejs/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:stub}));
  await pgVazio.route('**/cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:'window.jspdf={jsPDF:function(){}};'}));
  await pgVazio.route('**/fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await pgVazio.addInitScript((sd)=>{ window.__SEED=sd; }, {
    contratos:{},
    usuarios_v2:{'g-pedro':{email:'pedrohhpacifico@gmail.com', nome:'Pedro', status:'aprovado',
                            isAdmin:true, acessos:{agenda:'editar', pregoeiro:'editar', contratos:'editar'},
                            provedor:'google.com'}}
  });
  await pgVazio.addInitScript((u)=>{ window.__AUTH_SEED=u; }, {uid:'g-pedro', email:'pedrohhpacifico@gmail.com', displayName:'Pedro', photoURL:''});
  await pgVazio.goto('http://127.0.0.1:8099/contratos/index.html',{waitUntil:'networkidle'});
  await pgVazio.waitForTimeout(900);
  const vazio=await pgVazio.evaluate(()=>({
    texto: document.getElementById('vazio').textContent,
    temBotao: !!document.querySelector('#vazio button')
  }));
  t('com o banco vazio, o administrador vê o convite para importar',
    /banco de contratos ainda está vazio/.test(vazio.texto) && vazio.temBotao, vazio.texto.slice(0,80));

  /* confirm() automático: o navegador de teste não tem quem clique em OK */
  await pgVazio.evaluate(()=>{ window.confirm=()=>true; });
  await pgVazio.click('#vazio button');
  /* Espera a importação TERMINAR, não o primeiro lote: o banco deixa de
     estar vazio já no primeiro, e a tela se monta por cima — foi assim que
     uma importação de verdade parou nos 400 e passou por concluída. */
  await pgVazio.waitForFunction(()=>typeof _importando!=='undefined' && _importando===false
    && typeof CONTRATOS!=='undefined' && CONTRATOS.length>0, null, {timeout:60000});
  const importou=await pgVazio.evaluate(()=>({
    noBanco: Object.keys(window.__STORE.contratos).length,
    naTela: CONTRATOS.length,
    linhas: document.querySelectorAll('.tab tbody tr').length,
    andamento: (document.getElementById('avisoImportacao')||{}).textContent||''
  }));
  t('todos os contratos do arquivo entram no banco', importou.noBanco===N, {esperado:N, veio:importou.noBanco});
  t('e a tela se monta sozinha com eles', importou.naTela===N && importou.linhas>0, importou);
  t('o andamento sobrevive ao redesenho da lista (não vive dentro de #vazio)',
    /Pronto: \d+ contrato/.test(importou.andamento), importou.andamento.slice(0,90));
  t('terminado, não sobra aviso de contrato faltando',
    !/ainda não est/.test(importou.andamento), importou.andamento.slice(0,90));

  console.log('\n11) Importação que parou no meio: a tela oferece completar');
  const pgMeio=await b.newPage({viewport:{width:1280,height:900}});
  await pgMeio.route('**/firebasejs/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:stub}));
  await pgMeio.route('**/cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:'window.jspdf={jsPDF:function(){}};'}));
  await pgMeio.route('**/fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  /* Só os 400 primeiros no banco: exatamente o estado em que o cadastro
     ficou quando a página foi embora depois do primeiro lote. */
  const meio={}; dados.slice(0,400).forEach(c=>{ meio[String(c.id)]=c; });
  await pgMeio.addInitScript((sd)=>{ window.__SEED=sd; }, {
    contratos:meio,
    usuarios_v2:{'g-pedro':{email:'pedrohhpacifico@gmail.com', nome:'Pedro', status:'aprovado',
                            isAdmin:true, acessos:{agenda:'editar', pregoeiro:'editar', contratos:'editar'},
                            provedor:'google.com'}}
  });
  await pgMeio.addInitScript((u)=>{ window.__AUTH_SEED=u; }, {uid:'g-pedro', email:'pedrohhpacifico@gmail.com', displayName:'Pedro', photoURL:''});
  await pgMeio.goto('http://127.0.0.1:8099/contratos/index.html',{waitUntil:'networkidle'});
  await pgMeio.waitForFunction(()=>typeof _faltamImportar!=='undefined' && _faltamImportar!==null, null, {timeout:30000});
  const pelaMetade=await pgMeio.evaluate(()=>({
    naTela: CONTRATOS.length,
    faltam: _faltamImportar.length,
    aviso: document.getElementById('avisoImportacao').textContent,
    temBotao: !!document.querySelector('#avisoImportacao button')
  }));
  t('o banco pela metade não passa despercebido', /ainda não est/.test(pelaMetade.aviso), pelaMetade.aviso.slice(0,90));
  t('o aviso diz quantos faltam', pelaMetade.faltam===N-400 && pelaMetade.aviso.includes(String(N-400)),
    {esperado:N-400, veio:pelaMetade.faltam});
  t('e traz o botão para completar', pelaMetade.temBotao, pelaMetade.temBotao);

  await pgMeio.evaluate(()=>{ window.confirm=()=>true; importarDoArquivo(); });
  await pgMeio.waitForFunction(()=>_importando===false && CONTRATOS.length>400, null, {timeout:60000});
  const completou=await pgMeio.evaluate(()=>({
    noBanco: Object.keys(window.__STORE.contratos).length,
    naTela: CONTRATOS.length,
    aviso: document.getElementById('avisoImportacao').textContent
  }));
  t('completar sobe só o que faltava e fecha a conta', completou.noBanco===N && completou.naTela===N,
    {esperado:N, veio:completou});
  t('e o aviso de faltando some', !/ainda não est/.test(completou.aviso), completou.aviso.slice(0,90));

  console.log('\n12) Histórico de edições: quem mexeu, no quê, e o desfazer');
  const pgHist=await b.newPage({viewport:{width:1280,height:900}});
  const errsHist=[]; pgHist.on('pageerror',e=>errsHist.push(e.message));
  await abrirContratos(pgHist, 'editar');
  const alvo=dados[0].id;
  const objetoAntigo=await pgHist.evaluate(a=>CONTRATOS.find(x=>x.id===a).objeto, alvo);
  await pgHist.evaluate(a=>{
    const c=Object.assign({}, CONTRATOS.find(x=>x.id===a), {objeto:'OBJETO TROCADO NO TESTE'});
    return gravar(c, 'ok', 'editou');
  }, alvo);
  const reg=await pgHist.evaluate(()=>{
    const h=Object.values(window.__STORE.contratos_historico||{});
    return {quantos:h.length, primeiro:h[0]&&{acao:h[0].acao, nome:h[0].nome, uid:h[0].uid,
      temAntes:!!h[0].antes, temDepois:!!h[0].depois, rotulo:h[0].rotulo,
      objAntes:h[0].antes&&h[0].antes.objeto, objDepois:h[0].depois&&h[0].depois.objeto,
      temExpira:!!(h[0].expiraEm&&h[0].expiraEm.toDate)}};
  });
  t('editar um contrato deixa registro no histórico', reg.quantos===1 && reg.primeiro.acao==='editou', reg);
  t('o registro diz quem foi', reg.primeiro.nome==='Pedro' && reg.primeiro.uid==='g-pedro', reg.primeiro);
  t('o registro guarda o antes e o depois', reg.primeiro.temAntes && reg.primeiro.temDepois
    && reg.primeiro.objAntes===objetoAntigo && reg.primeiro.objDepois==='OBJETO TROCADO NO TESTE', reg.primeiro);
  t('e nasce com data de validade (para sumir sozinho depois)', reg.primeiro.temExpira, reg.primeiro);

  await pgHist.evaluate(()=>abrirHistorico());
  await pgHist.waitForFunction(()=>document.querySelectorAll('.hist-linha').length>0,null,{timeout:15000});
  const painel=await pgHist.evaluate(()=>({
    linhas: document.querySelectorAll('.hist-linha').length,
    texto: document.getElementById('histLista').textContent,
    temDesfazer: !!document.querySelector('#histLista .usr-btn')
  }));
  t('o painel mostra a edição em português', /Pedro/.test(painel.texto)
    && /editou o contrato/.test(painel.texto), painel.texto.slice(0,120));
  t('e mostra o que mudou, de → para', /objeto/.test(painel.texto)
    && painel.texto.includes('OBJETO TROCADO NO TESTE'), painel.texto.slice(0,200));
  t('quem pode editar vê o botão de desfazer', painel.temDesfazer, painel);

  await pgHist.evaluate(()=>{ window.confirm=()=>true; });
  await pgHist.click('#histLista .usr-btn');
  await pgHist.waitForFunction(o=>CONTRATOS.find(x=>x.objeto===o), objetoAntigo, {timeout:15000});
  const desfeito=await pgHist.evaluate(a=>({
    objeto: CONTRATOS.find(x=>x.id===a).objeto,
    noBanco: window.__STORE.contratos[String(a)].objeto,
    registros: Object.values(window.__STORE.contratos_historico).map(h=>h.acao)
  }), alvo);
  t('desfazer devolve o contrato ao que era', desfeito.objeto===objetoAntigo
    && desfeito.noBanco===objetoAntigo, desfeito);
  t('e o próprio desfazer entra no histórico', desfeito.registros.includes('desfez'), desfeito.registros);

  console.log('\n13) O histórico se limpa sozinho e não serve de rascunho para apagar rastro');
  const pgLimpa=await b.newPage({viewport:{width:1280,height:900}});
  const ontem=Date.now()-86400000, daquiAUmAno=Date.now()+300*86400000;
  await pgLimpa.route('**/firebasejs/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:stub}));
  await pgLimpa.route('**/cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:'window.jspdf={jsPDF:function(){}};'}));
  await pgLimpa.route('**/fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await pgLimpa.addInitScript((sd)=>{ window.__SEED=sd; }, Object.assign(seedCom('editar'), {
    /* {__ts: ...} vira Timestamp dentro do stub — ver fbstub3.js */
    contratos_historico:{
      vencido:{acao:'editou', nome:'Serli', uid:'x', rotulo:'1/2020', contratoId:1, empresa:'',
               quando:{__ts:ontem-365*86400000}, expiraEm:{__ts:ontem}, antes:{id:1}, depois:{id:1}},
      dentroDoPrazo:{acao:'aditivo-criou', nome:'Julieta', uid:'y', rotulo:'2/2026', contratoId:2, empresa:'',
               quando:{__ts:Date.now()}, expiraEm:{__ts:daquiAUmAno}, antes:{id:2}, depois:{id:2}}
    }
  }));
  await pgLimpa.addInitScript((u)=>{ window.__AUTH_SEED=u; }, {uid:'g-pedro', email:'pedrohhpacifico@gmail.com', displayName:'Pedro', photoURL:''});
  await pgLimpa.goto('http://127.0.0.1:8099/contratos/index.html',{waitUntil:'networkidle'});
  await pgLimpa.waitForTimeout(900);
  await pgLimpa.evaluate(()=>abrirHistorico());
  await pgLimpa.waitForFunction(()=>!window.__STORE.contratos_historico.vencido,null,{timeout:15000});
  const sobrou=await pgLimpa.evaluate(()=>({
    ids: Object.keys(window.__STORE.contratos_historico),
    texto: document.getElementById('histLista').textContent
  }));
  t('registro vencido (mais de 365 dias) é apagado ao abrir o painel',
    !sobrou.ids.includes('vencido'), sobrou.ids);
  t('registro dentro do prazo continua lá', sobrou.ids.includes('dentroDoPrazo'), sobrou.ids);
  t('e o painel conta o aditivo em português', /Julieta/.test(sobrou.texto)
    && /cadastrou um aditivo no contrato/.test(sobrou.texto), sobrou.texto.slice(0,140));

  const regras=fs.readFileSync('../firestore-processos-ijui.rules','utf8');
  t('as regras não deixam reescrever um registro de histórico',
    /match \/contratos_historico\/\{id\}[\s\S]*?allow update: if false;/.test(regras));
  t('as regras só deixam apagar registro já vencido',
    /allow delete: if contratosEdit\(\) && resource\.data\.expiraEm < request\.time;/.test(regras));
  t('as regras exigem que o registro saia em nome de quem está gravando',
    /request\.resource\.data\.uid == request\.auth\.uid/.test(regras));

  console.log('\n14) Só visualização: histórico é leitura, sem desfazer');
  const pgHistVer=await b.newPage({viewport:{width:1280,height:900}});
  await abrirContratos(pgHistVer, 'ver');
  await pgHistVer.evaluate(()=>abrirHistorico());
  await pgHistVer.waitForTimeout(600);
  const histSoVer=await pgHistVer.evaluate(()=>({
    botaoVisivel: document.getElementById('btnHist').style.display!=='none',
    temDesfazer: !!document.querySelector('#histLista .usr-btn')
  }));
  t('quem só visualiza também vê o histórico', histSoVer.botaoVisivel, histSoVer);
  t('mas não recebe botão de desfazer', !histSoVer.temDesfazer, histSoVer);

  console.log('\nerros do histórico:', errsHist.length?errsHist:'nenhum');
  t('nenhum erro de JavaScript no histórico', errsHist.length===0, errsHist);

  console.log('\nerros JS:', errs.length||errsPdf.length?[...errs,...errsPdf]:'nenhum');
  console.log(`\n${ok} passaram, ${mau} falharam.`);
  await b.close();
})();
