/* O módulo Arquivo saiu do protótipo: era quatro fetch de dados/*.json, sem
   login e sem gravar. Agora são quatro coleções no mesmo Firestore do resto
   do sistema, atrás do mesmo portão de acesso — painel "arquivo" em
   usuarios_v2 — e a tela do Arquivo é lida UMA MODALIDADE POR VEZ, como as
   Requisições são lidas uma secretaria por vez.

   O que este teste cobra:
     · sem conta aprovada com o painel liberado, nenhuma coleção chega ao
       navegador;
     · cada tela lê só a sua coleção, e só quando é aberta — nada de ler as
       quatro na abertura;
     · a faixa de modalidades é um RECORTE (uma consulta por modalidade), e
       não um filtro em cima de tudo carregado;
     · "Visualizar" não grava;
     · a importação sobe a carga sem duplicar. */
const {chromium, executablePath} = require('./navegador');
const fs = require('fs');
let ok = 0, mau = 0;
function t(n, c, e){ if(c){ console.log('  ✓', n); ok++; } else { console.log('  ✗', n, e !== undefined ? '\n       ' + JSON.stringify(e) : ''); mau++; process.exitCode = 1; } }

/* Carga de mentira, com a forma da de verdade: as cinco modalidades que
   existem nos dados do setor, em quantidades diferentes — é o que permite
   conferir que o recorte trouxe UMA e não todas. */
const MODS = ['DISPENSA', 'PREGÃO', 'CONCORRÊNCIA', 'INEXIGIBILIDADE', 'REQ. NÃO SE APLICA'];
const QUANTAS = { 'DISPENSA': 9, 'PREGÃO': 5, 'CONCORRÊNCIA': 3, 'INEXIGIBILIDADE': 2, 'REQ. NÃO SE APLICA': 1 };
const pastas = {};
let idp = 0;
MODS.forEach(m => {
  for(let i = 0; i < QUANTAS[m]; i++){
    idp++;
    pastas[String(idp)] = { id: idp, modalidade: m, processo: m.slice(0, 4) + ' ' + (i + 1) + ' - objeto de teste',
      pregoeiro: i % 2 ? 'RODRIGO' : 'ANDREI', arquivadoEm: '2026-0' + ((i % 9) + 1) + '-10',
      checklist: i % 3 !== 0, vencedor: 'Empresa ' + (i + 1), origem: 'Controle do Arquivo' };
  }
});
/* Trâmites: o que importa é que só os SEM volta sejam lidos. */
const tramites = {
  '1': {id:1, docTipo:'Processo', docNum:'101', comQuem:'ANDREI', saiuEm:'2026-01-05', voltouEm:null, tipo:'assinatura'},
  '2': {id:2, docTipo:'Processo', docNum:'102', comQuem:'ANDREI', saiuEm:'2026-08-20', voltouEm:null, tipo:'assinatura'},
  '3': {id:3, docTipo:'Pasta',    docNum:'103', comQuem:'MAITÊ',  saiuEm:'2026-09-01', voltouEm:null, tipo:'emprestimo'},
  '4': {id:4, docTipo:'Processo', docNum:'104', comQuem:'DENER',  saiuEm:'2026-02-02', voltouEm:'2026-02-03', tipo:'assinatura'},
  '5': {id:5, docTipo:'Processo', docNum:'105', comQuem:'DENER',  saiuEm:'2026-03-02', voltouEm:'2026-03-04', tipo:'assinatura'}
};
/* Anulações e memorandos são cadernos ANUAIS, lidos um ano por vez. A
   semente tem os três casos que importam: o ano corrente, um ano velho (que
   NÃO pode vir na abertura) e a data torta — o "24/07/2062" que a planilha
   de verdade guarda —, que vira ano nulo e TEM de vir sempre, porque
   documento escondido é pior que leitura paga. */
const ANO = new Date().getFullYear();
const anulacoes = {
  '1': {id:1, num:1, valor:1000, secretaria:'SMED', reqSec:'SMED', quem:'ANA', ano:ANO,   contabilidadeEm:ANO+'-05-01'},
  '2': {id:2, num:2, valor:2500, secretaria:'SMS',  reqSec:'SMS',  quem:'ANA', ano:ANO,   contabilidadeEm:ANO+'-05-02'},
  '3': {id:3, num:3, valor:700,  secretaria:'SMS',  reqSec:'SMS',  quem:'ANA', ano:ANO-2, contabilidadeEm:(ANO-2)+'-03-09'}
};
const memorandos = {
  '1': {id:1, num:'10', secretaria:'SMED', entregueA:'ANDREI', recebidoEm:ANO+'-04-01',     ano:ANO,   descricao:'do ano'},
  '2': {id:2, num:'11', secretaria:'SMS',  entregueA:'ANDREI', recebidoEm:(ANO-3)+'-04-01', ano:ANO-3, descricao:'de anos atrás'},
  '3': {id:3, num:'12', secretaria:'SMS',  entregueA:'MAITÊ',  recebidoEm:'2062-07-24',     ano:null,  descricao:'data torta da planilha'}
};

const TOTAL_PASTAS = Object.keys(pastas).length;
const ABERTOS = Object.values(tramites).filter(x => !x.voltouEm).length;

(async () => {
  const stub = fs.readFileSync('fbstub3.js', 'utf8');
  function seedCom(nivel, comDados){
    return {
      arquivo_pastas:     comDados === false ? {} : pastas,
      arquivo_tramites:   comDados === false ? {} : tramites,
      arquivo_anulacoes:  comDados === false ? {} : anulacoes,
      arquivo_memorandos: comDados === false ? {} : memorandos,
      usuarios_v2: {'g-pedro': {email:'pedrohhpacifico@gmail.com', nome:'Pedro', status:'aprovado',
        isAdmin:false, acessos:{agenda:'nenhum', pregoeiro:'nenhum', contratos:'nenhum', arquivo:nivel},
        provedor:'google.com'}}
    };
  }
  async function abrirArquivo(pg, nivel, comDados){
    await pg.route('**/firebasejs/**', r => r.fulfill({status:200, contentType:'application/javascript', body:stub}));
    await pg.route('**/fonts.googleapis.com/**', r => r.fulfill({status:200, contentType:'text/css', body:''}));
    await pg.addInitScript((sd) => { window.__SEED = sd; }, seedCom(nivel, comDados));
    await pg.addInitScript((u) => { window.__AUTH_SEED = u; }, {uid:'g-pedro', email:'pedrohhpacifico@gmail.com', displayName:'Pedro', photoURL:''});
    await pg.addInitScript(() => { try{ localStorage.removeItem('arquivo_ijui_modalidade'); }catch(e){} });
    await pg.goto('http://127.0.0.1:8099/arquivo/index.html', {waitUntil:'networkidle'});
    await pg.waitForTimeout(700);
  }

  const b = await chromium.launch(executablePath ? {executablePath} : {});

  console.log('1) O protótipo virou módulo: Firestore, portão e nada de fetch de JSON');
  const html = fs.readFileSync('../arquivo/index.html', 'utf8');
  t('aponta para o mesmo projeto do resto do sistema',
    /projectId: "processos-ijui"/.test(html) && /usuarios_v2/.test(html));
  t('as quatro coleções estão declaradas num lugar só',
    /arquivo_tramites/.test(html) && /arquivo_anulacoes/.test(html)
    && /arquivo_memorandos/.test(html) && /arquivo_pastas/.test(html));
  t('a carga real continua fora do repositório',
    !fs.existsSync('../arquivo/dados/pastas.json') || fs.readFileSync('../arquivo/dados/.gitignore','utf8').indexOf('*.json') >= 0);
  const regras = fs.readFileSync('../firestore-processos-ijui.rules', 'utf8');
  t('as quatro coleções têm regra, e nenhuma delas apaga',
    ['arquivo_tramites','arquivo_anulacoes','arquivo_memorandos','arquivo_pastas']
      .every(c => new RegExp('match /' + c + '/\\{id\\} \\{[^}]*allow delete: if false;', 's').test(regras)));
  t('conta nova não nasce com o painel Arquivo marcado',
    /get\('arquivo', 'nenhum'\) +in \['nenhum', false\]/.test(regras));
  t('o painel Arquivo aparece no cadastro de contas',
    /id:"arquivo"/.test(fs.readFileSync('../usuarios/index.html', 'utf8')));

  console.log('\n2) Sem o painel liberado, nenhuma coleção chega ao navegador');
  const neg = await b.newPage({viewport:{width:1280, height:900}});
  await abrirArquivo(neg, 'nenhum');
  const fechado = await neg.evaluate(() => ({
    portao: document.getElementById('authGate').style.display !== 'none',
    pastas: PASTAS.length, tramites: TRAMITES.length,
    anul: ANULACOES.length, memo: MEMORANDOS.length
  }));
  t('o portão fica de pé', fechado.portao, fechado);
  t('e nada foi carregado',
    !fechado.pastas && !fechado.tramites && !fechado.anul && !fechado.memo, fechado);
  await neg.close();

  console.log('\n3) A abertura lê UMA coleção, não as quatro');
  const pg = await b.newPage({viewport:{width:1280, height:900}});
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  pg.on('dialog', d => d.accept());
  await abrirArquivo(pg, 'editar');
  const abertura = await pg.evaluate(() => ({
    tela: telaAtual, lidas: [...CARREGADA],
    tramites: TRAMITES.length, pastas: PASTAS.length,
    anul: ANULACOES.length, memo: MEMORANDOS.length
  }));
  t('abre na tela "na rua", que é a razão do módulo', abertura.tela === 'rua', abertura);
  t('e só ela foi lida', abertura.lidas.join(',') === 'rua', abertura);
  t('as outras três coleções não foram tocadas',
    !abertura.pastas && !abertura.anul && !abertura.memo, abertura);
  /* A consulta é where('voltouEm','==',null): o que já voltou não vem. */
  t('traz só o que está fora, não o ano inteiro de trâmites',
    abertura.tramites === ABERTOS, {veio: abertura.tramites, esperado: ABERTOS});

  console.log('\n4) O Arquivo é lido uma modalidade por vez');
  const semMod = await pg.evaluate(() => {
    irPara('arq');
    return {
      lidas: [...CARREGADA], pastas: PASTAS.length,
      faixa: [...document.querySelectorAll('.mod-btn')].map(b => b.textContent.trim()),
      pede: /Escolha a modalidade/.test(document.getElementById('tela').textContent)
    };
  });
  t('a faixa oferece as cinco modalidades',
    semMod.faixa.length === 5 && /DISPENSA/.test(semMod.faixa[0]), semMod.faixa);
  t('sem modalidade escolhida, nada é lido — nem uma consulta',
    semMod.lidas.indexOf('arq') < 0 && semMod.pastas === 0, semMod);
  t('e a tela pede a escolha em vez de ficar vazia sem explicação', semMod.pede, semMod);

  const escolheu = await pg.evaluate(async () => {
    escolherModalidade('PREGÃO');
    await new Promise(r => setTimeout(r, 500));
    return {pastas: PASTAS.length, todas: PASTAS.map(p => p.modalidade),
            naFaixa: document.querySelector('.mod-btn.on').textContent.trim()};
  });
  t('escolher PREGÃO traz só os pregões',
    escolheu.pastas === QUANTAS['PREGÃO'] && escolheu.todas.every(m => m === 'PREGÃO'),
    {veio: escolheu.pastas, esperado: QUANTAS['PREGÃO']});
  t('o botão marcado é o da modalidade lida, com a conta dela',
    /PREGÃO/.test(escolheu.naFaixa) && escolheu.naFaixa.indexOf(String(QUANTAS['PREGÃO'])) >= 0, escolheu);
  t('e o cadastro inteiro NÃO foi lido — é recorte, não filtro',
    escolheu.pastas < TOTAL_PASTAS, {veio: escolheu.pastas, total: TOTAL_PASTAS});

  const trocou = await pg.evaluate(async () => {
    escolherModalidade('DISPENSA');
    await new Promise(r => setTimeout(r, 500));
    return {pastas: PASTAS.length, todas: [...new Set(PASTAS.map(p => p.modalidade))]};
  });
  t('trocar de modalidade troca o recorte, não soma em cima do anterior',
    trocou.pastas === QUANTAS['DISPENSA'] && trocou.todas.join() === 'DISPENSA', trocou);

  /* A faceta "Modalidade" saiu: a faixa já é o recorte, e uma lista de
     opções com uma opção só é lugar de clicar sem nada acontecer. */
  t('a faceta de modalidade saiu dos filtros — a faixa ocupou o lugar dela',
    await pg.evaluate(() => !/Modalidade/.test(document.querySelector('.barra') ? document.querySelector('.barra').textContent : '')
      || !document.querySelector('[onclick*="modalidade"]')));

  console.log('\n5) Cada aba lê a sua coleção, na hora que é aberta');
  const abas = await pg.evaluate(async () => {
    irPara('anul'); await new Promise(r => setTimeout(r, 400));
    const depoisAnul = {lidas:[...CARREGADA], anul:ANULACOES.length, memo:MEMORANDOS.length};
    irPara('memo'); await new Promise(r => setTimeout(r, 400));
    return {depoisAnul, memo: MEMORANDOS.length, lidas: [...CARREGADA]};
  });
  /* Do ano corrente + os sem ano — não a coleção inteira. */
  const ANUL_ANO = Object.values(anulacoes).filter(a => a.ano === ANO || a.ano === null).length;
  const MEMO_ANO = Object.values(memorandos).filter(m => m.ano === ANO || m.ano === null).length;
  t('abrir Anulações lê as anulações', abas.depoisAnul.anul === ANUL_ANO, {veio: abas.depoisAnul.anul, esperado: ANUL_ANO});
  t('e não lê os memorandos junto', abas.depoisAnul.memo === 0, abas);
  t('abrir Memorandos lê os memorandos', abas.memo === MEMO_ANO, {veio: abas.memo, esperado: MEMO_ANO});
  t('ao fim, as quatro foram lidas — uma por vez, sob demanda', abas.lidas.length === 4, abas);

  console.log('\n5b) Anulações e memorandos são lidos UM ANO por vez');
  const doAno = await pg.evaluate(() => ({
    anul: ANULACOES.map(a => a.ano), memo: MEMORANDOS.map(m => m.ano),
    aviso: document.getElementById('tela').textContent
  }));
  t('a anulação de anos atrás não vem na abertura',
    doAno.anul.every(a => a === ANO || a === null), doAno.anul);
  t('o memorando de anos atrás também não',
    doAno.memo.every(a => a === ANO || a === null), doAno.memo);
  /* O "24/07/2062" da planilha: ano nulo. Se o recorte o escondesse, o
     sistema teria perdido um documento — pior que pagar a leitura. */
  t('mas o de data torta vem SEMPRE, em qualquer ano escolhido',
    doAno.memo.indexOf(null) >= 0, doAno.memo);
  t('e a tela avisa que está recortada, em vez de fingir que é tudo',
    /Os anos anteriores continuam no banco/.test(doAno.aviso), doAno.aviso.slice(0, 200));

  const todos = await pg.evaluate(async () => {
    verAno(null);
    await new Promise(r => setTimeout(r, 500));
    return {memo: MEMORANDOS.length, aviso: document.getElementById('tela').textContent};
  });
  t('"ver todos os anos" alcança o cadastro inteiro',
    todos.memo === Object.keys(memorandos).length, {veio: todos.memo, esperado: Object.keys(memorandos).length});
  t('e oferece voltar para o ano corrente', /Voltar para/.test(todos.aviso), todos.aviso.slice(0, 200));
  await pg.evaluate(async () => { verAno(new Date().getFullYear()); await new Promise(r => setTimeout(r, 400)); });

  console.log('\n6) "✓ Voltou hoje" grava no banco, não só na tela');
  /* O CLIQUE, não a função. Chamar marcarVolta(alvo._id) direto daqui
     passava por cima do bug que existiu: o botão mandava t.id (o número da
     planilha, 3) e a função procurava por _id (o id do documento, "3") —
     "3" === 3 é falso, e o botão não fazia nada, calado. Teste que chama a
     função nunca teria visto. */
  await pg.evaluate(async () => { irPara('rua'); await new Promise(r => setTimeout(r, 300)); });
  const alvo = await pg.evaluate(() => TRAMITES[0]._id);
  const antes = await pg.evaluate(() => TRAMITES.length);
  await pg.click('.btn-voltou');
  await pg.waitForTimeout(500);
  const voltou = await pg.evaluate((id) => {
    const doc = window.__STORE.arquivo_tramites[id];
    return {depois: TRAMITES.length, gravado: doc && doc.voltouEm,
            saiuDaLista: !TRAMITES.some(x => x._id === id)};
  }, alvo);
  t('o retorno foi gravado com a data de hoje',
    /^\d{4}-\d{2}-\d{2}$/.test(voltou.gravado || ''), voltou);
  t('e a pendência sai da tela — ela é "o que está fora"',
    voltou.saiuDaLista && voltou.depois === antes - 1, {antes, ...voltou});
  await pg.close();

  console.log('\n7) Quem só visualiza não grava');
  const ver = await b.newPage({viewport:{width:1280, height:900}});
  const avisos = []; ver.on('dialog', d => { avisos.push(d.message()); d.accept(); });
  await abrirArquivo(ver, 'ver');
  const leitura = await ver.evaluate(async () => {
    const alvo = TRAMITES[0];
    marcarVolta(alvo._id);
    await new Promise(r => setTimeout(r, 300));
    return {entrou: document.getElementById('authGate').style.display === 'none',
            gravou: !!window.__STORE.arquivo_tramites[alvo._id].voltouEm,
            botaoImportar: [...document.querySelectorAll('.so-editor')].some(e => e.style.display !== 'none')};
  });
  t('entra e enxerga o arquivo', leitura.entrou);
  t('mas não grava o retorno', !leitura.gravou, leitura);
  t('e é avisado, em vez de o clique não fazer nada',
    avisos.some(m => /leitura/i.test(m)), avisos);
  t('o botão de importar não aparece para ele', !leitura.botaoImportar, leitura);
  await ver.close();

  console.log('\n8) A importação sobe os arquivos ESCOLHIDOS no computador');
  const imp = await b.newPage({viewport:{width:1280, height:900}});
  imp.on('dialog', d => d.accept());
  await abrirArquivo(imp, 'editar', false);          /* banco vazio */
  const vazio = await imp.evaluate(() => Object.keys(window.__STORE.arquivo_pastas || {}).length);
  t('o banco começou vazio', vazio === 0, {vazio});

  /* A carga NÃO está no servidor — é gitignored, o repositório é público —
     então ela chega pelo seletor de arquivos, como na máquina do setor.
     A primeira versão buscava dados/*.json ao lado do index.html e só
     sabia dizer "não achei". */
  const tmp = require('os').tmpdir() + '/t-arquivo-carga';
  fs.mkdirSync(tmp, {recursive: true});
  const escrever = (nome, obj) => {
    const caminho = tmp + '/' + nome + '.json';
    fs.writeFileSync(caminho, JSON.stringify(Object.values(obj)));
    return caminho;
  };
  const caminhos = [escrever('pastas', pastas), escrever('tramites', tramites),
                    escrever('anulacoes', anulacoes), escrever('memorandos', memorandos)];
  await imp.setInputFiles('#impArquivos', caminhos);
  await imp.waitForTimeout(2000);
  const subiu = await imp.evaluate(() => ({
    pastas: Object.keys(window.__STORE.arquivo_pastas).length,
    tramites: Object.keys(window.__STORE.arquivo_tramites).length,
    recado: (document.getElementById('impNota') || {}).textContent || ''
  }));
  t('as pastas subiram', subiu.pastas === TOTAL_PASTAS, subiu);
  t('os trâmites também', subiu.tramites === Object.keys(tramites).length, subiu);
  t('e a tela diz quantos entraram', /\d+ registros no banco/.test(subiu.recado), subiu);

  await imp.setInputFiles('#impArquivos', caminhos);
  await imp.waitForTimeout(2000);
  const denovo = await imp.evaluate(() => Object.keys(window.__STORE.arquivo_pastas).length);
  t('importar de novo reescreve, não duplica', denovo === TOTAL_PASTAS, {denovo, esperado: TOTAL_PASTAS});

  /* O ano tem de ser gravado NA IMPORTAÇÃO. O Firestore não filtra por "os
     quatro primeiros caracteres de recebidoEm": sem o campo no documento, o
     recorte por ano não existe — e acrescentá-lo depois é reimportar o
     cadastro inteiro. */
  const anoNoBanco = await imp.evaluate(() => {
    const m = window.__STORE.arquivo_memorandos, a = window.__STORE.arquivo_anulacoes;
    return {memo: Object.values(m).map(x => x.ano), anul: Object.values(a).map(x => x.ano)};
  });
  t('a importação grava o ano do memorando, derivado da data de recebimento',
    anoNoBanco.memo.indexOf(ANO) >= 0, anoNoBanco.memo);
  t('a data torta da planilha vira ano nulo, não um ano inventado',
    anoNoBanco.memo.indexOf(null) >= 0 && anoNoBanco.memo.indexOf(2062) < 0, anoNoBanco.memo);
  t('e o ano da anulação, que já vem da planilha, é preservado',
    anoNoBanco.anul.indexOf(ANO) >= 0, anoNoBanco.anul);

  /* Arquivo com nome que o conversor não gera não entra calado. */
  const errado = tmp + '/planilha-qualquer.json';
  fs.writeFileSync(errado, JSON.stringify([{id: 1, x: 'nada a ver'}]));
  await imp.setInputFiles('#impArquivos', [errado]);
  await imp.waitForTimeout(800);
  const recusa = await imp.evaluate(() => document.getElementById('impNota').textContent);
  t('arquivo de nome desconhecido é recusado, com o nome certo na tela',
    /não reconhecido/.test(recusa) && /tramites\.json/.test(recusa), recusa.slice(0, 180));
  await imp.close();

  console.log('\nerros JS: ' + (errs.length ? errs.join(' | ') : 'nenhum'));
  console.log('\n' + ok + ' passaram, ' + mau + ' falharam.');
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
