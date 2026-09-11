/* O Painel da Secretaria (/secretaria/) é uma tela por pasta: quem entra vê
   as requisições e os contratos DA PRÓPRIA secretaria, e nada mais.

   O que este teste cobre, e o que NÃO cobre: aqui se confere a tela — que
   ela pede ao banco só o recorte da conta, que os números do topo filtram,
   que o celular não estoura. Que o BANCO recusa o resto é outra prova, e
   está em t-regras.mjs (seção "Painel da Secretaria"), rodando no emulador
   oficial. As duas juntas é que valem alguma coisa: uma tela que esconde
   não protege nada. */
const {chromium, executablePath} = require('./navegador');
const fs=require('fs');
let ok=0,mau=0;
function t(n,c,e){ if(c){console.log('  ✓',n);ok++;} else {console.log('  ✗',n,e!==undefined?'\n       '+JSON.stringify(e):'');mau++;process.exitCode=1;} }

function iso(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }

(async()=>{
  const stub=fs.readFileSync('fbstub3.js','utf8');
  const html=fs.readFileSync('../secretaria/index.html','utf8');

  console.log('1) A tela é de leitura, e o escopo não mora nela');
  t('não grava requisição', !/collection\('requisicoes'\)[\s\S]{0,40}\.(set|update|delete|add)\(/.test(html));
  t('não grava contrato',   !/collection\('contratos'\)[\s\S]{0,40}\.(set|update|delete|add)\(/.test(html));
  /* O escopo vindo da URL seria o bug clássico: bastaria trocar ?sec= para
     ver a pasta da vizinha. Ele vem do perfil, e só de lá. */
  t('o escopo não vem da URL', !/location\.search|URLSearchParams/.test(html));
  t('o escopo vem do perfil da conta', /authCurrentUser\s*&&\s*authCurrentUser\.secretarias/.test(html));
  t('usa o mesmo projeto e o mesmo cadastro de contas',
    /projectId: "processos-ijui"/.test(html) && /usuarios_v2/.test(html));
  t('e um painel próprio no controle de acesso', /painel_secretaria/.test(html));
  /* Baixar o requisicoes.json (1,1 MB) para ler dezesseis nomes seria pagar
     mil vezes o preço — e, numa tela que promete mostrar só uma secretaria,
     seria baixar as requisições de TODAS elas para o navegador. */
  t('não baixa o histórico inteiro só para ler os nomes das secretarias',
    !/fetch\([^)]*requisicoes\.json/.test(html) && /fetch\([^)]*secretarias\.json/.test(html));
  t('e o arquivo dos nomes é pequeno de verdade',
    fs.statSync('../requisicao/dados/secretarias.json').size < 8*1024,
    fs.statSync('../requisicao/dados/secretarias.json').size);

  const HOJE=new Date();
  const mesPassado=new Date(HOJE.getFullYear(), HOJE.getMonth()-1, 10);
  const antigo=new Date(HOJE.getFullYear(), HOJE.getMonth()-8, 10);

  /* Educação escreve-se "SMEd" nas requisições e "SMED" nos contratos. É o
     caso real do cadastro, e o painel tem de mostrar os dois lados. */
  const REQS={
    r1:{id:1, sec:'SMEd', num:10, ano:2026, sufixo:'', recebido:iso(HOJE), credor:'PAPELARIA CENTRAL',
        objeto:'Material de expediente para as escolas', valor:1200, modalidade:'', empenho:'',
        contabilidade:null, despacho:'', criadaEm:'2026-09-01T10:00:00.000Z'},
    r2:{id:2, sec:'SMEd', num:11, ano:2026, sufixo:'', recebido:iso(mesPassado), credor:'TRANSPORTES ALFA',
        objeto:'Transporte escolar da zona rural', valor:84000, modalidade:'Pregão', empenho:'4711',
        contabilidade:null, despacho:'Pregão', criadaEm:'2026-08-02T10:00:00.000Z'},
    r3:{id:3, sec:'SMEd', num:12, ano:2026, sufixo:'', recebido:null, credor:'', objeto:'', valor:null,
        modalidade:'', empenho:'', contabilidade:null, despacho:'', criadaEm:'2026-09-10T10:00:00.000Z'},
    r4:{id:4, sec:'SMEd', num:3, ano:2026, sufixo:'', recebido:iso(antigo), credor:'MERENDA LTDA',
        objeto:'Gêneros alimentícios', valor:53000, modalidade:'Pregão', empenho:'4102',
        contabilidade:null, despacho:'Pregão'},
    /* Da saúde: não pode aparecer em lugar nenhum desta tela. */
    r9:{id:9, sec:'SMS', num:77, ano:2026, sufixo:'', recebido:iso(HOJE), credor:'FARMACIA DA VIZINHA',
        objeto:'Medicamentos', valor:9000, modalidade:'', empenho:'', contabilidade:null, despacho:''}
  };
  const venc = n => { const d=new Date(HOJE); d.setDate(d.getDate()+n); return iso(d); };
  const CTRS={
    c1:{id:1, contr:40, ano:2024, empresa:'TRANSPORTES ALFA LTDA', objeto:'Transporte escolar',
        situacao:'ATIVO', vencimento:venc(45), valor:300000, secretarias:['SMED'],
        fiscalAdm:['Marta'], fiscalTec:[], modalidade:'PREGÃO', tipo:'SERVIÇO', palavra:'', obs:'', aditivos:[]},
    c2:{id:2, contr:12, ano:2022, empresa:'CONSTRUTORA BETA', objeto:'Reforma da escola central',
        situacao:'ATIVO', vencimento:venc(-20), valor:180000, secretarias:['SMED'],
        fiscalAdm:[], fiscalTec:['Jorge'], modalidade:'', tipo:'OBRA', palavra:'', obs:'', aditivos:[]},
    c3:{id:3, contr:90, ano:2025, empresa:'LIMPEZA GAMA', objeto:'Limpeza predial',
        situacao:'ENCERRADO', vencimento:venc(-400), valor:40000, secretarias:['SMED'],
        fiscalAdm:[], fiscalTec:[], modalidade:'', tipo:'', palavra:'', obs:'', aditivos:[]},
    /* Com aditivo: o valor e o prazo vigentes são os da conta, não os de origem. */
    c4:{id:4, contr:7, ano:2023, empresa:'MANUTENCAO DELTA', objeto:'Manutenção de equipamentos',
        situacao:'ATIVO', vencimento:venc(200), valor:50000, secretarias:['SMED'],
        fiscalAdm:[], fiscalTec:[], modalidade:'', tipo:'', palavra:'', obs:'',
        aditivos:[{valor:25000, vencimento:venc(400), assinado:'2025-01-10'}]},
    c9:{id:9, contr:55, ano:2026, empresa:'HOSPITAL VIZINHO', objeto:'Da saúde, não da educação',
        situacao:'ATIVO', vencimento:venc(30), valor:70000, secretarias:['SMS'],
        fiscalAdm:[], fiscalTec:[], modalidade:'', tipo:'', palavra:'', obs:'', aditivos:[]}
  };

  function seed(secretarias, nivel){
    return {
      requisicoes: REQS, contratos: CTRS,
      usuarios_v2: {'g-educ':{email:'educacao@ijui.rs.gov.br', nome:'Secretaria de Educação',
        status:'aprovado', isAdmin:false,
        acessos:{agenda:'nenhum', pregoeiro:'nenhum', contratos:'nenhum', requisicao:'nenhum',
                 painel_secretaria:nivel===undefined?'ver':nivel},
        secretarias: secretarias, provedor:'password'}}
    };
  }
  async function abrir(b, secretarias, nivel, viewport){
    const pg=await b.newPage({viewport: viewport || {width:1280,height:950}});
    const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
    if(process.env.DBG) pg.on('console',m=>console.log('  [console]',m.type(),m.text()));
    await pg.route('**/firebasejs/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:stub}));
    await pg.route('**/fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
    await pg.addInitScript(sd=>{ window.__SEED=sd; }, seed(secretarias, nivel));
    await pg.addInitScript(u=>{ window.__AUTH_SEED=u; },
      {uid:'g-educ', email:'educacao@ijui.rs.gov.br', displayName:'Secretaria de Educação', photoURL:''});
    await pg.goto('http://127.0.0.1:8099/secretaria/index.html',{waitUntil:'networkidle'});
    await pg.waitForTimeout(1000);
    return {pg, errs};
  }

  const b=await chromium.launch(executablePath?{executablePath}:{});
  const {pg, errs}=await abrir(b, ['SMEd','SMED']);

  console.log('\n2) A tela abre na pasta de quem entrou, e diz qual é');
  const topo=await pg.evaluate(()=>({
    sigla:document.getElementById('pastaSigla').textContent,
    nome:document.getElementById('pastaNome').textContent,
    sub:document.getElementById('pastaSub').textContent,
    trocar:document.getElementById('pastaTrocar').textContent.trim(),
    rodape:document.getElementById('rodape').textContent
  }));
  t('a faixa do topo mostra a sigla da pasta', topo.sigla==='SMEd', topo);
  t('e o nome por extenso, lido da lista do repositório',
    /Educa/i.test(topo.nome), topo.nome);
  t('dizendo que ela também é "SMED" nos contratos', /SMED/.test(topo.sub), topo.sub);
  /* Um botão de trocar de pasta para quem só tem uma seria um botão que não
     leva a lugar nenhum. */
  t('quem responde por uma pasta só não ganha seletor', topo.trocar==='', topo.trocar);
  t('e o rodapé diz o que a tela NÃO mostra', /apenas o que é de/.test(topo.rodape), topo.rodape.slice(0,90));

  console.log('\n3) Só a pasta dela chega — e o recorte é da CONSULTA');
  const dados=await pg.evaluate(()=>({
    reqs:REQS.map(r=>({id:r.id, sec:r.sec})),
    ctrs:CTRS.map(c=>({id:c.id, secs:c.secretarias})),
    lidosReq:(window.__LIDOS||{}).requisicoes||0,
    lidosCtr:(window.__LIDOS||{}).contratos||0,
    noBancoReq:Object.keys(window.__STORE.requisicoes).length,
    noBancoCtr:Object.keys(window.__STORE.contratos).length
  }));
  t('nenhuma requisição de outra secretaria entrou',
    dados.reqs.every(r=>r.sec==='SMEd'), dados.reqs);
  t('nenhum contrato de outra secretaria entrou',
    dados.ctrs.every(c=>c.secs.includes('SMED')), dados.ctrs);
  /* O ponto: não é que a tela esconda — é que ela nem lê. */
  t('a da vizinha nem é lida do banco',
    dados.lidosReq < dados.noBancoReq && dados.lidosCtr < dados.noBancoCtr, dados);
  t('os contratos vêm pela sigla que o cadastro de contratos usa (SMED)',
    dados.ctrs.length===4, dados.ctrs);

  console.log('\n4) Requisições: dois meses na abertura, o resto num clique');
  const janela=await pg.evaluate(()=>({
    ini:inicioDaJanela(), completa:REQ_COMPLETA,
    naTela:REQS.map(r=>r.id).sort(),
    aviso:(document.getElementById('antigasReq')||{}).textContent||''
  }));
  t('abre só com os dois últimos meses', !janela.completa
    && janela.naTela.join(',')==='1,2,3', janela);
  /* Sem data de recebimento é como uma requisição NASCE: sumir com ela no
     instante da criação seria o pior defeito de uma tela de lançamento. */
  t('mas a sem data de recebimento vem junto', janela.naTela.includes(3), janela);
  t('e a tela diz o que está mostrando, e como ver o resto',
    /mais antigas/.test(janela.aviso), janela.aviso.slice(0,90));

  await pg.evaluate(()=>window.__zerarLidos());
  await pg.click('#antigasReq button');
  await pg.waitForFunction(()=>REQ_COMPLETA && REQS.length>3,null,{timeout:20000});
  await pg.waitForTimeout(300);
  const depois=await pg.evaluate(()=>({
    naTela:REQS.map(r=>r.id).sort(), lidos:(window.__LIDOS||{}).requisicoes||0,
    aviso:(document.getElementById('antigasReq')||{}).textContent||''
  }));
  t('o botão traz as anteriores', depois.naTela.join(',')==='1,2,3,4', depois);
  /* Trocar a consulta dos dois meses pela secretaria inteira releria o que
     já está na tela. Aqui entra só a leva das antigas. */
  t('e lê SÓ as antigas — as dos dois meses não são relidas',
    depois.lidos===1, depois);
  t('o aviso do recorte some depois disso', depois.aviso==='', depois.aviso);

  console.log('\n5) Os números do topo são botões, não enfeite');
  const cards=await pg.evaluate(()=>[...document.querySelectorAll('.card')].map(c=>({
    n:c.querySelector('.card-n').textContent, r:c.querySelector('.card-r').textContent})));
  console.log('  ', cards.map(c=>c.r+'='+c.n).join(' | '));
  const acha=r=>cards.find(c=>c.r===r);
  t('conta as requisições da pasta', acha('Requisições').n==='4', cards);
  t('quantas aguardam despacho', acha('Aguardando despacho').n==='2', cards);
  t('quantas faltam empenhar', acha('Falta empenhar').n==='2', cards);
  t('quantos contratos vigentes', acha('Contratos vigentes').n==='3', cards);
  /* c1 vence em 45 dias; c4, com aditivo, passou para 400 e sai da conta. */
  t('quantos vencem em 90 dias', acha('Vencem em 90 dias').n==='1', cards);
  t('e quantos já venceram continuando ativos', acha('Já vencidos').n==='1', cards);

  /* Clicar filtra a lista de baixo — é para isso que o número existe. */
  await pg.evaluate(()=>clicarCartao('ctr-venc'));
  await pg.waitForTimeout(250);
  const filtrou=await pg.evaluate(()=>({
    linhas:document.querySelectorAll('#corpoCtr tr').length,
    empresa:(document.querySelector('#corpoCtr tr .cel-tit')||{}).textContent||'',
    marcado:!!document.querySelector('.card.on'),
    reqIntactas:document.querySelectorAll('#corpoReq tr').length
  }));
  t('clicar no número filtra a lista', filtrou.linhas===1 && /BETA/.test(filtrou.empresa), filtrou);
  t('e o cartão fica marcado', filtrou.marcado, filtrou);
  /* Um cartão de contrato não pode mexer na lista de requisições: são duas
     perguntas diferentes na mesma tela. */
  t('sem mexer na outra lista', filtrou.reqIntactas===4, filtrou);
  await pg.evaluate(()=>clicarCartao('ctr-venc'));
  await pg.waitForTimeout(200);
  t('clicar de novo desfaz', (await pg.evaluate(()=>document.querySelectorAll('#corpoCtr tr').length))===4);

  console.log('\n6) O contrato mostra o valor e o prazo VIGENTES');
  /* Com aditivo, o que a lista mostra é o resultado — 50 mil + 25 mil, e o
     prazo do aditivo —, não o de origem. É a mesma conta do sistema de
     contratos; refazê-la diferente aqui seria dois sistemas discordando. */
  const adit=await pg.evaluate(()=>{
    const c=CTRS.find(x=>x.id===4);
    return {valor:c.valor, venc:c.vencimento, marca:document.querySelector('#corpoCtr tr .badge.b-gray')?true:false};
  });
  t('o valor soma os aditivos', adit.valor===75000, adit);
  t('e o prazo é o do aditivo mais recente',
    adit.venc===(()=>{const d=new Date(HOJE);d.setDate(d.getDate()+400);return iso(d);})(), adit);

  console.log('\n6b) Ordem dos contratos: o que precisa de decisão em cima');
  /* Um contrato encerrado no topo, só porque venceu antes, empurra para
     baixo o que ainda está de pé — e é esse que precisa ser renovado. */
  const ordem=await pg.evaluate(()=>[...document.querySelectorAll('#corpoCtr tr')].map(tr=>({
    emp:tr.querySelector('.cel-tit').textContent,
    sit:tr.querySelectorAll('td')[4].textContent.trim()
  })));
  console.log('  ', ordem.map(o=>o.emp.split(' ')[0]+'/'+o.sit).join(' | '));
  const iEnc = ordem.findIndex(o=>o.sit==='ENCERRADO');
  t('nenhum encerrado vem antes de um vigente',
    iEnc<0 || ordem.slice(iEnc).every(o=>o.sit!=='ATIVO'), ordem);
  t('e entre os vigentes, o que vence antes vem primeiro',
    /BETA/.test(ordem[0].emp), ordem[0]);

  console.log('\n7) A busca de cada lista procura só na lista dela');
  await pg.fill('#buscaReq','transporte');
  await pg.waitForTimeout(250);
  const busca=await pg.evaluate(()=>({
    req:document.querySelectorAll('#corpoReq tr').length,
    ctr:document.querySelectorAll('#corpoCtr tr').length
  }));
  t('procurar na de requisições filtra as requisições', busca.req===1, busca);
  t('e não mexe nos contratos', busca.ctr===4, busca);
  await pg.fill('#buscaReq','');
  await pg.waitForTimeout(200);

  console.log('\n8) Conta sem secretaria marcada: diz o que falta, não fica vazia');
  const {pg:pgSem}=await abrir(b, []);
  const semSec=await pgSem.evaluate(()=>({
    texto:document.getElementById('vazioReq').textContent,
    cards:document.querySelectorAll('.card').length,
    lidos:((window.__LIDOS||{}).requisicoes||0)+((window.__LIDOS||{}).contratos||0)
  }));
  t('a tela explica o que falta fazer', /nenhuma secretaria marcada/i.test(semSec.texto), semSec.texto.slice(0,80));
  t('e diz onde se resolve', /Usu[aá]rios/.test(semSec.texto), semSec.texto.slice(0,140));
  t('sem escopo, nenhuma leitura sai', semSec.lidos===0, semSec);
  t('e nenhum número é mostrado', semSec.cards===0, semSec);
  await pgSem.close();

  console.log('\n9) Sem o painel liberado, não entra');
  const {pg:pgFora}=await abrir(b, ['SMEd'], 'nenhum');
  const fora=await pgFora.evaluate(()=>({
    portao:document.getElementById('authGate').style.display==='flex',
    espera:document.getElementById('authPendenteCard').style.display==='block',
    lidos:((window.__LIDOS||{}).requisicoes||0)+((window.__LIDOS||{}).contratos||0)
  }));
  t('quem não tem o painel fica na tela de espera', fora.portao && fora.espera, fora);
  t('e não recebe dado nenhum', fora.lidos===0, fora);
  await pgFora.close();

  console.log('\n10) Duas pastas na mesma conta: alterna, e não mistura');
  const {pg:pgDuas}=await abrir(b, ['SMEd','SMED','SMS']);
  const duas=await pgDuas.evaluate(()=>({
    grupos:GRUPOS.map(g=>g.titulo),
    trocar:[...document.querySelectorAll('#pastaTrocar button')].map(b=>b.textContent),
    secs:REQS.map(r=>r.sec)
  }));
  t('as siglas da mesma pasta viram um grupo só',
    duas.grupos.length===2 && duas.grupos.includes('SMEd') && duas.grupos.includes('SMS'), duas);
  t('e aí sim aparece o seletor', duas.trocar.length===2, duas.trocar);
  t('começa na primeira pasta', duas.secs.every(s=>s==='SMEd'), duas.secs);
  await pgDuas.evaluate(()=>trocarGrupo(1));
  await pgDuas.waitForFunction(()=>REQS.length>0 && REQS.every(r=>r.sec==='SMS'),null,{timeout:20000});
  const trocou=await pgDuas.evaluate(()=>({
    secs:REQS.map(r=>r.sec), sigla:document.getElementById('pastaSigla').textContent,
    ctrs:CTRS.map(c=>c.secretarias.join(','))
  }));
  t('trocar mostra só a outra — as duas não se misturam',
    trocou.secs.every(s=>s==='SMS') && trocou.sigla==='SMS', trocou);
  t('e os contratos acompanham', trocou.ctrs.every(s=>s.includes('SMS')), trocou);
  /* Voltar é instantâneo: a consulta da primeira continuou ouvindo. */
  await pgDuas.evaluate(()=>window.__zerarLidos());
  await pgDuas.evaluate(()=>trocarGrupo(0));
  await pgDuas.waitForTimeout(400);
  t('voltar na primeira não custa leitura nenhuma',
    (await pgDuas.evaluate(()=>((window.__LIDOS||{}).requisicoes||0)+((window.__LIDOS||{}).contratos||0)))===0);
  await pgDuas.close();

  console.log('\n11) No celular a tabela vira bloco');
  const {pg:cel}=await abrir(b, ['SMEd','SMED'], 'ver', {width:390,height:844});
  const mob=await cel.evaluate(()=>({
    larguraPagina:document.documentElement.scrollWidth,
    janela:window.innerWidth,
    cabecalhoEscondido:getComputedStyle(document.querySelector('thead')).display==='none',
    temEmpresa:!!document.querySelector('#corpoCtr .cel-tit'),
    cards:document.querySelectorAll('.card').length
  }));
  t('a página cabe na largura do celular', mob.larguraPagina<=mob.janela+1, mob);
  t('a tabela vira bloco', mob.cabecalhoEscondido, mob);
  t('e a empresa continua em destaque no bloco', mob.temEmpresa, mob);
  t('os números do topo continuam lá', mob.cards===6, mob);
  await cel.close();

  console.log('\nerros JS:', errs.length?errs:'nenhum');
  t('nenhum erro de JavaScript', errs.length===0, errs);
  await b.close();
  console.log(`\n${ok} passaram, ${mau} falharam.`);
})();
