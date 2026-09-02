/* Confere que toda função chamada em atributo inline (onclick/oninput/...)
   existe de verdade. É a falha clássica de arquivo grande: o botão existe,
   o usuário clica, e não acontece nada — sem erro visível até alguém tentar. */
const {chromium, executablePath} = require('./navegador');
const fs=require('fs');
const stub=fs.readFileSync('fbstub3.js','utf8');
(async()=>{
  const b=await chromium.launch(executablePath?{executablePath}:{});
  const pg=await b.newPage({viewport:{width:1400,height:900}});
  const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
  await pg.route('**/firebasejs/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:r.request().url().includes('firestore')?stub:'/*noop*/'}));
  await pg.route('**/fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await pg.route('**/cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:'window.jspdf={jsPDF:function(){}};'}));
  await pg.addInitScript(()=>localStorage.setItem('copam_auth',JSON.stringify({u:'teste',nome:'QA'})));
  await pg.goto('http://127.0.0.1:8099/pregoeiro/index.html',{waitUntil:'networkidle'});
  await pg.waitForTimeout(900);

  const r=await pg.evaluate(()=>{
    const ATTRS=['onclick','oninput','onchange','onsubmit','onkeydown','onkeyup','ondblclick','onblur','onfocus','ondragstart'];
    const nomes=new Set();
    document.querySelectorAll('*').forEach(el=>{
      ATTRS.forEach(a=>{
        const v=el.getAttribute&&el.getAttribute(a);
        if(!v) return;
        // pega identificadores chamados: nome(  — ignora métodos (this.x, a.b)
        (v.match(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)||[]).forEach(m=>{
          nomes.add(m.replace(/\s*\($/,''));
        });
      });
    });
    const IGNORAR=new Set(['if','return','typeof','new','function','alert','confirm','event']);
    const faltando=[...nomes].filter(n=>!IGNORAR.has(n) && typeof window[n]!=='function');
    return {total:nomes.size, faltando:faltando.sort()};
  });
  console.log('funções chamadas em atributos inline:', r.total);
  console.log('sem existir no window:', r.faltando.length?r.faltando:'nenhuma ✓');
  console.log('erros JS ao carregar:', errs.length?errs:'nenhum');
  await b.close();
})();
