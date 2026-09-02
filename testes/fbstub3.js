(function(){
  function clone(o){ return o?Object.assign({},o):o; }
  function makeSnap(items){
    return {
      forEach: function(cb){ items.forEach(function(it){ cb({id:it.id, data:function(){return clone(it.data);}, exists:true}); }); },
      docs: items.map(function(it){ return {id:it.id, data:function(){return clone(it.data);}, exists:true}; }),
      empty: items.length===0,
      size: items.length,
      docChanges: function(){ return []; }
    };
  }
  var STORE={}, LISTENERS={};
  function notifyCollection(name){
    var items=Object.keys(STORE[name]||{}).map(function(id){ return {id:id, data:STORE[name][id]}; });
    (LISTENERS[name]||[]).forEach(function(cb){ cb(makeSnap(items)); });
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
        return Promise.resolve(makeSnap(items));
      },
      add:function(data){
        var id='auto'+Math.random().toString(36).slice(2);
        STORE[name][id]=data; notifyCollection(name);
        return Promise.resolve({id:id});
      },
      where:function(){ return colApi; },
      limit:function(){ return colApi; },
      orderBy:function(){ return colApi; },
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
  window.firebase={
    initializeApp:function(){},
    firestore:function(){ return {collection:collection}; }
  };
  window.firebase.firestore.FieldValue={ serverTimestamp:function(){ return new Date(); } };

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
  try{ if(window.__SEED) Object.keys(window.__SEED).forEach(function(k){ STORE[k]=window.__SEED[k]; }); }catch(e){}
})();
