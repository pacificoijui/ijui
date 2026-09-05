/* Handlers escritos DENTRO de strings JS (botões gerados por innerHTML).
   Só existem depois que a tela renderiza, então não aparecem no DOM inicial —
   mas se o nome estiver errado, o botão nasce morto. */
const {chromium, executablePath} = require('./navegador');
const fs=require('fs');
const stub=fs.readFileSync('fbstub3.js','utf8');
const src=fs.readFileSync(__dirname+'/../pregoeiro/index.html','utf8');

const nomes=new Set();
const re=/\bon(?:click|input|change|dblclick|dragstart|keydown|blur|submit)\s*=\s*(?:\\?["'])([^"'\\]{0,300}?)(?:\\?["'])/g;
let m;
while((m=re.exec(src))){
  (m[1].match(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)||[]).forEach(x=>nomes.add(x.replace(/\s*\($/,'')));
}
const IGNORAR=new Set(['if','return','typeof','new','function','alert','confirm','event','this']);
const lista=[...nomes].filter(n=>!IGNORAR.has(n)).sort();

(async()=>{
  const b=await chromium.launch(executablePath?{executablePath}:{});
  const pg=await b.newPage({viewport:{width:1400,height:900}});
  await pg.route('**/firebasejs/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:r.request().url().includes('firestore')?stub:'/*noop*/'}));
  await pg.route('**/fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await pg.route('**/cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:'window.jspdf={jsPDF:function(){}};'}));
  await pg.addInitScript(()=>localStorage.setItem('copam_auth',JSON.stringify({u:'teste',nome:'QA'})));
  await pg.addInitScript((u)=>{ window.__AUTH_SEED=u; }, {uid:'teste-admin', email:'pedrohhpacifico@gmail.com', displayName:'QA', photoURL:''});
  await pg.goto('http://127.0.0.1:8099/pregoeiro/index.html',{waitUntil:'networkidle'});
  await pg.waitForTimeout(900);
  const faltando=await pg.evaluate(ns=>ns.filter(n=>typeof window[n]!=='function'), lista);
  console.log('handlers encontrados em strings JS:', lista.length);
  console.log('sem existir no window:', faltando.length?faltando:'nenhum ✓');
  await b.close();
})();
