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
    modais: document.getElementById('fModal').options.length-1,
    anos: document.getElementById('fAno').options.length-1,
    linhas: document.querySelectorAll('.tab tbody tr').length,
  }));
  t('total de itens bate com o arquivo', est.total===dados.length, est);
  t('a tarja do cabeçalho mostra o total', /^6\.514/.test(est.chip), est.chip);
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
    colunas: [...document.querySelectorAll('.tab .th-titulos th')].map(th=>th.textContent.trim()),
    linhasCabecalho: document.querySelectorAll('.tab thead tr').length,
  }));
  console.log('   colunas:', forma.colunas.join(' | '));
  t('existe exatamente 1 tabela na página', forma.tabelas===1, forma);
  t('e exatamente 1 cabeçalho de colunas', forma.theads===1, forma);
  t('o cabeçalho tem 2 linhas: os títulos e a busca por coluna',
    forma.linhasCabecalho===2, forma);
  t('não há mais caixas agrupadas por processo', forma.grupos===0, forma);
  t('não há cards', forma.cards===0, forma);
  t('não há modal de detalhe', forma.modais===0 && forma.semAbrirDet, forma);
  t('o painel dinâmico continua fora', forma.semPainelDinamico, forma);
  t('as colunas trazem o processo junto do item (dá para consultar na linha)',
    forma.colunas.join('|')==='Processo|Abertura|Item|Qtd.|Un.|Vl. Un. Homolg.|Vl. Total|Vencedor|CPF/CNPJ',
    forma.colunas);

  console.log('\n4) A barra escura de números saiu da página');
  const semNumeros=await pg.evaluate(()=>({
    barra: !!document.querySelector('.stats-bar'),
    caixa: !!document.getElementById('statsBar'),
    fn: typeof window.renderStats!=='undefined' || typeof window.statTodos!=='undefined',
    somaNaTela: document.body.textContent.indexOf('327.931.497,39')>=0,
  }));
  t('não existe mais a barra de estatísticas', !semNumeros.barra && !semNumeros.caixa, semNumeros);
  t('e nem as funções que a montavam', !semNumeros.fn, semNumeros);
  t('o valor total somado não aparece mais em lugar nenhum', !semNumeros.somaNaTela, semNumeros);

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
    document.querySelector('[data-sit="SEM"]').click();
    return filtrados.length;
  });
  t('contagem de itens sem vencedor bate', semv===semVencedor, {tela:semv, esperado:semVencedor});

  const modalidadeAlvo=dados[0].modalidade;
  const porModal=await pg.evaluate((m)=>{
    document.querySelector('[data-sit=""]').click();
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

  console.log('\n8b) Cada coluna tem a sua própria busca');
  const cols=await pg.evaluate(()=>{
    limparFiltros();
    return {
      quantos: document.querySelectorAll('.cf').length,
      colunas: [...document.querySelectorAll('.cf')].map(i=>i.dataset.col),
    };
  });
  console.log('   colunas com busca:', cols.colunas.join(', '));
  t('todas as 9 colunas têm campo de busca', cols.quantos===9, cols);
  t('e são as colunas da tabela', cols.colunas.join('|')==='proc|abert|item|qtd|un|unit|total|vend|cnpj', cols);

  /* a busca da coluna casa com o texto que a coluna MOSTRA — inclusive o
     valor já formatado, então dá para procurar "939" e achar "R$ 939,97" */
  const porItem=await pg.evaluate(()=>{
    document.querySelector('.cf[data-col="item"]').value='cebola';
    aplicarFiltros();
    return {n:filtrados.length, todosTemCebola:filtrados.every(x=>x.item.toLowerCase().includes('cebola'))};
  });
  const esperadoCebola=dados.filter(x=>x.item.toLowerCase().includes('cebola')).length;
  t('buscar "cebola" na coluna Item bate com o arquivo', porItem.n===esperadoCebola, {tela:porItem.n, esperado:esperadoCebola});
  t('e só traz itens que realmente contêm "cebola"', porItem.todosTemCebola, porItem);

  const porEmpresa=await pg.evaluate((emp)=>{
    limparFiltros();
    document.querySelector('.cf[data-col="vend"]').value=emp;
    aplicarFiltros();
    return filtrados.length;
  }, comTudo.vencedor.slice(0,12).toLowerCase());
  const esperadoEmp=dados.filter(x=>(x.vencedor||'').toLowerCase().includes(comTudo.vencedor.slice(0,12).toLowerCase())).length;
  t('buscar na coluna Vencedor bate com o arquivo', porEmpresa===esperadoEmp, {tela:porEmpresa, esperado:esperadoEmp});

  const porValor=await pg.evaluate(()=>{
    limparFiltros();
    document.querySelector('.cf[data-col="unit"]').value='939,97';
    aplicarFiltros();
    return {n:filtrados.length, chips:document.getElementById('chipsAtivos').textContent.trim()};
  });
  t('dá para buscar pelo valor já formatado na coluna de preço', porValor.n>0, porValor);
  t('o filtro de coluna aparece como chip (no celular não há cabeçalho)',
    /Valor unitário: 939,97/.test(porValor.chips), porValor.chips);

  const limpou=await pg.evaluate(()=>{
    limparFiltros();
    return {n:filtrados.length, campos:[...document.querySelectorAll('.cf')].every(i=>i.value==='')};
  });
  t('limpar filtros esvazia também os campos das colunas', limpou.campos && limpou.n===6514, limpou);

  console.log('\n8c) Clicar no cabeçalho ordena, e clicar de novo inverte');
  const clique = campo => pg.evaluate(c=>{
    ordenarPor(c);
    const th=document.querySelector('.th-titulos th[data-ord="'+c+'"]');
    return {sort:F.sort, select:document.getElementById('fSort').value,
            classe:th.className, primeiro:filtrados[0], segundo:filtrados[1]};
  }, campo);

  const u1=await clique('unit');
  t('1º clique em "Vl. Un. Homolg." põe o maior primeiro', u1.sort==='unit-desc', u1.sort);
  t('e o 1º item realmente tem o maior unitário', u1.primeiro.vlUnit>=u1.segundo.vlUnit, {a:u1.primeiro.vlUnit,b:u1.segundo.vlUnit});
  t('a seta ▼ marca a coluna ordenada', /ord-desc/.test(u1.classe), u1.classe);
  t('o seletor "ORDENAR" acompanha o clique', u1.select==='unit-desc', u1.select);

  const u2=await clique('unit');
  t('2º clique inverte para o menor primeiro', u2.sort==='unit-asc', u2.sort);
  t('e o 1º item passa a ter o menor unitário', u2.primeiro.vlUnit<=u2.segundo.vlUnit, {a:u2.primeiro.vlUnit,b:u2.segundo.vlUnit});
  t('a seta vira ▲', /ord-asc/.test(u2.classe), u2.classe);

  const tt=await clique('total');
  t('o valor total também ordena, do maior para o menor', tt.sort==='total-desc' && tt.primeiro.vlTotal>=tt.segundo.vlTotal, tt.sort);
  const soUma=await pg.evaluate(()=>document.querySelectorAll('.th-titulos th.ord-asc, .th-titulos th.ord-desc').length);
  t('só uma coluna fica marcada por vez', soUma===1, soUma);

  const it1=await clique('item');
  t('coluna de texto começa em A–Z (e não do maior para o menor)', it1.sort==='item-asc', it1.sort);
  t('e a ordem alfabética vale', it1.primeiro.item.localeCompare(it1.segundo.item,'pt-BR')<=0,
    {a:it1.primeiro.item, b:it1.segundo.item});

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
    const tr=document.querySelector('.tab tbody tr');
    const cs=c=>getComputedStyle(tr.querySelector('.'+c));
    const px=v=>parseFloat(v);
    return {
      escondido: corpo.classList.contains('hide'),
      buscaVisivel: busca.getBoundingClientRect().height>0,
      colunasEscondidas: getComputedStyle(document.querySelector('.tab thead')).display,
      linhaEhBloco: getComputedStyle(tr).display,
      larguraPagina: document.documentElement.scrollWidth,
      larguraTela: document.documentElement.clientWidth,
      /* hierarquia: o item e o preço unitário mandam; o resto é apoio */
      fItem: px(cs('c-item').fontSize),
      fUnit: px(cs('c-unit').fontSize),
      fQtd: px(cs('c-qtd').fontSize),
      fProc: px(cs('c-proc').fontSize),
      pesoUnit: cs('c-unit').fontWeight,
      /* rótulos gerados por CSS que ainda aparecem, em ordem de leitura */
      rotulos: ['c-item','c-unit','c-un','c-qtd','c-total','c-vend','c-cnpj','c-abert']
        .map(c=>getComputedStyle(tr.querySelector('.'+c),'::before').content)
        .filter(v=>v && v!=='none' && v!=='""'),
      /* nenhum bloco pode ficar mais alto que a tela: se ficar, cabe 1 item
         por vez e a lista deixa de ser consultável */
      alturaMaiorBloco: Math.max(...[...document.querySelectorAll('.tab tbody tr')].map(r=>r.getBoundingClientRect().height)),
    };
  });
  console.log('  ', noCel);
  t('o painel de busca NÃO começa recolhido', !noCel.escondido, noCel);
  t('o campo de busca está visível de cara', noCel.buscaVisivel, noCel);
  t('a tabela vira blocos no celular (não tabela espremida)', noCel.linhaEhBloco==='flex' && noCel.colunasEscondidas==='none', noCel);
  t('a página não estoura para os lados', noCel.larguraPagina<=noCel.larguraTela, noCel);
  t('acabaram os rótulos em CAIXA ALTA (QTD., UN., UNITÁRIO...)',
    !noCel.rotulos.some(r=>/[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{3,}/.test(r)), noCel.rotulos);
  t('os rótulos que sobraram são palavras minúsculas de apoio',
    noCel.rotulos.every(r=>/^"(por |qtde |total )"$/.test(r)), noCel.rotulos);
  t('o preço unitário é o número maior do bloco', noCel.fUnit>noCel.fItem && noCel.fUnit>=18, noCel);
  t('e vem em negrito forte', Number(noCel.pesoUnit)>=800, noCel);
  t('o item vem em segundo, acima dos dados de apoio', noCel.fItem>noCel.fQtd && noCel.fItem>noCel.fProc, noCel);
  t('nenhum bloco é mais alto que a tela', noCel.alturaMaiorBloco<844, noCel.alturaMaiorBloco);

  console.log('\nerros JS:', errs.length||errsCel.length?[...errs,...errsCel]:'nenhum');
  console.log(`\n${ok} passaram, ${mau} falharam.`);
  await b.close();
})();
