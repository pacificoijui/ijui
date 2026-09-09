/* A tela de Requisições (/requisicao/) é a planilha REQUISIÇÕES numa página
   só: uma aba por secretaria virou a faixa do alto, que filtra a lista E diz
   em nome de quem a próxima requisição nasce.

   Protótipo: sem banco e sem contas, o que se salva fica no navegador. Este
   teste confere o que a tela promete — a faixa, o próximo número de cada
   secretaria, os filtros, o total em reais, os PDFs — e que a conversão da
   planilha não inventou nem perdeu nada. */
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

  const jspdf=fs.readFileSync('node_modules/jspdf/dist/jspdf.umd.min.js','utf8');
  const b=await chromium.launch(executablePath?{executablePath}:{});
  const ctx=await b.newContext({viewport:{width:1440,height:950}, acceptDownloads:true});
  const pg=await ctx.newPage();
  const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
  await pg.route('**/cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:jspdf}));
  await pg.route('**/fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await pg.goto('http://127.0.0.1:8099/requisicao/index.html',{waitUntil:'networkidle'});
  await pg.waitForFunction(()=>typeof REQS!=='undefined'&&REQS.length>1000,null,{timeout:30000});
  await pg.evaluate(()=>{ window.confirm=()=>true; window.alert=m=>{(window.__A=window.__A||[]).push(m);}; });

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

  console.log('\n3) Lançar: a secretaria escolhida e o próximo número dela');
  const form=await pg.evaluate(()=>{ novaRequisicao(); return {
    sec:document.getElementById('frSec').value,
    num:Number(document.getElementById('frNum').value),
    ano:Number(document.getElementById('frAno').value),
    maiorSMS:Math.max(...REQS.filter(r=>r.sec==='SMS'&&r.ano===new Date().getFullYear()&&r.num!=null).map(r=>r.num))
  }; });
  t('o formulário já vem com a secretaria escolhida', form.sec==='SMS', form);
  t('e com o próximo número DELA, não do cadastro inteiro',
    form.num===form.maiorSMS+1, form);
  const trocou=await pg.evaluate(()=>{
    const s=document.getElementById('frSec'); s.value='SMEL';
    s.dispatchEvent(new Event('change',{bubbles:true}));
    return {num:Number(document.getElementById('frNum').value),
            maiorSMEL:Math.max(...REQS.filter(r=>r.sec==='SMEL'&&r.ano===new Date().getFullYear()&&r.num!=null).map(r=>r.num))};
  });
  t('trocar de secretaria no formulário reoferece o número dela',
    trocou.num===trocou.maiorSMEL+1, trocou);

  const gravou=await pg.evaluate(()=>{
    document.getElementById('frSec').value='SMEL';
    document.getElementById('frCredor').value='FORNECEDOR DE TESTE';
    document.getElementById('frObjeto').value='OBJETO DE TESTE';
    document.getElementById('frValor').value='1.234,56';
    document.getElementById('frModalidade').value='PE 1/2026';
    salvarForm();
    const r=REQS.find(x=>x.credor==='FORNECEDOR DE TESTE');
    return {achou:!!r, valor:r&&r.valor, sec:r&&r.sec,
            rascunho:Object.keys(JSON.parse(localStorage.getItem('requisicoes_ijui_rascunho')||'{}')).length,
            aviso:document.getElementById('avisoRascunho').textContent};
  });
  t('salvar cadastra a requisição', gravou.achou && gravou.sec==='SMEL', gravou);
  t('com o valor lido à brasileira', gravou.valor===1234.56, gravou);
  t('e fica guardada neste navegador, com aviso na tela',
    gravou.rascunho===1 && /só neste navegador/.test(gravou.aviso), gravou);

  console.log('\n4) A conta que se faz na mão: o total do que está na tela');
  const total=await pg.evaluate(()=>{
    limparFiltros(); escolherSecretaria('GP');
    const soma=filtrados.reduce((s,r)=>s+(r.valor||0),0);
    return {texto:document.getElementById('resultCount').textContent, soma:soma, n:filtrados.length};
  });
  t('o total em reais aparece ao lado da contagem',
    total.texto.includes(total.n.toString()) && /total/.test(total.texto), total.texto);
  t('e é a soma do que está filtrado',
    total.texto.includes(new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(total.soma)),
    total.texto);

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
  console.log(`\n${ok} passaram, ${mau} falharam.`);
  await b.close();
})();
