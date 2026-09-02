/* Confere a resolução do artigo "a/o" na frente do objeto: reconhecido
   (feminino/masculino) resolve certo; não reconhecido mantém "a/o" como
   sempre foi — nunca deve piorar em relação ao modelo original. */
const {chromium, executablePath} = require('./navegador');
const fs=require('fs');
const jszip=fs.readFileSync('node_modules/jszip/dist/jszip.min.js','utf8');

const CASOS=[
  {objeto:'Aquisição de veículos utilitários para a frota municipal', esperado:'a'},
  {objeto:'Registro de preços para materiais de expediente', esperado:'o'},
  {objeto:'Contratação de empresa especializada em dedetização', esperado:'a'},
  {objeto:'Fornecimento de refeições prontas para a merenda escolar', esperado:'o'},
  {objeto:'Locação de veículos com motorista', esperado:'a'},
  {objeto:'Xilofone gigante para a praça central', esperado:null}, // não reconhecido — mantém a/o
];

(async()=>{
  const b=await chromium.launch(executablePath?{executablePath}:{});
  const pg=await b.newPage({viewport:{width:1200,height:900}});
  const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
  await pg.route('**/cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:jszip}));
  await pg.route('**/firebasejs/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:'/*x*/'}));
  await pg.goto('http://127.0.0.1:8099/editais/index.html',{waitUntil:'networkidle'});
  await pg.waitForTimeout(500);

  let ok=0, mau=0;
  for(const c of CASOS){
    const artigo=await pg.evaluate((o)=>artigoObjeto(o), c.objeto);
    const bate = artigo===c.esperado;
    console.log(`  ${bate?'✓':'✗'} "${c.objeto}" → artigoObjeto()="${artigo}" (esperado "${c.esperado}")`);
    if(bate) ok++; else mau++;
  }

  console.log('\nerros JS:', errs.length?errs:'nenhum');
  console.log(`\n${ok} passaram, ${mau} falharam.`);
  if(mau) process.exitCode=1;
  await b.close();
})();
