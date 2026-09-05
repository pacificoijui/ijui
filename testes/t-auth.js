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
  t('sem nenhum acesso liberado', pendente.acessos.agenda===false && pendente.acessos.pregoeiro===false, pendente.acessos);
  t('mostra a tela de "aguardando liberação"', pendente.telaPendente, pendente);
  t('com o nome e e-mail de quem acabou de entrar', pendente.nomeMostrado==='Julio Novo' && pendente.emailMostrado==='julio.novo@gmail.com', pendente);
  t('o sistema continua bloqueado', pendente.appEscondido, pendente);

  /* Simula "um admin aprovou em outro lugar, só com Agenda": grava direto
     no mesmo Firestore falso desta página. O onSnapshot do Julio (que já
     está com a aba aberta) tem que reagir sozinho, sem F5. */
  await pg.evaluate(()=>usuariosV2ColRef.doc('g-julio').update({status:'aprovado', acessos:{agenda:true,pregoeiro:false}}));
  await pg.waitForTimeout(400);
  const aoVivo=await pg.evaluate(()=>({
    aindaPendenteAqui: document.getElementById('authPendenteCard').style.display==='block',
    msg: document.getElementById('authPendMsg').textContent
  }));
  t('a liberação chega na hora, sem precisar relogar (mas aqui é Pregoeiro, e ele só ganhou Agenda)', aoVivo.aindaPendenteAqui, aoVivo);
  t('e a mensagem já explica que o acesso dele é só na Agenda', /só à Agenda/.test(aoVivo.msg), aoVivo.msg);

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
  t('com acesso à Agenda e ao Sistema Interno', admin.perfil && admin.perfil.acessos.agenda && admin.perfil.acessos.pregoeiro, admin.perfil);
  t('entra direto no sistema, sem esperar aprovação', admin.appAberto, admin);
  t('e vê o botão de gerenciar usuários', admin.botaoUsuarios==='', admin.botaoUsuarios);

  console.log('\n3) Painel do admin: aprovar pendente, aplicar convite, proteger o único admin, ver contas antigas');
  let pg3=await b.newPage({viewport:{width:1300,height:900}});
  await abrirPregoeiro(pg3, {
    usuarios_v2:{
      'g-pedro':{email:'pedrohhpacifico@gmail.com', nome:'Pedro', status:'aprovado', isAdmin:true, acessos:{agenda:true,pregoeiro:true}, provedor:'google.com'},
      'g-bianca':{email:'bianca.nova@gmail.com', nome:'Bianca', status:'pendente', isAdmin:false, acessos:{agenda:false,pregoeiro:false}, provedor:'google.com'}
    },
    usuarios_v2_convites:{
      cv1:{nome:'Bianca', email:'bianca.nova@gmail.com', acessos:{agenda:true,pregoeiro:true}}
    }
  }, {uid:'g-pedro', email:'pedrohhpacifico@gmail.com', displayName:'Pedro', photoURL:''});
  await pg3.evaluate(()=>abrirModalUsuarios());
  await pg3.waitForTimeout(400);

  const comConvite=await pg3.evaluate(()=>document.getElementById('usrPendentesLista').innerHTML);
  t('o pedido da Bianca aparece esperando aprovação', /Bianca/.test(comConvite), comConvite.slice(0,200));
  t('com o convite preparado destacado ao lado', /convite preparado/.test(comConvite) && /Agenda, Sistema Interno/.test(comConvite), comConvite.slice(0,400));

  await pg3.evaluate(()=>{
    var btn=[...document.querySelectorAll('#usrPendentesLista button')].find(function(x){ return /Aplicar/.test(x.textContent); });
    btn.click();
  });
  await pg3.waitForTimeout(500);
  const biancaFinal=await pg3.evaluate(()=>({
    perfil: window.__STORE.usuarios_v2['g-bianca'],
    conviteSobrou: Object.keys(window.__STORE.usuarios_v2_convites).length
  }));
  t('aplicar o convite aprova com exatamente o que foi preparado', biancaFinal.perfil.status==='aprovado' && biancaFinal.perfil.acessos.agenda && biancaFinal.perfil.acessos.pregoeiro, biancaFinal.perfil);
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
    usuarios_v2:{'g-julio':{email:'julio.novo@gmail.com', nome:'Julio Novo', status:'aprovado', isAdmin:false, acessos:{agenda:true,pregoeiro:false}, provedor:'google.com'}}
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
    usuarios_v2:{'g-serli':{email:'serli@example.com', nome:'Serli', status:'pendente', isAdmin:false, acessos:{agenda:false,pregoeiro:false}, provedor:'password'}}
  }));
  await pgB.addInitScript((u)=>{ window.__AUTH_SEED=u; }, {uid:'g-serli', email:'serli@example.com', displayName:'Serli', photoURL:''});
  await pgB.goto('http://127.0.0.1:8099/index.html',{waitUntil:'networkidle'});
  await pgB.waitForTimeout(900);
  const pendenteNaAgenda=await pgB.evaluate(()=>document.getElementById('authGate').style.display==='flex');
  t('quem não tem nenhum acesso fica bloqueado também na Agenda', pendenteNaAgenda, pendenteNaAgenda);

  console.log('\nerros JS (pregoeiro, página 1):', errs1.length?errs1:'nenhum');
  console.log(`\n${ok} passaram, ${mau} falharam.`);
  await b.close();
})();
