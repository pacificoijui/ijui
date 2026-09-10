/* A tela de Requisições (/requisicao/) é a planilha REQUISIÇÕES numa página
   só: uma aba por secretaria virou a faixa do alto, que filtra a lista E diz
   em nome de quem a próxima requisição nasce.

   As requisições ficam no Firestore, atrás do mesmo portão de acesso dos
   Contratos. Este teste confere o que a tela promete — a faixa, o próximo
   número de cada secretaria, os filtros, os PDFs —, que a conversão da
   planilha não inventou nem perdeu nada, e a coluna DIRETOR: quem preenche
   não despacha, quem despacha não preenche, e quem só olha não faz nem uma
   coisa nem outra.

   A trava de verdade são as regras do Firestore (testes/t-regras.mjs, com o
   emulador). Aqui é a tela: o que ela deixa clicar, o que ela tranca e o
   que ela grava. */
const {chromium, executablePath} = require('./navegador');
const fs=require('fs');
let ok=0,mau=0;
function t(n,c,e){ if(c){console.log('  ✓',n);ok++;} else {console.log('  ✗',n,e!==undefined?'\n       '+JSON.stringify(e):'');mau++;process.exitCode=1;} }

(async()=>{
  console.log('1) O arquivo gerado da planilha');
  const html=fs.readFileSync('../requisicao/index.html','utf8');
  const dados=JSON.parse(fs.readFileSync('../requisicao/dados/requisicoes.json','utf8'));
  const REQS=dados.requisicoes, SECS=dados.secretarias;
  t('tem as 16 secretarias da planilha', SECS.length===16, SECS.length);
  t('e mais de três mil requisições', REQS.length>3000, REQS.length);
  t('toda requisição pertence a uma secretaria que existe',
    REQS.every(r=>SECS.some(s=>s.sigla===r.sec)),
    REQS.filter(r=>!SECS.some(s=>s.sigla===r.sec)).slice(0,3));
  t('os ids não se repetem', new Set(REQS.map(r=>r.id)).size===REQS.length);
  t('as datas estão em ISO (aaaa-mm-dd) ou vazias',
    REQS.every(r=>['recebido','contabilidade'].every(k=>!r[k]||/^\d{4}-\d{2}-\d{2}$/.test(r[k]))),
    REQS.filter(r=>r.recebido&&!/^\d{4}-\d{2}-\d{2}$/.test(r.recebido)).slice(0,3));
  t('valor é número ou vazio — nunca texto',
    REQS.every(r=>r.valor===null||typeof r.valor==='number'),
    REQS.filter(r=>r.valor!==null&&typeof r.valor!=='number').slice(0,3));
  /* O Excel lia "7/2026" como mês/ano; o mês é o número da requisição. */
  t('nenhum número de requisição ficou como data',
    REQS.every(r=>!/^\d{4}-\d{2}-\d{2}/.test(String(r.rotulo))),
    REQS.filter(r=>/^\d{4}-/.test(String(r.rotulo))).slice(0,3));
  /* Um traço sozinho na planilha quer dizer "não tem". */
  t('traço solitário virou vazio, não virou texto "-"',
    REQS.every(r=>['credor','empenho','modalidade','objeto'].every(k=>r[k]!=='-')),
    REQS.filter(r=>r.empenho==='-').slice(0,3));
  t('a página não carrega as requisições embutidas no HTML',
    html.indexOf('"credor":')<0 && html.length<150*1024, {kb:Math.round(html.length/1024)});

  t('a página não carrega as requisições sem passar pelo portão',
    /iniciarListenerRequisicoes/.test(html) && !/^carregarTudo\(\);/m.test(html));
  t('e aponta para o mesmo projeto do resto do sistema',
    /projectId: "processos-ijui"/.test(html) && /usuarios_v2/.test(html));

  /* Daqui pra frente a tela roda como em produção: Firestore e Firebase Auth
     falsos (fbstub3.js), a coleção "requisicoes" semeada com o mesmo arquivo
     versionado, e uma conta já logada no nível que o teste quiser. */
  const jspdf=fs.readFileSync('node_modules/jspdf/dist/jspdf.umd.min.js','utf8');
  const stub=fs.readFileSync('fbstub3.js','utf8');
  const seedReqs={}; REQS.forEach(r => { seedReqs[String(r.id)]=r; });
  /* As 3.6 mil vieram da planilha e são histórico. A fila do Diretor só
     existe com requisições nascidas NO SISTEMA — as que têm "criadaEm". */
  const hoje = new Date().toISOString().slice(0,10);
  /* Em SMS, que é a secretaria que os testes abrem — a tela lê uma por vez,
     e uma requisição de outra aba não estaria carregada. */
  const NASCIDAS = REQS.filter(r => r.sec==='SMS').slice(0, 4).map(r => r.id);
  NASCIDAS.forEach((id, i) => {
    /* Recém-nascida é, por definição, recente: entra no recorte de abertura.
       A primeira fica SEM data de recebimento, que é como uma requisição
       nasce de verdade — e é o caso que só a consulta dos nulos alcança. */
    seedReqs[String(id)] = Object.assign({}, seedReqs[String(id)],
      {criadaEm:new Date().toISOString(), recebido: i===0 ? null : hoje,
       ano:new Date().getFullYear(), despacho:'', despachoPor:'', despachoEm:''});
  });
  function seedCom(nivel){
    return {
      requisicoes: seedReqs,
      usuarios_v2: {'g-pedro':{email:'pedrohhpacifico@gmail.com', nome:'Pedro Pacífico', status:'aprovado',
                               isAdmin:false, provedor:'google.com',
                               acessos:{agenda:'nenhum', pregoeiro:'nenhum', contratos:'nenhum', requisicao:nivel}}}
    };
  }
  const b=await chromium.launch(executablePath?{executablePath}:{});
  async function abrir(nivel, corpoJspdf, secretaria){
    const ctx=await b.newContext({viewport:{width:1440,height:950}, acceptDownloads:true});
    const pg=await ctx.newPage();
    const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
    await pg.route('**/firebasejs/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:stub}));
    await pg.route('**/cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:corpoJspdf||'window.jspdf={jsPDF:function(){}};'}));
    await pg.route('**/fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
    await pg.addInitScript(sd=>{ window.__SEED=sd; }, seedCom(nivel));
    await pg.addInitScript(u=>{ window.__AUTH_SEED=u; }, {uid:'g-pedro', email:'pedrohhpacifico@gmail.com', displayName:'Pedro Pacífico', photoURL:''});
    /* A tela lê UMA secretaria por vez e lembra a última neste navegador.
       Semear a lembrança é o que faz o teste abrir já dentro de uma, como
       acontece a partir da segunda visita de qualquer pessoa. */
    if(secretaria) await pg.addInitScript(sig=>{
      try{ localStorage.setItem('requisicoes_ijui_secretaria', sig); }catch(e){}
    }, secretaria);
    /* vigia o piscar do formulário de login, como nos Contratos */
    await pg.addInitScript(()=>{
      window.__LOGIN_APARECEU=false;
      setInterval(()=>{ const e=document.getElementById('authEntradaBox');
        if(e && getComputedStyle(e).display!=='none' && e.offsetParent!==null) window.__LOGIN_APARECEU=true; }, 15);
    });
    await pg.goto('http://127.0.0.1:8099/requisicao/index.html',{waitUntil:'networkidle'});
    if(secretaria)
      await pg.waitForFunction(sig=>typeof REQS!=='undefined'&&SEC_ATUAL===sig&&REQS.length>0,
        secretaria,{timeout:30000});
    else await pg.waitForTimeout(900);
    await pg.evaluate(()=>{ window.confirm=()=>true; window.alert=m=>{(window.__A=window.__A||[]).push(m);}; });
    return {pg, ctx, errs};
  }
  const {pg, errs} = await abrir('editar', jspdf, 'SMS');

  console.log('\n1b) A tela lê uma secretaria por vez, não o cadastro inteiro');
  /* Com cinco anos de cadastro seriam 20 mil documentos lidos toda vez que
     alguém aperta F5 — e o preço cresceria sozinho: quem abrisse a tela em
     2030 pagaria por 2026. Agora o custo é o tamanho da secretaria de quem
     está olhando, e para de crescer com o arquivo. */
  const recorte=await pg.evaluate(()=>({
    sec:SEC_ATUAL, leu:REQS.length,
    noBanco:Object.keys(window.__STORE.requisicoes).length,
    todasDaSec:REQS.every(r=>r.sec===SEC_ATUAL),
    chip:document.getElementById('chipTotal').textContent
  }));
  t('abre dentro de uma secretaria', recorte.sec==='SMS', recorte);
  t('e lê do banco só o tamanho dela',
    recorte.leu>0 && recorte.leu < recorte.noBanco/3, {leu:recorte.leu, tem:recorte.noBanco});
  t('nenhuma requisição de outra secretaria veio junto', recorte.todasDaSec, recorte);
  t('o chip do topo diz de qual secretaria são as que estão na tela',
    /EM SMS/.test(recorte.chip), recorte.chip);

  /* Sem "Todas": era a única leitura que custava o cadastro inteiro, e é
     justamente a que ninguém precisa para trabalhar. */
  const semTodas=await pg.evaluate(()=>({
    botoes:[...document.querySelectorAll('.sec-btn')].map(e=>e.textContent.trim()),
    comNumero:[...document.querySelectorAll('.sec-btn .sec-n')].length
  }));
  t('a faixa não oferece mais "Todas"', !semTodas.botoes.some(b=>/^Todas/.test(b)), semTodas.botoes.slice(0,3));
  /* Contagem só na carregada: nas outras seria invenção, porque não foram
     lidas. */
  t('e só a secretaria carregada mostra contagem', semTodas.comNumero===1, semTodas);

  console.log('\n1c) Trocar de secretaria é outra consulta, do tamanho dela');
  await pg.evaluate(()=>escolherSecretaria('SMA'));
  await pg.waitForFunction(()=>SEC_ATUAL==='SMA'&&REQS.length>0,null,{timeout:15000});
  const trocou=await pg.evaluate(()=>({
    sec:SEC_ATUAL, leu:REQS.length, todasDaSec:REQS.every(r=>r.sec==='SMA'),
    lembrou:localStorage.getItem('requisicoes_ijui_secretaria')
  }));
  t('trocar de secretaria troca o que veio do banco',
    trocou.sec==='SMA' && trocou.todasDaSec && trocou.leu<100, trocou);
  t('e a secretaria pequena custa pouco', trocou.leu < recorte.leu/5, {SMA:trocou.leu, SMS:recorte.leu});
  /* Lembrar poupa a pergunta a cada visita, e é só isso: se o navegador
     esquecer, a tela pede de novo. */
  t('a tela lembra a secretaria de quem usa, neste navegador', trocou.lembrou==='SMA', trocou);

  /* Voltar para uma secretaria já aberta é de graça: a consulta continuou
     ouvindo, então a lista está na mão E chegou atualizada. Fechar e
     reabrir seria pagar de novo pelos mesmos documentos. */
  const volta=await pg.evaluate(()=>{
    const antes=[...ABERTAS.keys()].length;
    escolherSecretaria('SMS');                 /* sem await: tem de ser síncrono */
    return {consultasAntes:antes, consultasDepois:[...ABERTAS.keys()].length,
            sec:SEC_ATUAL, n:REQS.length, abertas:[...ABERTAS.keys()]};
  });
  t('voltar a uma secretaria já aberta é instantâneo — sem esperar o banco',
    volta.sec==='SMS' && volta.n>100, volta);
  t('e sem consulta nova: não se paga duas vezes pelos mesmos documentos',
    volta.consultasDepois===volta.consultasAntes && volta.abertas.length===2, volta);
  await pg.waitForFunction(()=>SEC_ATUAL==='SMS'&&REQS.length>100,null,{timeout:15000});

  console.log('\n1d) A busca global saiu — procurar é procurar numa coluna');
  t('não há mais barra de "pesquisar em tudo"',
    !/id="fBusca"/.test(html) && !/Pesquisar em tudo/.test(html));
  t('nem a maquinaria dela sobrando no código',
    !/passaBusca/.test(html) && !/buscarEmTudo/.test(html) && !/F\.busca/.test(html));
  t('e a secretaria não vira chip com ✕ — ela não é filtro de tela',
    !(await pg.evaluate(()=>/SMS/.test(document.getElementById('chipsAtivos').textContent))));

  t('quem já entrou não vê o formulário de login piscar',
    !(await pg.evaluate(()=>window.__LOGIN_APARECEU)));
  t('e a tela mostra o NOME de quem entrou, não o e-mail',
    /Pedro Pacífico/.test(await pg.textContent('#authUserChip')),
    await pg.textContent('#authUserChip'));

  console.log('\n2) A faixa das secretarias, que é a aba da planilha');
  const faixa=await pg.evaluate(()=>({
    botoes:[...document.querySelectorAll('.sec-btn')].map(e=>e.textContent.replace(/\s+/g,' ').trim()),
    marcado:[...document.querySelectorAll('.sec-btn')].find(e=>e.classList.contains('on')).textContent.trim()
  }));
  t('tem um botão por secretaria', faixa.botoes.length===SECS.length, faixa.botoes.length);
  t('e a que está carregada fica marcada', faixa.marcado.startsWith('SMS'), faixa.marcado);
  /* A faixa deixou de ser filtro de tela e virou o RECORTE que veio do
     banco — é a diferença entre esconder linhas e não as ler. */
  const sms=await pg.evaluate(()=>({
    n:filtrados.length, todosSMS:filtrados.every(r=>r.sec==='SMS'),
    naMemoria:REQS.every(r=>r.sec==='SMS')
  }));
  t('a tela mostra só as da secretaria escolhida', sms.todosSMS && sms.n>0, sms);
  t('e as outras nem estão na memória — não foram lidas', sms.naMemoria, sms);

  console.log('\n3) Lançar na própria tabela, sem abrir formulário');
  /* A requisição não nasce pronta: chega, recebe data, depois objeto, depois
     empenho, depois vai para a contabilidade. O lançamento é uma linha nova
     no alto e cada etapa é um clique duplo na coluna certa. */
  t('não existe mais formulário de cadastro', !/id="ovForm"/.test(html));
  const nova=await pg.evaluate(()=>{
    novaRequisicao();
    const tr=document.querySelector('.tab tbody tr');
    const td=document.querySelector('td.editando');
    const r=REQS.find(x=>x._nova);
    return {primeiraDaLista: Number(tr.dataset.id)===r.id,
            destacada: tr.classList.contains('linha-nova'),
            sec:r.sec, num:r.num, campoAberto: td && td.dataset.campo,
            maiorSMS: Math.max(...REQS.filter(x=>x.sec==='SMS'&&x.ano===new Date().getFullYear()&&x.num!=null&&!x._nova).map(x=>x.num))};
  });
  t('a linha nova entra no alto da tabela', nova.primeiraDaLista && nova.destacada, nova);
  t('já na secretaria escolhida na faixa', nova.sec==='SMS', nova);
  t('e com o próximo número DELA, não do cadastro inteiro', nova.num===nova.maiorSMS+1, nova);
  t('com a célula da data já aberta para digitar', nova.campoAberto==='recebido', nova);

  await pg.fill('td.editando .cel-inp', '2026-09-10');
  await pg.keyboard.press('Tab'); await pg.waitForTimeout(250);
  t('Tab salva e anda para a próxima coluna',
    (await pg.evaluate(()=>REQS.find(r=>r._nova).recebido))==='2026-09-10');
  t('e a coluna seguinte é o credor',
    (await pg.evaluate(()=>document.querySelector('td.editando').dataset.campo))==='credor');

  await pg.keyboard.type('FORNECEDOR DE TESTE');
  await pg.keyboard.press('Tab'); await pg.waitForTimeout(200);
  await pg.keyboard.type('OBJETO DE TESTE');
  await pg.keyboard.press('Enter'); await pg.waitForTimeout(250);
  const andou=await pg.evaluate(()=>{
    const r=REQS.find(x=>x._nova);
    return {credor:r.credor, objeto:r.objeto, empenho:r.empenho,
            naTela:document.querySelector('tr[data-id="'+r.id+'"]').textContent};
  });
  t('a requisição vai se preenchendo campo a campo',
    andou.credor==='FORNECEDOR DE TESTE' && andou.objeto==='OBJETO DE TESTE', andou);
  t('e enquanto não tem empenho, a linha diz isso', /falta empenhar/.test(andou.naTela), andou.naTela.slice(0,90));
  t('o credor entra em maiúsculas, como o resto do cadastro', andou.credor===andou.credor.toUpperCase());

  /* Etapa seguinte, dias depois: o empenho chega. */
  const idNova=await pg.evaluate(()=>REQS.find(r=>r._nova).id);
  await pg.click('td[data-id="'+idNova+'"][data-campo="empenho"]');
  await pg.waitForTimeout(250);
  await pg.keyboard.type('4999 (GABI)');
  await pg.keyboard.press('Enter'); await pg.waitForTimeout(250);
  const empenhou=await pg.evaluate(id=>({
    valor:REQS.find(r=>r.id===id).empenho,
    naTela:document.querySelector('td[data-id="'+id+'"][data-campo="empenho"]').textContent.trim()
  }), idNova);
  t('um clique na célula preenche a etapa seguinte',
    empenhou.valor==='4999 (GABI)' && empenhou.naTela==='4999 (GABI)', empenhou);

  /* Esc desiste sem estragar o que estava lá. */
  await pg.click('td[data-id="'+idNova+'"][data-campo="credor"]');
  await pg.waitForTimeout(250);
  await pg.keyboard.type('LIXO QUE NAO PODE SALVAR');
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(250);
  const escapou=await pg.evaluate(id=>({credor:REQS.find(r=>r.id===id).credor,
    fichaAberta:document.getElementById('ovDet').classList.contains('open')}), idNova);
  t('Esc desiste da edição sem gravar', escapou.credor==='FORNECEDOR DE TESTE', escapou);
  t('e Esc na célula não fecha mais nada por tabela', !escapou.fichaAberta, escapou);

  console.log('\n3b) A célula abre com um clique, e não se fecha sozinha');
  /* A moldura azul que seguia o mouse cansava a vista e não dizia nada que
     o cursor de texto já não diga. */
  t('não há moldura de hover em toda célula', !/td\[data-campo\]:hover/.test(html));
  t('e a célula abre com um clique, não com dois',
    /livre \? ' onclick="editarCelula\(this\)"'/.test(html), html.indexOf('editarCelula'));

  /* Antes bastava o foco deixar o campo: clicar na borda da própria célula
     fechava a edição no meio do preenchimento. */
  await pg.click('td[data-id="'+idNova+'"][data-campo="credor"]');
  await pg.waitForTimeout(200);
  await pg.evaluate(()=>{ const td=document.querySelector('td.editando');
    const r=td.getBoundingClientRect();
    td.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,clientX:r.left+1,clientY:r.top+1})); });
  await pg.waitForTimeout(200);
  t('clicar na borda da célula não fecha a edição',
    await pg.evaluate(()=>!!document.querySelector('td.editando')));

  /* Clicar direto noutra célula salva esta e abre aquela, num clique só. */
  await pg.evaluate(()=>{ document.querySelector('td.editando .cel-inp').value='CREDOR TROCADO'; });
  await pg.click('td[data-id="'+idNova+'"][data-campo="modalidade"]');
  await pg.waitForTimeout(300);
  const pulou=await pg.evaluate(id=>({
    credor:REQS.find(r=>r.id===id).credor,
    abertoAgora:(document.querySelector('td.editando')||{dataset:{}}).dataset.campo
  }), idNova);
  t('clicar noutra célula salva esta e abre aquela', pulou.credor==='CREDOR TROCADO', pulou);
  t('num clique só, sem precisar clicar duas vezes', pulou.abertoAgora==='modalidade', pulou);
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(150);

  console.log('\n3c) O número da requisição abre num painel, não espremido na coluna');
  /* São quatro coisas — secretaria, nº, ano e complemento — e a coluna tem
     pouco mais de cem pixels: espremidos ali viravam "34…" e "20…". */
  await pg.click('td[data-id="'+idNova+'"][data-campo="num"]');
  await pg.waitForTimeout(250);
  const painel=await pg.evaluate(()=>{
    const p=document.getElementById('celPop'), r=p.getBoundingClientRect();
    return {aberto:p.classList.contains('open'), largura:Math.round(r.width),
      campos:[...p.querySelectorAll('[data-parte]')].map(e=>e.dataset.parte),
      larguraNum:Math.round(p.querySelector('[data-parte="num"]').getBoundingClientRect().width),
      colunaNum:Math.round(document.querySelector('td[data-campo="num"]').getBoundingClientRect().width),
      dentroDaTela:r.left>=0 && r.right<=window.innerWidth};
  });
  t('abre um painel com os quatro campos',
    painel.aberto && painel.campos.join('|')==='sec|num|ano|sufixo', painel);
  t('mais largo que a coluna, e dentro da tela',
    painel.largura>painel.colunaNum && painel.dentroDaTela, painel);
  t('com o campo do número em tamanho de digitar', painel.larguraNum>80, painel);
  await pg.click('#celPop [data-parte="ano"]');
  await pg.waitForTimeout(150);
  t('clicar de um campo para outro dentro do painel não fecha',
    await pg.evaluate(()=>document.getElementById('celPop').classList.contains('open')));
  await pg.fill('#celPop [data-parte="num"]','777');
  await pg.click('.cel-pop-ok');
  await pg.waitForTimeout(300);
  const salvouNum=await pg.evaluate(id=>({num:REQS.find(r=>r.id===id).num,
    rotulo:REQS.find(r=>r.id===id).rotulo,
    fechou:!document.getElementById('celPop').classList.contains('open')}), idNova);
  t('e o "Pronto" grava o número novo', salvouNum.num===777 && /777\/20/.test(salvouNum.rotulo), salvouNum);
  t('fechando o painel junto', salvouNum.fechou, salvouNum);

  console.log('\n3d) O que se digita vai para o banco, não para o navegador');
  const gravado=await pg.evaluate(id=>
    firebase.firestore().collection('requisicoes').doc(String(id)).get()
      .then(d=>({existe:d.exists, dado:d.exists?d.data():null})), idNova);
  t('a requisição nova está no Firestore, não num rascunho local',
    gravado.existe && gravado.dado.credor==='CREDOR TROCADO' && gravado.dado.num===777, gravado);
  /* "_nova" e o índice da busca são estado de tela: gravados, a linha
     nasceria fixada no topo e furando todo filtro, a cada visita. */
  t('e o documento guarda só os campos de verdade',
    !('_nova' in gravado.dado) && !('_txt' in gravado.dado) && !('_gravada' in gravado.dado),
    Object.keys(gravado.dado));
  /* O rascunho de navegador acabou: o que se digita vai para o banco. O
     único localStorage que sobrou guarda qual secretaria esta pessoa abriu
     por último — conveniência de navegação, não cadastro. */
  t('nada de rascunho de navegador sobrou',
    !/requisicoes_ijui_rascunho/.test(html)
    && (html.match(/localStorage/g)||[]).every((_,i,a)=>a.length<=4),
    (html.match(/localStorage/g)||[]).length);

  /* Gravar campo a campo é o que faz a trava do despacho funcionar: as
     regras olham QUAIS chaves mudaram. Regravar o documento inteiro faria
     uma gravação legítima esbarrar num campo que a pessoa nem viu. */
  t('a tela grava por campo, não o documento inteiro',
    /docReq\(r\.id\)\.update\(soCampos\(r, camposGravados\(campo\)\)\)/.test(html));
  t('e o despacho leva junto quem assinou e quando',
    /CAMPOS_DO_DESPACHO = \['despacho','despachoPor','despachoEm'\]/.test(html));

  console.log('\n3e) A coluna DIRETOR: o despacho é de quem despacha');
  /* Quem preenche a requisição não escolhe a modalidade da contratação —
     isso é decisão do Diretor, e a coluna é só dele. */
  const trancada=await pg.evaluate(()=>{
    const td=document.querySelector('td.c-desp');
    return {trancada:td.classList.contains('travada'), temClique:!!td.getAttribute('onclick'),
            dica:td.getAttribute('title')||'', texto:td.textContent.trim()};
  });
  t('para quem preenche, a célula do despacho é de leitura',
    trancada.trancada && !trancada.temClique, trancada);
  t('e diz por quê, em vez de só não responder', /Diretor/.test(trancada.dica), trancada.dica);
  await pg.click('td[data-id="'+idNova+'"][data-campo="despacho"]').catch(()=>{});
  await pg.waitForTimeout(200);
  t('clicar nela não abre editor nenhum',
    await pg.evaluate(()=>!document.querySelector('td.editando')));
  const semDespacho=await pg.evaluate(id=>{
    const td=document.querySelector('td[data-id="'+id+'"][data-campo="despacho"]');
    editarCelula(td);   /* na marra, pelo console */
    return {abriu:!!document.querySelector('td.editando'), podeMexer:podeMexer('despacho')};
  }, idNova);
  t('nem chamando editarCelula por fora', !semDespacho.abriu && !semDespacho.podeMexer, semDespacho);

  console.log('\n4) A busca de cada coluna procura no que a coluna mostra');
  /* A coluna Empenho é agrupada em "Empenhada / Falta empenhar". Quem
     digitava o NÚMERO do empenho ali recebia "nada para filtrar aqui" — a
     busca procurava nos rótulos das opções, não no conteúdo da coluna. */
  const porColuna=await pg.evaluate(()=>{
    const ex = REQS.find(r=>r.empenho && r.credor && r.modalidade && !r._nova);
    const casos = [['emp', ex.empenho], ['cred', ex.credor], ['mod', ex.modalidade], ['num', ex.rotulo]];
    return casos.map(([col, termo])=>{
      limparFiltros();
      abrirFiltroCol({stopPropagation(){}, currentTarget:document.querySelector('.cf[data-col="'+col+'"]')}, col);
      document.getElementById('popBusca').value = termo;
      renderPop(); aplicarFiltros();
      return {col, termo, n:filtrados.length,
              aviso:(document.querySelector('.pop-achou')||{}).textContent||'',
              todosBatem: filtrados.every(r=>String(TEXTO_COL[col](r)).toUpperCase().includes(termo.toUpperCase()))};
    });
  });
  porColuna.forEach(c=>{
    t('busca na coluna '+c.col+' acha “'+c.termo+'”', c.n>0 && c.todosBatem, c);
  });
  t('e o menu diz quantas achou, em vez de "nada para filtrar aqui"',
    porColuna.every(c=>/requisi/.test(c.aviso)), porColuna.map(c=>c.aviso));
  const numEmp=await pg.evaluate(()=>{
    limparFiltros();
    const alvo=REQS.find(r=>r.empenho && !r._nova).empenho;
    COLF.emp.sel.nEmp=new Set([alvo]); aplicarFiltros();
    return {alvo, n:filtrados.length, todos:filtrados.every(r=>r.empenho===alvo)};
  });
  t('dá para marcar um número de empenho na lista de opções',
    numEmp.n>0 && numEmp.todos, numEmp);

  t('o total em reais saiu de cima da tabela',
    !/total <b>/.test(await pg.evaluate(()=>document.getElementById('resultCount').innerHTML)));

  console.log('\n5) Falta empenhar: a coluna vazia da planilha, à vista');
  const emp=await pg.evaluate(()=>{
    limparFiltros();
    const semEmpenho=REQS.filter(r=>!r.empenho).length;
    COLF.emp.sel.sit=new Set(['Falta empenhar']); aplicarFiltros();
    return {filtrado:filtrados.length, esperado:semEmpenho,
            todosSem:filtrados.every(r=>!r.empenho),
            badge:document.querySelector('.badge-falta') ? document.querySelector('.badge-falta').textContent : ''};
  });
  t('dá para filtrar só as que faltam empenhar',
    emp.filtrado===emp.esperado && emp.todosSem, emp);
  t('e a linha diz isso em português', /falta empenhar/.test(emp.badge), emp.badge);

  console.log('\n6) Procurar numa coluna, ficha e PDFs');
  /* Sem a barra de "pesquisar em tudo", procurar é procurar na coluna — e
     ela continua achando sem acento. */
  const busca=await pg.evaluate(()=>{
    limparFiltros();
    const alvo=REQS.find(r=>/[ÁÉÍÓÚÂÊÔÃÕÇ]/.test(r.objeto||'')) || REQS.find(r=>r.objeto);
    const semAcento=alvo.objeto.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().slice(0,14);
    COLF.obj.txt=semAcento; aplicarFiltros();
    return {termo:semAcento, n:filtrados.length,
      todos:filtrados.every(r=>normalizar(r.objeto).includes(normalizar(semAcento)))};
  });
  t('a busca da coluna acha sem acento', busca.n>0 && busca.todos, busca);
  await pg.evaluate(()=>limparFiltros());
  await pg.waitForTimeout(150);

  await pg.evaluate(()=>abrirDet(filtrados[0].id));
  await pg.waitForTimeout(150);
  const ficha=await pg.evaluate(()=>({aberta:document.getElementById('ovDet').classList.contains('open'),
    titulo:document.getElementById('detTitle').textContent,
    corpo:document.getElementById('detBody').textContent}));
  t('a ficha abre com o número da requisição', ficha.aberta && /Requisição nº/.test(ficha.titulo), ficha.titulo);
  t('e mostra a secretaria por extenso', /Secretaria/.test(ficha.corpo), ficha.corpo.slice(0,80));

  const [dl1]=await Promise.all([pg.waitForEvent('download',{timeout:25000}).catch(()=>null),
                                 pg.evaluate(()=>pdfRequisicaoAtual())]);
  t('a ficha sai em PDF', !!dl1 && /^requisicao_/.test(dl1.suggestedFilename()), dl1&&dl1.suggestedFilename());
  await pg.evaluate(()=>{ fecharDet(); limparFiltros(); escolherSecretaria('SMH'); });
  const [dl2]=await Promise.all([pg.waitForEvent('download',{timeout:25000}).catch(()=>null),
                                 pg.evaluate(()=>pdfDoFiltro())]);
  t('e a lista filtrada também', !!dl2 && /^requisicoes_SMH/.test(dl2.suggestedFilename()), dl2&&dl2.suggestedFilename());

  console.log('\n7) No celular a página não estoura para os lados');
  await pg.setViewportSize({width:390,height:840});
  await pg.waitForTimeout(300);
  const cel=await pg.evaluate(()=>({larg:document.documentElement.scrollWidth, tela:window.innerWidth,
    faixaRola:document.getElementById('secFaixa').scrollWidth>document.getElementById('secFaixa').clientWidth}));
  t('a página cabe na largura do celular', cel.larg<=cel.tela+1, cel);
  t('e a faixa de secretarias rola de lado em vez de quebrar', cel.faixaRola, cel);

  console.log('\nerros JS:', errs.length?errs:'nenhum');
  t('nenhum erro de JavaScript', errs.length===0, errs);

  console.log('\n7b) O que veio da planilha não pede despacho');
  /* As 3.617 requisições da migração já foram contratadas antes de a coluna
     existir. Oferecer "despachar" nelas encheria a tela de um convite para
     decidir o que já foi decidido — e esconderia, no meio de milhares, as
     poucas que de fato esperam. */
  await pg.setViewportSize({width:1440,height:950});
  await pg.evaluate(()=>{ escolherSecretaria('SMS'); limparFiltros(); });
  await pg.waitForFunction(()=>SEC_ATUAL==='SMS'&&REQS.length>100,null,{timeout:15000});
  const estados=await pg.evaluate(()=>({
    daPlanilha:REQS.filter(r=>!r.criadaEm && !r.despacho).length,
    aguardando:REQS.filter(aguardaDespacho).length,
    celulaHistorica:(()=>{
      const r=REQS.find(x=>!x.criadaEm && !x.despacho);
      return celDespacho(r);
    })(),
    celulaNova:(()=>{
      const r=REQS.find(x=>x.criadaEm && !x.despacho);
      return r ? celDespacho(r) : '';
    })()
  }));
  t('quase tudo veio da planilha e fica quieto', estados.daPlanilha>500, estados.daPlanilha);
  t('a célula do histórico é um traço — sem convite e sem cadeado',
    /cel-vazia/.test(estados.celulaHistorica) && !/despachar|aguardando/.test(estados.celulaHistorica),
    estados.celulaHistorica);
  /* 4 semeadas em SMS + a que a seção 3 lançou nesta mesma tela. */
  t('e só as nascidas no sistema pedem decisão',
    estados.aguardando>=4 && /despachar|aguardando/.test(estados.celulaNova), estados);
  const facetas=await pg.evaluate(()=>{
    limparFiltros();
    abrirFiltroCol({stopPropagation(){}, currentTarget:document.querySelector('.cf[data-col="desp"]')}, 'desp');
    return [...document.querySelectorAll('#popLista .op-txt')].map(e=>e.textContent.trim());
  });
  t('e o filtro da coluna separa os três estados',
    facetas.some(x=>/Aguardando despacho/.test(x)) && facetas.some(x=>/Veio da planilha/.test(x)),
    facetas.slice(0,9));
  await pg.evaluate(()=>{ fecharPop(); limparFiltros(); });

  console.log('\n8) O Diretor: despacha a modalidade, e só');
  /* "somente quem eu poder marcar como o diretor vai poder alterar, e o
     diretor nao vai poder mexer em nenhum campo da planilha, somente
     naquele." É literalmente isto que esta seção confere. */
  const dir=await abrir('diretor', jspdf);
  /* Ele não trabalha DENTRO de uma secretaria: trabalha entre elas. A tela
     abre na fila — o que aguarda despacho, de todas —, senão ele teria de
     procurar as poucas pendentes no meio de 3,6 mil já contratadas. */
  const fila=await dir.pg.evaluate(()=>({
    sec:SEC_ATUAL, mostrando:filtrados.length,
    todasAguardam:filtrados.every(aguardaDespacho),
    secretariasNaTela:[...new Set(filtrados.map(r=>r.sec))].length,
    chip:document.getElementById('chipTotal').textContent,
    chips:document.getElementById('chipsAtivos').textContent,
    temX:!!document.querySelector('#chipsAtivos .chip-x')
  }));
  t('o Diretor abre na fila dele, não no cadastro inteiro',
    fila.mostrando>0 && fila.todasAguardam && fila.mostrando<100, fila);
  t('de todas as secretarias, não de uma', fila.sec==='', fila);
  t('e o chip do topo conta a fila, não o tamanho do cadastro',
    /AGUARDANDO DESPACHO/.test(fila.chip), fila.chip);
  /* Sugestão de abertura, não cela: o filtro aparece nos chips, com o ✕. */
  t('o filtro fica à vista e dá para tirar',
    /Aguardando despacho/.test(fila.chips) && fila.temX, fila);

  const papel=await dir.pg.evaluate(()=>({
    chip:document.getElementById('authUserChip').textContent,
    dica:document.getElementById('dicaEdicao').textContent,
    botaoNova:getComputedStyle(document.querySelector('.header-actions .so-editor')).display,
    despacha:reqPodeDespachar(), preenche:reqPodeEditar()
  }));
  t('a tela diz, ao lado do nome, que ele é o Diretor', / · diretor/.test(papel.chip), papel.chip);
  t('e o convite é para despachar, não para lançar', /DIRETOR/.test(papel.dica), papel.dica);
  t('o botão de nova requisição não aparece para ele', papel.botaoNova==='none', papel);
  t('ele despacha e não preenche', papel.despacha && !papel.preenche, papel);

  const celulas=await dir.pg.evaluate(()=>{
    const tr=document.querySelector('.tab tbody tr');
    const r={};
    tr.querySelectorAll('td[data-campo]').forEach(td=>{
      r[td.dataset.campo]={travada:td.classList.contains('travada'), clique:!!td.getAttribute('onclick')};
    });
    return r;
  });
  t('a coluna do despacho é a única aberta para ele',
    celulas.despacho.clique && !celulas.despacho.travada
    && Object.keys(celulas).filter(k=>k!=='despacho').every(k=>celulas[k].travada && !celulas[k].clique),
    celulas);

  const alvo=await dir.pg.evaluate(()=>filtrados[0].id);
  await dir.pg.click('td[data-id="'+alvo+'"][data-campo="despacho"]');
  await dir.pg.waitForTimeout(250);
  /* Seis opções não cabem espremidas numa coluna de 130px: "Dispensa por
     justificativa" virava "— sem despach". Abre num painel ancorado. */
  const pop=await dir.pg.evaluate(()=>{
    const p=document.getElementById('despPop'), r=p.getBoundingClientRect();
    const c=document.querySelector('td.editando').getBoundingClientRect();
    return {aberto:p.classList.contains('open'),
      opcoes:[...p.querySelectorAll('.desp-op')].map(b=>b.dataset.v),
      maisLargo:r.width>c.width, dentroDaTela:r.left>=0 && r.right<=window.innerWidth};
  });
  t('e abre exatamente as seis modalidades que o Diretor pode assinar',
    pop.aberto && pop.opcoes.join('|')==='Pregão|Concorrência|Dispensa por limite|Dispensa por justificativa|Inexigibilidade|Ata de Registro de Preços',
    pop);
  t('num painel mais largo que a coluna, e dentro da tela',
    pop.maisLargo && pop.dentroDaTela, pop);
  t('sem despacho ainda, não há o que tirar', pop.opcoes.indexOf('')<0, pop.opcoes);

  await dir.pg.click('.desp-op[data-v="Dispensa por limite"]');
  await dir.pg.waitForTimeout(400);
  const despachou=await dir.pg.evaluate(id=>
    firebase.firestore().collection('requisicoes').doc(String(id)).get().then(d=>({
      doc:d.data(),
      aindaNaFila:filtrados.some(r=>r.id===id),
      fila:filtrados.length
    })), alvo);
  t('o despacho grava a modalidade escolhida',
    despachou.doc.despacho==='Dispensa por limite', despachou.doc);
  t('assinado por quem despachou', despachou.doc.despachoPor==='Pedro Pacífico', despachou.doc);
  t('com a data do despacho', /^\d{4}-\d{2}-\d{2}/.test(despachou.doc.despachoEm||''), despachou.doc);
  /* Fila é fila: despachou, saiu. É o que faz o Diretor sempre olhar para
     o que falta, sem ter de lembrar onde parou. */
  t('e a requisição sai da fila assim que é despachada',
    !despachou.aindaNaFila && despachou.fila===fila.mostrando-1, despachou);
  t('num clique só — despacho é decisão, não formulário',
    await dir.pg.evaluate(()=>!document.getElementById('despPop').classList.contains('open')));

  /* Despachou errado: dá para tirar, e só aí a opção aparece. */
  /* Ela saiu da fila; para reabri-la, o filtro da própria modalidade — que
     é como o Diretor reveria um despacho que deu errado. */
  await dir.pg.evaluate(()=>{
    limparFiltros();
    COLF.desp.sel.desp = new Set(['Dispensa por limite']);
    aplicarFiltros();
  });
  await dir.pg.waitForTimeout(250);
  await dir.pg.click('td[data-id="'+alvo+'"][data-campo="despacho"]');
  await dir.pg.waitForTimeout(250);
  const comLimpar=await dir.pg.evaluate(()=>({
    tem:!!document.querySelector('.desp-op.limpar'),
    marcada:(document.querySelector('.desp-op.on')||{dataset:{}}).dataset.v
  }));
  t('reabrindo, a modalidade escolhida vem marcada', comLimpar.marcada==='Dispensa por limite', comLimpar);
  t('e agora dá para tirar o despacho, se foi errado', comLimpar.tem, comLimpar);
  await dir.pg.keyboard.press('Escape');
  await dir.pg.waitForTimeout(200);
  t('Esc desiste sem mexer no que já estava despachado',
    (await dir.pg.evaluate(id=>REQS.find(r=>r.id===id).despacho, alvo))==='Dispensa por limite');

  const naMarra=await dir.pg.evaluate(id=>{
    const td=document.querySelector('td[data-id="'+id+'"][data-campo="credor"]');
    editarCelula(td);
    return {abriu:!!document.querySelector('td.editando'), podeCredor:podeMexer('credor')};
  }, alvo);
  t('mas ele não abre o credor nem chamando editarCelula por fora',
    !naMarra.abriu && !naMarra.podeCredor, naMarra);
  /* A consulta do Diretor é a fila, e só ela: as 3,6 mil que vieram da
     planilha já foram contratadas antes de a coluna existir e não esperam
     decisão de ninguém — então nem chegam a ser lidas. É a economia e a
     clareza pelo mesmo gesto. */
  const filaSo=await dir.pg.evaluate(()=>({
    leu:REQS.length,
    noBanco:Object.keys(window.__STORE.requisicoes).length,
    todasNascidas:REQS.every(r=>!!r.criadaEm),
    secretarias:[...new Set(REQS.map(r=>r.sec))].length
  }));
  t('a fila do Diretor lê só as nascidas no sistema, não o cadastro',
    filaSo.todasNascidas && filaSo.leu < filaSo.noBanco/50, filaSo);
  t('e atravessa as secretarias, que é o trabalho dele', filaSo.secretarias>=1, filaSo);
  t('e a coluna DIRETOR também filtra e sai no relatório',
    /{k:'desp', t:'Despacho do Diretor'/.test(html) && /{t:'Diretor',    w:\d+/.test(html));
  /* Larguras medidas, não chutadas: apertar a coluna de olho produz
     "04/09/202 / 6" e "Inexigibilidad / e", que foi o que aconteceu quando
     o Diretor entrou no meio da tabela. */
  const larguras=await dir.pg.evaluate(()=>{
    const doc=new window.jspdf.jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
    doc.setFont('helvetica','normal'); doc.setFontSize(PDF_FS);
    const w=n=>COLS.find(c=>c.t===n).w;
    return {soma:COLS.reduce((t,c)=>t+c.w,0), cw:CW,
      data:doc.getTextWidth('04/09/2026'), receb:w('Recebida'), contab:w('P/ contab.'),
      inex:doc.getTextWidth('Inexigibilidade'), desp:w('Diretor'),
      vermelha:COLS.findIndex(c=>c.vermelhoSeVazio), empenho:COLS.findIndex(c=>c.t==='Empenho')};
  });
  t('as colunas do relatório somam a largura da página, sem sobra nem falta',
    larguras.soma===larguras.cw, larguras);
  t('a data cabe inteira nas duas colunas de data',
    larguras.data+4.5<=larguras.receb && larguras.data+4.5<=larguras.contab, larguras);
  t('e "Inexigibilidade", que não tem onde quebrar, cabe na do Diretor',
    larguras.inex+4.5<=larguras.desp, larguras);
  /* O vermelho de "falta empenhar" era pintado por índice fixo: com o
     Diretor no meio da tabela, passou a colorir a Modalidade. */
  t('o vermelho de "falta empenhar" segue a coluna Empenho, não uma posição',
    larguras.vermelha===larguras.empenho && larguras.vermelha>=0, larguras);
  t('sem erro de JavaScript na tela do Diretor', dir.errs.length===0, dir.errs);

  console.log('\n9) Quem só visualiza não mexe em nada');
  const ver=await abrir('ver', null, 'SMS');
  const soOlha=await ver.pg.evaluate(()=>({
    chip:document.getElementById('authUserChip').textContent,
    travadas:[...document.querySelector('.tab tbody tr').querySelectorAll('td[data-campo]')]
      .every(td=>td.classList.contains('travada') && !td.getAttribute('onclick')),
    botao:getComputedStyle(document.querySelector('.header-actions .so-editor')).display,
    linhas:filtrados.length
  }));
  t('ele abre na mesma secretaria de todo mundo', soOlha.linhas>0, soOlha.linhas);
  /* Ler é o que ele PODE fazer: o recorte é economia, não permissão. */
  await ver.pg.evaluate(()=>escolherSecretaria('SMDS'));
  await ver.pg.waitForFunction(()=>SEC_ATUAL==='SMDS'&&REQS.length>0,null,{timeout:15000});
  t('e alcança qualquer secretaria trocando na faixa — o recorte é economia, não trava',
    await ver.pg.evaluate(()=>REQS.length>100 && REQS.every(r=>r.sec==='SMDS')));
  t('a tela avisa que o acesso é de leitura', /só visualização/.test(soOlha.chip), soOlha.chip);
  t('nenhuma célula abre para ele — nem a do despacho', soOlha.travadas, soOlha);
  t('e não há botão de lançar requisição', soOlha.botao==='none', soOlha);
  t('sem erro de JavaScript na tela de leitura', ver.errs.length===0, ver.errs);

  console.log('\n10) Sem o painel liberado, a lista não chega ao navegador');
  const fora=await abrir('nenhum');
  const barrado=await fora.pg.evaluate(()=>({
    portao:getComputedStyle(document.getElementById('authGate')).display,
    pendente:getComputedStyle(document.getElementById('authPendenteCard')).display,
    recado:document.getElementById('authPendMsg').textContent,
    lista:REQS.length
  })).catch(()=>({erro:true}));
  t('o portão fica fechado', barrado.portao!=='none' && barrado.pendente!=='none', barrado);
  t('com o recado de pedir liberação a um administrador',
    /administrador/.test(barrado.recado||''), barrado.recado);
  t('e nenhuma requisição foi carregada', barrado.lista===0, barrado.lista);

  console.log(`\n${ok} passaram, ${mau} falharam.`);
  await b.close();
})();
