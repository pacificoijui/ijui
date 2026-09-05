/* Abre cada painel/modal do sistema e observa se algum dispara erro de JS.
   É o teste que um arquivo de 11 mil linhas mais precisa: nada garante que
   um trecho novo não quebrou uma tela que ninguém abriu desde então. */
const {chromium, executablePath} = require('./navegador');
const fs=require('fs');
const stub=fs.readFileSync('fbstub3.js','utf8');
const SEED={
  processos:{ p1:{numero:'PE 1/2026', objeto:'Teste', status:'em-andamento', dataLicit:'2026-08-01', horarioAbertura:'09:00', link:'', responsavel:'PEDRO', contato:''} },
  rankings:{ p1:{ numero:'PE 1/2026', itens:[{num:'1', desc:'Item', qtde:10, unidade:'UN',
      fornecedores:[{nome:'EMPRESA TESTE LTDA', cnpj:'11.111.111/0001-11', valor:'10,00', marca:'M', modelo:'X'}]}],
      estados:{'1-0':'aprovado'} } },
  status:{ s1:{id:'em-andamento',nome:'Em Andamento',cor:'amber',ordem:0},
           s2:{id:'concluido',nome:'Concluído',cor:'green',ordem:1} },
  agentes:{ a1:{nomeAbrev:'PEDRO', nomeCompleto:'Pedro Pacifico', nomeCompleto2:''} }
};
(async()=>{
  const b=await chromium.launch(executablePath?{executablePath}:{});
  const pg=await b.newPage({viewport:{width:1400,height:950}});
  const errs=[];
  pg.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
  pg.on('console',m=>{ if(m.type()==='error') errs.push('CONSOLE: '+m.text().slice(0,160)); });
  await pg.route('**/firebasejs/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:r.request().url().includes('firestore')?stub:'/*noop*/'}));
  await pg.route('**/fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await pg.route('**/cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:'window.jspdf={jsPDF:function(){ return {internal:{pageSize:{getWidth:()=>210,getHeight:()=>297}},setFont(){},setFontSize(){},text(){},addPage(){},save(){},splitTextToSize:()=>[""],getTextWidth:()=>10,getTextDimensions:()=>({h:5}),setTextColor(){},setFillColor(){},setDrawColor(){},rect(){},roundedRect(){},line(){},setLineWidth(){},addImage(){},output:()=>new Blob()}; }};'}));
  await pg.addInitScript(()=>localStorage.setItem('copam_auth',JSON.stringify({u:'teste',nome:'QA'})));
  await pg.addInitScript((sd)=>{ window.__SEED=sd; }, SEED);
  await pg.addInitScript((u)=>{ window.__AUTH_SEED=u; }, {uid:'teste-admin', email:'pedrohhpacifico@gmail.com', displayName:'QA', photoURL:''});
  await pg.goto('http://127.0.0.1:8099/pregoeiro/index.html',{waitUntil:'networkidle'});
  await pg.waitForTimeout(900);

  const TELAS=[
    ['Ranking (Propostas)',   ()=>abrirRanking('p1'),        ()=>fecharRanking()],
    ['Habilitação',           ()=>abrirHabilitacao('p1'),    ()=>fecharHabilitacao()],
    ['Vencedores',            ()=>abrirVencedores('p1'),     ()=>fecharVencedores()],
    ['Decisões',              ()=>abrirPainelDec(),          ()=>fecharPainelDec()],
    ['Diligências',           ()=>abrirPainelDil(),          ()=>fecharPainelDil()],
    ['Modal processo',        ()=>editarProcesso('p1'),      ()=>fecharModal()],
    ['Modal status',          ()=>abrirModalStatus(),        ()=>fecharModalStatus()],
    ['Modal agentes',         ()=>abrirModalAgentes(),       ()=>fecharModalAgentes()],
    ['Modal usuários',        ()=>abrirModalUsuarios(),      ()=>fecharModalUsuarios()],
    ['Modal e-mail',          ()=>abrirModalEmail(),         ()=>fecharModalEmail()],
  ];
  for(const [nome, abrir, fechar] of TELAS){
    const antes=errs.length;
    try{
      await pg.evaluate(`(${abrir.toString()})()`);
      await pg.waitForTimeout(450);
      await pg.evaluate(`(${fechar.toString()})()`);
      await pg.waitForTimeout(200);
      const novos=errs.length-antes;
      console.log(`  ${novos?'✗':'✓'} ${nome}${novos?' — '+novos+' erro(s)':''}`);
    }catch(e){
      console.log(`  ✗ ${nome} — exceção: ${e.message.split('\n')[0].slice(0,110)}`);
    }
  }
  console.log('\nerros acumulados:', errs.length?errs.slice(0,12):'nenhum ✓');
  await b.close();
})();
