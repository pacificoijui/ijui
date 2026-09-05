/* Pedido: poder corrigir o Valor de uma colocação quando a empresa
   renegocia o preço (já dava pra corrigir Modelo/Marca com duplo clique;
   agora o Valor também). Confere: o campo aparece editável, aceita os
   formatos comuns de digitação, recalcula o %, grava no Firestore e não
   quebra a edição de Modelo/Marca que já existia. */
const {chromium, executablePath} = require('./navegador');
const fs=require('fs');
const stub=fs.readFileSync('fbstub3.js','utf8');
let ok=0,mau=0;
function t(n,c,e){ if(c){console.log('  ✓',n);ok++;} else {console.log('  ✗',n,e!==undefined?'\n       '+JSON.stringify(e):'');mau++;process.exitCode=1;} }

(async()=>{
  const b=await chromium.launch(executablePath?{executablePath}:{});
  const pg=await b.newPage({viewport:{width:1200,height:900}});
  const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
  await pg.route('**/firebasejs/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:r.request().url().includes('firestore')?stub:'/*noop*/'}));
  await pg.route('**/fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await pg.route('**/cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:'window.jspdf={jsPDF:function(){}};'}));
  await pg.addInitScript(()=>localStorage.setItem('copam_auth',JSON.stringify({u:'teste',nome:'QA'})));
  await pg.addInitScript((u)=>{ window.__AUTH_SEED=u; }, {uid:'teste-admin', email:'pedrohhpacifico@gmail.com', displayName:'QA', photoURL:''});
  await pg.goto('http://127.0.0.1:8099/pregoeiro/index.html',{waitUntil:'networkidle'});
  await pg.waitForTimeout(700);

  await pg.evaluate(()=>abrirRanking('p1'));
  await pg.waitForTimeout(300);
  await pg.evaluate(()=>{
    rkItens=[{num:'5', desc:'Item de teste', ref:'80,00', fornecedores:[
      {nome:'LICITARE LICITACAO LTDA', valor:'1.000,00', modelo:'ECO POP', marca:'ECOESPUMA'}
    ]}];
    rkEstados={};
    document.getElementById('rkNoJson').style.display='none';
    document.getElementById('rkConteudo').style.display='block';
    rkSetModo('itens');
    rkRenderProcesso();
  });
  await pg.waitForTimeout(200);

  console.log('\n1) O Valor aparece como campo editável, com o mesmo padrão do Modelo/Marca');
  const marcado=await pg.evaluate(()=>{
    const span=document.querySelector('[data-editforn$="|valor"]');
    return span ? {existe:true, classe:span.className, texto:span.textContent, titulo:span.title} : {existe:false};
  });
  t('existe um span editável para o valor', marcado.existe, marcado);
  t('tem a classe de campo editável (mesmo estilo do Modelo/Marca)', marcado.classe && marcado.classe.includes('rks-forn-tag-edit'), marcado);
  t('mostra o valor atual e o % acima da referência', /1\.000,00/.test(marcado.texto) && /1150,0%/.test(marcado.texto), marcado.texto);

  console.log('\n2) Duplo clique abre o campo de edição já preenchido');
  await pg.dblclick('[data-editforn$="|valor"]');
  await pg.waitForTimeout(100);
  const aberto=await pg.evaluate(()=>{
    const inp=document.querySelector('.rks-forn-tag-input');
    return inp?{valor:inp.value}:null;
  });
  t('abre um input com o valor atual', aberto && aberto.valor==='1.000,00', aberto);

  console.log('\n3) Empresa renegocia: digita o novo valor e sai do campo (Enter)');
  await pg.fill('.rks-forn-tag-input','850,50');
  await pg.keyboard.press('Enter');
  await pg.waitForTimeout(200);
  const gravado=await pg.evaluate(()=>({
    valor: rkItens[0].fornecedores[0].valor,
    firestore: window.__STORE.rankings ? null : null,
    toast: document.getElementById('toastMsg').textContent
  }));
  t('o novo valor foi gravado no item', gravado.valor==='850,50', gravado);
  t('avisa que atualizou (toast "Valor atualizado.")', /Valor atualizado/.test(gravado.toast), gravado.toast);
  const pctNovo=await pg.evaluate(()=>{
    const span=document.querySelector('[data-editforn$="|valor"]');
    return span?span.textContent:'';
  });
  t('o % em relação à referência foi recalculado (não ficou o +1167% antigo)', !/1167/.test(pctNovo) && /850,50/.test(pctNovo), pctNovo);

  console.log('\n4) Aceita os formatos comuns de digitação');
  const casos=[
    ['1200', '1.200,00'],
    ['1200,5', '1.200,50'],
    ['1.234,56', '1.234,56'],
    ['R$ 999,00', '999,00'],
  ];
  for(const [digitado, esperado] of casos){
    await pg.dblclick('[data-editforn$="|valor"]');
    await pg.waitForTimeout(80);
    await pg.fill('.rks-forn-tag-input', digitado);
    await pg.keyboard.press('Enter');
    await pg.waitForTimeout(150);
    const v=await pg.evaluate(()=>rkItens[0].fornecedores[0].valor);
    t('"'+digitado+'" vira "'+esperado+'"', v===esperado, v);
  }

  console.log('\n5) Valor inválido não é aceito (mantém alerta e não grava lixo)');
  await pg.dblclick('[data-editforn$="|valor"]');
  await pg.waitForTimeout(80);
  await pg.fill('.rks-forn-tag-input', 'abacate');
  let dialogMsg=null;
  pg.once('dialog', async d=>{ dialogMsg=d.message(); await d.accept(); });
  await pg.keyboard.press('Enter');
  await pg.waitForTimeout(200);
  t('mostra alerta pedindo um número válido', dialogMsg && /inválido/i.test(dialogMsg), dialogMsg);
  const aindaEditando=await pg.evaluate(()=>!!document.querySelector('.rks-forn-tag-input'));
  t('o campo continua aberto para corrigir (não perdeu a edição)', aindaEditando, aindaEditando);
  await pg.keyboard.press('Escape');
  await pg.waitForTimeout(150);
  const semLixo=await pg.evaluate(()=>rkItens[0].fornecedores[0].valor);
  t('cancelando com Esc, o valor antigo não foi sobrescrito', semLixo==='999,00', semLixo);

  console.log('\n6) Modelo e Marca continuam editáveis como antes (não regrediu)');
  await pg.dblclick('[data-editforn$="|modelo"]');
  await pg.waitForTimeout(80);
  await pg.fill('.rks-forn-tag-input','ECO NOVO');
  await pg.keyboard.press('Enter');
  await pg.waitForTimeout(150);
  const modelo=await pg.evaluate(()=>rkItens[0].fornecedores[0].modelo);
  t('Modelo ainda edita e grava normalmente', modelo==='ECO NOVO', modelo);

  await pg.dblclick('[data-editforn$="|marca"]');
  await pg.waitForTimeout(80);
  await pg.fill('.rks-forn-tag-input','MARCA NOVA');
  await pg.keyboard.press('Enter');
  await pg.waitForTimeout(150);
  const marca=await pg.evaluate(()=>rkItens[0].fornecedores[0].marca);
  t('Marca ainda edita e grava normalmente', marca==='MARCA NOVA', marca);

  console.log('\nerros JS:', errs.length?errs:'nenhum');
  console.log(`\n${ok} passaram, ${mau} falharam.`);
  await b.close();
})();
