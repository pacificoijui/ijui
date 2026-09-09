/* Fim do login por usuário/senha guardado em Firestore aberto: agora é
   Firebase Authentication (Google ou e-mail/senha) + um perfil em
   "usuarios_v2" que nasce sempre pendente, sem nenhum acesso — só um
   admin decide, no painel "Usuários", quais painéis (Agenda, Sistema
   Interno) cada pessoa entra. Este teste cobre o ciclo completo:
   cadastro -> pendente -> aprovação -> acesso liberado ao vivo,
   o e-mail de resgate que sempre nasce admin, os convites por e-mail,
   e a proteção contra ficar sem nenhum administrador.

   Nota sobre o stub: cada `page` do Playwright tem o seu PRÓPRIO Firestore
   falso em memória (não é uma rede de verdade entre abas). Por isso, para
   testar "o admin aprova e a pessoa vê na hora", os dois papéis são jogados
   NA MESMA página, trocando de identidade com signOut()/signIn() — é o
   próprio onSnapshot do app que resolve, exatamente como no Firestore real. */
const {chromium, executablePath} = require('./navegador');
const fs=require('fs');
const stub=fs.readFileSync('fbstub3.js','utf8');
let ok=0,mau=0;
function t(n,c,e){ if(c){console.log('  ✓',n);ok++;} else {console.log('  ✗',n,e!==undefined?'\n       '+JSON.stringify(e):'');mau++;process.exitCode=1;} }

function seedBase(extra){
  return Object.assign({
    usuarios_v2:{}, usuarios_v2_convites:{},
    usuarios:{ velho1:{usuario:'julio', nome:'Julio', senhaHash:'x'} },
    processos:{}, agentes:{}, status:{}
  }, extra||{});
}
async function abrirPregoeiro(pg, seedExtra, authSeed){
  await pg.route('**/firebasejs/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:(r.request().url().includes('firestore')||r.request().url().includes('auth'))?stub:'/*noop*/'}));
  await pg.route('**/fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await pg.route('**/cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:'window.jspdf={jsPDF:function(){}};'}));
  await pg.addInitScript((sd)=>{ window.__SEED=sd; }, seedBase(seedExtra));
  if(authSeed) await pg.addInitScript((u)=>{ window.__AUTH_SEED=u; }, authSeed);
  await pg.goto('http://127.0.0.1:8099/pregoeiro/index.html',{waitUntil:'networkidle'});
  await pg.waitForTimeout(700);
}
async function entrarComGoogle(pg, user){
  await pg.evaluate((u)=>{ window.__AUTH_GOOGLE_USER=u; }, user);
  await pg.click('#authBtnGoogle');
  await pg.waitForTimeout(450);
}

(async()=>{
  const b=await chromium.launch(executablePath?{executablePath}:{});

  console.log('\n1) Cadastro por Google nasce pendente, sem acesso a nada — e libera ao vivo');
  let pg=await b.newPage({viewport:{width:1300,height:900}});
  const errs1=[]; pg.on('pageerror',e=>errs1.push(e.message));
  await abrirPregoeiro(pg);
  const antesLogin=await pg.evaluate(()=>({gateAberto:document.getElementById('authGate').style.display==='flex'}));
  t('o portão de login aparece de cara', antesLogin.gateAberto, antesLogin);

  await entrarComGoogle(pg, {uid:'g-julio', email:'julio.novo@gmail.com', displayName:'Julio Novo', photoURL:'https://exemplo.com/foto.jpg'});
  const pendente=await pg.evaluate(()=>({
    perfilCriado: !!window.__STORE.usuarios_v2['g-julio'],
    status: window.__STORE.usuarios_v2['g-julio'] && window.__STORE.usuarios_v2['g-julio'].status,
    acessos: window.__STORE.usuarios_v2['g-julio'] && window.__STORE.usuarios_v2['g-julio'].acessos,
    telaPendente: document.getElementById('authPendenteCard').style.display==='block',
    nomeMostrado: document.getElementById('authPendNome').textContent,
    emailMostrado: document.getElementById('authPendEmail').textContent,
    appEscondido: document.getElementById('authGate').style.display==='flex'
  }));
  t('cria o perfil em usuarios_v2 na hora que loga', pendente.perfilCriado, pendente);
  t('nasce como "pendente"', pendente.status==='pendente', pendente.status);
  t('sem nenhum acesso liberado', pendente.acessos.agenda==='nenhum' && pendente.acessos.pregoeiro==='nenhum', pendente.acessos);
  t('mostra a tela de "aguardando liberação"', pendente.telaPendente, pendente);
  t('com o nome e e-mail de quem acabou de entrar', pendente.nomeMostrado==='Julio Novo' && pendente.emailMostrado==='julio.novo@gmail.com', pendente);
  t('o sistema continua bloqueado', pendente.appEscondido, pendente);

  /* Simula "um admin aprovou em outro lugar, só com Agenda": grava direto
     no mesmo Firestore falso desta página. O onSnapshot do Julio (que já
     está com a aba aberta) tem que reagir sozinho, sem F5. Usa o formato
     antigo (true/false) de propósito, pra testar que contas aprovadas
     antes do modelo de 3 níveis continuam funcionando sem migração. */
  await pg.evaluate(()=>usuariosV2ColRef.doc('g-julio').update({status:'aprovado', acessos:{agenda:true,pregoeiro:false}}));
  await pg.waitForTimeout(400);
  const aoVivo=await pg.evaluate(()=>({
    aindaPendenteAqui: document.getElementById('authPendenteCard').style.display==='block',
    msg: document.getElementById('authPendMsg').textContent
  }));
  t('a liberação chega na hora, sem precisar relogar (mas aqui é Pregoeiro, e ele só ganhou Agenda)', aoVivo.aindaPendenteAqui, aoVivo);
  t('e a mensagem já explica que ele tem acesso a outro painel, não a este', /acesso a Agenda/.test(aoVivo.msg) && /não ao Sistema Interno/.test(aoVivo.msg), aoVivo.msg);

  console.log('\n2) O e-mail de resgate já nasce administrador, com tudo liberado');
  let pg2=await b.newPage({viewport:{width:1300,height:900}});
  await abrirPregoeiro(pg2);
  await entrarComGoogle(pg2, {uid:'g-pedro', email:'PedroHHPacifico@gmail.com', displayName:'Pedro', photoURL:''});
  const admin=await pg2.evaluate(()=>({
    perfil: window.__STORE.usuarios_v2['g-pedro'],
    appAberto: document.getElementById('authGate').style.display==='none',
    botaoUsuarios: document.getElementById('btnUsuarios').style.display
  }));
  t('mesmo em maiúsculas, o e-mail de resgate é reconhecido', admin.perfil && admin.perfil.status==='aprovado', admin.perfil);
  t('nasce administrador', admin.perfil && admin.perfil.isAdmin===true, admin.perfil);
  t('com acesso de editar à Agenda e ao Sistema Interno', admin.perfil && admin.perfil.acessos.agenda==='editar' && admin.perfil.acessos.pregoeiro==='editar', admin.perfil);
  t('entra direto no sistema, sem esperar aprovação', admin.appAberto, admin);
  t('e vê o botão de gerenciar usuários', admin.botaoUsuarios==='', admin.botaoUsuarios);

  console.log('\n3) Painel do admin: aprovar pendente, aplicar convite, proteger o único admin, ver contas antigas');
  let pg3=await b.newPage({viewport:{width:1300,height:900}});
  await abrirPregoeiro(pg3, {
    usuarios_v2:{
      'g-pedro':{email:'pedrohhpacifico@gmail.com', nome:'Pedro', status:'aprovado', isAdmin:true, acessos:{agenda:'editar',pregoeiro:'editar'}, provedor:'google.com'},
      'g-bianca':{email:'bianca.nova@gmail.com', nome:'Bianca', status:'pendente', isAdmin:false, acessos:{agenda:'nenhum',pregoeiro:'nenhum'}, provedor:'google.com'}
    },
    usuarios_v2_convites:{
      cv1:{nome:'Bianca', email:'bianca.nova@gmail.com', acessos:{agenda:'editar',pregoeiro:'ver'}}
    }
  }, {uid:'g-pedro', email:'pedrohhpacifico@gmail.com', displayName:'Pedro', photoURL:''});
  await pg3.evaluate(()=>abrirModalUsuarios());
  await pg3.waitForTimeout(400);

  const comConvite=await pg3.evaluate(()=>document.getElementById('usrPendentesLista').innerHTML);
  t('o pedido da Bianca aparece esperando aprovação', /Bianca/.test(comConvite), comConvite.slice(0,200));
  t('com o convite preparado destacado ao lado, mostrando os níveis', /convite preparado/.test(comConvite) && /Agenda \(editar\)/.test(comConvite) && /Sistema Interno \(visualizar\)/.test(comConvite), comConvite.slice(0,400));

  await pg3.evaluate(()=>{
    var btn=[...document.querySelectorAll('#usrPendentesLista button')].find(function(x){ return /Aplicar/.test(x.textContent); });
    btn.click();
  });
  await pg3.waitForTimeout(500);
  const biancaFinal=await pg3.evaluate(()=>({
    perfil: window.__STORE.usuarios_v2['g-bianca'],
    conviteSobrou: Object.keys(window.__STORE.usuarios_v2_convites).length
  }));
  t('aplicar o convite aprova com exatamente o nível que foi preparado', biancaFinal.perfil.status==='aprovado' && biancaFinal.perfil.acessos.agenda==='editar' && biancaFinal.perfil.acessos.pregoeiro==='ver', biancaFinal.perfil);
  t('e o convite é consumido (não fica repetido pra sempre)', biancaFinal.conviteSobrou===0, biancaFinal.conviteSobrou);

  const protegido=await pg3.evaluate(()=>{
    document.getElementById('aprAdmin_g-pedro').checked=false;
    usuariosSalvarAcessos('g-pedro', 1);
    return window.__STORE.usuarios_v2['g-pedro'].isAdmin;
  });
  t('tentar tirar o único administrador não funciona', protegido===true, protegido);

  const antigos=await pg3.evaluate(()=>document.getElementById('usrAntigosLista').textContent);
  t('o cadastro antigo aparece, só de leitura, pra acompanhar quem falta migrar', /Julio/.test(antigos) && /login antigo: julio/.test(antigos), antigos);

  console.log('\n4) E-mail/senha: criar conta nasce pendente, e senha errada avisa direito');
  let pg4=await b.newPage({viewport:{width:1300,height:900}});
  await abrirPregoeiro(pg4);
  await pg4.click("button:has-text('Criar uma conta')");
  await pg4.fill('#authNomeC','Serli');
  await pg4.fill('#authEmailC','serli@example.com');
  await pg4.fill('#authPassC','123456');
  await pg4.fill('#authPass2','123456');
  await pg4.click('#authBtnCriar');
  await pg4.waitForTimeout(500);
  const criouConta=await pg4.evaluate(()=>({
    perfil: Object.values(window.__STORE.usuarios_v2).find(function(u){ return u.email==='serli@example.com'; }),
    pendente: document.getElementById('authPendenteCard').style.display==='block'
  }));
  t('criar conta por e-mail também nasce pendente', criouConta.perfil && criouConta.perfil.status==='pendente', criouConta.perfil);
  t('e mostra a tela de espera igual ao Google', criouConta.pendente, criouConta);

  /* mesma página/mesmo "banco" falso: pg4 já tem a conta da Serli */
  await pg4.evaluate(()=>firebase.auth().signOut());
  await pg4.waitForTimeout(300);
  await pg4.fill('#authEmail','serli@example.com');
  await pg4.fill('#authPass','senhaerrada');
  await pg4.click('#authBtnEntrar');
  await pg4.waitForTimeout(400);
  const erroSenha=await pg4.evaluate(()=>document.getElementById('authErr').textContent);
  t('senha errada mostra mensagem clara', /Senha incorreta/.test(erroSenha), erroSenha);

  console.log('\n5) A Agenda usa a mesma conta e o mesmo perfil');
  let pgA=await b.newPage({viewport:{width:1300,height:950}});
  await pgA.route('**/firebasejs/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:(r.request().url().includes('firestore')||r.request().url().includes('auth'))?stub:'/*noop*/'}));
  await pgA.route('**/fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await pgA.route('**/cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:'window.jspdf={jsPDF:function(){}};'}));
  await pgA.addInitScript((sd)=>{ window.__SEED=sd; }, seedBase({
    usuarios_v2:{'g-julio':{email:'julio.novo@gmail.com', nome:'Julio Novo', status:'aprovado', isAdmin:false, acessos:{agenda:'editar',pregoeiro:'nenhum'}, provedor:'google.com'}}
  }));
  await pgA.addInitScript((u)=>{ window.__AUTH_SEED=u; }, {uid:'g-julio', email:'julio.novo@gmail.com', displayName:'Julio Novo', photoURL:''});
  await pgA.goto('http://127.0.0.1:8099/index.html',{waitUntil:'networkidle'});
  await pgA.waitForTimeout(900);
  const naAgenda=await pgA.evaluate(()=>({ appAberto: document.getElementById('authGate').style.display==='none' }));
  t('quem só tem Agenda entra direto na Agenda', naAgenda.appAberto, naAgenda);

  let pgB=await b.newPage({viewport:{width:1300,height:950}});
  await pgB.route('**/firebasejs/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:(r.request().url().includes('firestore')||r.request().url().includes('auth'))?stub:'/*noop*/'}));
  await pgB.route('**/fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await pgB.route('**/cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:'window.jspdf={jsPDF:function(){}};'}));
  await pgB.addInitScript((sd)=>{ window.__SEED=sd; }, seedBase({
    usuarios_v2:{'g-serli':{email:'serli@example.com', nome:'Serli', status:'pendente', isAdmin:false, acessos:{agenda:'nenhum',pregoeiro:'nenhum'}, provedor:'password'}}
  }));
  await pgB.addInitScript((u)=>{ window.__AUTH_SEED=u; }, {uid:'g-serli', email:'serli@example.com', displayName:'Serli', photoURL:''});
  await pgB.goto('http://127.0.0.1:8099/index.html',{waitUntil:'networkidle'});
  await pgB.waitForTimeout(900);
  const pendenteNaAgenda=await pgB.evaluate(()=>document.getElementById('authGate').style.display==='flex');
  t('quem não tem nenhum acesso fica bloqueado também na Agenda', pendenteNaAgenda, pendenteNaAgenda);

  console.log('\n6) "Visualizar" entra e lê, mas não consegue gravar (trava do lado do cliente)');
  let pg6=await b.newPage({viewport:{width:1300,height:900}});
  await abrirPregoeiro(pg6, {
    usuarios_v2:{'g-vera':{email:'vera@example.com', nome:'Vera', status:'aprovado', isAdmin:false, acessos:{agenda:'nenhum',pregoeiro:'ver'}, provedor:'google.com'}},
    processos:{p1:{numero:'PE 75/2026', objeto:'Teste', status:'em-andamento', dataLicit:'2026-08-01', horarioAbertura:'09:00', link:'', responsavel:'PEDRO', contato:''}}
  }, {uid:'g-vera', email:'vera@example.com', displayName:'Vera', photoURL:''});
  const somenteView=await pg6.evaluate(()=>({
    appAberto: document.getElementById('authGate').style.display==='none',
    banner: document.getElementById('authBannerSoLeitura') && document.getElementById('authBannerSoLeitura').style.display==='block'
  }));
  t('entra no sistema mesmo só com "visualizar"', somenteView.appAberto, somenteView);
  t('e vê o aviso de modo somente visualização', somenteView.banner, somenteView);

  const tentativaGravar=await pg6.evaluate(()=>
    colRef.doc('p1').update({numero:'ALTERADO'}).then(function(){ return {bloqueou:false}; })
      .catch(function(e){ return {bloqueou:true, msg:e.message}; })
  );
  t('a gravação é rejeitada no cliente, sem nem chegar a tentar o servidor', tentativaGravar.bloqueou, tentativaGravar);
  const numeroIntacto=await pg6.evaluate(()=>window.__STORE.processos.p1.numero);
  t('o dado não muda de verdade', numeroIntacto==='PE 75/2026', numeroIntacto);

  const tentativaExcluir=await pg6.evaluate(()=>
    excluirProcessoCompleto('p1').then(function(){ return {bloqueou:false}; }).catch(function(){ return {bloqueou:true}; })
  );
  t('excluir também é bloqueado pra quem só visualiza', tentativaExcluir.bloqueou, tentativaExcluir);

  console.log('\n7) Aprovar com a aba já aberta reanexa os dados (não fica "vazio pra sempre")');
  const seedComDados={
    processos:{p1:{numero:'PE 10/2026', objeto:'Teste', status:'em-andamento', dataLicit:'2026-08-01', horarioAbertura:'09:00', link:'', responsavel:'PEDRO', contato:''}},
    agentes:{ag1:{nomeAbrev:'PEDRO', nomeCompleto:'Pedro', nomeCompleto2:''}}
  };
  let pg7=await b.newPage({viewport:{width:1300,height:900}});
  await abrirPregoeiro(pg7, seedComDados);
  await entrarComGoogle(pg7, {uid:'g-marli', email:'marli@example.com', displayName:'Marli', photoURL:''});
  const antesAprovar=await pg7.evaluate(()=>({processos:(window.processos||[]).length, agentes:(window.agentes||[]).length}));
  t('antes de aprovar, sem dado nenhum na tela (correto: ela não tem acesso ainda)', antesAprovar.processos===0 && antesAprovar.agentes===0, antesAprovar);
  await pg7.evaluate(()=>usuariosV2ColRef.doc('g-marli').update({status:'aprovado', acessos:{agenda:'nenhum',pregoeiro:'editar'}}));
  await pg7.waitForTimeout(600);
  const depoisAprovar=await pg7.evaluate(()=>({
    appAberto: document.getElementById('authGate').style.display==='none',
    processos:(window.processos||[]).length, agentes:(window.agentes||[]).length
  }));
  t('depois de aprovada, o sistema abre', depoisAprovar.appAberto, depoisAprovar);
  t('e os processos/agentes aparecem sozinhos, sem precisar recarregar a página', depoisAprovar.processos===1 && depoisAprovar.agentes===1, depoisAprovar);

  let pg8=await b.newPage({viewport:{width:1300,height:950}});
  await pg8.route('**/firebasejs/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:(r.request().url().includes('firestore')||r.request().url().includes('auth'))?stub:'/*noop*/'}));
  await pg8.route('**/fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await pg8.route('**/cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:'window.jspdf={jsPDF:function(){}};'}));
  await pg8.addInitScript((sd)=>{ window.__SEED=sd; }, seedBase(seedComDados));
  await pg8.addInitScript((u)=>{ window.__AUTH_SEED=u; }, {uid:'g-marli', email:'marli@example.com', displayName:'Marli', photoURL:''});
  await pg8.goto('http://127.0.0.1:8099/index.html',{waitUntil:'networkidle'});
  await pg8.waitForTimeout(700);
  const antesAprovarAgenda=await pg8.evaluate(()=>(window.processos||[]).length);
  t('na Agenda, antes de aprovar, também sem dado nenhum', antesAprovarAgenda===0, antesAprovarAgenda);
  await pg8.evaluate(()=>usuariosV2ColRef.doc('g-marli').update({status:'aprovado', acessos:{agenda:'ver',pregoeiro:'nenhum'}}));
  await pg8.waitForTimeout(600);
  const depoisAprovarAgenda=await pg8.evaluate(()=>({
    appAberto: document.getElementById('authGate').style.display==='none',
    processos:(window.processos||[]).length
  }));
  t('na Agenda, depois de aprovada (só visualizar), os processos aparecem sozinhos', depoisAprovarAgenda.appAberto && depoisAprovarAgenda.processos===1, depoisAprovarAgenda);

  console.log('\n8) A trava de escrita não pode quebrar os links públicos de assinatura');
  /* O ?assinatura=ID grava a assinatura do pregoeiro em "agentes" sem login
     nenhum — as regras do Firestore liberam só aqueles campos. A trava de
     escrita por painel precisa reconhecer o modo compartilhado NA HORA DE
     GRAVAR: as referências do topo do arquivo nascem antes de a URL ser
     lida, então checar isso na criação da referência bloqueava o link. */
  let pgAsg=await b.newPage({viewport:{width:420,height:900}});
  await pgAsg.route('**/firebasejs/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:(r.request().url().includes('firestore')||r.request().url().includes('auth'))?stub:'/*noop*/'}));
  await pgAsg.route('**/fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await pgAsg.route('**/cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:'window.jspdf={jsPDF:function(){}};'}));
  await pgAsg.addInitScript((sd)=>{ window.__SEED=sd; }, seedBase({agentes:{ag1:{nomeAbrev:'PEDRO', nomeCompleto:'Pedro Pacifico', nomeCompleto2:''}}}));
  await pgAsg.goto('http://127.0.0.1:8099/pregoeiro/index.html?assinatura=ag1',{waitUntil:'networkidle'});
  await pgAsg.waitForTimeout(700);
  const modoLink=await pgAsg.evaluate(()=>({
    compartilhado: AUTH_MODO_COMPARTILHADO,
    portaoEscondido: document.getElementById('authGate').style.display==='none'
  }));
  t('o link abre em modo compartilhado, sem portão de login', modoLink.compartilhado && modoLink.portaoEscondido, modoLink);
  const gravouAssinatura=await pgAsg.evaluate(()=>
    db.collection('agentes').doc('ag1').set({assinaturaImg:'data:image/png;base64,xx', assinaturaEm:'2026-01-01'},{merge:true})
      .then(()=>({ok:true})).catch(e=>({ok:false, msg:e.message})));
  t('e a assinatura é gravada normalmente, sem a trava atrapalhar', gravouAssinatura.ok, gravouAssinatura);
  t('a assinatura chegou mesmo no cadastro do agente',
    await pgAsg.evaluate(()=>!!(window.__STORE.agentes.ag1||{}).assinaturaImg));

  console.log('\n9) Conta excluída com a aba aberta devolve o portão');
  let pg9=await b.newPage({viewport:{width:1300,height:900}});
  await abrirPregoeiro(pg9, {
    usuarios_v2:{'g-ana':{email:'ana@example.com', nome:'Ana', status:'aprovado', isAdmin:false, acessos:{agenda:'nenhum',pregoeiro:'editar',contratos:'nenhum'}, provedor:'google.com'}}
  }, {uid:'g-ana', email:'ana@example.com', displayName:'Ana', photoURL:''});
  t('a Ana entra normalmente', await pg9.evaluate(()=>document.getElementById('authGate').style.display==='none'));
  await pg9.evaluate(()=>usuariosV2ColRef.doc('g-ana').delete());
  await pg9.waitForTimeout(600);
  const depoisExcluir=await pg9.evaluate(()=>({
    portao: document.getElementById('authGate').style.display==='flex',
    semUsuario: window.authCurrentUser===null,
    telaLogin: document.getElementById('authEntradaBox').style.display==='block'
  }));
  t('excluir a conta dela fecha a sessão na hora', depoisExcluir.portao && depoisExcluir.semUsuario, depoisExcluir);
  t('e devolve a tela de login, não a de espera', depoisExcluir.telaLogin, depoisExcluir);

  console.log('\n10) Contratos é o terceiro painel do mesmo cadastro');
  let pg10=await b.newPage({viewport:{width:1300,height:900}});
  await abrirPregoeiro(pg10, {
    usuarios_v2:{
      'g-pedro':{email:'pedrohhpacifico@gmail.com', nome:'Pedro', status:'aprovado', isAdmin:true, acessos:{agenda:'editar',pregoeiro:'editar',contratos:'editar'}, provedor:'google.com'},
      'g-rita':{email:'rita@example.com', nome:'Rita', status:'pendente', isAdmin:false, acessos:{agenda:'nenhum',pregoeiro:'nenhum',contratos:'nenhum'}, provedor:'google.com'}
    }
  }, {uid:'g-pedro', email:'pedrohhpacifico@gmail.com', displayName:'Pedro', photoURL:''});
  await pg10.evaluate(()=>abrirModalUsuarios());
  await pg10.waitForTimeout(400);
  t('o painel Usuários mostra os três painéis',
    await pg10.evaluate(()=>!!document.getElementById('pendAg_g-rita') && !!document.getElementById('pendPr_g-rita') && !!document.getElementById('pendCt_g-rita')));

  /* É este o pedido do começo: alguém que só mexe em contratos. */
  await pg10.evaluate(()=>{ document.getElementById('pendCt_g-rita').value='editar'; usuariosAprovar('g-rita'); });
  await pg10.waitForTimeout(500);
  const rita=await pg10.evaluate(()=>window.__STORE.usuarios_v2['g-rita']);
  t('dá pra aprovar alguém só para editar contratos',
    rita.status==='aprovado' && rita.acessos.contratos==='editar' && rita.acessos.agenda==='nenhum' && rita.acessos.pregoeiro==='nenhum', rita);

  const resumo=await pg10.evaluate(()=>authResumoAcessos({agenda:'ver', pregoeiro:'nenhum', contratos:'editar'}));
  t('o resumo de acessos fala dos três painéis',
    /Agenda \(visualizar\)/.test(resumo) && /Contratos \(editar\)/.test(resumo) && !/Sistema Interno/.test(resumo), resumo);

  console.log('\n11) O link de consulta (?consulta=1) pede login em vez de dar erro de permissão');
  /* Esse painel LISTA a coleção de processos inteira, e listar exige conta
     aprovada desde que as regras foram fechadas. Antes ele entrava como
     link público e a pessoa via "Missing or insufficient permissions". */
  let pgC=await b.newPage({viewport:{width:1300,height:900}});
  await pgC.route('**/firebasejs/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:(r.request().url().includes('firestore')||r.request().url().includes('auth'))?stub:'/*noop*/'}));
  await pgC.route('**/fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await pgC.route('**/cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:'window.jspdf={jsPDF:function(){}};'}));
  await pgC.addInitScript((sd)=>{ window.__SEED=sd; }, seedBase({
    processos:{p1:{numero:'PE 22/2026', objeto:'Consulta', status:'em-andamento', dataLicit:'2026-08-01', horarioAbertura:'09:00', link:'', responsavel:'PEDRO', contato:''}},
    usuarios_v2:{'g-vera':{email:'vera@example.com', nome:'Vera', status:'aprovado', isAdmin:false, acessos:{agenda:'ver',pregoeiro:'nenhum',contratos:'nenhum'}, provedor:'google.com'}}
  }));
  await pgC.goto('http://127.0.0.1:8099/pregoeiro/index.html?consulta=1',{waitUntil:'networkidle'});
  await pgC.waitForTimeout(700);
  const consultaSemLogin=await pgC.evaluate(()=>({
    compartilhado: AUTH_MODO_COMPARTILHADO,
    portaoVisivel: getComputedStyle(document.getElementById('authGate')).display!=='none'
  }));
  t('sem login, o link mostra o portão — não uma tela quebrada',
    consultaSemLogin.compartilhado===false && consultaSemLogin.portaoVisivel, consultaSemLogin);

  await entrarComGoogle(pgC, {uid:'g-vera', email:'vera@example.com', displayName:'Vera', photoURL:''});
  await pgC.waitForTimeout(600);
  const consultaLogada=await pgC.evaluate(()=>({
    portaoFechado: document.getElementById('authGate').style.display==='none',
    processos:(window.processos||[]).length,
    cards: document.getElementById('consultaGrid').querySelectorAll('.card').length
  }));
  t('quem tem acesso à Agenda consegue usar o painel de consulta',
    consultaLogada.portaoFechado && consultaLogada.processos===1, consultaLogada);
  t('e os processos aparecem no painel', consultaLogada.cards===1, consultaLogada);

  console.log('\nerros JS (pregoeiro, página 1):', errs1.length?errs1:'nenhum');
  console.log(`\n${ok} passaram, ${mau} falharam.`);
  await b.close();
})();
