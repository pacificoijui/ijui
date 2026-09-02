/* Gera um edital pelo navegador, como o pregoeiro faria, e grava o .odt em
   disco para conferência estrutural em seguida (verificar.py). */
const {chromium, executablePath} = require('./navegador');
const fs=require('fs');
const jszip=fs.readFileSync('node_modules/jszip/dist/jszip.min.js','utf8');

const CENARIOS=[
  {nome:'registro-ata-aquisicao', dados:{
     pregao:'131/2026', processo:'642/2026',
     objeto:'Aquisição de equipamentos de musculação & acessórios <teste>',
     data:'2026-09-14', hora:'09:30', dataEdital:'2026-08-31',
     regime:'registro', instrumento:'ata', natureza:'aquisicao',
     meEpp:'exclusivo', balanco:'nao',
     itemUnico:false, amostra:false, habTecnica:false, catalogo:false,
     docsAntes:false, garantia:false, subcontrat:false, maoObra:false}},
  {nome:'contratacao-contrato-servicos', dados:{
     pregao:'77/2026', processo:'900/2026',
     objeto:'Contratação de serviços contínuos de limpeza predial',
     data:'2026-10-05', hora:'14:00', dataEdital:'2026-09-20',
     regime:'contratacao', instrumento:'contrato', natureza:'servicos',
     meEpp:'compraMais', balanco:'servicos',
     itemUnico:true, amostra:true, habTecnica:true, catalogo:true,
     docsAntes:true, garantia:true, subcontrat:true, maoObra:true}},
  {nome:'contratacao-empenho-aquisicao', dados:{
     pregao:'12/2026', processo:'55/2026',
     objeto:'Aquisição de material de expediente',
     data:'2026-11-03', hora:'08:30', dataEdital:'2026-10-15',
     regime:'contratacao', instrumento:'empenho', natureza:'aquisicao',
     meEpp:'semCota', balanco:'obras',
     itemUnico:false, amostra:false, habTecnica:false, catalogo:false,
     docsAntes:false, garantia:false, subcontrat:false, maoObra:false}},
];

(async()=>{
  const b=await chromium.launch(executablePath?{executablePath}:{});
  const pg=await b.newPage({viewport:{width:1400,height:1000}});
  const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
  pg.on('console',m=>{ if(m.type()==='error') errs.push('console: '+m.text()); });

  await pg.route('**/cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:jszip}));
  await pg.route('**/fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await pg.route('**/firebasejs/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:'/*sem firebase no teste*/'}));

  await pg.goto('http://127.0.0.1:8099/editais/index.html',{waitUntil:'networkidle'});
  await pg.waitForTimeout(500);

  console.log('=== avisos e prévia inicial ===');
  const inicial=await pg.evaluate(()=>({
    aviso: (document.getElementById('avisoFirebase').innerText||'').slice(0,90),
    resumo: document.getElementById('resumoNum').innerText.replace(/\n/g,' | '),
    blocos: document.querySelectorAll('#previa .bloco').length,
  }));
  console.log(inicial);

  for(const c of CENARIOS){
    const d=c.dados;
    await pg.fill('#fPregao', d.pregao);
    await pg.fill('#fProcesso', d.processo);
    await pg.fill('#fObjeto', d.objeto);
    await pg.fill('#fData', d.data);
    await pg.fill('#fHora', d.hora);
    await pg.fill('#fDataEdital', d.dataEdital);
    /* os radios/checkboxes são estilizados: o input fica invisível e quem
       recebe o clique é o <span>. Clicar no rótulo é o caminho do usuário. */
    for(const [nome,valor] of [['regime',d.regime],['instrumento',d.instrumento],
                               ['natureza',d.natureza],['meEpp',d.meEpp],
                               ['balanco',d.balanco]]){
      await pg.click(`input[name="${nome}"][value="${valor}"] + span`);
    }
    for(const [id,v] of [['#fItemUnico',d.itemUnico],['#fAmostra',d.amostra],
                         ['#fHabTecnica',d.habTecnica],['#fCatalogo',d.catalogo],
                         ['#fDocsAntes',d.docsAntes],['#fGarantia',d.garantia],
                         ['#fSubcontrat',d.subcontrat],['#fMaoObra',d.maoObra]]){
      if(v) await pg.check(id,{force:true}); else await pg.uncheck(id,{force:true});
    }
    await pg.waitForTimeout(200);

    const resumo=await pg.evaluate(()=>document.getElementById('resumoNum').innerText.replace(/\n/g,' '));

    // gera direto pela função, capturando o blob em base64
    const b64=await pg.evaluate(async()=>{
      const d=lerFormulario();
      const blob=await montarODT(d);
      const buf=await blob.arrayBuffer();
      let s=''; const u=new Uint8Array(buf);
      const CH=8192;
      for(let i=0;i<u.length;i+=CH) s+=String.fromCharCode.apply(null,u.subarray(i,i+CH));
      return btoa(s);
    });
    const arq=`saida-${c.nome}.odt`;
    fs.writeFileSync(arq, Buffer.from(b64,'base64'));
    console.log(`\n[${c.nome}] ${resumo}`);
    console.log(`   → ${arq} (${fs.statSync(arq).size} bytes)`);
  }

  console.log('\nerros JS:', errs.length?errs:'nenhum');
  await b.close();
})();
