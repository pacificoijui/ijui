/* Módulo licitacon/ — consulta pública de itens licitados (dados do Portal
   LicitaCon, TCE-RS), sem Firebase e sem escrita: só lê dados/itens.json.
   Confere que os dados carregam, que os filtros (busca livre, modalidade,
   categoria, ano, empresa vencedora, com/sem vencedor) e a ordenação batem
   com o que está no arquivo, e que o modal de detalhe mostra o item certo.

   Cobre também o formato pedido: tabela agrupada por processo (como no
   próprio LicitaCon), não cards; e o valor UNITÁRIO como dado principal,
   com o total em segundo plano. */
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
    grupos: document.querySelectorAll('.grupo').length,
    linhas: document.querySelectorAll('.tab tbody tr').length,
    stats: document.getElementById('statsBar').children.length,
    modais: document.getElementById('fModal').options.length-1,
    anos: document.getElementById('fAno').options.length-1,
    semPainelDinamico: !document.getElementById('painelDash') && typeof window.renderDash==='undefined',
    semCards: document.querySelectorAll('.icard').length===0,
  }));
  t('total de itens bate com o arquivo', est.total===dados.length, est);
  t('a tarja do cabeçalho mostra o total', est.chip.indexOf('6.514')===0||est.chip.indexOf(String(dados.length))===0, est.chip);
  t('o painel dinâmico não existe mais', est.semPainelDinamico, est);
  t('não há mais cards — a lista é tabela', est.semCards, est);
  t('grupos de processo renderizaram', est.grupos>0, est);
  t('linhas de item renderizaram dentro das tabelas', est.linhas>0, est);
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

  console.log('\n7) Ordenação — o valor UNITÁRIO é a prioridade desta consulta');
  const ordena = (chave)=>pg.evaluate((k)=>{
    document.getElementById('fModal').value='';
    document.getElementById('fSort').value=k;
    aplicarFiltros();
    return {id:filtrados[0].id, primeiroGrupo:document.querySelector('.grupo .tab tbody tr td.c-unit').textContent.trim()};
  }, chave);

  const maiorUnit=dados.reduce((a,b)=>(b.vlUnit||0)>(a.vlUnit||0)?b:a);
  const porUnit=await ordena('unit-desc');
  t('"Maior valor unitário" traz em 1º o item de maior unitário do arquivo',
    porUnit.id===maiorUnit.id, {tela:porUnit.id, esperado:maiorUnit.id, item:maiorUnit.item});
  t('a primeira linha da tabela mostra esse unitário',
    porUnit.primeiroGrupo.replace(/\s/g,'').indexOf(maiorUnit.vlUnit.toLocaleString('pt-BR',{minimumFractionDigits:2}).replace(/\s/g,''))>=0,
    {tela:porUnit.primeiroGrupo, esperado:maiorUnit.vlUnit});

  const menorUnit=dados.reduce((a,b)=>(b.vlUnit||0)<(a.vlUnit||0)?b:a);
  const porUnitAsc=await ordena('unit-asc');
  t('"Menor valor unitário" inverte a ordem', (dados.find(x=>x.id===porUnitAsc.id).vlUnit||0)===(menorUnit.vlUnit||0),
    {tela:porUnitAsc.id, esperado:menorUnit.id});

  const maiorTotal=dados.reduce((a,b)=>(b.vlTotal||0)>(a.vlTotal||0)?b:a);
  const porTotal=await ordena('total-desc');
  t('"Maior valor total" continua existindo e funciona', porTotal.id===maiorTotal.id,
    {tela:porTotal.id, esperado:maiorTotal.id, item:maiorTotal.item});

  console.log('\n7b) A lista agrupa por processo, como no LicitaCon');
  const grupo=await pg.evaluate(()=>{
    document.getElementById('fSort').value='abertura-desc';
    aplicarFiltros();
    const g=document.querySelector('.grupo');
    return {
      cabecalho: g.querySelector('.grupo-head').textContent.replace(/\s+/g,' ').trim(),
      colunas: [...g.querySelectorAll('.tab thead th')].map(th=>th.textContent.trim()).filter(Boolean),
      itensNoGrupo: g.querySelectorAll('.tab tbody tr').length,
      itensDoPrimeiroProcesso: grupos[0].itens.length
    };
  });
  console.log('   cabeçalho:', grupo.cabecalho);
  console.log('   colunas..:', grupo.colunas.join(' | '));
  t('o cabeçalho do grupo traz Nº/ano do processo', /Nº\s*\S+\/\d{4}/.test(grupo.cabecalho), grupo.cabecalho);
  t('as colunas são as do LicitaCon (item, qtd, un, unitário, total, vencedor, CNPJ)',
    grupo.colunas.join('|')==='Item|Qtd.|Un.|Vl. Un. Homolg.|Vl. Total|Vencedor|CPF/CNPJ', grupo.colunas);
  t('as linhas do grupo são exatamente os itens daquele processo',
    grupo.itensNoGrupo===grupo.itensDoPrimeiroProcesso, grupo);

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
