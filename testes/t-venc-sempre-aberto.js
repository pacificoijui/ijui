/* Pedido: na tela pública de Vencedores (?venc=ID) pra secretaria,
   1) os itens de cada empresa aparecem sempre abertos, sem precisar clicar
   2) cada item sai em frase legível ("marca X, modelo Y, pelo valor
      unitário de R$ Z") em vez da grade de rótulos abreviados */
const {chromium, executablePath} = require('./navegador');
const fs=require('fs');
const stub=fs.readFileSync('fbstub3.js','utf8');
let ok=0,mau=0;
function t(n,c,e){ if(c){console.log('  ✓',n);ok++;} else {console.log('  ✗',n,e!==undefined?'\n       '+JSON.stringify(e):'');mau++;process.exitCode=1;} }

const SEED={
  processos:{ p1:{numero:'PE 105/2026', objeto:'Registro de preços para materiais de uso médico', status:'concluido', dataLicit:'2026-08-01', horarioAbertura:'09:00', link:'', responsavel:'PEDRO', contato:''} },
  rankings:{ p1:{ numero:'PE 105/2026', itens:[
      {num:'1', desc:'Luva de procedimento, tamanho M, caixa c/100', qtde:50, unidade:'CX', fornecedores:[
        {nome:'GBS COMERCIO E REPRESENTACOES LTDA', cnpj:'46.679.707/0001-77', marca:'Descarpack', modelo:'Nitrílica', valor:'45,00'}
      ]},
      {num:'2', desc:'Seringa descartável 10ml', qtde:2000, unidade:'UN', fornecedores:[
        {nome:'GBS COMERCIO E REPRESENTACOES LTDA', cnpj:'46.679.707/0001-77', marca:'', modelo:'', valor:'0,85'}
      ]},
      {num:'3', desc:'Álcool 70% 1L', qtde:100, unidade:'UN', fornecedores:[
        {nome:'GENIAL PRODUTOS PARA LIMPEZA LTDA', cnpj:'04.415.316/0002-86', marca:'Ballerine', modelo:'', valor:'12,50'}
      ]},
    ], estados:{'1-0':'aprovado','2-0':'aprovado','3-0':'aprovado'} } }
};

(async()=>{
  const b=await chromium.launch(executablePath?{executablePath}:{});
  const pg=await b.newPage({viewport:{width:420,height:900},hasTouch:false});
  const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
  await pg.route('**/firebasejs/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:r.request().url().includes('firestore')?stub:'/*noop*/'}));
  await pg.route('**/fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await pg.route('**/cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:'window.jspdf={jsPDF:function(){}};'}));
  await pg.addInitScript((sd)=>{ window.__SEED=sd; }, SEED);
  await pg.goto('http://127.0.0.1:8099/pregoeiro/index.html?venc=p1',{waitUntil:'networkidle'});
  await pg.waitForTimeout(900);

  console.log('1) Painel de vencedores compartilhado abriu');
  const painelVisivel=await pg.evaluate(()=>getComputedStyle(document.getElementById('vencSharedPanel')).display!=='none');
  t('o painel está visível', painelVisivel);

  console.log('\n2) Os itens de TODAS as empresas já aparecem abertos, sem clicar em nada');
  const itensVisiveis=await pg.evaluate(()=>{
    return [...document.querySelectorAll('.vcs-itens')].map(el=>getComputedStyle(el).display);
  });
  t('existem cards de empresa (2 empresas no seed)', itensVisiveis.length===2, itensVisiveis);
  t('todos os blocos de itens estão com display:block (visíveis)', itensVisiveis.every(d=>d==='block'), itensVisiveis);

  console.log('\n3) Não existe mais controle de abrir/fechar (caret) nem clique no cabeçalho');
  const semCaret=await pg.evaluate(()=>document.querySelectorAll('.vcs-caret').length===0);
  t('não há mais ícone de seta (▶) na tela', semCaret);
  const semToggleAttr=await pg.evaluate(()=>document.querySelectorAll('[data-toggle]').length===0);
  t('não há mais atributo data-toggle nos cabeçalhos', semToggleAttr);

  console.log('\n4) Clicar no cabeçalho da empresa não faz nada (não fecha os itens)');
  await pg.click('.vcs-emp-head');
  await pg.waitForTimeout(150);
  const aindaAberto=await pg.evaluate(()=>[...document.querySelectorAll('.vcs-itens')].every(el=>getComputedStyle(el).display==='block'));
  t('itens continuam visíveis depois do clique', aindaAberto);

  console.log('\n5) O item com marca e modelo sai em frase legível');
  const fraseComMarca=await pg.evaluate(()=>{
    const item=[...document.querySelectorAll('.vcs-item')].find(i=>i.textContent.includes('Luva de procedimento'));
    return item?item.querySelector('.vcs-item-frase').textContent.trim():null;
  });
  console.log('   texto:', fraseComMarca);
  t('menciona a marca (Descarpack)', /Descarpack/.test(fraseComMarca), fraseComMarca);
  t('menciona o modelo (Nitrílica)', /Nitrílica/.test(fraseComMarca), fraseComMarca);
  t('menciona "pelo valor unitário de"', /pelo valor unitário de/.test(fraseComMarca), fraseComMarca);
  t('mostra o valor unitário certo (R$ 45,00)', /R\$\s*45,00/.test(fraseComMarca), fraseComMarca);
  t('mostra quantidade e unidade (50 CX)', /50\s*CX/.test(fraseComMarca), fraseComMarca);
  t('mostra o total do item (50 x 45 = 2.250,00)', /2\.250,00/.test(fraseComMarca), fraseComMarca);
  t('não sobrou rótulo abreviado tipo "Qtde" ou "Unitário:" solto', !/\bQtde\b|\bUnitário:/.test(fraseComMarca), fraseComMarca);

  console.log('\n6) Item SEM marca/modelo não fica com vírgula ou rótulo vazio pendurado');
  const fraseSemMarca=await pg.evaluate(()=>{
    const item=[...document.querySelectorAll('.vcs-item')].find(i=>i.textContent.includes('Seringa descartável'));
    return item?item.querySelector('.vcs-item-frase').textContent.trim():null;
  });
  console.log('   texto:', fraseSemMarca);
  t('começa direto com o valor unitário (sem "marca ," pendurado)', /^pelo valor unitário de/.test(fraseSemMarca), fraseSemMarca);
  t('mostra o valor certo (R$ 0,85)', /R\$\s*0,85/.test(fraseSemMarca), fraseSemMarca);

  console.log('\n7) Total da empresa e total geral continuam corretos');
  const totais=await pg.evaluate(()=>({
    nEmp: document.getElementById('vcsNEmp').textContent,
    nItens: document.getElementById('vcsNItens').textContent,
    total: document.getElementById('vcsNTotal').textContent
  }));
  console.log('  ', totais);
  t('2 empresas', totais.nEmp==='2', totais);
  t('3 itens no total', totais.nItens==='3', totais);
  // GBS: 50*45=2250 + 2000*0.85=1700 = 3950,00 | GENIAL: 100*12.5=1250,00 | total geral 5200,00
  t('valor total do processo bate (R$ 5.200,00)', /5\.200,00/.test(totais.total), totais);

  console.log('\nerros JS:', errs.length?errs:'nenhum');
  console.log(`\n${ok} passaram, ${mau} falharam.`);
  await b.close();
})();
