/* Pedido: no cabeçalho do PDF (Decisão e Pedido de Diligência), tirar tudo
   que não é o título — número do processo, data/pregoeiro e "ASSUNTO:" —
   e ir direto pro corpo do texto. Essas informações continuam existindo nos
   dados do processo (aparecem no corpo, no fecho e nos cards da lista); só
   pararam de ser repetidas no alto da página. */
const {chromium, executablePath} = require('./navegador');
const fs=require('fs');
const stub=fs.readFileSync('fbstub3.js','utf8');
const jspdf=fs.readFileSync('node_modules/jspdf/dist/jspdf.umd.min.js','utf8');
let ok=0,mau=0;
function t(n,c,e){ if(c){console.log('  ✓',n);ok++;} else {console.log('  ✗',n,e!==undefined?'\n       '+JSON.stringify(e):'');mau++;process.exitCode=1;} }

(async()=>{
  const b=await chromium.launch(executablePath?{executablePath}:{});
  const pg=await b.newPage({viewport:{width:1200,height:900}});
  const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
  await pg.route('**/firebasejs/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:r.request().url().includes('firestore')?stub:'/*noop*/'}));
  await pg.route('**/fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await pg.route('**/cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:jspdf}));
  await pg.addInitScript(()=>localStorage.setItem('copam_auth',JSON.stringify({u:'teste',nome:'QA'})));
  await pg.goto('http://127.0.0.1:8099/pregoeiro/index.html',{waitUntil:'networkidle'});
  await pg.waitForTimeout(700);

  const espiar=(fn, dados, texto)=>pg.evaluate(([f,d,t2])=>{
    const Orig=window.jspdf.jsPDF; const reg=[];
    window.jspdf.jsPDF=function(...a){
      const doc=new Orig(...a);
      const oT=doc.text.bind(doc);
      doc.text=function(tx,x,y,o){
        const ls=Array.isArray(tx)?tx:[tx];
        ls.forEach(l=>{ if(typeof l==='string') reg.push(l); });
        return oT(tx,x,y,o);
      };
      doc.save=function(){};
      return doc;
    };
    window[f](Object.assign({texto:t2}, d));
    window.jspdf.jsPDF=Orig;
    return reg;
  },[fn,dados,texto]);

  const TEXTO='I. DO OBJETO DA DILIGÊNCIA\n\nTrata-se do Pregão Eletrônico nº 103/2026, Lote 1 — Prestação de serviços em Ginásios Municipais, no qual a empresa **SERVIMAX LTDA**, CNPJ 62.499.573/0001-87, apresentou o menor lance.';

  console.log('\n1) Pedido de Diligência: só o título, sem PE, sem data/pregoeiro, sem ASSUNTO');
  const dil=await espiar('dilGerarPDF', {
    numero:31, ano:'2026', dataDiligencia:'2026-08-27', agente:'LUCILDA',
    titulo:'SERVIMAX LTDA', processoNumero:'PE 103/2026'
  }, TEXTO);
  t('o título "Pedido de Diligência 031/2026" está lá', dil.some(x=>/Pedido de Diligência\s+031\/2026/.test(x)), dil.slice(0,6));
  t('o número do processo (PE 103/2026) NÃO aparece sozinho no cabeçalho', !dil.slice(0,4).some(x=>/^PE 103\/2026$/.test(x.trim())), dil.slice(0,6));
  /* só olha o cabeçalho (antes do corpo começar) — "Ijui/RS," no FECHO,
     junto da assinatura, é esperado e correto */
  const iCorpo0=dil.findIndex(x=>/DO OBJETO DA DILIG/.test(x));
  t('a linha de data/pregoeiro (Ijui/RS, ...) sumiu do CABEÇALHO', !dil.slice(0,iCorpo0).some(x=>/Ijui\/RS,/.test(x)), dil.slice(0,iCorpo0));
  t('o rótulo "ASSUNTO:" sumiu', !dil.some(x=>/ASSUNTO/.test(x)), dil.filter(x=>/ASSUNTO/i.test(x)));
  t('o texto "SERVIMAX LTDA" só aparece dentro do corpo (não como assunto solto)',
    dil.filter(x=>/SERVIMAX/.test(x)).length===1, dil.filter(x=>/SERVIMAX/.test(x)));
  t('o corpo do documento (I. DO OBJETO) continua saindo normalmente', dil.some(x=>/DO OBJETO DA DILIG/.test(x)), dil.slice(0,8));
  /* logo depois do título só deve vir o corpo (I. DO OBJETO...), nada no meio */
  const iTitDil=dil.findIndex(x=>/Pedido de Diligência/.test(x));
  const iCorpoDil=dil.findIndex(x=>/DO OBJETO DA DILIG/.test(x));
  t('nada foi desenhado entre o título e o corpo', iCorpoDil===iTitDil+1, {entre:dil.slice(iTitDil+1,iCorpoDil)});

  console.log('\n2) Decisão do Pregoeiro: só o título, sem o assunto centralizado embaixo');
  const dec=await espiar('decGerarPDF', {
    numero:16, ano:'2026', dataDecisao:'2026-08-21', agente:'PEDRO',
    titulo:'Julgamento de impugnação — SERVIMAX LTDA', processoNumero:'CC 30/2026'
  }, 'I. RELATÓRIO\n\nTrata-se de impugnação apresentada pela empresa SERVIMAX LTDA.');
  t('o título "Decisão do Pregoeiro 016/2026" está lá', dec.some(x=>/Decisão do Pregoeiro\s+016\/2026/.test(x)), dec.slice(0,6));
  t('o assunto ("Julgamento de impugnação...") não aparece solto no cabeçalho',
    !dec.some(x=>/Julgamento de impugnação/.test(x)), dec.filter(x=>/Julgamento/.test(x)));
  t('o corpo (I. RELATÓRIO) continua saindo normalmente', dec.some(x=>/RELAT[ÓO]RIO/.test(x)), dec.slice(0,6));
  const iTitDec=dec.findIndex(x=>/Decisão do Pregoeiro/.test(x));
  const iCorpoDec=dec.findIndex(x=>/RELAT[ÓO]RIO/.test(x));
  t('nada foi desenhado entre o título e o corpo', iCorpoDec===iTitDec+1, {entre:dec.slice(iTitDec+1,iCorpoDec)});

  console.log('\n3) Documento sem título/assunto preenchido continua gerando normal');
  const semTit=await espiar('dilGerarPDF', {numero:32, ano:'2026', dataDiligencia:'2026-08-27', agente:'PEDRO'}, 'I. DO OBJETO\n\nTexto qualquer.');
  t('sem processoNumero/titulo, ainda assim vai direto pro corpo', semTit.some(x=>/DO OBJETO/.test(x)), semTit.slice(0,4));

  console.log('\nerros JS:', errs.length?errs:'nenhum');
  console.log(`\n${ok} passaram, ${mau} falharam.`);
  await b.close();
})();
