/* decGerarPDF e dilGerarPDF eram duas funções de 430 linhas com sete diferenças
   entre elas. Toda correção de layout tinha de ser feita duas vezes — e nem
   sempre era. Agora existe uma só, pdfGerarDocumento(dec, tipo).

   Este teste tranca as sete diferenças que devem CONTINUAR existindo, e o
   resto que deve ser idêntico. Se alguém voltar a duplicar, ou se a unificação
   apagar por engano algo que era só de um dos dois, aqui quebra. */
const {chromium, executablePath} = require('./navegador');
const fs=require('fs');
const stub=fs.readFileSync('fbstub3.js','utf8');
const jspdf=fs.readFileSync('node_modules/jspdf/dist/jspdf.umd.min.js','utf8');
const fonte=fs.readFileSync('../pregoeiro/index.html','utf8');
let ok=0,mau=0;
function t(n,c,e){ if(c){console.log('  ✓',n);ok++;} else {console.log('  ✗',n,e!==undefined?'\n       '+JSON.stringify(e):'');mau++;process.exitCode=1;} }

/* Mesmo texto para os dois documentos: fora título e fecho, o corpo tem de
   sair igualzinho. O [LINK] só a Diligência costuma usar, mas o desenho é
   compartilhado. */
const TEXTO=[
  'I. DO RELATÓRIO',
  '',
  'Trata-se de processo em que a empresa **ALFA LTDA** apresentou o menor lance.',
  '',
  '> Art. 63. A habilitação será verificada.',
  '>> Lei nº 14.133/2021',
  '',
  '!! O prazo é de 2 (dois) dias úteis.',
  '',
  '- primeiro item da lista',
  '- segundo item da lista',
  '',
  '1. Item numerado',
  'a) alínea',
  '',
  '| Item | Valor |',
  '|---|---|',
  '| 1 | R$ 10,00 |',
  '',
  '[LINK] https://portal.exemplo.gov.br/pe103 | Acessar o portal',
  '',
  'II. DA CONCLUSÃO',
  '',
  'Fica ==deferido== o pedido.'
].join('\n');

(async()=>{
  const b=await chromium.launch(executablePath?{executablePath}:{});
  const pg=await b.newPage({viewport:{width:1200,height:900}});
  const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
  await pg.route('**/firebasejs/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:r.request().url().includes('firestore')?stub:'/*noop*/'}));
  await pg.route('**/fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await pg.route('**/cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:jspdf}));
  await pg.addInitScript(()=>localStorage.setItem('copam_auth',JSON.stringify({u:'teste',nome:'QA'})));
  await pg.addInitScript((u)=>{ window.__AUTH_SEED=u; }, {uid:'teste-admin', email:'pedrohhpacifico@gmail.com', displayName:'QA', photoURL:''});
  await pg.goto('http://127.0.0.1:8099/pregoeiro/index.html',{waitUntil:'networkidle'});
  await pg.waitForTimeout(700);

  /* Espiona o jsPDF: guarda o que foi escrito, os links criados e o nome do
     arquivo, sem salvar nada. */
  const espiar=(fn, dados, texto)=>pg.evaluate(([f,d,t2])=>{
    const Orig=window.jspdf.jsPDF; const linhas=[], links=[]; let arquivo=null;
    window.jspdf.jsPDF=function(...a){
      const doc=new Orig(...a);
      const oT=doc.text.bind(doc), oL=doc.link?doc.link.bind(doc):null;
      doc.text=function(tx,x,y,o){
        (Array.isArray(tx)?tx:[tx]).forEach(l=>{ if(typeof l==='string') linhas.push(l); });
        return oT(tx,x,y,o);
      };
      doc.link=function(x,y,w,h,o){ links.push(o&&o.url); return oL?oL(x,y,w,h,o):undefined; };
      doc.save=function(nome){ arquivo=nome; };
      return doc;
    };
    window[f](Object.assign({texto:t2}, d));
    window.jspdf.jsPDF=Orig;
    return {linhas, links, arquivo};
  },[fn,dados,texto]);

  console.log('1) Existe UMA função geradora, e as duas antigas só a chamam');
  const forma=await pg.evaluate(()=>({
    unificada: typeof window.pdfGerarDocumento,
    dec: typeof window.decGerarPDF, dil: typeof window.dilGerarPDF,
    /* invólucro de uma linha: o corpo tem de ser curto e citar a unificada */
    decCurta: String(window.decGerarPDF).length<120 && /pdfGerarDocumento/.test(String(window.decGerarPDF)),
    dilCurta: String(window.dilGerarPDF).length<120 && /pdfGerarDocumento/.test(String(window.dilGerarPDF)),
    parse: typeof window.pdfParseBlocos, fmt: typeof window.pdfFmtNum
  }));
  t('pdfGerarDocumento existe', forma.unificada==='function', forma);
  t('decGerarPDF virou invólucro', forma.decCurta, forma);
  t('dilGerarPDF virou invólucro', forma.dilCurta, forma);
  t('o parser é compartilhado (pdfParseBlocos)', forma.parse==='function', forma);
  t('o formatador de número é compartilhado (pdfFmtNum)', forma.fmt==='function', forma);

  console.log('\n2) Nenhum helper ficou definido duas vezes no arquivo');
  ['pdfFmtNum','pdfLimparInline','pdfLimparPara','pdfEhMaiuscula','pdfEhSecaoPrincipal','pdfParseBlocos','pdfGerarDocumento']
    .forEach(function(n){
      var q=(fonte.match(new RegExp('^function '+n+'\\(','gm'))||[]).length;
      t('há só uma definição de '+n, q===1, {definicoes:q});
    });
  ['decParseBlocos','dilParseBlocos','decFmtNum','dilFmtNum','decLimparPara','dilLimparPara']
    .forEach(function(n){ t('o nome antigo '+n+' não sobrou em lugar nenhum', fonte.indexOf(n)<0); });

  /* Mesma data nos dois: o fecho tem de sair igual, então o que sobrar de
     diferença no corpo é diferença de verdade, não do que eu preenchi. */
  const dec=await espiar('decGerarPDF', {numero:16, ano:'2026', dataDecisao:'2026-08-21',
    agente:'PEDRO', titulo:'Impugnação ALFA', processoNumero:'CC 30/2026'}, TEXTO);
  /* dataDecisao também na Diligência: o campo é o mesmo nos dois módulos. */
  const dil=await espiar('dilGerarPDF', {numero:31, ano:'2026', dataDecisao:'2026-08-21',
    agente:'PEDRO', titulo:'Impugnação ALFA', processoNumero:'PE 103/2026'}, TEXTO);

  console.log('\n3) O que TEM de ser diferente entre os dois');
  t('título da Decisão', dec.linhas.some(x=>/^Decisão do Pregoeiro 016\/2026$/.test(x)), dec.linhas.slice(0,3));
  t('título da Diligência', dil.linhas.some(x=>/^Pedido de Diligência 031\/2026$/.test(x)), dil.linhas.slice(0,3));
  t('a Decisão não usa o título da Diligência', !dec.linhas.some(x=>/Pedido de Diligência/.test(x)));
  t('a Diligência não usa o título da Decisão', !dil.linhas.some(x=>/Decisão do Pregoeiro/.test(x)));
  t('nome do arquivo da Decisão', /^Decisao Pregoeiro 016 2026/.test(dec.arquivo||''), dec.arquivo);
  t('nome do arquivo da Diligência', /^Pedido Diligencia 031 2026/.test(dil.arquivo||''), dil.arquivo);
  t('o slug do título entra no nome do arquivo', /Impugnacao/i.test(dec.arquivo||''), dec.arquivo);
  t('a Decisão mostra "(assinatura pendente)"', dec.linhas.some(x=>/assinatura pendente/.test(x)));
  t('a Diligência NÃO mostra "(assinatura pendente)"', !dil.linhas.some(x=>/assinatura pendente/.test(x)),
    dil.linhas.filter(x=>/pendente/.test(x)));

  console.log('\n4) O que tem de ser IGUAL: o corpo inteiro');
  const so=v=>v.linhas.filter(x=>!/Decisão do Pregoeiro|Pedido de Diligência|assinatura pendente/.test(x));
  const cDec=so(dec), cDil=so(dil);
  t('o corpo dos dois documentos é linha por linha idêntico',
    JSON.stringify(cDec)===JSON.stringify(cDil),
    {decSo:cDec.filter(x=>cDil.indexOf(x)<0), dilSo:cDil.filter(x=>cDec.indexOf(x)<0)});
  /* O corpo sai justificado — cada palavra é um doc.text separado. Só faz
     sentido conferir o texto remontado. */
  const txDec=cDec.join(' ');
  t('a citação de lei saiu', /A habilitação será verificada/.test(txDec), txDec);
  t('a fonte da citação saiu', /14\.133\/2021/.test(txDec), txDec);
  t('o destaque !! saiu', /2 \(dois\) dias úteis/.test(txDec), txDec);
  t('a lista com traço saiu', /primeiro item da lista/.test(txDec) && /segundo item da lista/.test(txDec), txDec);
  t('a alínea saiu', /a\) alínea/.test(txDec), txDec);
  t('a tabela saiu', /R\$ 10,00/.test(txDec), txDec);
  t('as duas seções em MAIÚSCULAS saíram como título',
    cDec.some(x=>/^I\. DO RELATÓRIO$/.test(x)) && cDec.some(x=>/^II\. DA CONCLUSÃO$/.test(x)), cDec);
  t('o ==destaque== virou texto marcado, sem os sinais', /Fica deferido o pedido\./.test(txDec), txDec);

  console.log('\n5) O [LINK] — era exclusivo da Diligência, agora o desenho é compartilhado');
  t('a Diligência cria o link clicável', dil.links.indexOf('https://portal.exemplo.gov.br/pe103')>=0, dil.links);
  t('o texto do link é o rótulo, não a URL', dil.linhas.some(x=>/^Acessar o portal$/.test(x)), dil.linhas);
  t('a marcação [LINK] não vaza como texto cru', !dil.linhas.some(x=>/\[LINK\]/.test(x)), dil.linhas.filter(x=>/LINK/.test(x)));
  t('a Decisão, com a mesma marcação, também rende um link', dec.links.indexOf('https://portal.exemplo.gov.br/pe103')>=0, dec.links);

  console.log('\n6) Documento vazio ou sem título continua gerando sem quebrar');
  const magro=await espiar('dilGerarPDF', {numero:32, ano:'2026', agente:'PEDRO'}, 'Texto simples.');
  t('gera mesmo sem título/processo/data', /^Pedido Diligencia 032 2026/.test(magro.arquivo||''), magro.arquivo);
  t('o texto simples saiu', /Texto simples\./.test(magro.linhas.join(' ')), magro.linhas);

  console.log('\nerros JS:', errs.length?errs:'nenhum');
  console.log(`\n${ok} passaram, ${mau} falharam.`);
  await b.close();
})();
