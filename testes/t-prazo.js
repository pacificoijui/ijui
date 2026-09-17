/* O PRAZO DO PREGOEIRO — "volto nisso amanhã às 11h30"

   Dez processos parados na tela, todos pedindo atenção, e nenhum podendo
   andar hoje. Marcar um prazo é dizer que a decisão sobre aquele processo
   já foi tomada: ela é depois. Até lá o card sai da frente.

   O que este teste cobra, e por quê:
     · adiar tira da TELA, não do sistema — a busca continua achando, e o
       número do que está escondido fica à vista;
     · quando a hora chega, o processo volta sozinho;
     · o prazo é gravado no processo (tela compartilhada: a colega ao lado
       precisa saber que ele está parado até quinta). */
const {chromium, executablePath} = require('./navegador');
const fs = require('fs');
let ok = 0, mau = 0;
function t(n, c, e){ if(c){ console.log('  ✓', n); ok++; } else { console.log('  ✗', n, e !== undefined ? '\n       ' + JSON.stringify(e) : ''); mau++; process.exitCode = 1; } }

/* Datas relativas a AGORA: um teste com data fixa passa hoje e falha em
   janeiro, e aí ninguém sabe se quebrou o código ou o calendário. */
function iso(offsetMin){
  const d = new Date(Date.now() + offsetMin * 60000);
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2)
    + 'T' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
}
const ONTEM = iso(-60 * 26), DAQUI_2H = iso(120), SEMANA = iso(60 * 24 * 7);

const SEED = {
  processos: {
    livre1: {numero:'PE 1/2026',  objeto:'Sem prazo — precisa de decisão hoje', status:'em-andamento', responsavel:'PEDRO', link:'', contato:''},
    livre2: {numero:'PE 2/2026',  objeto:'Também sem prazo',                     status:'em-andamento', responsavel:'PEDRO', link:'', contato:''},
    adiado1:{numero:'PE 10/2026', objeto:'Aguardando recurso',  status:'em-andamento', responsavel:'PEDRO', link:'', contato:'', prazo: DAQUI_2H},
    adiado2:{numero:'PE 11/2026', objeto:'Parado até semana que vem', status:'em-andamento', responsavel:'PEDRO', link:'', contato:'', prazo: SEMANA},
    venceu: {numero:'PE 12/2026', objeto:'O prazo já chegou',   status:'em-andamento', responsavel:'PEDRO', link:'', contato:'', prazo: ONTEM}
  },
  status: { s1:{id:'em-andamento', nome:'Em Andamento', cor:'amber', ordem:0} },
  agentes: { a1:{nomeAbrev:'PEDRO', nomeCompleto:'Pedro Pacifico', nomeCompleto2:''} }
};

(async () => {
  const stub = fs.readFileSync('fbstub3.js', 'utf8');
  const b = await chromium.launch(executablePath ? {executablePath} : {});
  const pg = await b.newPage({viewport:{width:1400, height:950}});
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  pg.on('dialog', d => d.accept());
  await pg.route('**/firebasejs/**', r => r.fulfill({status:200, contentType:'application/javascript',
    body: r.request().url().includes('firestore') ? stub : '/*noop*/'}));
  await pg.route('**/fonts.googleapis.com/**', r => r.fulfill({status:200, contentType:'text/css', body:''}));
  await pg.route('**/cdnjs.cloudflare.com/**', r => r.fulfill({status:200, contentType:'application/javascript', body:'window.jspdf={};'}));
  await pg.addInitScript(() => localStorage.setItem('copam_auth', JSON.stringify({u:'teste', nome:'QA'})));
  await pg.addInitScript((sd) => { window.__SEED = sd; }, SEED);
  await pg.addInitScript((u) => { window.__AUTH_SEED = u; }, {uid:'teste-admin', email:'pedrohhpacifico@gmail.com', displayName:'QA', photoURL:''});
  await pg.goto('http://127.0.0.1:8099/pregoeiro/index.html', {waitUntil:'networkidle'});
  await pg.waitForTimeout(1200);

  const naTela = () => pg.evaluate(() =>
    [...document.querySelectorAll('#grid .card[data-pid]')].map(c => c.getAttribute('data-pid')));

  console.log('1) A tela abre só com o que precisa de decisão agora');
  const abertura = await naTela();
  t('o processo sem prazo aparece',
    abertura.indexOf('livre1') >= 0 && abertura.indexOf('livre2') >= 0, abertura);
  t('o adiado para daqui a 2h sai da tela', abertura.indexOf('adiado1') < 0, abertura);
  t('o adiado para a semana que vem também', abertura.indexOf('adiado2') < 0, abertura);
  /* O que tem prazo VENCIDO é justamente o que precisa de decisão agora —
     esconder ele seria o oposto do que a função serve. */
  t('mas o de prazo já vencido VOLTA — é o que precisa de decisão',
    abertura.indexOf('venceu') >= 0, abertura);

  console.log('\n2) Esconder não é esquecer');
  const barra = await pg.evaluate(() => {
    const el = document.getElementById('barraPrazo');
    return {visivel: el.style.display !== 'none', txt: el.textContent};
  });
  t('a barra diz quantos estão fora da tela', barra.visivel && /2 processos/.test(barra.txt), barra);
  t('e oferece trazê-los de volta', /Ver assim mesmo/.test(barra.txt), barra);

  const revelados = await pg.evaluate(() => { alternarAdiados(); return null; }).then(naTela);
  t('"ver assim mesmo" mostra todos', revelados.length === 5, revelados);
  const barra2 = await pg.evaluate(() => document.getElementById('barraPrazo').textContent);
  t('e a barra passa a oferecer esconder de novo', /Esconder de novo/.test(barra2), barra2);
  await pg.evaluate(() => alternarAdiados());

  console.log('\n3) A busca continua achando o que está adiado');
  const achou = await pg.evaluate(async () => {
    document.getElementById('filtroNumero').value = '11';
    renderizar();
    await new Promise(r => setTimeout(r, 150));
    const ids = [...document.querySelectorAll('#grid .card[data-pid]')].map(c => c.getAttribute('data-pid'));
    document.getElementById('filtroNumero').value = '';
    renderizar();
    return ids;
  });
  t('procurar pelo número acha o processo adiado', achou.indexOf('adiado2') >= 0, achou);

  console.log('\n4) Marcar um prazo tira o processo da frente, e grava no banco');
  const marcou = await pg.evaluate(async () => {
    abrirPrazo('livre1');
    const abriu = document.getElementById('modalPrazo').classList.contains('open');
    const nomeNoModal = document.getElementById('prazoProc').textContent;
    prazoRapido(1, '11:30');                       /* "amanhã 11h30" */
    const valor = document.getElementById('prazoInput').value;
    salvarPrazo();
    await new Promise(r => setTimeout(r, 400));
    return {abriu, nomeNoModal, valor,
            fechou: !document.getElementById('modalPrazo').classList.contains('open'),
            gravado: window.__STORE.processos.livre1.prazo,
            naTela: [...document.querySelectorAll('#grid .card[data-pid]')].map(c => c.getAttribute('data-pid'))};
  });
  t('o modal abre dizendo de qual processo se trata', marcou.abriu && /1\/2026/.test(marcou.nomeNoModal), marcou);
  t('"amanhã 11h30" preenche a data e a hora sem digitar',
    /T11:30$/.test(marcou.valor || ''), marcou);
  t('o prazo é gravado no processo, não só na tela', marcou.gravado === marcou.valor, marcou);
  t('e o card sai da tela na hora', marcou.naTela.indexOf('livre1') < 0, marcou);
  t('o modal fecha sozinho depois de marcar', marcou.fechou, marcou);

  console.log('\n5) Tirar o prazo devolve o processo');
  const tirou = await pg.evaluate(async () => {
    abrirPrazo('livre1');
    const ofereceTirar = document.getElementById('prazoTirar').style.display !== 'none';
    tirarPrazo();
    await new Promise(r => setTimeout(r, 400));
    return {ofereceTirar, gravado: window.__STORE.processos.livre1.prazo,
            naTela: [...document.querySelectorAll('#grid .card[data-pid]')].map(c => c.getAttribute('data-pid'))};
  });
  t('quem já tem prazo vê a opção de tirar', tirou.ofereceTirar);
  t('tirar apaga o prazo no banco', !tirou.gravado, tirou);
  t('e o processo volta para a tela', tirou.naTela.indexOf('livre1') >= 0, tirou);

  console.log('\n6) O botão do card conta o que está marcado');
  const botoes = await pg.evaluate(() => {
    alternarAdiados();
    const por = {};
    document.querySelectorAll('#grid .card[data-pid]').forEach(c => {
      const bt = c.querySelector('.card-prazo-btn');
      por[c.getAttribute('data-pid')] = bt ? {txt: bt.textContent.trim(), cls: bt.className} : null;
    });
    alternarAdiados();
    return por;
  });
  t('processo sem prazo mostra só "Prazo"', /Prazo$/.test(botoes.livre2.txt), botoes.livre2);
  t('o adiado mostra quando volta, em português',
    /às/.test(botoes.adiado1.txt) && /on/.test(botoes.adiado1.cls), botoes.adiado1);
  t('e o de prazo vencido fica marcado como vencido',
    /venceu/.test(botoes.venceu.cls), botoes.venceu);

  console.log('\n7) Adiar tudo dá uma tela vazia que é boa notícia, não erro');
  const vazia = await pg.evaluate(async () => {
    ['livre1','livre2','venceu'].forEach(id => { gravarPrazo(id, null, ''); });
    await new Promise(r => setTimeout(r, 200));
    const daqui = new Date(Date.now() + 3 * 3600000);
    const v = daqui.getFullYear() + '-' + ('0'+(daqui.getMonth()+1)).slice(-2) + '-' + ('0'+daqui.getDate()).slice(-2)
      + 'T' + ('0'+daqui.getHours()).slice(-2) + ':' + ('0'+daqui.getMinutes()).slice(-2);
    ['livre1','livre2','venceu'].forEach(id => { gravarPrazo(id, v, ''); });
    await new Promise(r => setTimeout(r, 400));
    return {cards: document.querySelectorAll('#grid .card[data-pid]').length,
            txt: document.getElementById('grid').textContent};
  });
  t('não sobra card nenhum', vazia.cards === 0, vazia);
  t('e a tela diz "nada para decidir agora", em vez de "nenhum processo encontrado"',
    /Nada para decidir agora/.test(vazia.txt) && !/Ajuste os filtros/.test(vazia.txt), vazia.txt.slice(0, 160));

  console.log('\nerros JS: ' + (errs.length ? errs.join(' | ') : 'nenhum'));
  console.log('\n' + ok + ' passaram, ' + mau + ' falharam.');
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
