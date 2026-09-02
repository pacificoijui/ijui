/* Pedido: o painel interno de Vencedores (dentro do sistema, botão no card do
   processo) usava uma tabela de 7 colunas que, no celular, ficava espremida e
   ilegível ("TANQ UINHO 10KG..."). Agora mostra a mesma frase legível da
   página pública ?venc= ("marca X, modelo Y, pelo valor unitário de R$ Z"),
   pra secretaria ver a mesma coisa nos dois lugares. */
const {chromium, executablePath} = require('./navegador');
const fs=require('fs');
const stub=fs.readFileSync('fbstub3.js','utf8');
let ok=0,mau=0;
function t(n,c,e){ if(c){console.log('  ✓',n);ok++;} else {console.log('  ✗',n,e!==undefined?'\n       '+JSON.stringify(e):'');mau++;process.exitCode=1;} }

const SEED={
  processos:{ p1:{numero:'PE 211/2026', objeto:'Aquisição de eletrodomésticos', status:'concluido', dataLicit:'2026-08-01', horarioAbertura:'09:00', link:'', responsavel:'PEDRO', contato:''} },
  rankings:{ p1:{ numero:'PE 211/2026', itens:[
      {num:'1', desc:'Máquina de lavar roupa 10kg', qtde:40, unidade:'UN', fornecedores:[
        {nome:'CASA MIX LTDA', cnpj:'37.429.301/0001-45', marca:'Libell', modelo:'Libell/AKI Eletro', valor:'405,00'}
      ]},
      {num:'2', desc:'Bebedouro de coluna', qtde:5, unidade:'UN', fornecedores:[
        {nome:'CASA MIX LTDA', cnpj:'37.429.301/0001-45', marca:'', modelo:'', valor:'890,00'}
      ]}
    ], estados:{'1-0':'aprovado','2-0':'aprovado'} } }
};

(async()=>{
  const b=await chromium.launch(executablePath?{executablePath}:{});
  const pg=await b.newPage({viewport:{width:1200,height:900}});
  const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
  await pg.route('**/firebasejs/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:r.request().url().includes('firestore')?stub:'/*noop*/'}));
  await pg.route('**/fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await pg.route('**/cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:'window.jspdf={jsPDF:function(){}};'}));
  await pg.addInitScript(()=>localStorage.setItem('copam_auth',JSON.stringify({u:'teste',nome:'QA'})));
  await pg.addInitScript((sd)=>{ window.__SEED=sd; }, SEED);
  await pg.goto('http://127.0.0.1:8099/pregoeiro/index.html',{waitUntil:'networkidle'});
  await pg.waitForTimeout(700);

  await pg.evaluate(()=>abrirVencedores('p1'));
  await pg.waitForTimeout(500);

  console.log('1) O painel abriu com as duas empresas... digo, o item da CASA MIX');
  const aberto=await pg.evaluate(()=>document.getElementById('vencPanel').classList.contains('open'));
  t('o painel está aberto', aberto);

  console.log('\n2) Não sobrou tabela nenhuma — nem venc-tbl nem "Valor Unit." de cabeçalho de coluna');
  const semTabela=await pg.evaluate(()=>({
    tabelas: document.querySelectorAll('#vencLista table').length,
    vencTbl: document.querySelectorAll('.venc-tbl').length,
    dataLabel: document.querySelectorAll('#vencLista [data-label]').length
  }));
  console.log('  ', semTabela);
  t('não há mais nenhuma <table> na lista de vencedores', semTabela.tabelas===0, semTabela);
  t('a classe venc-tbl não é usada em lugar nenhum', semTabela.vencTbl===0, semTabela);
  t('não sobrou data-label (era da tabela responsiva)', semTabela.dataLabel===0, semTabela);

  console.log('\n3) Os itens aparecem no mesmo estilo de frase da página pública');
  const itens=await pg.evaluate(()=>[...document.querySelectorAll('#vencLista .venc-item')].map(function(el){
    return {num: el.querySelector('.venc-item-num').textContent.trim(),
            desc: el.querySelector('.venc-item-desc').textContent.trim(),
            frase: el.querySelector('.venc-item-frase').textContent.trim()};
  }));
  console.log('  ', itens);
  t('os 2 itens da empresa aparecem', itens.length===2, itens);

  const item1=itens.find(function(i){ return i.num==='1'; });
  t('item 1: número do item certo', !!item1, itens);
  t('item 1: descrição do produto', /Máquina de lavar roupa/.test(item1.desc), item1);
  t('item 1: menciona a marca (Libell)', /Libell/.test(item1.frase), item1);
  t('item 1: menciona "pelo valor unitário de"', /pelo valor unitário de/.test(item1.frase), item1);
  t('item 1: valor unitário certo (R$ 405,00)', /R\$\s*405,00/.test(item1.frase), item1);
  t('item 1: quantidade e unidade (40 UN)', /40\s*UN/.test(item1.frase), item1);
  t('item 1: total do item (40 × 405 = 16.200,00)', /16\.200,00/.test(item1.frase), item1);

  const item2=itens.find(function(i){ return i.num==='2'; });
  t('item 2 (sem marca/modelo): sem vírgula pendurada', /^pelo valor unitário de/.test(item2.frase), item2);
  t('item 2: valor certo (R$ 890,00)', /R\$\s*890,00/.test(item2.frase), item2);

  console.log('\n4) O total do vencedor e o total geral seguem corretos');
  const totais=await pg.evaluate(()=>({
    linha: document.querySelector('.venc-total-row').textContent.trim(),
    geral: document.querySelector('.venc-grand-total').textContent.trim(),
    nEmp: document.getElementById('vencs-emp').textContent,
    nItens: document.getElementById('vencs-itens').textContent
  }));
  console.log('  ', totais);
  t('1 empresa', totais.nEmp==='1', totais);
  t('2 itens', totais.nItens==='2', totais);
  // 40*405=16.200 + 5*890=4.450 = 20.650,00
  t('total do vencedor bate (R$ 20.650,00)', /20\.650,00/.test(totais.linha), totais);
  t('total geral bate (R$ 20.650,00)', /20\.650,00/.test(totais.geral), totais);

  console.log('\nerros JS:', errs.length?errs:'nenhum');
  console.log(`\n${ok} passaram, ${mau} falharam.`);
  await b.close();
})();
