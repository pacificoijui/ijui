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
    html.indexOf('"credor":')<0 && html.length<130*1024, {kb:Math.round(html.length/1024)});

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
  function seedCom(nivel){
    return {
      requisicoes: seedReqs,
      usuarios_v2: {'g-pedro':{email:'pedrohhpacifico@gmail.com', nome:'Pedro Pacífico', status:'aprovado',
                               isAdmin:false, provedor:'google.com',
                               acessos:{agenda:'nenhum', pregoeiro:'nenhum', contratos:'nenhum', requisicao:nivel}}}
    };
  }
  const b=await chromium.launch(executablePath?{executablePath}:{});
  async function abrir(nivel, corpoJspdf, esperarLista){
    const ctx=await b.newContext({viewport:{width:1440,height:950}, acceptDownloads:true});
    const pg=await ctx.newPage();
    const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
    await pg.route('**/firebasejs/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:stub}));
    await pg.route('**/cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:corpoJspdf||'window.jspdf={jsPDF:function(){}};'}));
    await pg.route('**/fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
    await pg.addInitScript(sd=>{ window.__SEED=sd; }, seedCom(nivel));
    await pg.addInitScript(u=>{ window.__AUTH_SEED=u; }, {uid:'g-pedro', email:'pedrohhpacifico@gmail.com', displayName:'Pedro Pacífico', photoURL:''});
    /* vigia o piscar do formulário de login, como nos Contratos */
    await pg.addInitScript(()=>{
      window.__LOGIN_APARECEU=false;
      setInterval(()=>{ const e=document.getElementById('authEntradaBox');
        if(e && getComputedStyle(e).display!=='none' && e.offsetParent!==null) window.__LOGIN_APARECEU=true; }, 15);
    });
    await pg.goto('http://127.0.0.1:8099/requisicao/index.html',{waitUntil:'networkidle'});
    if(esperarLista!==false)
      await pg.waitForFunction(()=>typeof REQS!=='undefined'&&REQS.length>1000,null,{timeout:30000});
    else await pg.waitForTimeout(900);
    await pg.evaluate(()=>{ window.confirm=()=>true; window.alert=m=>{(window.__A=window.__A||[]).push(m);}; });
    return {pg, ctx, errs};
  }
  const {pg, errs} = await abrir('editar', jspdf);
  t('quem já entrou não vê o formulário de login piscar',
    !(await pg.evaluate(()=>window.__LOGIN_APARECEU)));
  t('e a tela mostra o NOME de quem entrou, não o e-mail',
    /Pedro Pacífico/.test(await pg.textContent('#authUserChip')),
    await pg.textContent('#authUserChip'));

  console.log('\n2) A faixa das secretarias, que é a aba da planilha');
  const faixa=await pg.evaluate(()=>({
    botoes:[...document.querySelectorAll('.sec-btn')].map(e=>e.textContent.replace(/\s+/g,' ').trim()),
    primeiro:document.querySelector('.sec-btn').classList.contains('on')
  }));
  t('tem um botão por secretaria, mais "Todas"', faixa.botoes.length===SECS.length+1, faixa.botoes.length);
  t('cada botão diz quantas requisições traz', faixa.botoes.every(b=>/\d+$/.test(b)), faixa.botoes.slice(0,3));
  t('a tela abre em "Todas"', faixa.primeiro, faixa.botoes[0]);

  const sms=await pg.evaluate(()=>{ escolherSecretaria('SMS'); return {
    n:filtrados.length, todosSMS:filtrados.every(r=>r.sec==='SMS'),
    marcado:[...document.querySelectorAll('.sec-btn')].find(e=>e.classList.contains('on')).textContent.trim().split(/\s+/)[0],
    chips:document.getElementById('chipsAtivos').textContent.trim()
  }; });
  t('clicar numa secretaria mostra só as dela', sms.todosSMS && sms.n>0, sms);
  t('e o botão fica marcado', sms.marcado.startsWith('SMS'), sms);
  t('com chip para voltar a todas', /SMS/.test(sms.chips), sms.chips);

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
  t('nada de rascunho de navegador sobrou',
    !/requisicoes_ijui_rascunho/.test(html) && !/localStorage/.test(html));

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

  console.log('\n6) Busca, ficha e PDFs');
  await pg.evaluate(()=>{ limparFiltros();
    const e=document.getElementById('fBusca'); e.removeAttribute('readonly');
    e.value='banrisul combustivel'; aplicarFiltros(); });
  await pg.waitForTimeout(150);
  const busca=await pg.evaluate(()=>({n:filtrados.length,
    todos:filtrados.every(r=>/banrisul/i.test(r.credor) && /combust/i.test(r.objeto))}));
  t('a busca sem acento acha em credor e objeto ao mesmo tempo', busca.n>0 && busca.todos, busca);

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

  console.log('\n8) O Diretor: despacha a modalidade, e só');
  /* "somente quem eu poder marcar como o diretor vai poder alterar, e o
     diretor nao vai poder mexer em nenhum campo da planilha, somente
     naquele." É literalmente isto que esta seção confere. */
  const dir=await abrir('diretor', jspdf);
  await dir.pg.evaluate(()=>{ escolherSecretaria('SMS'); });
  await dir.pg.waitForTimeout(200);
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
      naTela:document.querySelector('td[data-id="'+id+'"][data-campo="despacho"]').textContent.trim()
    })), alvo);
  t('o despacho grava a modalidade escolhida',
    despachou.doc.despacho==='Dispensa por limite', despachou.doc);
  t('assinado por quem despachou', despachou.doc.despachoPor==='Pedro Pacífico', despachou.doc);
  t('com a data do despacho', /^\d{4}-\d{2}-\d{2}/.test(despachou.doc.despachoEm||''), despachou.doc);
  t('e aparece na linha na hora', /Dispensa por limite/.test(despachou.naTela), despachou.naTela);
  t('num clique só — despacho é decisão, não formulário',
    await dir.pg.evaluate(()=>!document.getElementById('despPop').classList.contains('open')));

  /* Despachou errado: dá para tirar, e só aí a opção aparece. */
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
  const ver=await abrir('ver');
  const soOlha=await ver.pg.evaluate(()=>({
    chip:document.getElementById('authUserChip').textContent,
    travadas:[...document.querySelector('.tab tbody tr').querySelectorAll('td[data-campo]')]
      .every(td=>td.classList.contains('travada') && !td.getAttribute('onclick')),
    botao:getComputedStyle(document.querySelector('.header-actions .so-editor')).display,
    linhas:filtrados.length
  }));
  t('ele enxerga o cadastro inteiro', soOlha.linhas>1000, soOlha.linhas);
  t('a tela avisa que o acesso é de leitura', /só visualização/.test(soOlha.chip), soOlha.chip);
  t('nenhuma célula abre para ele — nem a do despacho', soOlha.travadas, soOlha);
  t('e não há botão de lançar requisição', soOlha.botao==='none', soOlha);
  t('sem erro de JavaScript na tela de leitura', ver.errs.length===0, ver.errs);

  console.log('\n10) Sem o painel liberado, a lista não chega ao navegador');
  const fora=await abrir('nenhum', null, false);
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
