/* Cola uma lista de itens (como sai de um Ctrl+C no Calc) e confere que a
   tabela do Termo de Referência e a do modelo de proposta foram remontadas. */
const {chromium, executablePath} = require('./navegador');
const fs=require('fs');
const jszip=fs.readFileSync('node_modules/jszip/dist/jszip.min.js','utf8');

/* 4 itens; o 3º sem valor total, para conferir que a conta é feita sozinha */
const ITENS = [
  '1\t1\t9001\tArroz branco tipo 1, pacote de 5kg\t\t28,50\t100\tPCT\t2.850,00',
  '1\t2\t9002\tFeijão preto tipo 1, pacote de 1kg\t\t8,90\t200\tPCT\t1.780,00',
  '2\t1\t9003\tÓleo de soja refinado, 900ml\t\t7,25\t150\tUN',
  '2\t2\t9004\tAçúcar cristal, pacote de 5kg\t\t18,00\t80\tPCT\t1.440,00',
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

  await pg.fill('#fPregao','200/2026');
  await pg.fill('#fProcesso','1500/2026');
  await pg.fill('#fObjeto','Aquisição de gêneros alimentícios para a merenda escolar');
  await pg.fill('#fData','2026-12-01');
  await pg.fill('#fDataEdital','2026-11-10');
  await pg.fill('#fItens', ITENS);
  await pg.waitForTimeout(400);

  const obs=await pg.textContent('#obsItens');
  console.log('contador na tela:', obs.trim());

  const b64=await pg.evaluate(async()=>{
    const d=lerFormulario();
    const blob=await montarODT(d);
    const buf=await blob.arrayBuffer();
    let s=''; const u=new Uint8Array(buf); const CH=8192;
    for(let i=0;i<u.length;i+=CH) s+=String.fromCharCode.apply(null,u.subarray(i,i+CH));
    return btoa(s);
  });
  fs.writeFileSync('saida-itens.odt', Buffer.from(b64,'base64'));
  console.log('saida-itens.odt', fs.statSync('saida-itens.odt').size, 'bytes');
  console.log('erros JS:', errs.length?errs:'nenhum');
  await b.close();
})();
