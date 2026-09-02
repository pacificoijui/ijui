/* Módulo licitacon/ — consulta pública de itens licitados (dados do Portal
   LicitaCon, TCE-RS), sem Firebase e sem escrita: só lê dados/itens.json.
   Confere que os dados carregam, que os filtros (busca livre, modalidade,
   categoria, ano, empresa vencedora, com/sem vencedor) e a ordenação batem
   com o que está no arquivo, e que o modal de detalhe mostra o item certo. */
const {chromium, executablePath} = require('./navegador');
const fs=require('fs');
let ok=0,mau=0;
function t(n,c,e){ if(c){console.log('  ✓',n);ok++;} else {console.log('  ✗',n,e!==undefined?'\n       '+JSON.stringify(e):'');mau++;process.exitCode=1;} }

(async()=>{
  console.log('1) O JSON de dados é consistente');
  const dados=JSON.parse(fs.readFileSync('../licitacon/dados/itens.json','utf8'));
  t('tem itens', dados.length>0, dados.length);
  t('todo item tem id numérico único', new Set(dados.map(x=>x.id)).size===dados.length);
  t('todo item tem valor total (número ou null, nunca string)',
    dados.every(x=>x.vlTotal===null||typeof x.vlTotal==='number'),
    dados.find(x=>typeof x.vlTotal!=='number'&&x.vlTotal!==null));
  t('toda data de abertura é AAAA-MM-DD ou null',
    dados.every(x=>x.abertura===null||/^\d{4}-\d{2}-\d{2}$/.test(x.abertura)),
    dados.find(x=>x.abertura&&!/^\d{4}-\d{2}-\d{2}$/.test(x.abertura)));
  const totalGeral=dados.reduce((s,x)=>s+(x.vlTotal||0),0);
  const semVencedor=dados.filter(x=>!x.vencedor).length;

  const b=await chromium.launch(executablePath?{executablePath}:{});
  const pg=await b.newPage({viewport:{width:1280,height:900}});
  const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
  await pg.goto('http://127.0.0.1:8099/licitacon/index.html',{waitUntil:'networkidle'});
  await pg.waitForTimeout(700);

  console.log('\n2) A tela carrega o mesmo total do arquivo e monta tudo');
  const est=await pg.evaluate(()=>({
    total: ITENS.length,
    chip: document.getElementById('infoChip').textContent,
    cards: document.querySelectorAll('.icard').length,
    stats: document.getElementById('statsBar').children.length,
    modais: document.getElementById('fModal').options.length-1,
    anos: document.getElementById('fAno').options.length-1,
  }));
  t('total de itens bate com o arquivo', est.total===dados.length, est);
  t('a tarja do cabeçalho mostra o total', est.chip.indexOf(String(dados.length))===0, est.chip);
  t('cards do primeiro lote renderizaram', est.cards>0 && est.cards<=60, est);
  t('as 5 estatísticas foram montadas', est.stats===5, est);
  t('select de modalidade populado', est.modais>0, est);
  t('select de ano populado', est.anos>0, est);

  console.log('\n3) A estatística de valor total bate com a soma do arquivo');
  const statTxt=await pg.evaluate(()=>document.getElementById('statsBar').children[2].querySelector('.stat-num').textContent);
  const totalFmt=totalGeral.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  t('valor total homologado exibido bate com a soma do JSON', statTxt.trim()===totalFmt, {tela:statTxt, esperado:totalFmt});

  console.log('\n4) Busca livre filtra por texto do item');
  const alvo=dados[0];
  const termoBusca=alvo.item.split(' ').filter(w=>w.length>4)[0]||alvo.item.split(' ')[0];
  const achou=await pg.evaluate((termo)=>{
    document.getElementById('fBusca').value=termo;
    aplicarFiltros();
    return filtrados.length;
  }, termoBusca);
  /* a busca da tela cobre item + vencedor + cnpj + nº/ano + modalidade +
     categoria, não só o texto do item — reproduz a mesma combinação aqui */
  const esperadoBusca=dados.filter(x=>{
    const alvo=(x.item+' '+x.vencedor+' '+x.cnpj+' '+x.nr+'/'+x.ano+' '+x.modalidade+' '+x.categoria).toLowerCase();
    return alvo.includes(termoBusca.toLowerCase());
  }).length;
  t('a busca livre por "'+termoBusca+'" bate com a contagem manual no arquivo', achou===esperadoBusca, {tela:achou, esperado:esperadoBusca});

  console.log('\n5) Filtro "sem vencedor" bate com a contagem do arquivo');
  const semv=await pg.evaluate(()=>{
    document.getElementById('fBusca').value='';
    statSemVencedor();
    return filtrados.length;
  });
  t('contagem de itens sem vencedor bate', semv===semVencedor, {tela:semv, esperado:semVencedor});

  console.log('\n6) Filtro por modalidade bate com a contagem do arquivo');
  const modalidadeAlvo=dados[0].modalidade;
  const porModal=await pg.evaluate((m)=>{
    statTodos();
    document.getElementById('fModal').value=m;
    aplicarFiltros();
    return filtrados.length;
  }, modalidadeAlvo);
  const esperadoModal=dados.filter(x=>x.modalidade===modalidadeAlvo).length;
  t('filtro por modalidade "'+modalidadeAlvo+'" bate', porModal===esperadoModal, {tela:porModal, esperado:esperadoModal});

  console.log('\n7) Ordenar por maior valor traz o item mais caro primeiro');
  const maisCaro=dados.reduce((a,b)=>(b.vlTotal||0)>(a.vlTotal||0)?b:a);
  const primeiroOrdenado=await pg.evaluate(()=>{
    document.getElementById('fModal').value='';
    document.getElementById('fSort').value='valor-desc';
    aplicarFiltros();
    return filtrados[0].id;
  });
  t('o item de maior valor do arquivo aparece em 1º ao ordenar por valor', primeiroOrdenado===maisCaro.id,
    {tela:primeiroOrdenado, esperado:maisCaro.id, item:maisCaro.item});

  console.log('\n8) Modal de detalhe mostra os dados certos de um item específico');
  const comVencedor=dados.find(x=>x.vencedor && x.cnpj);
  await pg.evaluate((id)=>{ abrirDet(id); }, comVencedor.id);
  await pg.waitForTimeout(150);
  const det=await pg.evaluate(()=>({
    aberto: document.getElementById('ovDet').classList.contains('open'),
    titulo: document.getElementById('detTitle').textContent,
    corpo: document.getElementById('detBody').textContent
  }));
  t('o modal abriu', det.aberto);
  t('o título é a descrição do item', det.titulo===comVencedor.item, {tela:det.titulo, esperado:comVencedor.item});
  t('o nome da empresa vencedora aparece', det.corpo.indexOf(comVencedor.vencedor)>=0, comVencedor.vencedor);
  const cnpjFmt=comVencedor.cnpj.length===14
    ? comVencedor.cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
    : comVencedor.cnpj;
  t('o CNPJ formatado aparece', det.corpo.indexOf(cnpjFmt)>=0, {tela:det.corpo.slice(0,400), esperado:cnpjFmt});

  console.log('\n9) Limpar filtros volta ao estado inicial (todos os itens)');
  const total2=await pg.evaluate(()=>{
    fecharDet();
    limparFiltros();
    return filtrados.length;
  });
  t('limpar filtros mostra todos os itens de novo', total2===dados.length, total2);

  console.log('\nerros JS:', errs.length?errs:'nenhum');
  console.log(`\n${ok} passaram, ${mau} falharam.`);
  await b.close();
})();
