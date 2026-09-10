(function(){
  function clone(o){ return o?Object.assign({},o):o; }
  function makeSnap(items, nomeCol){
    /* doc.ref existe no Firestore de verdade e é por onde um batch apaga o
       que a consulta encontrou (a limpeza do histórico faz assim). */
    function mk(it){
      return {id:it.id, data:function(){return clone(it.data);}, exists:true,
              get ref(){ return collection(nomeCol).doc(it.id); }};
    }
    return {
      forEach: function(cb){ items.forEach(function(it){ cb(mk(it)); }); },
      docs: items.map(mk),
      empty: items.length===0,
      size: items.length,
      docChanges: function(){ return []; }
    };
  }
  var STORE={}, LISTENERS={};
  function notifyCollection(name){
    var items=Object.keys(STORE[name]||{}).map(function(id){ return {id:id, data:STORE[name][id]}; });
    /* Listener de coleção recebe a leva pronta; listener de CONSULTA monta a
       dele (a função não usa o argumento e refaz os filtros). */
    (LISTENERS[name]||[]).slice().forEach(function(cb){ cb(makeSnap(items, name)); });
  }
  function collection(name){
    STORE[name]=STORE[name]||{};
    LISTENERS[name]=LISTENERS[name]||[];
    var docListeners={};
    function notifyDoc(id){
      var data=STORE[name][id];
      (docListeners[id]||[]).forEach(function(cb){
        cb({exists:!!data, id:id, data:function(){ return clone(data); }});
      });
    }
    var colApi={
      onSnapshot:function(cb){
        LISTENERS[name].push(cb);
        setTimeout(function(){ notifyCollection(name); },10);
        return function(){ var i=LISTENERS[name].indexOf(cb); if(i>=0) LISTENERS[name].splice(i,1); };
      },
      get:function(){
        var items=Object.keys(STORE[name]).map(function(id){ return {id:id,data:STORE[name][id]}; });
        return Promise.resolve(makeSnap(items, name));
      },
      add:function(data){
        var id='auto'+Math.random().toString(36).slice(2);
        STORE[name][id]=data; notifyCollection(name);
        return Promise.resolve({id:id});
      },
      /* where/orderBy/limit valem para o .get(): o histórico dos contratos
         pede "as mais recentes" e "as que já venceram", e um stub que
         devolvesse a coleção inteira faria o teste passar sem testar nada.
         O onSnapshot segue entregando tudo, como antes. */
      where:function(campo,op,valor){ return makeQuery(name,[{campo:campo,op:op,valor:valor}],null,0,undefined); },
      orderBy:function(campo,dir){ return makeQuery(name,[],{campo:campo,dir:dir||'asc'},0); },
      limit:function(n){ return makeQuery(name,[],null,n); },
      doc:function(id){
        id=id||('auto'+Math.random().toString(36).slice(2));
        return {
          id:id,
          onSnapshot:function(cb){
            docListeners[id]=docListeners[id]||[];
            docListeners[id].push(cb);
            setTimeout(function(){ notifyDoc(id); },10);
            return function(){ var a=docListeners[id]; var i=a?a.indexOf(cb):-1; if(i>=0) a.splice(i,1); };
          },
          get:function(){
            var data=STORE[name][id];
            return Promise.resolve({exists:!!data,id:id,data:function(){ return clone(data); }});
          },
          set:function(data,opts){
            STORE[name][id]=(opts&&opts.merge)?Object.assign({},STORE[name][id]||{},data):data;
            notifyCollection(name); notifyDoc(id);
            return Promise.resolve();
          },
          update:function(data){
            var alvo=Object.assign({},STORE[name][id]||{});
            Object.keys(data).forEach(function(campo){
              if(campo.indexOf('.')===-1){ alvo[campo]=data[campo]; return; }
              /* Firestore trata "a.b" como caminho aninhado, não chave literal */
              var partes=campo.split('.'), obj=alvo;
              for(var i=0;i<partes.length-1;i++){
                if(typeof obj[partes[i]]!=='object'||obj[partes[i]]===null) obj[partes[i]]={};
                else obj[partes[i]]=Object.assign({},obj[partes[i]]);
                obj=obj[partes[i]];
              }
              obj[partes[partes.length-1]]=data[campo];
            });
            STORE[name][id]=alvo;
            notifyCollection(name); notifyDoc(id);
            return Promise.resolve();
          },
          delete:function(){
            delete STORE[name][id];
            notifyCollection(name); notifyDoc(id);
            return Promise.resolve();
          }
        };
      }
    };
    return colApi;
  }
  /* ── Autenticação (Firebase Auth) ──
     Bem mais simples que o real: um "usuário atual" que os testes trocam
     diretamente, e um clique em "signInWithPopup" que usa o usuário do
     Google que o teste preparou em window.__AUTH_GOOGLE_USER. Contas de
     e-mail/senha ficam num mapa em memória (window.__AUTH_CONTAS), pra
     simular criar-conta/entrar/errar senha sem precisar de rede nenhuma. */
  var authUser=null, authListeners=[], authUid=1;
  var authContas = (window.__AUTH_CONTAS = window.__AUTH_CONTAS || {});   /* email -> {uid,senha,displayName} */
  function authNotificar(){ authListeners.forEach(function(cb){ setTimeout(function(){ cb(authUser); },0); }); }
  function authMkUser(dados){
    var u=Object.assign({
      providerData:[{providerId: dados.providerId||"password"}],
      updateProfile:function(p){ if(p&&p.displayName!==undefined) u.displayName=p.displayName; return Promise.resolve(); }
    }, dados);
    return u;
  }
  var authApi={
    get currentUser(){ return authUser; },
    onAuthStateChanged:function(cb){
      authListeners.push(cb);
      setTimeout(function(){ cb(authUser); },0);
      return function(){ var i=authListeners.indexOf(cb); if(i>=0) authListeners.splice(i,1); };
    },
    signInWithPopup:function(){
      if(window.__AUTH_POPUP_ERRO) return Promise.reject(window.__AUTH_POPUP_ERRO);
      var dados=window.__AUTH_GOOGLE_USER || {email:"teste@gmail.com", displayName:"Teste Google", photoURL:"", uid:"google-"+(authUid++)};
      authUser=authMkUser(Object.assign({providerId:"google.com"}, dados, {providerData:[{providerId:"google.com"}]}));
      authNotificar();
      return Promise.resolve({user:authUser});
    },
    signInWithEmailAndPassword:function(email,senha){
      email=(email||"").toLowerCase();
      var conta=authContas[email];
      if(!conta) return Promise.reject({code:"auth/user-not-found",message:"user not found"});
      if(conta.senha!==senha) return Promise.reject({code:"auth/wrong-password",message:"wrong password"});
      authUser=authMkUser({uid:conta.uid, email:email, displayName:conta.displayName||"", photoURL:"", providerId:"password"});
      authNotificar();
      return Promise.resolve({user:authUser});
    },
    createUserWithEmailAndPassword:function(email,senha){
      email=(email||"").toLowerCase();
      if(authContas[email]) return Promise.reject({code:"auth/email-already-in-use",message:"in use"});
      if((senha||"").length<6) return Promise.reject({code:"auth/weak-password",message:"weak"});
      var uid="pw-"+(authUid++);
      authContas[email]={uid:uid, senha:senha, displayName:""};
      authUser=authMkUser({uid:uid, email:email, displayName:"", photoURL:"", providerId:"password"});
      authUser.updateProfile=function(p){ if(p&&p.displayName!==undefined){ authUser.displayName=p.displayName; authContas[email].displayName=p.displayName; } return Promise.resolve(); };
      authNotificar();
      return Promise.resolve({user:authUser});
    },
    signOut:function(){ authUser=null; authNotificar(); return Promise.resolve(); },
    sendPasswordResetEmail:function(email){
      (window.__AUTH_RESETS_ENVIADOS = window.__AUTH_RESETS_ENVIADOS || []).push((email||"").toLowerCase());
      return Promise.resolve();
    }
  };

  /* Consulta com where/orderBy/limit encadeáveis, resolvida no .get(). */
  function makeQuery(name, filtros, ordem, lim, depois){
    function valorDe(v){ return (v && typeof v.toDate === 'function') ? v.toDate().getTime() : v; }
    /* Aplica os where/orderBy/limit a uma lista de itens. Serve ao get() e
       ao onSnapshot da consulta, que precisam concordar. */
    function aplicar(items){
      filtros.forEach(function(f){
        items=items.filter(function(it){
          var a=valorDe(it.data[f.campo]), b=valorDe(f.valor);
          if(f.op==='<')  return a<b;
          if(f.op==='<=') return a<=b;
          if(f.op==='>')  return a>b;
          if(f.op==='>=') return a>=b;
          return a===b;
        });
      });
      if(ordem) items.sort(function(x,y){
        var a=valorDe(x.data[ordem.campo]), b=valorDe(y.data[ordem.campo]);
        var r = a<b ? -1 : a>b ? 1 : 0;
        return ordem.dir==='desc' ? -r : r;
      });
      return items;
    }
    var api={
      where:function(campo,op,valor){ return makeQuery(name, filtros.concat([{campo:campo,op:op,valor:valor}]), ordem, lim, depois); },
      orderBy:function(campo,dir){ return makeQuery(name, filtros, {campo:campo,dir:dir||'asc'}, lim, depois); },
      limit:function(n){ return makeQuery(name, filtros, ordem, n, depois); },
      /* startAfter: continua a lista de onde a página anterior parou — é
         como o histórico dos contratos busca as edições mais antigas. */
      startAfter:function(v){ return makeQuery(name, filtros, ordem, lim, v); },
      /* Consulta AO VIVO. A tela de requisições lê só um recorte do banco
         (este mês e o anterior; o ano, quando se busca) — sem isto o stub
         entregaria a coleção inteira e o teste do recorte passaria sem
         testar nada, que é o defeito que ele existe para pegar. */
      onSnapshot:function(cb, erro){
        function entregar(){
          STORE[name]=STORE[name]||{};
          var items=aplicar(Object.keys(STORE[name]).map(function(id){
            return {id:id, data:STORE[name][id]};
          }));
          if(lim) items=items.slice(0, lim);
          try{ cb(makeSnap(items, name)); }catch(e){ if(erro) erro(e); else throw e; }
        }
        LISTENERS[name]=LISTENERS[name]||[];
        LISTENERS[name].push(entregar);
        setTimeout(entregar, 10);
        return function(){ var i=LISTENERS[name].indexOf(entregar); if(i>=0) LISTENERS[name].splice(i,1); };
      },
      get:function(){
        STORE[name]=STORE[name]||{};
        var items=Object.keys(STORE[name]).map(function(id){ return {id:id,data:STORE[name][id]}; });
        filtros.forEach(function(f){
          items=items.filter(function(it){
            var a=valorDe(it.data[f.campo]), b=valorDe(f.valor);
            if(f.op==='<')  return a<b;
            if(f.op==='<=') return a<=b;
            if(f.op==='>')  return a>b;
            if(f.op==='>=') return a>=b;
            return a===b;
          });
        });
        if(ordem) items.sort(function(x,y){
          var a=valorDe(x.data[ordem.campo]), b=valorDe(y.data[ordem.campo]);
          var r = a<b ? -1 : a>b ? 1 : 0;
          return ordem.dir==='desc' ? -r : r;
        });
        if(depois !== undefined && ordem){
          const corte = valorDe(depois);
          items = items.filter(function(it){
            const v = valorDe(it.data[ordem.campo]);
            return ordem.dir==='desc' ? v < corte : v > corte;
          });
        }
        if(lim) items=items.slice(0,lim);
        return Promise.resolve(makeSnap(items, name));
      }
    };
    return api;
  }

  /* Transação (db.runTransaction). O contrato novo usa isso para não gravar
     em cima de um id que outra pessoa acabou de ocupar. Aqui não há
     concorrência de verdade: basta ler e escrever na ordem. */
  function runTransaction(fn){
    var t={
      get:function(ref){ return ref.get(); },
      set:function(ref,data,opts){ ref.set(data,opts); return t; },
      update:function(ref,data){ ref.update(data); return t; },
      delete:function(ref){ ref.delete(); return t; }
    };
    try{ return Promise.resolve(fn(t)); }catch(e){ return Promise.reject(e); }
  }

  /* Lote de escritas (db.batch()). O Firestore real manda tudo de uma vez e
     desfaz se alguma falhar; aqui basta aplicar em ordem — os testes usam
     isso para a importação inicial dos contratos e para as operações de
     status do pregoeiro. */
  function batch(){
    var ops=[];
    var api={
      set:function(ref,data,opts){ ops.push(function(){ return ref.set(data,opts); }); return api; },
      update:function(ref,data){   ops.push(function(){ return ref.update(data); });   return api; },
      delete:function(ref){        ops.push(function(){ return ref.delete(); });       return api; },
      commit:function(){
        return ops.reduce(function(p,f){ return p.then(f); }, Promise.resolve()).then(function(){});
      }
    };
    return api;
  }

  window.firebase={
    initializeApp:function(){},
    firestore:function(){ return {collection:collection, batch:batch, runTransaction:runTransaction}; },
    auth:function(){ return authApi; }
  };
  window.firebase.auth.GoogleAuthProvider=function(){};
  window.firebase.firestore.FieldValue={ serverTimestamp:function(){ return new Date(); } };
  /* Timestamp com toDate(), que é como a tela lê a data do histórico. */
  function MkTimestamp(d){ this._d=new Date(d); }
  MkTimestamp.prototype.toDate=function(){ return new Date(this._d); };
  MkTimestamp.prototype.valueOf=function(){ return this._d.getTime(); };
  window.firebase.firestore.Timestamp={
    fromDate:function(d){ return new MkTimestamp(d); },
    now:function(){ return new MkTimestamp(new Date()); }
  };
  /* window.__AUTH_SEED: {uid,email,displayName,photoURL,providerId} já logado ao carregar a página. */
  try{ if(window.__AUTH_SEED) authUser=authMkUser(window.__AUTH_SEED); }catch(e){}

  STORE['processos']={
    p1:{numero:'PE 75/2026', objeto:'Registro de preços para materiais de expediente.', status:'em-andamento', dataLicit:'2026-08-01', horarioAbertura:'09:00', link:'https://exemplo.com/pe75', responsavel:'PEDRO', contato:''},
    p2:{numero:'CC 16/2026', objeto:'Concorrência para obra de ampliação da escola.', status:'finalizacao', dataLicit:'2026-07-20', horarioAbertura:'10:00', link:'', responsavel:'LUCILDA', contato:''}
  };
  window.__STORE=STORE;
  STORE['agentes']={
    ag1:{nomeAbrev:'PEDRO', nomeCompleto:'Pedro Henrique Pacifico', nomeCompleto2:''},
    ag2:{nomeAbrev:'LUCILDA', nomeCompleto:'Lucilda da Silva', nomeCompleto2:''}
  };
  STORE['status']={
    s1:{id:'em-andamento',nome:'Em Andamento',cor:'amber',ordem:0},
    s2:{id:'finalizacao',nome:'Finalização',cor:'blue',ordem:1}
  };
  /* No SEED, {__ts: milissegundos} vira Timestamp — é como um teste semeia
     data de histórico sem ter acesso ao firebase antes de a página abrir. */
  function seedTimestamps(o){
    if(!o || typeof o!=='object') return o;
    Object.keys(o).forEach(function(k){
      var v=o[k];
      if(v && typeof v==='object'){
        if('__ts' in v) o[k]=window.firebase.firestore.Timestamp.fromDate(new Date(v.__ts));
        else seedTimestamps(v);
      }
    });
    return o;
  }
  try{ if(window.__SEED) Object.keys(window.__SEED).forEach(function(k){ STORE[k]=seedTimestamps(window.__SEED[k]); }); }catch(e){}
})();
