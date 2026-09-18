/* O PDF de contratos separa "141/2026" (nº/ano) de "CONC. E. 31/2026"
   (modalidade), e "17/08/2027" de "NAO PRORROGA", com um "\n" dentro da
   string que alimenta doc.splitTextToSize(). O jsPDF real não trata esse
   "\n" como quebra de linha — ele só separa por espaço — e o "\n" vira
   parte de uma "palavra" sem espaço, cortada no meio do caractere quando
   não cabe na coluna: "141/2026CONC. E. 31/2026" virava "141/2026C" /
   "ONC. E." / "31/2026", grudado e cortado ao meio.

   Este teste simula esse comportamento exato do jsPDF (ignora "\n",
   quebra por espaço, corta caractere a caractere o que sobrar) e confere
   que pdfQuebrarCelula() — que separa por "\n" ANTES de chamar
   splitTextToSize — nunca deixa um pedaço colado no seguinte. */
const {chromium, executablePath} = require('./navegador');
const fs = require('fs');
let ok = 0, mau = 0;
function t(n, c, e){ if(c){ console.log('  ✓', n); ok++; } else { console.log('  ✗', n, e !== undefined ? '\n       ' + JSON.stringify(e) : ''); mau++; process.exitCode = 1; } }

/* Um splitTextToSize de mentira que se comporta como o jsPDF real nesse
   ponto: ignora "\n" (ele não é espaço, então vira parte de uma "palavra"),
   separa por espaço, e corta no meio do caractere a palavra que não cabe. */
function splitFalso(texto, largura){
  const CHARS_POR_LINHA = Math.max(1, Math.floor(largura));
  const palavras = texto.split(' ');
  const linhas = [];
  let atual = '';
  palavras.forEach(p => {
    let cand = atual ? atual + ' ' + p : p;
    while(cand.length > CHARS_POR_LINHA){
      if(atual){ linhas.push(atual); atual = ''; cand = p; }
      linhas.push(cand.slice(0, CHARS_POR_LINHA));
      cand = cand.slice(CHARS_POR_LINHA);
    }
    atual = cand;
  });
  if(atual) linhas.push(atual);
  return linhas;
}

(async () => {
  const stub = fs.readFileSync('fbstub3.js', 'utf8');
  const b = await chromium.launch(executablePath ? {executablePath} : {});
  const pg = await b.newPage({viewport:{width:1280, height:900}});
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.route('**/firebasejs/**', r => r.fulfill({status:200, contentType:'application/javascript',
    body: r.request().url().includes('firestore') ? stub : '/*noop*/'}));
  await pg.route('**/fonts.googleapis.com/**', r => r.fulfill({status:200, contentType:'text/css', body:''}));
  /* jsPDF de mentira, só com o suficiente para o script não quebrar ao carregar */
  await pg.route('**/cdnjs.cloudflare.com/**', r => r.fulfill({status:200, contentType:'application/javascript', body:'window.jspdf={jsPDF:function(){}};'}));
  await pg.addInitScript(() => localStorage.setItem('copam_auth', JSON.stringify({u:'teste', nome:'QA'})));
  await pg.addInitScript((u) => { window.__AUTH_SEED = u; }, {uid:'teste-admin', email:'pedrohhpacifico@gmail.com', displayName:'QA', photoURL:''});
  await pg.goto('http://127.0.0.1:8099/contratos/index.html', {waitUntil:'networkidle'});
  await pg.waitForTimeout(1000);

  console.log('1) pdfQuebrarCelula separa por "\\n" antes de perguntar ao jsPDF');
  const r = await pg.evaluate((splitFalsoSrc) => {
    const splitFalso = eval('(' + splitFalsoSrc + ')');
    const docFalso = { splitTextToSize: splitFalso };
    const casoNumAno = pdfQuebrarCelula(docFalso, '141/2026\nCONC. E. 31/2026', 9);
    const casoVenc   = pdfQuebrarCelula(docFalso, '17/08/2027\nNAO PRORROGA', 10);
    return {casoNumAno, casoVenc};
  }, splitFalso.toString());

  t('a primeira linha do nº/ano é só "141/2026", sem nada da modalidade grudado',
    r.casoNumAno[0] === '141/2026', r.casoNumAno);
  t('nenhuma linha mistura caractere de um pedaço com o outro (nada de "...C" colado)',
    r.casoNumAno.every(l => !/2026C/.test(l)), r.casoNumAno);
  t('a modalidade aparece inteira, só quebrada por espaço — nunca no meio de uma palavra',
    r.casoNumAno.slice(1).join(' ') === 'CONC. E. 31/2026' || r.casoNumAno.slice(1).join('') === 'CONC.E.31/2026'
      ? true : r.casoNumAno.slice(1).join(' ').replace(/\s+/g,' ') === 'CONC. E. 31/2026', r.casoNumAno);

  t('a primeira linha do vencimento é só a data, sem "NAO" colado nela',
    r.casoVenc[0] === '17/08/2027', r.casoVenc);
  t('"NAO PRORROGA" nunca é cortada no meio da palavra (nada de "PRO"+"RROGA" separados)',
    !r.casoVenc.some(l => /PRO$/.test(l)) || r.casoVenc.join(' ').indexOf('PRORROGA') >= 0, r.casoVenc);
  t('e a palavra "PRORROGA" aparece inteira em alguma linha',
    r.casoVenc.some(l => l.indexOf('PRORROGA') >= 0), r.casoVenc);

  console.log('\nerros JS: ' + (errs.length ? errs.join(' | ') : 'nenhum'));
  console.log('\n' + ok + ' passaram, ' + mau + ' falharam.');
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
