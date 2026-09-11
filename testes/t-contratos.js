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
  /* O limite existe para o cadastro nunca mais voltar para dentro do HTML —
     eram 724 KB numa linha só. O arquivo cresceu com o histórico, a agenda e
     o PDF novo; 210 KB continua sendo um décimo do que era. */
  t('o index.html continua pequeno (sem contrato embutido)', html.length<210*1024, {kb:Math.round(html.length/1024)});
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
    /* vigia o piscar do formulário de login — ver seção 15 */
    await pg.addInitScript(()=>{
      window.__LOGIN_APARECEU=false;
      setInterval(()=>{ const e=document.getElementById('authEntradaBox');
        if(e && getComputedStyle(e).display!=='none' && e.offsetParent!==null) window.__LOGIN_APARECEU=true; }, 15);
    });
    await pg.goto('http://127.0.0.1:8099/contratos/index.html',{waitUntil:'networkidle'});
    await pg.waitForTimeout(900);
  }
  /* A tela lê só o ano corrente. Quase todo teste daqui para baixo fala do
     cadastro inteiro — que é o que qualquer pessoa vê ao procurar algo. */
  async function comTudo(pg){
    await pg.evaluate(()=>verTudoContratos());
    await pg.waitForFunction(()=>CT_TUDO && CONTRATOS.length>1000,null,{timeout:20000});
    await pg.waitForTimeout(150);
  }

  const b=await chromium.launch(executablePath?{executablePath}:{});
  const pg=await b.newPage({viewport:{width:1280,height:900}});
  const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
  await abrirContratos(pg, 'editar');

  console.log('\n1b) A tela lê o ano corrente, não o cadastro inteiro');
  /* A tela já ABRIA nos contratos do ano — mas lia os 1.294 para depois
     esconder 1.153 deles. Ler e esconder é o pior dos dois mundos: paga-se
     pelo arquivo inteiro a cada F5 e não se vê nada a mais por isso. */
  const recorte=await pg.evaluate(()=>({
    tudo:CT_TUDO, leu:CONTRATOS.length,
    noBanco:Object.keys(window.__STORE.contratos).length,
    soDoAno:CONTRATOS.every(c=>c.ano===new Date().getFullYear() || c.ano==null),
    aviso:(document.getElementById('anosCt')||{}).textContent||''
  }));
  t('abre lendo só o ano corrente', !recorte.tudo && recorte.soDoAno, recorte);
  t('e isso é uma fração do cadastro',
    recorte.leu>0 && recorte.leu < recorte.noBanco/3, {leu:recorte.leu, tem:recorte.noBanco});
  t('a tela diz o que está mostrando, e como ver o resto',
    /todos os anos/.test(recorte.aviso), recorte.aviso.slice(0,90));

  /* O botão do aviso: trazer o cadastro não basta se o filtro de coluna
     continuar no ano corrente — o botão pareceria não fazer nada. */
  await pg.click('#anosCt button');
  await pg.waitForFunction(()=>CT_TUDO && CONTRATOS.length>1000, null, {timeout:20000});
  await pg.waitForTimeout(250);
  const soltou=await pg.evaluate(()=>({
    naTela: filtrados.length, lidos: CONTRATOS.length,
    anosMarcados: COLF.num.sel.ano.size,
    aviso: (document.getElementById('anosCt')||{}).textContent||''
  }));
  t('"Ver todos os anos" solta o recorte e mostra os anos anteriores',
    soltou.naTela>1000 && soltou.anosMarcados===0, soltou);
  t('e o aviso do recorte some junto', soltou.aviso==='', soltou.aviso.slice(0,60));

  /* Volta ao estado de abertura para o resto da seção. */
  await pg.evaluate(()=>{ CT_TUDO=false; _ctPrimeira=true; _vazioConferido=false;
                          ligarConsultaContratos(); });
  await pg.waitForFunction(()=>!CT_TUDO && CONTRATOS.length<1000, null, {timeout:20000});
  await pg.evaluate(()=>{ initFiltros(true); aplicarFiltros(); });
  await pg.waitForTimeout(200);

  /* Abrir o menu de uma coluna também traz: as opções contam linhas, e com
     um ano na mão elas diriam menos do que existe. */
  await pg.click('.cf[data-col="sec"]');
  await pg.waitForFunction(()=>CT_TUDO && CONTRATOS.length>1000, null, {timeout:20000});
  await pg.waitForTimeout(250);
  t('abrir o menu de uma coluna traz o cadastro, para as opções não mentirem',
    await pg.evaluate(()=>CT_TUDO && CONTRATOS.length>1000));
  await pg.evaluate(()=>fecharPop());
  await pg.evaluate(()=>{ CT_TUDO=false; _ctPrimeira=true; _vazioConferido=false;
                          ligarConsultaContratos(); });
  await pg.waitForFunction(()=>!CT_TUDO && CONTRATOS.length<1000, null, {timeout:20000});
  await pg.evaluate(()=>{ initFiltros(true); aplicarFiltros(); });
  await pg.waitForTimeout(200);

  /* Guardado antes do primeiro clique: a seção 19 fala do estado de
     abertura da busca, e clicar nela é justamente o que tira o readonly. */
  const buscaNasceReadonly=await pg.evaluate(()=>document.getElementById('fBusca').hasAttribute('readonly'));

  /* Procurar traz o cadastro: "pesquisar em tudo" com um ano na mão não é
     pesquisar em tudo. */
  await pg.click('#fBusca');
  await pg.waitForTimeout(150);
  await pg.type('#fBusca','a');
  await pg.waitForTimeout(1500);
  const trouxe=await pg.evaluate(()=>({tudo:CT_TUDO, leu:CONTRATOS.length}));
  t('procurar traz o cadastro inteiro', trouxe.tudo && trouxe.leu>1000, trouxe);
  await pg.fill('#fBusca','');
  await pg.waitForTimeout(300);
  t('e não volta a encolher — quem já pagou a leitura não paga de novo',
    await pg.evaluate(()=>CT_TUDO));
  t('o aviso do recorte some depois disso',
    (await pg.evaluate(()=>(document.getElementById('anosCt')||{}).textContent||''))==='');
  /* Devolve a tela ao estado de abertura (com o recorte do ano no filtro),
     que é o que as seções seguintes descrevem. */
  await pg.evaluate(()=>{ document.getElementById('fBusca').value=''; _buscaAnterior='';
                          initFiltros(true); aplicarFiltros(); });
  await pg.waitForTimeout(300);

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

  console.log('\n3) Ao abrir, mostra os contratos do ano, do último cadastrado para trás');
  /* Quem chega de manhã quer ver o que entrou desde ontem — e é o número do
     contrato, que anda sempre para cima, que conta isso. */
  const padraoAbertura=await pg.evaluate(()=>{
    const ano=new Date().getFullYear();
    const esperado=CONTRATOS.filter(c=>c.ano===ano);
    const nums=filtrados.map(c=>c.contr);
    return {
      n:filtrados.length, esperado:esperado.length, ano:ano,
      todosDoAno:filtrados.every(c=>c.ano===ano),
      decrescente:nums.every((v,i)=>i===0||v<=nums[i-1]),
      chips:document.getElementById('chipsAtivos').textContent.trim(),
      sort:F.sort
    };
  });
  t('mostra exatamente os contratos do ano corrente',
    padraoAbertura.n===padraoAbertura.esperado && padraoAbertura.todosDoAno, padraoAbertura);
  t('do maior número para o menor — o último cadastrado em cima',
    padraoAbertura.sort==='num-desc' && padraoAbertura.decrescente, padraoAbertura);
  t('e o filtro aparece como chip, pra ficar claro que a tela não mostra tudo',
    new RegExp('Ano do contrato: '+padraoAbertura.ano).test(padraoAbertura.chips), padraoAbertura.chips);
  const N_PADRAO = padraoAbertura.esperado;   /* quantos contratos o padrão de abertura traz hoje */

  console.log('\n4) A busca única procura em qualquer informação (sem o filtro de ano atrapalhando)');
  const ativos=await pg.evaluate(()=>{ limparColuna('num'); return filtrados.length; });
  t('sem o filtro de ano, mostra todos os contratos', ativos===N, {esperado:N, veio:ativos});

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

  /* Limpar é limpar: o botão dizia "Limpar filtros" e reaplicava os dois
     filtros de abertura, então quem clicava via os mesmos chips no lugar e
     achava que o botão não fazia nada. O recorte de abertura continua
     valendo — mas só na abertura. */
  const todos=await pg.evaluate(()=>{ limparFiltros(); return {n:filtrados.length,
    busca:document.getElementById('fBusca').value,
    chips:document.getElementById('chipsAtivos').textContent.trim()}; });
  t('limpar os filtros zera a busca e mostra o cadastro inteiro',
    todos.n===N && todos.busca==='' && todos.chips==='', {todos, N});

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

  /* Os testes daqui pra frente contam sobre a tela em recorte de abertura,
     que é onde as contagens do menu fazem sentido — a busca acima acabou de
     limpar tudo. */
  await pg.evaluate(()=>{ initFiltros(true); aplicarFiltros(); });
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
  t('limpar filtros apaga TODOS os menus de coluna, sem sobrar nenhum aceso',
    limpou.acesos.length===0, limpou);
  t('e a lista passa a mostrar o cadastro inteiro', limpou.n===N, {limpou, N});
  t('sem sobrar chip nenhum na tela', limpou.chips==='', limpou.chips);
  await pg.evaluate(()=>{ initFiltros(true); aplicarFiltros(); });

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
  await comTudo(pgp);
  /* Geração ficou assíncrona: a logo do município vem de um arquivo, e o
     PDF espera ela chegar antes de desenhar o cabeçalho. */
  const pdfs=await pgp.evaluate(async ()=>{
    let salvo=null;
    const O=window.jspdf.jsPDF;
    window.jspdf.jsPDF=function(...a){ const d=new O(...a); d.save=n=>{salvo=n;}; return d; };
    await pdfDoFiltro();                  const a=salvo; salvo=null;
    abrirDet(1); await pdfContratoAtual(); const c=salvo; salvo=null;
    await gerarRelatorio('geral','todos');
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
  await comTudo(pgVer);
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
  /* Importar precisa do cadastro inteiro na mão para saber o que já está lá,
     então a estreia termina com tudo à vista — e num banco vazio expandir
     não custa leitura nenhuma. */
  t('e a tela se monta sozinha com eles', importou.naTela===N && importou.linhas>0,
    {esperado:N, veio:importou.naTela, linhas:importou.linhas});
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
  /* A conta é feita contra o recorte que a tela tem na mão: comparar o
     arquivo inteiro com os contratos do ano diria "faltam mil" e ofereceria
     subir o cadastro de novo — um botão perigoso nascido de conta errada. */
  const FALTAM_NO_ANO=dados.filter(c=>(c.ano===new Date().getFullYear()||c.ano==null)
                                   && !dados.slice(0,400).some(x=>x.id===c.id)).length;
  t('o aviso diz quantos faltam, medindo pelo mesmo recorte que está na tela',
    pelaMetade.faltam===FALTAM_NO_ANO && pelaMetade.aviso.includes(String(FALTAM_NO_ANO)),
    {esperado:FALTAM_NO_ANO, veio:pelaMetade.faltam});
  t('e traz o botão para completar', pelaMetade.temBotao, pelaMetade.temBotao);

  /* Subir traz o cadastro inteiro antes de comparar — sem isso, contrato de
     2019 que já está no banco pareceria faltando e subiria de novo. */
  await pgMeio.evaluate(()=>{ window.confirm=()=>true; importarDoArquivo(); });
  await pgMeio.waitForFunction(()=>CT_TUDO && _importando===false && CONTRATOS.length>400, null, {timeout:60000});
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
  await comTudo(pgHist);
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
  /* O objeto de um contrato tem parágrafos inteiros: o painel diz que mudou,
     sem despejar os dois textos e afogar o resto da linha. */
  t('campo longo aparece como "alterado", sem despejar o texto', /objeto/.test(painel.texto)
    && /alterado/.test(painel.texto) && !painel.texto.includes('OBJETO TROCADO NO TESTE'),
    painel.texto.slice(0,200));
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
  /* campo curto continua mostrando o antes e o depois, que é o que serve */
  await pgHist.evaluate(a=>{
    const c=Object.assign({}, CONTRATOS.find(x=>x.id===a), {situacao:'INATIVO'});
    return gravar(c, 'ok', 'editou');
  }, alvo);
  await pgHist.evaluate(()=>abrirHistorico());
  await pgHist.waitForFunction(()=>/situação/.test(document.getElementById('histLista').textContent),null,{timeout:15000});
  const curto=await pgHist.evaluate(()=>document.getElementById('histLista').textContent);
  t('campo curto mostra de → para', /situação:/.test(curto) && /INATIVO/.test(curto), curto.slice(0,160));

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
  await comTudo(pgHistVer);
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

  console.log('\n15) O histórico não para nas primeiras linhas');
  /* Um ano de trabalho passa fácil de trezentas edições. O painel traz as
     mais recentes e oferece buscar as mais antigas — parar em trezentas sem
     dizer nada esconderia justamente o que alguém foi procurar. */
  const pgMuitas=await b.newPage({viewport:{width:1280,height:900}});
  const muitas={};
  for(let i=0;i<420;i++){
    muitas['h'+String(i).padStart(4,'0')]={acao:'editou', nome:'Serli', uid:'g-pedro',
      rotulo:(i+1)+'/2026', contratoId:i+1, empresa:'',
      quando:{__ts:Date.now()-i*60000}, expiraEm:{__ts:Date.now()+300*86400000},
      antes:{id:i+1, objeto:'a'}, depois:{id:i+1, objeto:'b'}};
  }
  await pgMuitas.route('**/firebasejs/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:stub}));
  await pgMuitas.route('**/cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:'window.jspdf={jsPDF:function(){}};'}));
  await pgMuitas.route('**/fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await pgMuitas.addInitScript((sd)=>{ window.__SEED=sd; },
    Object.assign(seedCom('editar'), {contratos_historico:muitas}));
  await pgMuitas.addInitScript((u)=>{ window.__AUTH_SEED=u; }, {uid:'g-pedro', email:'pedrohhpacifico@gmail.com', displayName:'Pedro', photoURL:''});
  await pgMuitas.goto('http://127.0.0.1:8099/contratos/index.html',{waitUntil:'networkidle'});
  await pgMuitas.waitForTimeout(900);
  await pgMuitas.evaluate(()=>abrirHistorico());
  await pgMuitas.waitForFunction(()=>document.querySelectorAll('.hist-linha').length>0,null,{timeout:15000});
  const pagina1=await pgMuitas.evaluate(()=>({
    linhas: document.querySelectorAll('.hist-linha').length,
    temBotaoMais: /Carregar edições mais antigas/.test(document.getElementById('histLista').textContent),
    primeira: document.querySelector('.hist-linha').textContent
  }));
  t('a primeira leva traz 300 linhas', pagina1.linhas===300, pagina1.linhas);
  t('a mais recente vem primeiro', /1\/2026/.test(pagina1.primeira), pagina1.primeira.slice(0,80));
  t('e oferece buscar as mais antigas', pagina1.temBotaoMais, pagina1);
  await pgMuitas.evaluate(()=>histCarregar(true));
  await pgMuitas.waitForFunction(()=>document.querySelectorAll('.hist-linha').length>300,null,{timeout:15000});
  const pagina2=await pgMuitas.evaluate(()=>({
    linhas: document.querySelectorAll('.hist-linha').length,
    temBotaoMais: /Carregar edições mais antigas/.test(document.getElementById('histLista').textContent),
    repetidas: (()=>{ const t=[...document.querySelectorAll('.hist-linha')].map(e=>e.textContent);
                      return t.length - new Set(t).size; })()
  }));
  t('carregar mais traz o resto', pagina2.linhas===420, pagina2.linhas);
  t('sem repetir o que já estava na tela', pagina2.repetidas===0, pagina2);
  t('e o botão some quando acabou', !pagina2.temBotaoMais, pagina2);

  console.log('\n16) O PDF só recebe letra que a fonte sabe desenhar');
  /* As fontes de fábrica do jsPDF desenham o alfabeto ocidental e nada além.
     Um caractere fora disso não sai errado só ele: a LINHA INTEIRA sai com
     as letras esparramadas. O cadastro tem 75 setas "\u2192" e 28 de Wingdings
     coladas do Word, sempre separando o valor total do mensal. */
  const limpeza=await pg.evaluate(()=>{
    const casos=[
      ['R$ 34.200,00 \u2192 R$ 5.700,00', 'R$ 34.200,00 -> R$ 5.700,00'],
      ['R$ 30.000,00 \uf0e0 R$ 5.000,00', 'R$ 30.000,00 -> R$ 5.000,00'],
      ['Lote 01 \u2013 item 01', 'Lote 01 \u2013 item 01'],
      ['\u201cOFICINAS\u201d de 30\u2019', '\u201cOFICINAS\u201d de 30\u2019'],
      ['acentos: \u00e1\u00e9\u00ed\u00f3\u00fa \u00e7 \u00e3\u00f5', 'acentos: \u00e1\u00e9\u00ed\u00f3\u00fa \u00e7 \u00e3\u00f5']
    ];
    return casos.map(([de,esperado])=>({de, esperado, veio:pdfTexto(de)}));
  });
  limpeza.forEach((c,i)=>{ t('PDF, caso '+(i+1)+': o que a fonte não desenha vira algo que ela desenha',
    c.veio===c.esperado, c); });
  const sobrouPdf=await pg.evaluate(()=>{
    const ok='\u2013\u2014\u2018\u2019\u201c\u201d\u2026\u20ac';
    const ruins=[];
    CONTRATOS.forEach(c=>['objeto','empresa','obs'].forEach(k=>{
      for(const ch of pdfTexto(c[k]||''))
        if(ch.codePointAt(0)>255 && ok.indexOf(ch)<0)
          ruins.push({id:c.id, campo:k, ch:'U+'+ch.codePointAt(0).toString(16)});
    }));
    return ruins.slice(0,5);
  });
  t('nenhum dos contratos do cadastro leva caractere impossível para o PDF', sobrouPdf.length===0, sobrouPdf);

  console.log('\n17) Valor em dinheiro do jeito que se escreve aqui');
  /* Os campos eram <input type="number">, que só aceita ponto decimal:
     quem digitava "1.234,56" — como está na planilha do setor — via o
     campo recusar em silêncio e o contrato ser salvo SEM VALOR. */
  await pg.evaluate(()=>{ fecharDet(); fecharHist(); fecharForm(); });
  const formatos=[['1234.56',1234.56], ['1234,56',1234.56], ['1.234,56',1234.56],
                  ['1,234.56',1234.56], ['1.234',1234], ['R$ 76.800,00',76800],
                  ['-50,25',-50.25], ['',null]];
  const lidos=await pg.evaluate((fs)=>fs.map(([txt])=>{
    document.getElementById('fcValor').value=txt;
    const v=lerValor('fcValor');
    return (typeof v==='number' && isNaN(v)) ? 'NaN' : v;
  }), formatos);
  formatos.forEach(([txt, esperado], i)=>{
    t('valor "'+txt+'" vira '+esperado, lidos[i]===esperado, {txt, esperado, veio:lidos[i]});
  });
  t('e texto sem número nenhum é recusado, não salvo como vazio',
    await pg.evaluate(()=>{ document.getElementById('fcValor').value='abc';
      const v=lerValor('fcValor'); return typeof v==='number' && isNaN(v); }));

  /* de ponta a ponta: cadastrar digitando à brasileira */
  const gravou=await pg.evaluate(async ()=>{
    novoContrato();
    document.getElementById('fcContr').value='9998';
    document.getElementById('fcAno').value='2026';
    document.getElementById('fcEmpresa').value='TESTE DO VALOR';
    document.getElementById('fcVencimento').value='2027-01-01';
    document.getElementById('fcValor').value='1.234,56';
    await salvarForm();
    await new Promise(r=>setTimeout(r,350));
    const c=CONTRATOS.find(x=>x.contr===9998&&x.ano===2026);
    return {valor:c&&c.valor, noBanco:c&&window.__STORE.contratos[String(c.id)].valor};
  });
  t('cadastrar com "1.234,56" salva 1234,56 mesmo', gravou.valor===1234.56, gravou);
  t('e é isso que vai para o banco', gravou.noBanco===1234.56, gravou);
  const reabre=await pg.evaluate(()=>{
    const c=CONTRATOS.find(x=>x.contr===9998&&x.ano===2026);
    abrirForm(c.id); const v=document.getElementById('fcValor').value; fecharForm(); return v;
  });
  t('e ao reabrir o formulário o valor aparece formatado', reabre==='1.234,56', reabre);

  console.log('\n18) "Limpar filtros" limpa mesmo');
  /* Limpava reaplicando os filtros de abertura: os dois chips continuavam
     na tela e quem clicou concluía que o botão não fazia nada — e quem
     procurava um contrato fora do recorte não achava nem depois de limpar. */
  await pg.evaluate(()=>{ fecharDet(); fecharHist(); });
  await pg.evaluate(()=>{ document.getElementById('fBusca').value=''; limparFiltros(); });
  await pg.waitForTimeout(200);
  const limpo=await pg.evaluate(()=>({
    chips: document.getElementById('chipsAtivos').textContent.trim(),
    linhas: filtrados.length,
    total: CONTRATOS.length
  }));
  t('depois de limpar não sobra nenhum chip de filtro', limpo.chips==='', limpo);
  t('e a lista passa a mostrar o cadastro inteiro', limpo.linhas===limpo.total, limpo);

  /* a tela ABRE no recorte de sempre — limpar é outra coisa */
  const pgAbre=await b.newPage({viewport:{width:1280,height:900}});
  await abrirContratos(pgAbre, 'editar');
  await comTudo(pgAbre);
  const abertura=await pgAbre.evaluate(()=>({
    chips: document.getElementById('chipsAtivos').textContent,
    ordem: document.getElementById('fSort').value,
    primeiro: filtrados[0] && {contr:filtrados[0].contr, ano:filtrados[0].ano},
    soDoAno: filtrados.every(c=>c.ano===new Date().getFullYear())
  }));
  /* Quem chega de manhã quer ver o que entrou desde ontem: contratos do ano,
     do último número para trás. */
  t('a tela abre nos contratos do ano corrente',
    new RegExp('Ano do contrato: '+new Date().getFullYear()).test(abertura.chips) && abertura.soDoAno, abertura);
  t('e do último cadastrado para trás', abertura.ordem==='num-desc', abertura);
  t('o primeiro da lista é o maior número do ano', abertura.primeiro
    && abertura.primeiro.ano===new Date().getFullYear(), abertura.primeiro);

  /* buscar algo que existe fora do recorte não pode responder "não achei" e parar */
  const fora=await pgAbre.evaluate(()=>{
    const alvo=CONTRATOS.find(c=>!filtrados.includes(c) && c.empresa && c.empresa.length>8);
    document.getElementById('fBusca').removeAttribute('readonly');
    document.getElementById('fBusca').value=alvo.empresa;
    aplicarFiltros();
    return {empresa:alvo.empresa, achou:filtrados.length, aviso:document.getElementById('vazio').textContent};
  });
  if(fora.achou===0){
    t('quando a busca só falha por causa do filtro, a tela diz e oferece ver',
      /fora dos filtros atuais/.test(fora.aviso) && /ver assim mesmo/.test(fora.aviso), fora.aviso.slice(0,140));
    await pgAbre.evaluate(()=>limparSoFiltros());
    await pgAbre.waitForTimeout(150);
    const depois=await pgAbre.evaluate(()=>({achou:filtrados.length,
      busca:document.getElementById('fBusca').value}));
    t('e "ver assim mesmo" mantém a busca digitada', depois.achou>0 && depois.busca===fora.empresa, depois);
  } else {
    t('busca fora do recorte encontrou direto (nada a avisar)', true);
  }

  /* ── Digitar na busca abre o recorte, porque o campo diz "em tudo" ──
     A tela abre só com os contratos do ano. Quem procura uma empresa de
     2019 ali digita, recebe "nenhum contrato" e conclui que não existe —
     mas existe, está fora do recorte. */
  const pgB=await b.newPage({viewport:{width:1280,height:900}});
  await abrirContratos(pgB, 'editar');
  await comTudo(pgB);
  const antesDeBuscar=await pgB.evaluate(()=>({
    chips:document.getElementById('chipsAtivos').textContent,
    linhas:filtrados.length, total:CONTRATOS.length
  }));
  t('a tela abre recortada (é o comportamento de sempre)',
    antesDeBuscar.chips!=='' && antesDeBuscar.linhas<antesDeBuscar.total, antesDeBuscar);

  const velho=await pgB.evaluate(()=>{
    const c=CONTRATOS.find(x=>!filtrados.includes(x) && x.empresa && x.empresa.length>8);
    return {empresa:c.empresa, ano:c.ano};
  });
  await pgB.click('#fBusca');
  await pgB.fill('#fBusca', velho.empresa);
  await pgB.waitForTimeout(300);
  const buscou=await pgB.evaluate(()=>({
    chips:document.getElementById('chipsAtivos').textContent,
    achou:filtrados.length,
    busca:document.getElementById('fBusca').value,
    anos:[...new Set(filtrados.map(c=>c.ano))].length,
    aviso:document.getElementById('toast').textContent
  }));
  t('digitar na busca abre os filtros e acha o contrato antigo',
    buscou.achou>0 && buscou.chips==='', buscou);
  t('sem apagar o que foi digitado', buscou.busca===velho.empresa, buscou);
  t('e a tela avisa que abriu, em vez de mudar sozinha e calada',
    /Filtros abertos/.test(buscou.aviso), buscou.aviso);

  /* Mas só a PRIMEIRA letra abre: quem filtra depois de buscar está
     cruzando as duas coisas de propósito, e o filtro tem de ficar. */
  await pgB.evaluate(()=>{ COLF.sit.sel.sit=new Set(['Vigente']); aplicarFiltros(); });
  await pgB.fill('#fBusca', velho.empresa+' x');
  await pgB.waitForTimeout(250);
  t('continuar digitando não desfaz um filtro posto depois da busca',
    await pgB.evaluate(()=>COLF.sit.sel.sit.size===1));

  /* Apagar a busca e recomeçar volta a abrir. */
  await pgB.fill('#fBusca', '');
  await pgB.waitForTimeout(200);
  await pgB.fill('#fBusca', velho.empresa);
  await pgB.waitForTimeout(300);
  t('e recomeçar uma busca do zero abre de novo',
    await pgB.evaluate(()=>COLF.sit.sel.sit.size===0));

  console.log('\n19) O gerenciador de senhas não tem onde despejar a senha');
  /* O Chrome ignora autocomplete="off" e chegou a preencher o campo de
     busca com a senha salva, porque o formulário de login continuava no
     documento — escondido, mas de pé — depois de a pessoa entrar. */
  const senhas=await pg.evaluate(()=>({
    loginDesabilitado: ['authEmail','authPass','authPassC','authPass2']
      .every(id=>{ const e=document.getElementById(id); return e && e.disabled; }),
    loginVazio: ['authEmail','authPass','authPassC','authPass2']
      .every(id=>document.getElementById(id).value===''),
  }));
  t('os campos de login ficam desabilitados depois de entrar', senhas.loginDesabilitado, senhas);
  t('e vazios', senhas.loginVazio, senhas);
  t('a busca nasce readonly, que é o que o Chrome respeita', buscaNasceReadonly);
  /* readonly não pode virar um campo que não se digita */
  await pg.evaluate(()=>{ fecharDet(); fecharHist(); });   /* uma ficha ficou aberta acima */
  await pg.click('#fBusca');
  await pg.evaluate(()=>{ document.getElementById('fBusca').value=''; });
  await pg.type('#fBusca', 'medianeira');
  await pg.waitForTimeout(250);
  const digitou=await pg.evaluate(()=>({
    valor: document.getElementById('fBusca').value,
    readonly: document.getElementById('fBusca').hasAttribute('readonly')
  }));
  t('mas ao clicar o campo volta a aceitar texto',
    digitou.valor==='medianeira' && !digitou.readonly, digitou);
  await pg.evaluate(()=>{ document.getElementById('fBusca').value=''; aplicarFiltros(); });

  console.log('\n20) Quem já está logado não vê o login piscar na abertura');
  const piscou=await pg.evaluate(()=>window.__LOGIN_APARECEU);
  t('o formulário de login não aparece para quem já entrou', !piscou, {piscou});
  t('o portão abre num aviso neutro, não no formulário',
    /id="authCarregando"/.test(html) && /Verificando seu acesso/.test(html));
  t('e o formulário nasce escondido',
    /id="authEntradaBox" style="display:none"/.test(html));

  console.log('\nerros JS:', errs.length||errsPdf.length?[...errs,...errsPdf]:'nenhum');
  console.log(`\n${ok} passaram, ${mau} falharam.`);
  await b.close();
})();
