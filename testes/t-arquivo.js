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
    pastas[String(idp)] = { id: idp, modalidade: m, processo: m.slice(0, 4) + ' ' + (i + 1) + ' - objeto de teste',
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
    await pg.evaluate(() => !document.querySelector('[onclick*="secretaria"]')));

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

  console.log('\n6b) Cadastrar um processo novo e mover um de modalidade');
  const pg2 = await b.newPage({viewport:{width:1280, height:900}});
  pg2.on('dialog', d => d.accept());
  await abrirArquivo(pg2, 'editar');
  await pg2.evaluate(async () => {
    irPara('arq'); escolherModalidade('PREGÃO');
    await new Promise(r => setTimeout(r, 500));
  });

  const criou = await pg2.evaluate(async () => {
    const antes = PASTAS.length;
    novaPasta();
    const abriu = document.getElementById('ovPasta').classList.contains('open');
    /* já nasce na modalidade que está na tela — ninguém abre o formulário
       para cadastrar noutro lugar que não o que está olhando */
    const modPadrao = document.getElementById('paMod').value;
    document.getElementById('paProc').value = 'PE 99/2026 - Processo cadastrado pela tela';
    document.getElementById('paPreg').value = 'rodrigo';
    document.getElementById('paValor').value = '1.234,56';
    document.getElementById('paData').value = '2026-09-10';
    document.getElementById('paCheck').checked = true;
    salvarPasta();
    await new Promise(r => setTimeout(r, 600));
    const novo = PASTAS.find(x => x.processo === 'PE 99/2026 - Processo cadastrado pela tela');
    return {abriu, modPadrao, antes, depois: PASTAS.length, novo: novo || null,
            noBanco: novo ? window.__STORE.arquivo_pastas[novo._id] : null,
            fechou: !document.getElementById('ovPasta').classList.contains('open')};
  });
  t('o formulário abre já na modalidade que está na tela', criou.abriu && criou.modPadrao === 'PREGÃO', criou);
  t('o processo novo entra na lista', criou.depois === criou.antes + 1 && !!criou.novo, criou);
  t('e vai para o banco', !!criou.noBanco && criou.noBanco.processo === 'PE 99/2026 - Processo cadastrado pela tela', criou.noBanco);
  t('o valor "1.234,56" vira número, não texto', criou.noBanco && criou.noBanco.valor === 1234.56, criou.noBanco);
  t('o pregoeiro entra em maiúsculas, como o resto do cadastro',
    criou.noBanco && criou.noBanco.pregoeiro === 'RODRIGO', criou.noBanco);
  /* O id da planilha é da IMPORTAÇÃO: é por ele que reimportar reescreve em
     vez de duplicar. Processo nascido na tela não tem — senão uma
     reimportação passaria por cima dele. */
  t('processo nascido na tela não carrega o id da planilha',
    criou.noBanco && criou.noBanco.id === undefined, criou.noBanco);
  t('o formulário fecha sozinho depois de salvar', criou.fechou, criou);

  const moveu = await pg2.evaluate(async () => {
    const alvo = PASTAS.find(x => x.processo === 'PE 99/2026 - Processo cadastrado pela tela');
    const antes = PASTAS.length;
    abrirPasta(alvo._id);
    document.getElementById('paMod').value = 'CONCORRÊNCIA';
    salvarPasta();
    await new Promise(r => setTimeout(r, 600));
    return {antes, depois: PASTAS.length,
            aindaNaLista: PASTAS.some(x => x._id === alvo._id),
            noBanco: window.__STORE.arquivo_pastas[alvo._id].modalidade,
            recado: (document.getElementById('impNota') || {}).textContent || ''};
  });
  t('trocar a modalidade move o processo no banco', moveu.noBanco === 'CONCORRÊNCIA', moveu);
  t('e ele sai desta lista, que mostra uma modalidade só',
    !moveu.aindaNaLista && moveu.depois === moveu.antes - 1, moveu);
  /* Sumir sem explicação é o que faz a pessoa achar que perdeu o registro. */
  t('a tela diz para onde ele foi, em vez de ele só sumir',
    /movido para CONCORRÊNCIA/.test(moveu.recado), moveu.recado);

  const achou = await pg2.evaluate(async () => {
    escolherModalidade('CONCORRÊNCIA');
    await new Promise(r => setTimeout(r, 600));
    return PASTAS.some(x => x.processo === 'PE 99/2026 - Processo cadastrado pela tela');
  });
  t('e ele está lá, na modalidade nova', achou);
  await pg2.close();

  console.log('\n6c) "Na rua" → Arquivo: sugere catalogar quando volta da assinatura');
  /* docTipo ("DL") e docNum ("999/2026") do trâmite não batem sozinhos com
     modalidade+processo da pasta — dá para SUGERIR, com a pessoa confirmando
     duas vezes: no confirm() antes de sair de "Na rua", e no "Salvar" do
     formulário que abre já preenchido. Os três casos que importam: docTipo
     reconhecido soma para DISPENSA; docTipo de papelada (EXTRATOS) não
     sugere nada; e um empréstimo — documento já arquivado voltando de uma
     consulta — não sugere de novo, mesmo com docTipo mapeado. */
  const pg3 = await b.newPage({viewport:{width:1280, height:900}});
  const dialogos = [];
  pg3.on('dialog', d => { dialogos.push(d.message()); d.accept(); });
  await abrirArquivo(pg3, 'editar');
  const hojeISO = new Date().toISOString().slice(0, 10);

  const posId = await pg3.evaluate(() => TRAMITES.find(x => x.docNum === '999/2026')._id);
  await pg3.click('.linha:has-text("999/2026") .btn-voltou');
  await pg3.waitForTimeout(700);
  const positivo = await pg3.evaluate((id) => ({
    gravou: window.__STORE.arquivo_tramites[id].voltouEm,
    tela: telaAtual, mod: MOD_ATUAL,
    formAberto: document.getElementById('ovPasta').classList.contains('open'),
    proc: document.getElementById('paProc').value,
    data: document.getElementById('paData').value,
    modNoForm: document.getElementById('paMod').value
  }), posId);
  t('pergunta antes de sugerir, citando o documento e o motivo',
    dialogos.some(m => /DL/.test(m) && /999\/2026/.test(m) && /assinatura/.test(m)), dialogos);
  t('mas o retorno é gravado de qualquer forma — o "voltou" não depende do "sim"',
    /^\d{4}-\d{2}-\d{2}$/.test(positivo.gravou || ''), positivo);
  t('a tela pula direto para o Arquivo', positivo.tela === 'arq', positivo);
  t('já na modalidade certa, vinda do docTipo "DL"', positivo.mod === 'DISPENSA', positivo);
  t('o formulário de processo novo abre sozinho', positivo.formAberto, positivo);
  t('com o processo pré-preenchido a partir do trâmite', positivo.proc === 'DL 999/2026', positivo);
  t('e a data de hoje, sem precisar digitar', positivo.data === hojeISO, positivo);
  t('o formulário concorda com a modalidade da tela', positivo.modNoForm === 'DISPENSA', positivo);
  /* Nada foi gravado no arquivo ainda — só sugerido. Cadastrar de verdade é
     o "Salvar" de sempre, já coberto em 6b. */
  t('mas nada entrou de fato no arquivo — é sugestão, não cadastro automático',
    await pg3.evaluate(() => !PASTAS.some(x => x.processo === 'DL 999/2026')));
  await pg3.evaluate(() => fecharPasta());

  dialogos.length = 0;
  await pg3.evaluate(async () => { irPara('rua'); await new Promise(r => setTimeout(r, 300)); });
  await pg3.click('.linha:has-text("50/2026") .btn-voltou');
  await pg3.waitForTimeout(500);
  const semMapa = await pg3.evaluate(() => ({
    tela: telaAtual, formAberto: document.getElementById('ovPasta').classList.contains('open')
  }));
  t('documento que é papelada (EXTRATOS), não processo, não sugere nada',
    dialogos.length === 0 && semMapa.tela === 'rua' && !semMapa.formAberto, {dialogos, semMapa});

  dialogos.length = 0;
  await pg3.click('.linha:has-text("888/2026") .btn-voltou');
  await pg3.waitForTimeout(500);
  const emprestimo = await pg3.evaluate(() => ({
    tela: telaAtual, formAberto: document.getElementById('ovPasta').classList.contains('open')
  }));
  t('documento emprestado — já catalogado — não sugere de novo, mesmo com docTipo mapeado',
    dialogos.length === 0 && emprestimo.tela === 'rua' && !emprestimo.formAberto, {dialogos, emprestimo});
  await pg3.close();

  console.log('\n6d) Cadastrar direto pela tela: trâmite, anulação e memorando');
  const pg4 = await b.newPage({viewport:{width:1280, height:900}});
  pg4.on('dialog', d => d.accept());
  await abrirArquivo(pg4, 'editar');
  const hojeISO2 = new Date().toISOString().slice(0, 10);

  /* --- Novo documento "na rua" --- */
  await pg4.evaluate(async () => { irPara('rua'); await new Promise(r => setTimeout(r, 300)); });
  const antesRua = await pg4.evaluate(() => TRAMITES.length);
  await pg4.click('button:has-text("＋ Novo documento na rua")');
  const abriuTramite = await pg4.evaluate(() => ({
    aberto: document.getElementById('ovTramite').classList.contains('open'),
    tipoPadrao: document.getElementById('trTipo').value,
    dataPadrao: document.getElementById('trData').value
  }));
  t('o formulário de novo documento abre com tipo "assinatura" e a data de hoje',
    abriuTramite.aberto && abriuTramite.tipoPadrao === 'assinatura' && abriuTramite.dataPadrao === hojeISO2, abriuTramite);

  const novoTr = await pg4.evaluate(async () => {
    document.getElementById('trDocTipo').value = 'dl';
    document.getElementById('trDocNum').value = '500/2026';
    document.getElementById('trComQuem').value = 'testando';
    salvarTramite();
    await new Promise(r => setTimeout(r, 500));
    const achado = TRAMITES.find(x => x.docNum === '500/2026');
    return {depois: TRAMITES.length, achado: achado || null,
            noBanco: achado ? window.__STORE.arquivo_tramites[achado._id] : null,
            fechou: !document.getElementById('ovTramite').classList.contains('open')};
  });
  t('o documento novo entra na lista de "Na rua"', novoTr.depois === antesRua + 1 && !!novoTr.achado, novoTr);
  t('docTipo e comQuem entram em maiúsculas',
    novoTr.noBanco && novoTr.noBanco.docTipo === 'DL' && novoTr.noBanco.comQuem === 'TESTANDO', novoTr.noBanco);
  t('nasce sem voltouEm — é isso que o deixa "na rua"', novoTr.noBanco && novoTr.noBanco.voltouEm === null, novoTr.noBanco);
  t('o formulário fecha sozinho', novoTr.fechou, novoTr);

  /* editar um trâmite existente pelo ✏️, sem usar "✓ Voltou hoje" */
  await pg4.click('.linha:has-text("101") .mini-btn');
  const formEdicaoTr = await pg4.evaluate(() => ({
    titulo: document.getElementById('tramiteTit').textContent,
    comQuem: document.getElementById('trComQuem').value
  }));
  t('editar um trâmite existente abre com "Documento na rua" e os dados dele',
    formEdicaoTr.titulo === 'Documento na rua' && formEdicaoTr.comQuem === 'ANDREI', formEdicaoTr);
  const salvouEdicaoTr = await pg4.evaluate(async () => {
    document.getElementById('trComQuem').value = 'corrigido';
    salvarTramite();
    await new Promise(r => setTimeout(r, 500));
    const alvo = TRAMITES.find(x => x.docNum === '101');
    return {total: TRAMITES.length, comQuem: window.__STORE.arquivo_tramites[alvo._id].comQuem};
  });
  t('editar corrige o registro sem duplicar',
    salvouEdicaoTr.total === novoTr.depois && salvouEdicaoTr.comQuem === 'CORRIGIDO', salvouEdicaoTr);

  /* --- Nova anulação: o número vem do banco, não da janela carregada --- */
  await pg4.evaluate(async () => { irPara('anul'); await new Promise(r => setTimeout(r, 400)); });
  const anulCarregadas = await pg4.evaluate(() => ANULACOES.map(a => a.num));
  t('a janela padrão (30 dias) não traz a anulação nº 2 do ano — ela é mais antiga que 30 dias',
    anulCarregadas.indexOf(2) < 0, anulCarregadas);

  await pg4.click('button:has-text("＋ Nova anulação")');
  await pg4.waitForTimeout(600);   /* aguarda a consulta do próximo número */
  const numCalculado = await pg4.evaluate(() => document.getElementById('anNum').value);
  t('o próximo número é 3 — o maior do ANO (2, mesmo fora da tela) mais um, não 2 (o maior CARREGADO)',
    numCalculado === '3/' + ANO, {numCalculado, esperado: '3/' + ANO});

  const novaAn = await pg4.evaluate(async () => {
    document.getElementById('anReq').value = '09-99-2026-SMED';
    document.getElementById('anSec').value = 'smed';
    document.getElementById('anQuem').value = 'testando';
    document.getElementById('anCredor').value = 'Fornecedor Teste';
    document.getElementById('anValor').value = '1.500,00';
    salvarAnul();
    await new Promise(r => setTimeout(r, 500));
    const achado = ANULACOES.find(x => x.requisicao === '09-99-2026-SMED');
    return {achado: achado || null, noBanco: achado ? window.__STORE.arquivo_anulacoes[achado._id] : null,
            naTela: [...document.querySelectorAll('table tbody tr td b')].some(td => /^3\//.test(td.textContent))};
  });
  t('a anulação nova grava com nº 3 e ano corrente',
    novaAn.noBanco && novaAn.noBanco.num === 3 && novaAn.noBanco.ano === ANO, novaAn.noBanco);
  t('secretaria e quem entram em maiúsculas',
    novaAn.noBanco && novaAn.noBanco.reqSec === 'SMED' && novaAn.noBanco.quem === 'TESTANDO', novaAn.noBanco);
  t('e o valor "1.500,00" vira número', novaAn.noBanco && novaAn.noBanco.valor === 1500, novaAn.noBanco);
  t('aparece na tela mesmo sem estar na janela de 30 dias — acabou de ser criada', novaAn.naTela, novaAn);

  /* editar não recalcula o número */
  const antesEdicaoAn = await pg4.evaluate(() => ANULACOES.length);
  await pg4.click('tr.lin-clic:has-text("09-99-2026-SMED")');
  const numEdicaoAn = await pg4.evaluate(() => document.getElementById('anNum').value);
  t('editar a anulação recém-criada mantém o número — não recalcula',
    numEdicaoAn === '3/' + ANO, {numEdicaoAn});
  const editouAn = await pg4.evaluate(async () => {
    document.getElementById('anCredor').value = 'Fornecedor Corrigido';
    salvarAnul();
    await new Promise(r => setTimeout(r, 500));
    const achado = ANULACOES.find(x => x.requisicao === '09-99-2026-SMED');
    return {total: ANULACOES.length, credor: window.__STORE.arquivo_anulacoes[achado._id].credor};
  });
  t('editar corrige sem duplicar nem mudar o número',
    editouAn.total === antesEdicaoAn && editouAn.credor === 'Fornecedor Corrigido', editouAn);

  /* --- Novo memorando, na secretaria da tela --- */
  await pg4.evaluate(async () => {
    irPara('memo'); escolherSecretariaMemo('SMED');
    await new Promise(r => setTimeout(r, 500));
  });
  const antesMemo = await pg4.evaluate(() => MEMORANDOS.length);
  await pg4.click('button:has-text("＋ Novo memorando")');
  const abriuMemo = await pg4.evaluate(() => ({
    aberto: document.getElementById('ovMemo').classList.contains('open'),
    secPadrao: document.getElementById('moSec').value,
    dataPadrao: document.getElementById('moData').value
  }));
  t('o formulário de novo memorando já nasce na secretaria da tela',
    abriuMemo.aberto && abriuMemo.secPadrao === 'SMED' && abriuMemo.dataPadrao === hojeISO2, abriuMemo);

  const novoMe = await pg4.evaluate(async () => {
    document.getElementById('moNum').value = '99/2026';
    document.getElementById('moPara').value = 'testando';
    document.getElementById('moDesc').value = 'Memorando de teste';
    salvarMemo();
    await new Promise(r => setTimeout(r, 500));
    const achado = MEMORANDOS.find(x => x.num === '99/2026');
    return {depois: MEMORANDOS.length, achado: achado || null,
            noBanco: achado ? window.__STORE.arquivo_memorandos[achado._id] : null};
  });
  t('o memorando novo entra na secretaria atual', novoMe.depois === antesMemo + 1 && !!novoMe.achado, novoMe);
  t('entregue para entra em maiúsculas, e o ano é derivado da data de recebimento',
    novoMe.noBanco && novoMe.noBanco.entregueA === 'TESTANDO' && novoMe.noBanco.ano === ANO, novoMe.noBanco);

  /* trocar a secretaria no formulário MOVE o memorando, como nas pastas */
  const moveuMemo = await pg4.evaluate(async () => {
    const alvo = MEMORANDOS.find(x => x.num === '99/2026');
    abrirMemo(alvo._id);
    document.getElementById('moSec').value = 'SMS';
    salvarMemo();
    await new Promise(r => setTimeout(r, 500));
    return {aindaAqui: MEMORANDOS.some(x => x.num === '99/2026'),
            noBanco: window.__STORE.arquivo_memorandos[alvo._id].secretaria,
            recado: (document.getElementById('impNota') || {}).textContent || ''};
  });
  t('trocar a secretaria move o memorando e ele some desta lista',
    !moveuMemo.aindaAqui && moveuMemo.noBanco === 'SMS', moveuMemo);
  t('a tela avisa para onde foi', /movido para SMS/.test(moveuMemo.recado), moveuMemo.recado);

  /* o rótulo encurtado do botão não pode mudar o valor usado na consulta */
  const nucleo = await pg4.evaluate(async () => {
    escolherSecretariaMemo('NUCLEO PROJETOSENGENHEIROS');
    await new Promise(r => setTimeout(r, 500));
    return {
      descricoes: MEMORANDOS.map(m => m.descricao),
      botaoOn: document.querySelector('.mod-btn.on').textContent.trim()
    };
  });
  t('o botão mostra o rótulo curto "NUCLEO PROJETOS", não o nome inteiro da aba',
    nucleo.botaoOn.indexOf('NUCLEO PROJETOS') >= 0 && nucleo.botaoOn.indexOf('ENGENHEIROS') < 0, nucleo);
  t('mas a consulta usa o valor real da secretaria e acha o memorando certo',
    nucleo.descricoes.indexOf('projeto de engenharia') >= 0, nucleo);
  await pg4.close();

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

  /* Os três formulários de cadastro (trâmite, anulação, memorando) usam a
     mesma trava de sempre — chamar a função direto, sem passar pelo botão,
     porque quem só visualiza nem vê o botão para clicar. */
  const semCadastro = await ver.evaluate(() => {
    novoTramite(); novaAnul(); novoMemo();
    return {
      tramite: document.getElementById('ovTramite').classList.contains('open'),
      anul: document.getElementById('ovAnul').classList.contains('open'),
      memo: document.getElementById('ovMemo').classList.contains('open')
    };
  });
  t('quem só visualiza não consegue abrir nenhum dos três formulários de cadastro',
    !semCadastro.tramite && !semCadastro.anul && !semCadastro.memo, semCadastro);
  t('e foi avisado do motivo em cada tentativa', avisos.filter(m => /leitura/i.test(m)).length >= 4, avisos);
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
