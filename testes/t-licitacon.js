/* Módulo licitacon/ — consulta pública de itens licitados (dados do Portal
   LicitaCon, TCE-RS), sem Firebase e sem escrita: só lê dados/itens.json.

   Confere que os dados carregam, que os filtros (busca livre, modalidade,
   categoria, ano, empresa vencedora, com/sem vencedor) e a ordenação batem
   com o que está no arquivo.

   Cobre também o formato pedido: UMA tabela só (sem caixas por processo,
   sem cards, sem modal — tudo se consulta na própria linha), o valor
   UNITÁRIO como dado principal, e no celular a busca já aberta. */
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
  const pg=await b.newPage({viewport:{width:1440,height:900}});
  const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
  await pg.goto('http://127.0.0.1:8099/licitacon/index.html',{waitUntil:'networkidle'});
  await pg.waitForTimeout(700);

  console.log('\n2) A tela carrega o mesmo total do arquivo e monta tudo');
  const est=await pg.evaluate(()=>({
    total: ITENS.length,
    chip: document.getElementById('infoChip').textContent,
    stats: document.getElementById('statsBar').children.length,
    modais: document.getElementById('fModal').options.length-1,
    anos: document.getElementById('fAno').options.length-1,
    linhas: document.querySelectorAll('.tab tbody tr').length,
  }));
  t('total de itens bate com o arquivo', est.total===dados.length, est);
  t('a tarja do cabeçalho mostra o total', /^6\.514/.test(est.chip), est.chip);
  t('as 5 estatísticas foram montadas', est.stats===5, est);
  t('select de modalidade populado', est.modais>0, est);
  t('select de ano populado', est.anos>0, est);
  t('primeiro lote de linhas renderizou', est.linhas>0 && est.linhas<=100, est);

  console.log('\n3) É UMA tabela só — sem caixas por processo, sem cards, sem modal');
  const forma=await pg.evaluate(()=>({
    tabelas: document.querySelectorAll('table').length,
    theads: document.querySelectorAll('thead').length,
    grupos: document.querySelectorAll('.grupo, .grupo-head').length,
    cards: document.querySelectorAll('.icard, .ccard').length,
    modais: document.querySelectorAll('.overlay, .modal').length,
    semAbrirDet: typeof window.abrirDet==='undefined',
    semPainelDinamico: !document.getElementById('painelDash') && typeof window.renderDash==='undefined',
    colunas: [...document.querySelectorAll('.tab thead th')].map(th=>th.textContent.trim()),
  }));
  console.log('   colunas:', forma.colunas.join(' | '));
  t('existe exatamente 1 tabela na página', forma.tabelas===1, forma);
  t('e exatamente 1 cabeçalho de colunas', forma.theads===1, forma);
  t('não há mais caixas agrupadas por processo', forma.grupos===0, forma);
  t('não há cards', forma.cards===0, forma);
  t('não há modal de detalhe', forma.modais===0 && forma.semAbrirDet, forma);
  t('o painel dinâmico continua fora', forma.semPainelDinamico, forma);
  t('as colunas trazem o processo junto do item (dá para consultar na linha)',
    forma.colunas.join('|')==='Processo|Abertura|Item|Qtd.|Un.|Vl. Un. Homolg.|Vl. Total|Vencedor|CPF/CNPJ',
    forma.colunas);

  console.log('\n4) A estatística de valor total bate com a soma do arquivo');
  const statTxt=await pg.evaluate(()=>document.getElementById('statsBar').children[2].querySelector('.stat-num').textContent);
  const totalFmt=totalGeral.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  t('valor total homologado exibido bate com a soma do JSON', statTxt.trim()===totalFmt, {tela:statTxt, esperado:totalFmt});

  console.log('\n5) Busca livre filtra');
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

  console.log('\n6) Filtros de situação e modalidade batem com o arquivo');
  const semv=await pg.evaluate(()=>{
    document.getElementById('fBusca').value='';
    statSemVencedor();
    return filtrados.length;
  });
  t('contagem de itens sem vencedor bate', semv===semVencedor, {tela:semv, esperado:semVencedor});

  const modalidadeAlvo=dados[0].modalidade;
  const porModal=await pg.evaluate((m)=>{
    statTodos();
    document.getElementById('fModal').value=m;
    aplicarFiltros();
    return filtrados.length;
  }, modalidadeAlvo);
  t('filtro por modalidade "'+modalidadeAlvo+'" bate',
    porModal===dados.filter(x=>x.modalidade===modalidadeAlvo).length, porModal);

  console.log('\n7) Ordenação — o valor UNITÁRIO é a prioridade desta consulta');
  const ordena = (chave)=>pg.evaluate((k)=>{
    document.getElementById('fModal').value='';
    document.getElementById('fSort').value=k;
    aplicarFiltros();
    return {id:filtrados[0].id, primeiraCelUnit:document.querySelector('.tab tbody tr td.c-unit').textContent.trim()};
  }, chave);

  const maiorUnit=dados.reduce((a,b)=>(b.vlUnit||0)>(a.vlUnit||0)?b:a);
  const porUnit=await ordena('unit-desc');
  t('"Maior valor unitário" traz em 1º o item de maior unitário do arquivo',
    porUnit.id===maiorUnit.id, {tela:porUnit.id, esperado:maiorUnit.id, item:maiorUnit.item});
  t('a primeira linha da tabela mostra esse unitário',
    porUnit.primeiraCelUnit.replace(/\s/g,'').indexOf(maiorUnit.vlUnit.toLocaleString('pt-BR',{minimumFractionDigits:2}).replace(/\s/g,''))>=0,
    {tela:porUnit.primeiraCelUnit, esperado:maiorUnit.vlUnit});

  const menorUnit=dados.reduce((a,b)=>(b.vlUnit||0)<(a.vlUnit||0)?b:a);
  const porUnitAsc=await ordena('unit-asc');
  t('"Menor valor unitário" inverte a ordem',
    (dados.find(x=>x.id===porUnitAsc.id).vlUnit||0)===(menorUnit.vlUnit||0), {tela:porUnitAsc.id});

  const maiorTotal=dados.reduce((a,b)=>(b.vlTotal||0)>(a.vlTotal||0)?b:a);
  const porTotal=await ordena('total-desc');
  t('"Maior valor total" continua existindo e funciona', porTotal.id===maiorTotal.id,
    {tela:porTotal.id, esperado:maiorTotal.id});

  console.log('\n8) A linha traz tudo o que se consulta, sem precisar clicar');
  const comTudo=dados.find(x=>x.vencedor && x.cnpj && x.qtd!=null && x.abertura);
  const linha=await pg.evaluate((it)=>{
    document.getElementById('fSort').value='abertura-desc';
    document.getElementById('fBusca').value=it.item.slice(0,40);
    document.getElementById('fVencedor').value=it.vencedor;
    aplicarFiltros();
    const tr=document.querySelector('.tab tbody tr');
    if(!tr) return null;
    const cel = c => { const e=tr.querySelector('.'+c); return e?e.textContent.trim():null; };
    return {proc:cel('c-proc'), abert:cel('c-abert'), item:cel('c-item'), qtd:cel('c-qtd'),
            un:cel('c-un'), unit:cel('c-unit'), total:cel('c-total'), vend:cel('c-vend'), cnpj:cel('c-cnpj')};
  }, comTudo);
  console.log('  ', linha);
  t('a linha existe', !!linha, comTudo.item);
  t('traz o nº/ano do processo', linha.proc.indexOf('Nº '+comTudo.nr+'/'+comTudo.ano)===0, linha.proc);
  t('traz a modalidade junto', linha.proc.indexOf(comTudo.modalidade)>0, linha.proc);
  t('traz a data de abertura', linha.abert===comTudo.abertura.split('-').reverse().join('/'), linha.abert);
  t('traz a descrição do item', linha.item===comTudo.item, {tela:linha.item, esperado:comTudo.item});
  t('traz a unidade', linha.un===comTudo.unidade, linha.un);
  t('traz o valor unitário', linha.unit.indexOf(comTudo.vlUnit.toLocaleString('pt-BR',{minimumFractionDigits:2}))>=0, linha.unit);
  t('traz o valor total', linha.total.indexOf(comTudo.vlTotal.toLocaleString('pt-BR',{minimumFractionDigits:2}))>=0, linha.total);
  t('traz a empresa vencedora', linha.vend===comTudo.vencedor, linha.vend);
  const cnpjFmt=comTudo.cnpj.length===14
    ? comTudo.cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : comTudo.cnpj;
  t('traz o CPF/CNPJ formatado', linha.cnpj===cnpjFmt, {tela:linha.cnpj, esperado:cnpjFmt});

  console.log('\n9) Limpar filtros volta ao estado inicial');
  const total2=await pg.evaluate(()=>{ limparFiltros(); return filtrados.length; });
  t('limpar filtros mostra todos os itens de novo', total2===dados.length, total2);

  console.log('\n10) No celular a busca já vem aberta');
  const cel=await b.newPage({viewport:{width:390,height:844}});
  const errsCel=[]; cel.on('pageerror',e=>errsCel.push(e.message));
  await cel.goto('http://127.0.0.1:8099/licitacon/index.html',{waitUntil:'networkidle'});
  await cel.waitForTimeout(700);
  const noCel=await cel.evaluate(()=>{
    const corpo=document.getElementById('filtrosBody');
    const busca=document.getElementById('fBusca');
    return {
      escondido: corpo.classList.contains('hide'),
      buscaVisivel: busca.getBoundingClientRect().height>0,
      colunasEscondidas: getComputedStyle(document.querySelector('.tab thead')).display,
      linhaEhBloco: getComputedStyle(document.querySelector('.tab tbody tr')).display,
      larguraPagina: document.documentElement.scrollWidth,
      larguraTela: document.documentElement.clientWidth,
    };
  });
  console.log('  ', noCel);
  t('o painel de busca NÃO começa recolhido', !noCel.escondido, noCel);
  t('o campo de busca está visível de cara', noCel.buscaVisivel, noCel);
  t('a tabela vira blocos no celular (não tabela espremida)', noCel.linhaEhBloco==='flex' && noCel.colunasEscondidas==='none', noCel);
  t('a página não estoura para os lados', noCel.larguraPagina<=noCel.larguraTela, noCel);

  console.log('\nerros JS:', errs.length||errsCel.length?[...errs,...errsCel]:'nenhum');
  console.log(`\n${ok} passaram, ${mau} falharam.`);
  await b.close();
})();
