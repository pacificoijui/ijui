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
function haDias(n){
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.getFullYear() + '-' + ('0'+(d.getMonth()+1)).slice(-2) + '-' + ('0'+d.getDate()).slice(-2);
}
const MODS = ['DISPENSA', 'PREGÃO', 'CONCORRÊNCIA', 'INEXIGIBILIDADE', 'REQ. NÃO SE APLICA'];
const QUANTAS = { 'DISPENSA': 9, 'PREGÃO': 5, 'CONCORRÊNCIA': 3, 'INEXIGIBILIDADE': 2, 'REQ. NÃO SE APLICA': 1 };
const pastas = {};
let idp = 0;
MODS.forEach(m => {
  for(let i = 0; i < QUANTAS[m]; i++){
    idp++;
    /* arquivadas DENTRO dos 30 dias: é nelas que a tela abre */
    /* o processo tem a forma do de verdade ("PE. 77/2026 - objeto"): é dele
       que sai o número do documento quando a pasta vai para a rua (ver 6g) */
    pastas[String(idp)] = { id: idp, modalidade: m,
      processo: m.slice(0, 4) + ' ' + (i + 1) + '/' + new Date().getFullYear() + ' - objeto de teste',
      pregoeiro: i % 2 ? 'RODRIGO' : 'ANDREI', arquivadoEm: haDias(i % 25),
      checklist: i % 3 !== 0, vencedor: 'Empresa ' + (i + 1), origem: 'Controle do Arquivo' };
  }
});
/* E duas de meses atrás, que a janela de 30 dias NÃO pode trazer — são elas
   que provam que a economia existe. */
pastas['901'] = { id: 901, modalidade: 'PREGÃO', processo: 'PREG ANTIGO - arquivado há meses',
  pregoeiro: 'RODRIGO', arquivadoEm: haDias(200), checklist: true, vencedor: 'Empresa Antiga', origem: 'Controle do Arquivo' };
pastas['902'] = { id: 902, modalidade: 'DISPENSA', processo: 'DL 45/2025 - o processo que se procura',
  pregoeiro: 'ANDREI', arquivadoEm: haDias(300), checklist: true, vencedor: 'Empresa Velha', origem: 'Controle do Arquivo' };
/* Trâmites: o que importa é que só os SEM volta sejam lidos. */
const tramites = {
  '1': {id:1, docTipo:'Processo', docNum:'101', comQuem:'ANDREI', saiuEm:'2026-01-05', voltouEm:null, tipo:'assinatura'},
  '2': {id:2, docTipo:'Processo', docNum:'102', comQuem:'ANDREI', saiuEm:'2026-08-20', voltouEm:null, tipo:'assinatura'},
  '3': {id:3, docTipo:'Pasta',    docNum:'103', comQuem:'MAITÊ',  saiuEm:'2026-09-01', voltouEm:null, tipo:'emprestimo'},
  '4': {id:4, docTipo:'Processo', docNum:'104', comQuem:'DENER',  saiuEm:'2026-02-02', voltouEm:'2026-02-03', tipo:'assinatura'},
  '5': {id:5, docTipo:'Processo', docNum:'105', comQuem:'DENER',  saiuEm:'2026-03-02', voltouEm:'2026-03-04', tipo:'assinatura'},
  /* Os três casos do link "Na rua" → Arquivo (ver 6c): docTipo reconhecido
     numa assinatura sugere catalogar; docTipo de papelada (EXTRATOS) não
     sugere nada; e um empréstimo — documento que JÁ está arquivado — não
     sugere de novo mesmo com docTipo mapeado. */
  '6': {id:6, docTipo:'DL',       docNum:'999/2026', comQuem:'ANDREI', saiuEm:'2026-09-01', voltouEm:null, tipo:'assinatura'},
  '7': {id:7, docTipo:'EXTRATOS', docNum:'50/2026',  comQuem:'ANDREI', saiuEm:'2026-09-02', voltouEm:null, tipo:'assinatura'},
  '8': {id:8, docTipo:'DL',       docNum:'888/2026', comQuem:'MAITÊ',  saiuEm:'2026-09-03', voltouEm:null, tipo:'emprestimo'}
};
/* Anulações e memorandos são cadernos ANUAIS, lidos um ano por vez. A
   semente tem os três casos que importam: o ano corrente, um ano velho (que
   NÃO pode vir na abertura) e a data torta — o "24/07/2062" que a planilha
   de verdade guarda —, que vira ano nulo e TEM de vir sempre, porque
   documento escondido é pior que leitura paga. */
const ANO = new Date().getFullYear();
const RECENTE = haDias(5), VELHO_MES = haDias(120);
const anulacoes = {
  '1': {id:1, num:1, valor:1000, secretaria:'SMED', reqSec:'SMED', quem:'ANA', ano:ANO,   contabilidadeEm:RECENTE},
  '2': {id:2, num:2, valor:2500, secretaria:'SMS',  reqSec:'SMS',  quem:'ANA', ano:ANO,   contabilidadeEm:VELHO_MES},
  '3': {id:3, num:3, valor:700,  secretaria:'SMS',  reqSec:'SMS',  quem:'ANA', ano:ANO-2, contabilidadeEm:(ANO-2)+'-03-09'}
};
const memorandos = {
  '1': {id:1, num:'10', secretaria:'SMED', entregueA:'ANDREI', recebidoEm:RECENTE,          ano:ANO,   descricao:'deste mes'},
  '2': {id:2, num:'11', secretaria:'SMS',  entregueA:'ANDREI', recebidoEm:VELHO_MES,        ano:ANO,   descricao:'do ano, fora do mes'},
  '3': {id:3, num:'12', secretaria:'SMS',  entregueA:'ANDREI', recebidoEm:(ANO-3)+'-04-01', ano:ANO-3, descricao:'de anos atras'},
  '4': {id:4, num:'13', secretaria:'SMS',  entregueA:'MAITÊ',  recebidoEm:null,             ano:null,  descricao:'sem data na planilha'},
  /* O nome real da aba é longo — é ele que a consulta usa (ver 6d). O botão
     mostra um rótulo curto, mas isso não pode mudar o valor gravado. */
  '5': {id:5, num:'77', secretaria:'NUCLEO PROJETOSENGENHEIROS', entregueA:'FULANO', recebidoEm:RECENTE, ano:ANO, descricao:'projeto de engenharia'}
};

const TOTAL_PASTAS = Object.keys(pastas).length;
const PASTAS_ANTIGAS = 2;   /* fora da janela de 30 dias */
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
  t('trâmite, anulação e memorando não apagam — são registro de que algo aconteceu',
    ['arquivo_tramites','arquivo_anulacoes','arquivo_memorandos']
      .every(c => new RegExp('match /' + c + '/\\{id\\} \\{[^}]*allow delete: if false;', 's').test(regras)));
  /* A pasta é a exceção, e por isso apaga: ela não conta um acontecimento,
     diz o que está na prateleira. Processo lançado duas vezes ou na
     modalidade errada, "corrigido editando", deixaria uma linha de um
     processo que não existe — e aí o arquivo mente sobre o que guarda. */
  t('a pasta do arquivo apaga, e só para quem pode editar',
    /match \/arquivo_pastas\/\{id\} \{[^}]*allow delete: if arquivoEdit\(\);/s.test(regras));
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
  /* A janela de 30 dias também vale no arquivo: o pregão de 200 dias atrás
     não é lido na abertura, e é isso que economiza. Ele continua alcançável
     — por "Tudo" ou pela busca. */
  const janelaArq = await pg.evaluate(async () => {
    escolherModalidade('PREGÃO');
    await new Promise(r => setTimeout(r, 600));
    const doMes = PASTAS.map(x => x.processo);
    trocarJanela('arq', 'tudo');
    await new Promise(r => setTimeout(r, 600));
    const tudo = PASTAS.map(x => x.processo);
    trocarJanela('arq', '30');
    await new Promise(r => setTimeout(r, 600));
    return {doMes, tudo};
  });
  t('o pregão arquivado há 200 dias não é lido na abertura',
    janelaArq.doMes.indexOf('PREG ANTIGO - arquivado há meses') < 0, janelaArq.doMes);
  t('mas "Tudo" alcança ele', janelaArq.tudo.indexOf('PREG ANTIGO - arquivado há meses') >= 0, janelaArq.tudo);
  t('e "Tudo" traz só a modalidade escolhida, não as cinco',
    janelaArq.tudo.every(x => /^PREG/.test(x)), janelaArq.tudo);

  t('a faceta de modalidade saiu dos filtros — a faixa ocupou o lugar dela',
    await pg.evaluate(() => !/Modalidade/.test(document.querySelector('.barra') ? document.querySelector('.barra').textContent : '')
      || !document.querySelector('[onclick*="modalidade"]')));

  console.log('\n4b) O clique de verdade no botão da janela (não a função)');
  /* JSON.stringify(tela) dentro de um onclick="..." já entre aspas duplas
     quebrava o atributo no primeiro par — onclick="trocarJanela("arq","30")"
     fecha ali mesmo, e o resto vira lixo fora do atributo (o navegador lê
     um onclick vazio e "arq" sobra como um atributo bugado, sem valor). O
     botão RENDERIZAVA normal, e chamar trocarJanela() direto — como os
     testes acima fazem, de propósito, para testar a lógica — nunca veria
     isso: só o clique de verdade no HTML gerado revela. */
  const antesDoClique = await pg.evaluate(() => janelaDe('arq'));
  await pg.click('.mod-faixa:has(button:has-text("30 dias")) button:has-text("Tudo")');
  await pg.waitForTimeout(600);
  const depoisDoClique = await pg.evaluate(() => janelaDe('arq'));
  t('o clique de verdade muda a janela — não só a chamada direta da função',
    antesDoClique === '30' && depoisDoClique === 'tudo', {antesDoClique, depoisDoClique});
  await pg.evaluate(async () => { trocarJanela('arq', '30'); await new Promise(r => setTimeout(r, 400)); });

  console.log('\n5) Cada aba lê a sua coleção, na hora que é aberta');
  const abas = await pg.evaluate(async () => {
    irPara('anul'); await new Promise(r => setTimeout(r, 400));
    const depoisAnul = {lidas:[...CARREGADA], anul:ANULACOES.length, memo:MEMORANDOS.length};
    irPara('memo'); await new Promise(r => setTimeout(r, 400));
    return {depoisAnul, memo: MEMORANDOS.length, lidas: [...CARREGADA]};
  });
  /* Últimos 30 dias + os sem data — não o ano, muito menos a coleção. */
  t('abrir Anulações lê só as do mês', abas.depoisAnul.anul === 1, {veio: abas.depoisAnul.anul});
  t('e não lê os memorandos junto', abas.depoisAnul.memo === 0, abas);
  /* Memorandos não tem janela por data — sem secretaria escolhida, nada é
     lido, igual ao Arquivo sem modalidade escolhida. */
  t('abrir Memorandos sozinho não lê nada — falta escolher a secretaria',
    abas.memo === 0, {veio: abas.memo});
  t('só três telas foram lidas até aqui — a quarta espera a secretaria',
    abas.lidas.length === 3, abas);

  console.log('\n5b) Memorandos: uma secretaria por vez, como nas Requisições');
  const semSec = await pg.evaluate(() => ({
    lidas: [...CARREGADA], memo: MEMORANDOS.length,
    faixa: [...document.querySelectorAll('.mod-btn')].map(b => b.textContent.trim()),
    pede: /Escolha a secretaria/.test(document.getElementById('tela').textContent)
  }));
  t('a faixa oferece as secretarias conhecidas',
    semSec.faixa.indexOf('SMED') >= 0 && semSec.faixa.indexOf('SMS') >= 0, semSec.faixa);
  t('sem secretaria escolhida, nada é lido — nem uma consulta',
    semSec.lidas.indexOf('memo') < 0 && semSec.memo === 0, semSec);
  t('e a tela pede a escolha em vez de ficar vazia sem explicação', semSec.pede, semSec);

  const smed = await pg.evaluate(async () => {
    escolherSecretariaMemo('SMED');
    await new Promise(r => setTimeout(r, 600));
    return {descricoes: MEMORANDOS.map(m => m.descricao),
            naFaixa: document.querySelector('.mod-btn.on').textContent.trim()};
  });
  t('SMED traz só o memorando de SMED', smed.descricoes.join() === 'deste mes', smed);
  t('o botão marcado é o da secretaria lida, com a conta dela',
    /SMED/.test(smed.naFaixa) && smed.naFaixa.indexOf('1') >= 0, smed);

  const sms = await pg.evaluate(async () => {
    escolherSecretariaMemo('SMS');
    await new Promise(r => setTimeout(r, 600));
    return MEMORANDOS.map(m => m.descricao);
  });
  /* SMS lida por INTEIRO, sem recorte de data — é a diferença para as
     outras telas: uma secretaria sozinha já é pequena. */
  t('trocar de secretaria troca o recorte, não soma em cima do anterior',
    sms.indexOf('deste mes') < 0, sms);
  t('e traz TODO o histórico da secretaria, sem corte de data — inclusive o antigo',
    sms.indexOf('do ano, fora do mes') >= 0 && sms.indexOf('de anos atras') >= 0, sms);
  t('e o sem data também, porque não há janela para escondê-lo',
    sms.indexOf('sem data na planilha') >= 0, sms);

  t('a faceta de secretaria saiu dos filtros — a faixa ocupou o lugar dela',
    await pg.evaluate(() => !document.querySelector('[onchange*="marcar(\'memo\',\'secretaria\'"]')));

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

  console.log('\n6b) Cadastrar e editar direto na tabela do Arquivo, como nas Requisições');
  /* Sem modal, sem card: clicar na célula vira um campo ali mesmo. */
  const pg2 = await b.newPage({viewport:{width:1400, height:900}});
  pg2.on('dialog', d => d.accept());
  await abrirArquivo(pg2, 'editar');
  await pg2.click('.abas button:has-text("Arquivo")');
  await pg2.click('.mod-faixa button:has-text("PREGÃO")');
  await pg2.waitForTimeout(500);

  const antesCriar = await pg2.evaluate(() => PASTAS.length);
  await pg2.click('button:has-text("＋ Novo processo")');
  await pg2.waitForTimeout(200);
  const abriuNoProcesso = await pg2.evaluate(() => {
    const el = document.querySelector('td.editando');
    return {campo: el && el.dataset.campo, temInput: !!(el && el.querySelector('input'))};
  });
  t('"+ Novo processo" já abre a célula "Processo" para digitar — sem card, sem modal',
    abriuNoProcesso.campo === 'processo' && abriuNoProcesso.temInput, abriuNoProcesso);
  await pg2.fill('td.editando input', 'PE 99/2026 - Processo cadastrado pela tela');
  await pg2.keyboard.press('Enter');
  await pg2.waitForTimeout(500);
  const criou = await pg2.evaluate(() => {
    const novo = PASTAS.find(x => x.processo === 'PE 99/2026 - Processo cadastrado pela tela');
    return {depois: PASTAS.length, novo: novo || null,
            noBanco: novo ? window.__STORE.arquivo_pastas[novo._id] : null};
  });
  t('o processo novo entra na lista', criou.depois === antesCriar + 1 && !!criou.novo, criou);
  t('e vai para o banco, já na modalidade da tela',
    !!criou.noBanco && criou.noBanco.processo === 'PE 99/2026 - Processo cadastrado pela tela'
    && criou.noBanco.modalidade === 'PREGÃO', criou.noBanco);
  /* O id da planilha é da IMPORTAÇÃO: é por ele que reimportar reescreve em
     vez de duplicar. Processo nascido na tela não tem — senão uma
     reimportação passaria por cima dele. */
  t('processo nascido na tela não carrega o id da planilha',
    criou.noBanco && criou.noBanco.id === undefined, criou.noBanco);

  const idNovo = await pg2.evaluate(() => PASTAS.find(x => x.processo === 'PE 99/2026 - Processo cadastrado pela tela')._id);
  await pg2.click('td[data-campo="pregoeiro"][data-id="' + idNovo + '"]');
  await pg2.waitForTimeout(150);
  await pg2.fill('td.editando input', 'rodrigo');
  await pg2.keyboard.press('Enter');
  await pg2.waitForTimeout(500);
  const pregoeiroGravado = await pg2.evaluate((id) => window.__STORE.arquivo_pastas[id].pregoeiro, idNovo);
  t('o pregoeiro entra em maiúsculas, como o resto do cadastro', pregoeiroGravado === 'RODRIGO', pregoeiroGravado);

  await pg2.click('td[data-campo="valor"][data-id="' + idNovo + '"]');
  await pg2.waitForTimeout(150);
  await pg2.fill('td.editando input', '1.234,56');
  await pg2.keyboard.press('Enter');
  await pg2.waitForTimeout(500);
  const valorGravado = await pg2.evaluate((id) => window.__STORE.arquivo_pastas[id].valor, idNovo);
  t('o valor "1.234,56" vira número, não texto', valorGravado === 1234.56, valorGravado);

  console.log('\n6b2) Tab anda pela linha, como nas Requisições — sem precisar do mouse');
  await pg2.click('td[data-campo="processo"][data-id="' + idNovo + '"]');
  await pg2.waitForTimeout(150);
  await pg2.keyboard.press('Tab');
  await pg2.waitForTimeout(300);
  const depoisTab1 = await pg2.evaluate(() => document.querySelector('td.editando') && document.querySelector('td.editando').dataset.campo);
  t('Tab sai de "Processo" e abre "Secretaria" — a próxima coluna da tabela', depoisTab1 === 'secretaria', depoisTab1);
  await pg2.keyboard.type('smed');
  await pg2.keyboard.press('Tab');
  await pg2.waitForTimeout(300);
  const depoisTab2 = await pg2.evaluate(() => document.querySelector('td.editando') && document.querySelector('td.editando').dataset.campo);
  t('e o segundo Tab abre "Vencedor"', depoisTab2 === 'vencedor', depoisTab2);
  const secretariaPeloTab = await pg2.evaluate((id) => window.__STORE.arquivo_pastas[id].secretaria, idNovo);
  t('a secretaria foi gravada no banco entre um Tab e outro, sem precisar de Enter',
    secretariaPeloTab === 'SMED', secretariaPeloTab);
  await pg2.keyboard.press('Shift+Tab');
  await pg2.waitForTimeout(300);
  const depoisShiftTab = await pg2.evaluate(() => document.querySelector('td.editando') && document.querySelector('td.editando').dataset.campo);
  t('Shift+Tab volta para a coluna anterior', depoisShiftTab === 'secretaria', depoisShiftTab);
  await pg2.keyboard.press('Escape');
  await pg2.waitForTimeout(300);

  console.log('\n6b3) Tab numa linha nova — o id troca de rascunho para o de verdade no meio do caminho');
  const antesTabNovo = await pg2.evaluate(() => Object.keys(window.__STORE.arquivo_pastas).length);
  await pg2.click('button:has-text("＋ Novo processo")');
  await pg2.waitForTimeout(200);
  await pg2.keyboard.type('PE 501/2026 - criado com Tab');
  await pg2.keyboard.press('Tab');   /* este Tab grava o 1º campo — é aqui que o id de rascunho vira id de verdade */
  await pg2.waitForTimeout(400);
  const abriuComTab = await pg2.evaluate(() => {
    const el = document.querySelector('td.editando');
    return el ? {campo: el.dataset.campo, id: el.dataset.id} : null;
  });
  t('depois do Tab que criou a linha, a célula seguinte abre com o id de verdade do Firestore (não "rascunho-N")',
    abriuComTab && abriuComTab.campo === 'secretaria' && !/^rascunho-/.test(abriuComTab.id), abriuComTab);
  await pg2.keyboard.type('sms');
  await pg2.keyboard.press('Escape');
  await pg2.waitForTimeout(400);
  const depoisTabNovo = await pg2.evaluate(() => ({
    docs: Object.keys(window.__STORE.arquivo_pastas).length,
    achado: PASTAS.find(x => x.processo === 'PE 501/2026 - criado com Tab')
  }));
  t('só um documento novo foi criado — nenhuma duplicação pelo caminho',
    depoisTabNovo.docs === antesTabNovo + 1 && !!depoisTabNovo.achado, depoisTabNovo);

  console.log('\n6b4) Esc numa linha nunca gravada descarta a linha — não fica pairando em branco');
  const antesDescartar = await pg2.evaluate(() => PASTAS.length);
  await pg2.click('button:has-text("＋ Novo processo")');
  await pg2.waitForTimeout(200);
  await pg2.keyboard.press('Escape');   /* nada foi digitado ainda */
  await pg2.waitForTimeout(300);
  const depoisDescartar = await pg2.evaluate(() => PASTAS.length);
  t('a linha some da tela — nunca chegou a existir no banco',
    depoisDescartar === antesDescartar, {antesDescartar, depoisDescartar});

  /* trocar a modalidade na célula MOVE o processo — é o mesmo gesto de
     sempre, só que clicando na célula em vez de abrir um formulário */
  const antesMover = await pg2.evaluate(() => Object.keys(window.__STORE.arquivo_pastas).length);
  await pg2.click('td[data-campo="modalidade"][data-id="' + idNovo + '"]');
  await pg2.waitForTimeout(150);
  await pg2.selectOption('td.editando select', 'CONCORRÊNCIA');
  await pg2.click('.nota', {force: true});   /* clique de verdade fora da célula, fecha e grava */
  await pg2.waitForTimeout(500);
  const moveu = await pg2.evaluate((id) => ({
    docsNoBanco: Object.keys(window.__STORE.arquivo_pastas).length,
    aindaNaLista: PASTAS.some(x => x._id === id),
    noBanco: window.__STORE.arquivo_pastas[id].modalidade,
    recado: (document.getElementById('impNota') || {}).textContent || ''
  }), idNovo);
  t('trocar a modalidade move o processo no banco, sem duplicar o documento',
    moveu.noBanco === 'CONCORRÊNCIA' && moveu.docsNoBanco === antesMover, moveu);
  t('e ele sai desta lista, que mostra uma modalidade só', !moveu.aindaNaLista, moveu);
  /* Sumir sem explicação é o que faz a pessoa achar que perdeu o registro. */
  t('a tela diz para onde ele foi, em vez de ele só sumir',
    /movido para CONCORRÊNCIA/.test(moveu.recado), moveu.recado);

  const achou = await pg2.evaluate(async () => {
    escolherModalidade('CONCORRÊNCIA');
    await new Promise(r => setTimeout(r, 600));
    return PASTAS.some(x => x.processo === 'PE 99/2026 - Processo cadastrado pela tela');
  });
  t('e ele está lá, na modalidade nova', achou);

  console.log('\n6c) Inexigibilidade tira o pregoeiro; Concorrência chama de "Agente de Contratação"');
  await pg2.evaluate(async () => { escolherModalidade('INEXIGIBILIDADE'); await new Promise(r => setTimeout(r, 500)); });
  const semPregoeiro = await pg2.evaluate(() => [...document.querySelectorAll('th')].map(th => th.textContent.trim()));
  t('Inexigibilidade não tem coluna de Pregoeiro', semPregoeiro.indexOf('Pregoeiro') < 0, semPregoeiro);
  const cabecalhosConc = await pg2.evaluate(() => [...document.querySelectorAll('th')].map(th => th.textContent.trim()));
  t('e Concorrência (aba já aberta) mostra "Agente de Contratação" em vez de "Pregoeiro"',
    cabecalhosConc.indexOf('Pregoeiro') < 0, cabecalhosConc);
  await pg2.evaluate(async () => { escolherModalidade('CONCORRÊNCIA'); await new Promise(r => setTimeout(r, 500)); });
  const cabecalhosConc2 = await pg2.evaluate(() => [...document.querySelectorAll('th')].map(th => th.textContent.trim()));
  t('Concorrência mostra "Agente de Contratação"', cabecalhosConc2.indexOf('Agente de Contratação') >= 0, cabecalhosConc2);
  await pg2.close();

  console.log('\n6d) "Na rua" → Arquivo: sugere catalogar quando volta da assinatura');
  /* docTipo ("DL") e docNum ("999/2026") do trâmite não batem sozinhos com
     modalidade+processo da pasta — dá para SUGERIR, com a pessoa confirmando
     duas vezes: no confirm() antes de sair de "Na rua", e no "Salvar" da
     linha que abre já preenchida. Os três casos que importam: docTipo
     reconhecido soma para DISPENSA; docTipo de papelada (EXTRATOS) não
     sugere nada; e um empréstimo — documento já arquivado voltando de uma
     consulta — não sugere de novo, mesmo com docTipo mapeado. */
  const pg3 = await b.newPage({viewport:{width:1400, height:900}});
  const dialogos = [];
  pg3.on('dialog', d => { dialogos.push(d.message()); d.accept(); });
  await abrirArquivo(pg3, 'editar');
  const hojeISO = new Date().toISOString().slice(0, 10);

  await pg3.click('.linha:has-text("999/2026") .btn-voltou');
  await pg3.waitForTimeout(700);
  const positivo = await pg3.evaluate(() => {
    const draft = PASTAS.find(p => !p._gravada);
    const el = document.querySelector('td.editando');
    return {
      tela: telaAtual, mod: MOD_ATUAL,
      draftProcesso: draft && draft.processo, draftArquivadoEm: draft && draft.arquivadoEm,
      celulaAberta: el && el.dataset.campo,
      valorNaCelula: el && el.querySelector('input') ? el.querySelector('input').value : null
    };
  });
  t('pergunta antes de sugerir, citando o documento e o motivo',
    dialogos.some(m => /DL/.test(m) && /999\/2026/.test(m) && /assinatura/.test(m)), dialogos);
  const grav999 = await pg3.evaluate(() => {
    const id = Object.keys(window.__STORE.arquivo_tramites).find(x => window.__STORE.arquivo_tramites[x].docNum === '999/2026');
    return window.__STORE.arquivo_tramites[id];
  });
  t('mas o retorno é gravado de qualquer forma — o "voltou" não depende do "sim"',
    grav999 && /^\d{4}-\d{2}-\d{2}$/.test(grav999.voltouEm || ''), grav999);
  t('a tela pula direto para o Arquivo', positivo.tela === 'arq', positivo);
  t('já na modalidade certa, vinda do docTipo "DL"', positivo.mod === 'DISPENSA', positivo);
  t('nasce uma linha nova, com o processo pré-preenchido a partir do trâmite',
    positivo.draftProcesso === 'DL 999/2026', positivo);
  t('e a data de hoje, sem precisar digitar', positivo.draftArquivadoEm === hojeISO, positivo);
  t('a célula "Processo" já abre pronta para conferir e completar',
    positivo.celulaAberta === 'processo' && positivo.valorNaCelula === 'DL 999/2026', positivo);
  /* Nada foi gravado no arquivo ainda — só sugerido. Cadastrar de verdade é
     o Enter de sempre, já coberto em 6b. */
  t('mas nada entrou de fato no banco do arquivo — é sugestão, não cadastro automático',
    await pg3.evaluate(() => !Object.values(window.__STORE.arquivo_pastas).some(p => p.processo === 'DL 999/2026')));
  await pg3.keyboard.press('Escape');   /* desiste da sugestão — descarta a linha nunca gravada */
  await pg3.waitForTimeout(300);

  dialogos.length = 0;
  await pg3.click('.abas button:has-text("Na rua")');
  await pg3.waitForTimeout(300);
  await pg3.click('.linha:has-text("50/2026") .btn-voltou');
  await pg3.waitForTimeout(500);
  const semMapa = await pg3.evaluate(() => ({tela: telaAtual}));
  t('documento que é papelada (EXTRATOS), não processo, não sugere nada',
    dialogos.length === 0 && semMapa.tela === 'rua', {dialogos, semMapa});

  dialogos.length = 0;
  await pg3.click('.linha:has-text("888/2026") .btn-voltou');
  await pg3.waitForTimeout(500);
  const emprestimo = await pg3.evaluate(() => ({tela: telaAtual}));
  t('documento emprestado — já catalogado — não sugere de novo, mesmo com docTipo mapeado',
    dialogos.length === 0 && emprestimo.tela === 'rua', {dialogos, emprestimo});
  await pg3.close();

  console.log('\n6e) Cadastrar direto na tabela: trâmite, anulação e memorando');
  const pg4 = await b.newPage({viewport:{width:1400, height:900}});
  pg4.on('dialog', d => d.accept());
  await abrirArquivo(pg4, 'editar');

  /* --- Editar um trâmite existente pelo ✏️ (linha inteira, "Na rua" não é tabela) --- */
  const antesEditarTr = await pg4.evaluate(() => Object.keys(window.__STORE.arquivo_tramites).length);
  await pg4.click('.linha:has-text("101") .mini-btn');
  await pg4.waitForTimeout(200);
  const formEdicaoTr = await pg4.evaluate(() => ({
    aberto: !!document.querySelector('[data-linha-edit]'),
    comQuem: document.querySelector('[data-linha-edit] [data-campo="comQuem"]').value
  }));
  t('o ✏️ abre a linha inteira como formulário, ali mesmo — não é modal',
    formEdicaoTr.aberto && formEdicaoTr.comQuem === 'ANDREI', formEdicaoTr);
  await pg4.fill('[data-linha-edit] [data-campo="comQuem"]', 'corrigido');
  await pg4.click('[data-linha-edit] button:has-text("Salvar")');
  await pg4.waitForTimeout(500);
  const salvouEdicaoTr = await pg4.evaluate(() => {
    const alvo = TRAMITES.find(x => x.docNum === '101');
    return {docsNoBanco: Object.keys(window.__STORE.arquivo_tramites).length,
            comQuem: window.__STORE.arquivo_tramites[alvo._id].comQuem};
  });
  t('editar corrige o registro sem duplicar',
    salvouEdicaoTr.docsNoBanco === antesEditarTr && salvouEdicaoTr.comQuem === 'CORRIGIDO', salvouEdicaoTr);

  /* --- Aqui não se cadastra mais nada ---
     "Na rua" era um SEGUNDO cadastro do mesmo papel: a mesma DL digitada de
     novo, noutra tela, sem ligação com a pasta — e era por isso que a volta
     não devolvia nada a lugar nenhum. Agora o processo é cadastrado uma vez,
     no Arquivo, e de lá sai para a rua (ver 6g). */
  const semCadastroRua = await pg4.evaluate(() => ({
    botao: [...document.querySelectorAll('button')].some(b => /Novo documento na rua/.test(b.textContent)),
    diz: document.getElementById('tela').textContent
  }));
  t('a tela "Na rua" não cadastra documento nenhum', !semCadastroRua.botao, semCadastroRua.botao);
  t('e diz onde se faz, em vez de só não ter botão',
    /📤/.test(semCadastroRua.diz) && /Arquivo/.test(semCadastroRua.diz), semCadastroRua.diz.slice(0, 200));

  /* --- Nova anulação: o número vem do banco, não da janela carregada --- */
  await pg4.click('.abas button:has-text("Anulações")');
  await pg4.waitForTimeout(500);
  const anulCarregadas = await pg4.evaluate(() => ANULACOES.map(a => a.num));
  t('a janela padrão (30 dias) não traz a anulação nº 2 do ano — ela é mais antiga que 30 dias',
    anulCarregadas.indexOf(2) < 0, anulCarregadas);
  t('secretaria não é pedida na anulação — não há coluna nem célula para ela',
    await pg4.evaluate(() => !document.querySelector('th') || ![...document.querySelectorAll('th')].some(th => th.textContent.trim() === 'Secretaria')));

  await pg4.click('button:has-text("＋ Nova anulação")');
  await pg4.waitForTimeout(700);
  const numCalculado = await pg4.evaluate(() => document.querySelector('tbody tr td:first-child').textContent.trim());
  t('o próximo número é 3 — o maior do ANO (2, mesmo fora da tela) mais um, não 2 (o maior CARREGADO)',
    numCalculado === '3/' + ANO, {numCalculado, esperado: '3/' + ANO});

  await pg4.fill('td.editando input', '09-99-2026-SMED');   /* requisição, já aberta pelo foco inicial */
  await pg4.keyboard.press('Enter');
  await pg4.waitForTimeout(400);
  /* o primeiro campo gravado troca o id de rascunho pelo id de verdade do
     Firestore (ver gravarItem) — por isso o id só é lido DEPOIS desse Enter */
  const idAnulNova = await pg4.evaluate(() => ANULACOES.find(a => a.requisicao === '09-99-2026-SMED')._id);
  await pg4.click('td[data-campo="quem"][data-id="' + idAnulNova + '"]');
  await pg4.fill('td.editando input', 'testando');
  await pg4.keyboard.press('Enter');
  await pg4.waitForTimeout(400);
  await pg4.click('td[data-campo="credor"][data-id="' + idAnulNova + '"]');
  await pg4.fill('td.editando input', 'Fornecedor Teste');
  await pg4.keyboard.press('Enter');
  await pg4.waitForTimeout(400);
  await pg4.click('td[data-campo="valor"][data-id="' + idAnulNova + '"]');
  await pg4.fill('td.editando input', '1.500,00');
  await pg4.keyboard.press('Enter');
  await pg4.waitForTimeout(500);
  const novaAn = await pg4.evaluate((id) => window.__STORE.arquivo_anulacoes[id], idAnulNova);
  t('a anulação nova grava com nº 3 e ano corrente', novaAn && novaAn.num === 3 && novaAn.ano === ANO, novaAn);
  t('secretaria não entra em lugar nenhum — o campo nem existe no cadastro',
    novaAn && novaAn.reqSec === undefined, novaAn);
  t('quem lançou entra em maiúsculas', novaAn && novaAn.quem === 'TESTANDO', novaAn);
  t('e o valor "1.500,00" vira número', novaAn && novaAn.valor === 1500, novaAn);

  /* editar não recalcula o número */
  const antesEdicaoAn = await pg4.evaluate(() => Object.keys(window.__STORE.arquivo_anulacoes).length);
  const numAntesEditar = await pg4.evaluate((id) => window.__STORE.arquivo_anulacoes[id].num, idAnulNova);
  await pg4.click('td[data-campo="credor"][data-id="' + idAnulNova + '"]');
  await pg4.fill('td.editando input', 'Fornecedor Corrigido');
  await pg4.keyboard.press('Enter');
  await pg4.waitForTimeout(500);
  const editouAn = await pg4.evaluate((id) => window.__STORE.arquivo_anulacoes[id], idAnulNova);
  t('editar corrige sem duplicar nem mudar o número',
    editouAn.credor === 'Fornecedor Corrigido' && editouAn.num === numAntesEditar
    && Object.keys(await pg4.evaluate(() => window.__STORE.arquivo_anulacoes)).length === antesEdicaoAn, editouAn);

  console.log('\n6f) Marcar "voltou" numa anulação, direto na tabela');
  const idAnul1 = await pg4.evaluate(() => ANULACOES.find(a => a.num === 1)._id);
  const antesVoltouAnul = await pg4.evaluate(() => Object.keys(window.__STORE.arquivo_anulacoes).length);
  await pg4.click('td[data-campo="retornoEm"][data-id="' + idAnul1 + '"]');
  await pg4.waitForTimeout(150);
  await pg4.fill('td.editando input[type=date]', '2026-09-10');
  await pg4.keyboard.press('Enter');
  await pg4.waitForTimeout(500);
  const anul1Depois = await pg4.evaluate((id) => window.__STORE.arquivo_anulacoes[id], idAnul1);
  const depoisVoltouAnul = await pg4.evaluate(() => Object.keys(window.__STORE.arquivo_anulacoes).length);
  t('antes não havia nenhum jeito de marcar — agora a célula "Voltou" grava a data',
    anul1Depois.retornoEm === '2026-09-10', anul1Depois);
  t('sem duplicar o documento', depoisVoltouAnul === antesVoltouAnul, {antesVoltouAnul, depoisVoltouAnul});

  /* --- Novo memorando, na secretaria da tela --- */
  await pg4.click('.abas button:has-text("Memorandos")');
  await pg4.waitForTimeout(300);
  await pg4.click('.mod-faixa button:has-text("SMED")');
  await pg4.waitForTimeout(500);
  const antesMemo = await pg4.evaluate(() => MEMORANDOS.length);
  await pg4.click('button:has-text("＋ Novo memorando")');
  await pg4.waitForTimeout(200);
  const abriuMemo = await pg4.evaluate(() => {
    const el = document.querySelector('td.editando');
    return {campo: el && el.dataset.campo, temInput: !!(el && el.querySelector('input'))};
  });
  t('"+ Novo memorando" já abre a célula do número, na secretaria da tela',
    abriuMemo.campo === 'num' && abriuMemo.temInput, abriuMemo);
  await pg4.fill('td.editando input', '99/2026');
  await pg4.keyboard.press('Enter');
  await pg4.waitForTimeout(500);
  const novoMe = await pg4.evaluate(() => {
    const achado = MEMORANDOS.find(x => x.num === '99/2026');
    return {depois: MEMORANDOS.length, achado: achado || null,
            noBanco: achado ? window.__STORE.arquivo_memorandos[achado._id] : null};
  });
  t('o memorando novo entra na secretaria atual', novoMe.depois === antesMemo + 1 && !!novoMe.achado, novoMe);
  t('nasce na secretaria SMED, e o ano é derivado da data de recebimento',
    novoMe.noBanco && novoMe.noBanco.secretaria === 'SMED' && novoMe.noBanco.ano === ANO, novoMe.noBanco);

  await pg4.click('td[data-campo="entregueA"][data-id="' + novoMe.achado._id + '"]');
  await pg4.fill('td.editando input', 'testando');
  await pg4.keyboard.press('Enter');
  await pg4.waitForTimeout(500);
  const entregueGravado = await pg4.evaluate((id) => window.__STORE.arquivo_memorandos[id].entregueA, novoMe.achado._id);
  t('entregue para entra em maiúsculas', entregueGravado === 'TESTANDO', entregueGravado);

  /* trocar a secretaria na célula MOVE o memorando, como nas pastas */
  const idMemoNovo = novoMe.achado._id;
  await pg4.click('td[data-campo="secretaria"][data-id="' + idMemoNovo + '"]');
  await pg4.waitForTimeout(150);
  await pg4.selectOption('td.editando select', 'SMS');
  await pg4.click('.nota', {force: true});
  await pg4.waitForTimeout(500);
  const moveuMemo = await pg4.evaluate((id) => ({
    aindaAqui: MEMORANDOS.some(x => x._id === id),
    noBanco: window.__STORE.arquivo_memorandos[id].secretaria,
    recado: (document.getElementById('impNota') || {}).textContent || ''
  }), idMemoNovo);
  t('trocar a secretaria move o memorando e ele some desta lista',
    !moveuMemo.aindaAqui && moveuMemo.noBanco === 'SMS', moveuMemo);
  t('a tela avisa para onde foi', /movido para SMS/.test(moveuMemo.recado), moveuMemo.recado);

  /* o rótulo encurtado do botão não pode mudar o valor usado na consulta */
  await pg4.click('.mod-faixa button:has-text("NUCLEO PROJETOS")');
  await pg4.waitForTimeout(500);
  const nucleo = await pg4.evaluate(() => ({
    descricoes: MEMORANDOS.map(m => m.descricao),
    botaoOn: document.querySelector('.mod-btn.on').textContent.trim()
  }));
  t('o botão mostra o rótulo curto "NUCLEO PROJETOS", não o nome inteiro da aba',
    nucleo.botaoOn.indexOf('NUCLEO PROJETOS') >= 0 && nucleo.botaoOn.indexOf('ENGENHEIROS') < 0, nucleo);
  t('mas a consulta usa o valor real da secretaria e acha o memorando certo',
    nucleo.descricoes.indexOf('projeto de engenharia') >= 0, nucleo);
  await pg4.close();

  console.log('\n6g) Do Arquivo para a rua, e da rua de volta para o Arquivo');
  /* A pasta não é cadastrada duas vezes: ela MUDA DE ESTADO. O 📤 na linha
     do Arquivo cria o trâmite ligado à pasta (pastaId) e a tira da
     prateleira (naRua); o "✓ Voltou hoje" fecha o trâmite e a devolve. O
     teste cobre a volta inteira, sempre olhando o banco — não só a tela. */
  const pg5 = await b.newPage({viewport:{width:1400, height:900}});
  const dlg5 = []; pg5.on('dialog', d => { dlg5.push(d.message()); d.accept(); });
  await abrirArquivo(pg5, 'editar');
  await pg5.click('.abas button:has-text("Arquivo")');
  await pg5.click('.mod-faixa button:has-text("PREGÃO")');
  await pg5.waitForTimeout(600);
  const pastaAlvo = await pg5.evaluate(() => {
    const p = ordenada('arq')[0];
    return {id: p._id, processo: p.processo, quantas: pastasNoArquivo().length};
  });
  const trAntes = await pg5.evaluate(() => Object.keys(window.__STORE.arquivo_tramites).length);
  await pg5.click('button[data-acao="rua"][data-id="' + pastaAlvo.id + '"]');
  await pg5.waitForTimeout(800);
  const mandou = await pg5.evaluate(() => {
    const cx = document.querySelector('[data-linha-edit]');
    const val = c => { const el = cx && cx.querySelector('[data-campo="' + c + '"]'); return el ? el.value : null; };
    return {tela: telaAtual, aberto: !!cx, tipo: val('tipo'), docTipo: val('docTipo'), docNum: val('docNum'),
            saiuEm: val('saiuEm'), foco: document.activeElement ? document.activeElement.dataset.campo : null};
  });
  t('o 📤 leva para "Na rua" com a linha já aberta — sem digitar o processo de novo',
    mandou.tela === 'rua' && mandou.aberto, mandou);
  t('o tipo do documento vem da modalidade, e o número vem do processo',
    mandou.docTipo === 'PE' && mandou.docNum === pastaAlvo.processo.match(/\d+\/\d{4}/)[0], mandou);
  t('é empréstimo, com a data de hoje — a pasta estava arquivada e saiu',
    mandou.tipo === 'emprestimo' && mandou.saiuEm === new Date().toISOString().slice(0, 10), mandou);
  t('e o cursor entra na única coisa que falta: com quem o papel está',
    mandou.foco === 'comQuem', mandou);

  /* Pasta que sai do arquivo sem destino anotado é o que o módulo existe
     para não deixar acontecer: sem nome, não há a quem cobrar. */
  dlg5.length = 0;
  await pg5.click('[data-linha-edit] button:has-text("Salvar")');
  await pg5.waitForTimeout(400);
  const semDestino = await pg5.evaluate((alvo) => ({
    aberto: !!document.querySelector('[data-linha-edit]'),
    naRua: !!(window.__STORE.arquivo_pastas[alvo.id] || {}).naRua,
    tramites: Object.keys(window.__STORE.arquivo_tramites).length
  }), pastaAlvo);
  t('salvar sem dizer com quem está é recusado, e nada vai para o banco',
    dlg5.some(m => /com quem/i.test(m)) && semDestino.aberto
    && semDestino.tramites === trAntes && !semDestino.naRua, {dlg5, semDestino, trAntes});

  await pg5.fill('[data-linha-edit] [data-campo="comQuem"]', 'maitê');
  await pg5.click('[data-linha-edit] button:has-text("Salvar")');
  await pg5.waitForTimeout(900);
  const foiParaRua = await pg5.evaluate((alvo) => {
    const tr = Object.values(window.__STORE.arquivo_tramites).find(x => x.pastaId === alvo.id);
    return {tramite: tr || null, pasta: window.__STORE.arquivo_pastas[alvo.id],
            docs: Object.keys(window.__STORE.arquivo_tramites).length,
            naFila: TRAMITES.some(x => x.pastaId === alvo.id),
            noArquivo: pastasNoArquivo().some(p => p._id === alvo.id),
            etiqueta: /do arquivo/.test(document.getElementById('tela').textContent)};
  }, pastaAlvo);
  t('o trâmite nasce ligado à pasta, com quem está e sem volta marcada',
    foiParaRua.tramite && foiParaRua.tramite.comQuem === 'MAITÊ' && !foiParaRua.tramite.voltouEm
    && foiParaRua.docs === trAntes + 1, foiParaRua.tramite);
  t('a pasta fica marcada como "na rua" no banco', foiParaRua.pasta.naRua === true, foiParaRua.pasta);
  t('e sai da lista do arquivo — ela não está mais na prateleira', !foiParaRua.noArquivo, foiParaRua);
  t('a fila mostra que este papel veio do arquivo', foiParaRua.naFila && foiParaRua.etiqueta, foiParaRua);

  await pg5.click('.abas button:has-text("Arquivo")');
  await pg5.waitForTimeout(600);
  const arqSemEla = await pg5.evaluate((alvo) => ({
    lista: pastasNoArquivo().length, linha: !!document.querySelector('td[data-id="' + alvo.id + '"]'),
    diz: document.getElementById('tela').textContent
  }), pastaAlvo);
  /* Sumir sem explicação é o que faz alguém cadastrar o mesmo processo de
     novo — a tela conta quantos estão na rua e leva até eles. */
  t('o Arquivo mostra uma pasta menos e diz que ela está na rua',
    arqSemEla.lista === pastaAlvo.quantas - 1 && !arqSemEla.linha && /na rua/.test(arqSemEla.diz),
    {agora: arqSemEla.lista, antes: pastaAlvo.quantas});

  dlg5.length = 0;
  const idTr = await pg5.evaluate((alvo) => TRAMITES.find(x => x.pastaId === alvo.id)._id, pastaAlvo);
  await pg5.click('.abas button:has-text("Na rua")');
  await pg5.waitForTimeout(400);
  await pg5.click('.btn-voltou[onclick*="' + idTr + '"]');
  await pg5.waitForTimeout(900);
  const voltouPasta = await pg5.evaluate((alvo) => ({
    pasta: window.__STORE.arquivo_pastas[alvo.id],
    tramite: Object.values(window.__STORE.arquivo_tramites).find(x => x.pastaId === alvo.id),
    naFila: TRAMITES.some(x => x.pastaId === alvo.id),
    noArquivo: pastasNoArquivo().some(p => p._id === alvo.id)
  }), pastaAlvo);
  t('a volta fecha o trâmite com a data de hoje',
    /^\d{4}-\d{2}-\d{2}$/.test((voltouPasta.tramite || {}).voltouEm || ''), voltouPasta.tramite);
  t('a pasta deixa de estar na rua e volta para o arquivo',
    voltouPasta.pasta.naRua === false && voltouPasta.noArquivo && !voltouPasta.naFila, voltouPasta);
  t('e não pergunta se quer catalogar — a pasta já existe, catalogar duplicaria',
    !dlg5.some(m => /Catalogar/i.test(m)), dlg5);

  console.log('\n6h) Excluir um processo lançado errado');
  /* Das quatro coleções só a pasta apaga (ver 1): ela diz o que está na
     prateleira, e uma linha de processo que não existe faz o arquivo mentir. */
  dlg5.length = 0;
  await pg5.click('.abas button:has-text("Arquivo")');
  await pg5.waitForTimeout(600);
  const antesEx = await pg5.evaluate(() => ({
    docs: Object.keys(window.__STORE.arquivo_pastas).length,
    alvo: ordenada('arq')[0]._id, processo: ordenada('arq')[0].processo
  }));
  await pg5.click('button[data-acao="excluir"][data-id="' + antesEx.alvo + '"]');
  await pg5.waitForTimeout(800);
  const depoisEx = await pg5.evaluate((id) => ({
    docs: Object.keys(window.__STORE.arquivo_pastas).length,
    aindaNoBanco: !!window.__STORE.arquivo_pastas[id],
    naLista: PASTAS.some(p => p._id === id),
    recado: (document.getElementById('impNota') || {}).textContent || ''
  }), antesEx.alvo);
  t('pergunta antes, dizendo o nome do processo que vai sair',
    dlg5.some(m => /Excluir/.test(m) && m.indexOf(antesEx.processo) >= 0), dlg5);
  t('e o processo sai do banco de verdade, não só da tela',
    !depoisEx.aindaNoBanco && depoisEx.docs === antesEx.docs - 1 && !depoisEx.naLista, {antesEx, depoisEx});
  t('a tela confirma o que foi excluído', /Exclu/.test(depoisEx.recado), depoisEx.recado);

  /* Com uma célula aberta noutra linha, o botão TEM de funcionar. É por isso
     que quem despacha as ações da linha é o mousedown, e não um onclick:
     fechar a célula chama render(), e o botão em que o clique começou deixa
     de existir antes de o "click" acontecer — ele parecia enguiçado. */
  dlg5.length = 0;
  const antesEx2 = await pg5.evaluate(() => ({
    docs: Object.keys(window.__STORE.arquivo_pastas).length,
    alvo: ordenada('arq')[0]._id, outra: ordenada('arq')[1]._id
  }));
  await pg5.click('td[data-campo="vencedor"][data-id="' + antesEx2.outra + '"]');
  await pg5.waitForTimeout(200);
  await pg5.fill('td.editando input', 'Empresa Corrigida');
  await pg5.click('button[data-acao="excluir"][data-id="' + antesEx2.alvo + '"]');
  await pg5.waitForTimeout(900);
  const comCelulaAberta = await pg5.evaluate((e) => ({
    excluida: !window.__STORE.arquivo_pastas[e.alvo],
    docs: Object.keys(window.__STORE.arquivo_pastas).length,
    vencedor: (window.__STORE.arquivo_pastas[e.outra] || {}).vencedor
  }), antesEx2);
  t('o 🗑 funciona com uma célula aberta noutra linha, e o que estava digitado é salvo',
    comCelulaAberta.excluida && comCelulaAberta.docs === antesEx2.docs - 1
    && comCelulaAberta.vencedor === 'Empresa Corrigida', {antesEx2, comCelulaAberta});

  console.log('\n6i) A tabela para de mudar de tamanho quando se clica numa célula');
  /* A queixa era esta: clicar numa célula troca o texto por um campo de
     digitar e, com a largura saindo do CONTEÚDO, a tabela inteira se
     redesenhava a cada clique. Agora a largura é declarada em <colgroup>. */
  const larguras = await pg5.evaluate(async () => {
    const medir = () => [...document.querySelectorAll('thead th')].map(x => Math.round(x.getBoundingClientRect().width));
    const tabela = () => Math.round(document.querySelector('table').getBoundingClientRect().height);
    /* o vencedor é o texto mais comprido da linha: é ele que ocupa três
       linhas e vira um campo de uma só quando a célula abre */
    const td = document.querySelector('td[data-campo="vencedor"]');
    const linha = () => Math.round(td.parentElement.getBoundingClientRect().height);
    const antes = medir(), altaAntes = linha(), tabAntes = tabela();
    td.click();
    await new Promise(r => setTimeout(r, 250));
    return {antes, durante: medir(), altaAntes, altaDurante: linha(),
            tabAntes, tabDurante: tabela(), editando: !!document.querySelector('td.editando'),
            layout: getComputedStyle(document.querySelector('table')).tableLayout,
            cols: document.querySelectorAll('colgroup col').length,
            colunas: document.querySelectorAll('thead th').length};
  });
  t('a tabela declara a largura das colunas, uma por coluna',
    larguras.layout === 'fixed' && larguras.cols === larguras.colunas, larguras);
  t('e nenhuma coluna muda de largura com a célula aberta',
    larguras.editando && larguras.antes.join() === larguras.durante.join(), larguras);
  /* O texto de três linhas virando um campo de uma encolhia a linha, e a
     tabela subia debaixo do cursor no mesmo instante do clique. */
  t('a linha também não encolhe — nada se mexe debaixo do cursor',
    larguras.altaDurante === larguras.altaAntes && larguras.tabDurante === larguras.tabAntes, larguras);

  /* Os cartões de resumo saíram das três telas de cadastro: quem abre vem
     procurar ou lançar, e eles empurravam a primeira linha para baixo da
     dobra. "Na rua" mantém os seus — lá o número É a tela. */
  const cards = await pg5.evaluate(async () => {
    const conta = () => document.querySelectorAll('.resumo .rc').length;
    const arq = conta();
    irPara('anul'); await new Promise(r => setTimeout(r, 700));
    const anul = conta();
    irPara('memo'); await new Promise(r => setTimeout(r, 500));
    document.querySelectorAll('.mod-btn').forEach(b => { if(/SMED/.test(b.textContent)) b.click(); });
    await new Promise(r => setTimeout(r, 600));
    const memo = conta();
    irPara('rua'); await new Promise(r => setTimeout(r, 500));
    return {arq, anul, memo, rua: conta()};
  });
  t('o painel de cartões saiu do Arquivo, das Anulações e dos Memorandos',
    !cards.arq && !cards.anul && !cards.memo, cards);
  t('mas continua em "Na rua", onde o número é a própria tela', cards.rua > 0, cards);
  await pg5.close();

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

  /* "+ Novo..." e o ✏️ de "Na rua" usam a mesma trava — chamar a função
     direto, sem passar pelo botão, porque quem só visualiza nem vê o
     botão para clicar. */
  const semCadastro = await ver.evaluate(() => {
    novaLinha('arq'); novaLinha('anul'); novaLinha('memo'); novaLinha('rua');
    return {pastas: PASTAS.length, anul: ANULACOES.length, memo: MEMORANDOS.length,
            celulaAberta: !!document.querySelector('td.editando'),
            formTramite: !!document.querySelector('[data-linha-edit]')};
  });
  t('quem só visualiza não consegue abrir nenhuma célula nem criar nenhuma linha',
    semCadastro.pastas === 0 && semCadastro.anul === 0 && semCadastro.memo === 0
    && !semCadastro.celulaAberta && !semCadastro.formTramite, semCadastro);
  t('e foi avisado do motivo em cada tentativa', avisos.filter(m => /leitura/i.test(m)).length >= 4, avisos);

  /* Excluir e mandar para a rua têm a mesma trava — e nem aparecem na linha. */
  const semAcoes = await ver.evaluate(async () => {
    irPara('arq');
    escolherModalidade('DISPENSA');
    await new Promise(r => setTimeout(r, 700));
    const alvo = PASTAS[0];
    const botoes = document.querySelectorAll('button[data-acao]').length;
    excluirPasta(alvo._id);
    mandarParaRua(alvo._id);
    await new Promise(r => setTimeout(r, 400));
    return {botoes, linhas: PASTAS.length, tela: telaAtual,
            aindaNoBanco: !!window.__STORE.arquivo_pastas[alvo._id]};
  });
  t('a linha de quem só visualiza não tem botão de ação nenhum',
    semAcoes.linhas > 0 && semAcoes.botoes === 0, semAcoes);
  t('e nem chamando as funções por fora ele exclui ou manda para a rua',
    semAcoes.aindaNoBanco && semAcoes.tela === 'arq', semAcoes);
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
