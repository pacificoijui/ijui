/* Cola o bloco de dotação orçamentária uma vez e confere que ela entra nas
   DUAS tabelas do documento (item 17.12 do edital e Cláusula Quarta do
   contrato), com os dados do exemplo (Esporte e Lazer) substituídos. */
const {chromium, executablePath} = require('./navegador');
const fs=require('fs');
const jszip=fs.readFileSync('node_modules/jszip/dist/jszip.min.js','utf8');

const DOTACAO = [
  'ÓRGÃO\t09\tSEC. MUN. DE EDUCAÇÃO',
  'UNIDADE\t0901\tCoordenadoria de Ensino Fundamental',
  'FUNÇÃO\t12\tEducação',
  'SUBFUNÇÃO\t361\tEnsino Fundamental',
  'PROGRAMA\t201\tEducação de Qualidade para Todos',
  'PROJETO/ATIVIDADE\t2044\tManutenção do Ensino Fundamental',
  'DESPESA\t10500\t1001\tRecursos do Tesouro Municipal',
  'CATEGORIA ECONÔMICA\t339030000000\tMATERIAL DE CONSUMO',
].join('\n');

(async()=>{
  const b=await chromium.launch(executablePath?{executablePath}:{});
  const pg=await b.newPage({viewport:{width:1400,height:1000}});
  const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
  await pg.route('**/cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:jszip}));
  await pg.route('**/fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await pg.route('**/firebasejs/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:'/*x*/'}));
  await pg.goto('http://127.0.0.1:8099/editais/index.html',{waitUntil:'networkidle'});
  await pg.waitForTimeout(600);

  await pg.fill('#fPregao','300/2026');
  await pg.fill('#fProcesso','2000/2026');
  await pg.fill('#fObjeto','Aquisição de material didático');
  await pg.fill('#fData','2026-12-10');
  await pg.fill('#fDataEdital','2026-11-15');
  await pg.fill('#fDotacao', DOTACAO);
  await pg.waitForTimeout(400);

  const obs=await pg.textContent('#obsDotacao');
  console.log('contador na tela:', obs.trim());

  const b64=await pg.evaluate(async()=>{
    const d=lerFormulario();
    const blob=await montarODT(d);
    const buf=await blob.arrayBuffer();
    let s=''; const u=new Uint8Array(buf); const CH=8192;
    for(let i=0;i<u.length;i+=CH) s+=String.fromCharCode.apply(null,u.subarray(i,i+CH));
    return btoa(s);
  });
  fs.writeFileSync('saida-dotacao.odt', Buffer.from(b64,'base64'));
  console.log('saida-dotacao.odt', fs.statSync('saida-dotacao.odt').size, 'bytes');
  console.log('erros JS:', errs.length?errs:'nenhum');
  await b.close();
})();
