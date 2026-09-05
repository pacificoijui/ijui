/* Pedido: no cadastro de Status, a lista de "botões de mensagem rápida" só
   tinha "Remover" — pra corrigir um texto era preciso apagar e recriar o
   botão do zero (perdendo a posição na lista). Agora cada botão também tem
   "Editar", que carrega o nome/mensagem nos campos de cima pra corrigir. */
const {chromium, executablePath} = require('./navegador');
const fs=require('fs');
const stub=fs.readFileSync('fbstub3.js','utf8');
let ok=0,mau=0;
function t(n,c,e){ if(c){console.log('  ✓',n);ok++;} else {console.log('  ✗',n,e!==undefined?'\n       '+JSON.stringify(e):'');mau++;process.exitCode=1;} }

const SEED={ status:{
  s1:{id:'em-andamento',nome:'Em Andamento',cor:'amber',ordem:0,atalhos:[
    {label:'Hab. e Prop.', texto:'Considerando a celeridade do procedimento...'},
    {label:'Solicitar Habilitação', texto:'Solicitamos que a empresa envie os do...'},
    {label:'Catálogos', texto:'Solicito o envio dos catálogos dos itens...'},
    {label:'Não enviou documentos.', texto:'A empresa não apresentou, no prazo as...'}
  ]},
  s2:{id:'finalizacao',nome:'Finalização',cor:'blue',ordem:1}
}};

(async()=>{
  const b=await chromium.launch(executablePath?{executablePath}:{});
  const pg=await b.newPage({viewport:{width:1200,height:900}});
  const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
  await pg.route('**/firebasejs/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:r.request().url().includes('firestore')?stub:'/*noop*/'}));
  await pg.route('**/fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await pg.route('**/cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:'window.jspdf={jsPDF:function(){}};'}));
  await pg.addInitScript(()=>localStorage.setItem('copam_auth',JSON.stringify({u:'teste',nome:'QA'})));
  await pg.addInitScript((sd)=>{ window.__SEED=sd; }, SEED);
  await pg.addInitScript((u)=>{ window.__AUTH_SEED=u; }, {uid:'teste-admin', email:'pedrohhpacifico@gmail.com', displayName:'QA', photoURL:''});
  await pg.goto('http://127.0.0.1:8099/pregoeiro/index.html',{waitUntil:'networkidle'});
  await pg.waitForTimeout(700);

  await pg.evaluate(()=>{ abrirModalStatus(); editarStatus('em-andamento'); });
  await pg.waitForTimeout(200);

  console.log('\n1) Cada botão da lista mostra Editar e Remover');
  const linhas=await pg.evaluate(()=>{
    const els=[...document.querySelectorAll('#stAtalhosLista > div')];
    return els.map(el=>({
      textos:[...el.querySelectorAll('button')].map(b=>b.textContent.trim())
    }));
  });
  t('carregou os 4 botões cadastrados', linhas.length===4, linhas);
  t('todas as linhas têm Editar e Remover', linhas.every(l=>l.textos.includes('Editar')&&l.textos.includes('Remover')), linhas);

  console.log('\n2) Clicar em Editar carrega os campos de cima');
  await pg.evaluate(()=>editarAtalhoStatusTemp(1));
  await pg.waitForTimeout(100);
  const carregado=await pg.evaluate(()=>({
    label:document.getElementById('stAtLabel').value,
    texto:document.getElementById('stAtTexto').value,
    botao:document.getElementById('btnAddAtalho').textContent
  }));
  t('o nome do botão foi carregado', carregado.label==='Solicitar Habilitação', carregado);
  t('a mensagem foi carregada', carregado.texto==='Solicitamos que a empresa envie os do...', carregado);
  t('o botão de baixo virou "Salvar alteração"', carregado.botao==='Salvar alteração', carregado);

  const destaque=await pg.evaluate(()=>{
    const els=[...document.querySelectorAll('#stAtalhosLista > div')];
    return {temCancelar: els[1].textContent.includes('Cancelar'), corDiferente: getComputedStyle(els[1]).backgroundColor};
  });
  t('a linha em edição mostra "Cancelar" no lugar de "Editar"', destaque.temCancelar, destaque);

  console.log('\n3) Corrigir o texto e salvar atualiza o item NO LUGAR (não duplica)');
  await pg.fill('#stAtLabel','Solicitar Habilitação (urgente)');
  await pg.fill('#stAtTexto','Solicitamos, com urgência, que a empresa envie a documentação.');
  await pg.click('#btnAddAtalho');
  await pg.waitForTimeout(150);
  const depois=await pg.evaluate(()=>({
    qtd: stAtalhosTemp.length,
    item1: stAtalhosTemp[1],
    ordemLabels: stAtalhosTemp.map(a=>a.label),
    botao: document.getElementById('btnAddAtalho').textContent,
    camposLimpos: document.getElementById('stAtLabel').value===''
  }));
  t('continua com 4 itens (não duplicou)', depois.qtd===4, depois);
  t('o item na posição 1 foi atualizado', depois.item1.label==='Solicitar Habilitação (urgente)' && /urgência/.test(depois.item1.texto), depois.item1);
  t('a ordem dos outros não mudou', depois.ordemLabels[0]==='Hab. e Prop.' && depois.ordemLabels[2]==='Catálogos' && depois.ordemLabels[3]==='Não enviou documentos.', depois.ordemLabels);
  t('o botão voltou a dizer "+ Adicionar botão"', depois.botao==='+ Adicionar botão', depois.botao);
  t('os campos de cima foram limpos', depois.camposLimpos, depois);

  console.log('\n4) Cancelar a edição não altera nada');
  await pg.evaluate(()=>editarAtalhoStatusTemp(0));
  await pg.waitForTimeout(80);
  await pg.fill('#stAtLabel','Rascunho que não deve salvar');
  await pg.evaluate(()=>cancelarEdicaoAtalhoStatusTemp());
  await pg.waitForTimeout(100);
  const cancelado=await pg.evaluate(()=>({
    item0: stAtalhosTemp[0].label,
    campo: document.getElementById('stAtLabel').value,
    botao: document.getElementById('btnAddAtalho').textContent
  }));
  t('o item original não foi tocado', cancelado.item0==='Hab. e Prop.', cancelado);
  t('o campo voltou a ficar vazio', cancelado.campo==='', cancelado);
  t('o botão voltou ao normal', cancelado.botao==='+ Adicionar botão', cancelado);

  console.log('\n5) Remover o item que está em edição sai do modo edição direitinho');
  await pg.evaluate(()=>editarAtalhoStatusTemp(2));
  await pg.waitForTimeout(80);
  await pg.evaluate(()=>removerAtalhoStatusTemp(2));
  await pg.waitForTimeout(100);
  const removidoEmEdicao=await pg.evaluate(()=>({
    qtd: stAtalhosTemp.length,
    botao: document.getElementById('btnAddAtalho').textContent,
    campo: document.getElementById('stAtLabel').value
  }));
  t('o item foi removido (sobraram 3)', removidoEmEdicao.qtd===3, removidoEmEdicao);
  t('saiu do modo edição sozinho (sem travar no "Salvar alteração")', removidoEmEdicao.botao==='+ Adicionar botão', removidoEmEdicao);
  t('os campos ficaram limpos', removidoEmEdicao.campo==='', removidoEmEdicao);

  console.log('\n6) Remover um item ANTES do que está em edição não perde a edição em andamento');
  await pg.evaluate(()=>{
    stAtalhosTemp=[{label:'A',texto:'texto A'},{label:'B',texto:'texto B'},{label:'C',texto:'texto C'}];
    editarAtalhoStatusTemp(2);   /* editando "C" */
  });
  await pg.waitForTimeout(80);
  await pg.fill('#stAtLabel','C (editando)');
  await pg.evaluate(()=>removerAtalhoStatusTemp(0));  /* remove "A", que vem antes */
  await pg.waitForTimeout(100);
  const reindexado=await pg.evaluate(()=>({
    qtd: stAtalhosTemp.length,
    editandoIdx: editandoAtalhoIdx,
    campoAindaPreenchido: document.getElementById('stAtLabel').value
  }));
  t('sobraram 2 itens', reindexado.qtd===2, reindexado);
  t('o índice em edição foi realinhado (apontava pro "C", que agora é o índice 1)', reindexado.editandoIdx===1, reindexado);
  t('o campo continuou com o que a pessoa estava digitando (não perdeu a edição)', reindexado.campoAindaPreenchido==='C (editando)', reindexado);
  await pg.click('#btnAddAtalho');
  await pg.waitForTimeout(100);
  const salvouCerto=await pg.evaluate(()=>stAtalhosTemp.map(a=>a.label));
  t('salvando, atualizou o "C" certo (não o "B")', salvouCerto[0]==='B' && salvouCerto[1]==='C (editando)', salvouCerto);

  console.log('\n7) Trocar de status pra editar (fechar e abrir outro) não deixa lixo de edição');
  await pg.evaluate(()=>{ editarStatus('finalizacao'); });
  await pg.waitForTimeout(100);
  const outroStatus=await pg.evaluate(()=>({
    editandoIdx: editandoAtalhoIdx,
    botao: document.getElementById('btnAddAtalho').textContent,
    qtdAtalhos: stAtalhosTemp.length
  }));
  t('não ficou preso em modo edição do status anterior', outroStatus.editandoIdx===-1 && outroStatus.botao==='+ Adicionar botão', outroStatus);
  t('carregou os atalhos do status certo (Finalização não tem nenhum)', outroStatus.qtdAtalhos===0, outroStatus);

  console.log('\nerros JS:', errs.length?errs:'nenhum');
  console.log(`\n${ok} passaram, ${mau} falharam.`);
  await b.close();
})();
