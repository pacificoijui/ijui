/* O módulo de contratos tinha os 1.264 registros embutidos numa única linha
   de 724 KB dentro do index.html: 850 KB baixados a cada visita, e corrigir
   um contrato era editar o código-fonte.

   Agora a lista vem de dados/contratos.json (ou do Firestore próprio dos
   contratos, quando FIREBASE_CONFIG estiver preenchido). Este teste confere
   que a tela continua fazendo exatamente o que fazia: filtros, painel,
   contagens e a ficha do contrato. */
const {chromium, executablePath} = require('./navegador');
const fs=require('fs');
let ok=0,mau=0;
function t(n,c,e){ if(c){console.log('  ✓',n);ok++;} else {console.log('  ✗',n,e!==undefined?'\n       '+JSON.stringify(e):'');mau++;process.exitCode=1;} }

(async()=>{
  console.log('1) Os dados saíram do HTML e viraram arquivo');
  const html=fs.readFileSync('../contratos/index.html','utf8');
  const json=fs.readFileSync('../contratos/dados/contratos.json','utf8');
  const dados=JSON.parse(json);
  t('o index.html encolheu para menos de 150 KB', html.length<150*1024, {kb:Math.round(html.length/1024)});
  /* A única linha longa que sobra é o brasão em base64, que é imagem e não
     dado — o que não pode voltar é contrato dentro do HTML. */
  t('nenhum contrato ficou embutido no HTML', html.indexOf('"contr":')<0 && html.indexOf('MEDIANEIRA')<0);
  t('a única linha longa que sobrou é o brasão em base64',
    html.split('\n').filter(l=>l.length>5000).every(l=>l.indexOf('data:image/png;base64')>=0),
    html.split('\n').filter(l=>l.length>5000).map(l=>l.slice(0,60)));
  t('o arquivo tem os 1.264 contratos', dados.length===1264, dados.length);
  t('todo contrato tem id numérico', dados.every(c=>typeof c.id==='number'), dados.filter(c=>typeof c.id!=='number').slice(0,3));
  t('os ids não se repetem', new Set(dados.map(c=>c.id)).size===dados.length);
  t('o JSON é uma linha por contrato (diff legível)', json.split('\n').length===dados.length+3, json.split('\n').length);
  t('o config do Firebase começa vazio, e é dos contratos',
    /const FIREBASE_CONFIG = \{\};/.test(html) && /projeto SEPARADO do das licitações/.test(html));
  t('o módulo não fala com o Firestore das licitações',
    html.indexOf('processos-ijui')<0 && html.indexOf('licitacoes')<0);

  const b=await chromium.launch(executablePath?{executablePath}:{});
  const pg=await b.newPage({viewport:{width:1280,height:900}});
  const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
  await pg.route('**/cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:'window.jspdf={jsPDF:function(){}};'}));
  await pg.goto('http://127.0.0.1:8099/contratos/index.html',{waitUntil:'networkidle'});
  await pg.waitForTimeout(600);

  console.log('\n2) A tela carrega a lista de fora e monta tudo');
  const est=await pg.evaluate(()=>({
    total:CONTRATOS.length, fonte:FONTE_DADOS,
    comData:CONTRATOS.filter(c=>c._d!==undefined).length,
    chip:(document.querySelector('.proto-chip')||{}).textContent,
    linhas:document.querySelectorAll('.tab tbody tr').length,
  }));
  t('os 1.264 contratos chegaram na página', est.total===1264, est);
  t('a fonte é o arquivo local (sem Firebase configurado)', est.fonte==='arquivo', est);
  t('o vencimento foi pré-processado em todos', est.comData===1264, est);
  t('a tarja do cabeçalho diz de onde vieram', /1264 CONTRATOS · ARQUIVO LOCAL/.test(est.chip||''), est.chip);
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
  t('todas as colunas têm o próprio menu de filtro',
    forma.filtrosColuna.join('|')==='num|emp|obj|sec|tipo|fis|sit|venc|valor', forma.filtrosColuna);

  console.log('\n3) A busca única procura em qualquer informação');
  const ativos=await pg.evaluate(()=>filtrados.length);
  t('a tela abre nos 436 contratos que ainda valem', ativos===436, ativos);

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
  t('limpar os filtros zera a busca e volta aos ativos', todos.n===436 && todos.busca==='', todos);

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
    mTipo.contagens.reduce((a,x)=>a+x,0)===436, mTipo.contagens);

  const marcar = (col, valor) => pg.evaluate(([c,v])=>{
    document.querySelector('.cf[data-col="'+c+'"]').click();          /* garante aberto */
    if(!document.getElementById('popFiltro').classList.contains('open')) document.querySelector('.cf[data-col="'+c+'"]').click();
    const alvo=[...document.querySelectorAll('#popLista .pop-op:not(.todos)')].find(o=>o.querySelector('.op-txt').textContent===v);
    alvo.querySelector('input').click();
    return {n:filtrados.length, botao:document.querySelector('.cf[data-col="'+c+'"] .cf-txt').textContent,
            aceso:document.querySelector('.cf[data-col="'+c+'"]').classList.contains('ativo'),
            chips:document.getElementById('chipsAtivos').textContent.trim()};
  }, [col, valor]);

  await pg.evaluate(()=>{ fecharPop(); limparFiltros(); });
  const soObra=await marcar('tipo','OBRA');
  const conferObra=await pg.evaluate(()=>filtrados.every(c=>c.tipo==='OBRA'));
  t('marcar OBRA deixa só as obras', soObra.n>0 && conferObra, soObra);
  t('o botão da coluna passa a mostrar a escolha', soObra.botao==='OBRA' && soObra.aceso, soObra);
  t('a escolha vira chip', /Tipo: OBRA/.test(soObra.chips), soObra.chips);

  const duasSecs=await pg.evaluate(()=>{
    fecharPop(); limparFiltros();
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
    fecharPop(); limparFiltros();
    document.querySelector('.cf[data-col="obj"]').click();
    document.getElementById('popBusca').value='pavimenta';
    popDigitou();
    return {n:filtrados.length, todas:filtrados.every(c=>c.objeto.toLowerCase().includes('pavimenta')),
            chips:document.getElementById('chipsAtivos').textContent.trim()};
  });
  t('digitar no menu da coluna filtra por aquela coluna', digitado.n>0 && digitado.todas, digitado);
  t('o texto digitado também vira chip', /Objeto: pavimenta/.test(digitado.chips), digitado.chips);

  const faixa=await pg.evaluate(()=>{
    fecharPop(); limparFiltros();
    document.querySelector('.cf[data-col="valor"]').click();
    [...document.querySelectorAll('#popLista .pop-op:not(.todos)')]
      .find(o=>/Acima de R\$ 5/.test(o.querySelector('.op-txt').textContent)).querySelector('input').click();
    return {n:filtrados.length, todas:filtrados.every(c=>c.valor>5e6)};
  });
  t('Valor filtra por faixa, não por texto', faixa.n>0 && faixa.todas, faixa);

  const prazo=await pg.evaluate(()=>{
    fecharPop(); limparFiltros();
    document.querySelector('.cf[data-col="venc"]').click();
    [...document.querySelectorAll('#popLista .pop-op:not(.todos)')]
      .find(o=>o.querySelector('.op-txt').textContent==='Vencidos').querySelector('input').click();
    return {n:filtrados.length, todos:filtrados.every(c=>c._d!==null && c._d<0),
            grupos:[...document.querySelectorAll('#popLista .pop-grupo')].map(g=>g.textContent)};
  });
  t('Vencimento filtra por prazo', prazo.n>0 && prazo.todos, prazo);
  t('e ainda oferece o ano do vencimento em outro grupo',
    prazo.grupos.join('|')==='Prazo|Ano do vencimento', prazo.grupos);

  const contagemViva=await pg.evaluate(()=>{
    fecharPop(); limparFiltros();
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
  t('limpar filtros apaga os menus de coluna', limpou.acesos.join('|')==='sit', limpou);
  t('e volta aos 436 (a situação padrão continua marcada)', limpou.n===436, limpou);
  t('o chip que sobra é o da situação padrão', /Situação/.test(limpou.chips), limpou.chips);

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
  await pg.evaluate(()=>{ fecharPop(); limparFiltros(); });

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
  await pgp.route('**/cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:jspdf}));
  await pgp.goto('http://127.0.0.1:8099/contratos/index.html',{waitUntil:'networkidle'});
  await pgp.waitForTimeout(800);
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
  await cel.route('**/cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:'window.jspdf={jsPDF:function(){}};'}));
  await cel.goto('http://127.0.0.1:8099/contratos/index.html',{waitUntil:'networkidle'});
  await cel.waitForTimeout(700);
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
  t('o botão de fechar diz quantos contratos ficaram', /Ver 436 contratos/.test(folha.ver), folha.ver);

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

  console.log('\nerros JS:', errs.length||errsPdf.length?[...errs,...errsPdf]:'nenhum');
  console.log(`\n${ok} passaram, ${mau} falharam.`);
  await b.close();
})();
