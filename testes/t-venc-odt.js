/* Pedido: no ODT de Vencedores, cada item passa a ocupar DUAS linhas — em
   cima a descrição sozinha, na largura inteira da tabela; embaixo, em cinza
   claro, o resto (item, marca, modelo, quantidade e valores).

   Antes a descrição era só mais uma coluna e, sendo o campo que mais varia de
   tamanho, espremia Marca e Modelo — ao colar a tabela num documento em
   retrato, "SURGIFORCE" chegava a quebrar em "SURGIFORC / E".

   O teste gera o .odt de verdade pelo navegador e abre o zip para conferir a
   estrutura. Ele NÃO diz se o documento abre bonito: para isso ainda é
   preciso abrir no LibreOffice e olhar. */
const {chromium, executablePath} = require('./navegador');
const fs=require('fs');
const JSZip=require('jszip');
const stub=fs.readFileSync('fbstub3.js','utf8');
let ok=0,mau=0;
function t(n,c,e){ if(c){console.log('  ✓',n);ok++;} else {console.log('  ✗',n,e!==undefined?'\n       '+JSON.stringify(e):'');mau++;process.exitCode=1;} }

const DESC_LONGA='Máquina de lavar roupa. Não Centrifuga, funciona por redemoinho (turbilhonamento), com timer manual, capacidade 10KG a 15KG. Batedor no fundo ou na lateral.';
const SEED={
  processos:{ p1:{numero:'PE 211/2026', objeto:'Aquisição de eletrodomésticos', status:'concluido', dataLicit:'2026-08-01', horarioAbertura:'09:00', link:'', responsavel:'PEDRO', contato:''} },
  rankings:{ p1:{ numero:'PE 211/2026', itens:[
      {num:'1', desc:DESC_LONGA, qtde:40, unidade:'UN', fornecedores:[
        {nome:'CASA MIX LTDA', cnpj:'37.429.301/0001-45', marca:'Libell', modelo:'Tanquinho 10kg', valor:'405,00'}]},
      {num:'2', desc:'Bebedouro de coluna', qtde:5, unidade:'UN', fornecedores:[
        {nome:'CASA MIX LTDA', cnpj:'37.429.301/0001-45', marca:'', modelo:'', valor:'890,00'}]}
    ], estados:{'1-0':'aprovado','2-0':'aprovado'} } }
};

const tag = (s,re) => { const m=s.match(re); return m?m[1]:null; };

(async()=>{
  const b=await chromium.launch(executablePath?{executablePath}:{});
  const pg=await b.newPage({viewport:{width:1200,height:900}});
  const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
  await pg.route('**/firebasejs/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:r.request().url().includes('firestore')?stub:'/*noop*/'}));
  await pg.route('**/fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await pg.route('**/cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:'window.jspdf={jsPDF:function(){}};'}));
  await pg.addInitScript(()=>localStorage.setItem('copam_auth',JSON.stringify({u:'teste',nome:'QA'})));
  await pg.addInitScript((sd)=>{ window.__SEED=sd; }, SEED);
  await pg.goto('http://127.0.0.1:8099/pregoeiro/index.html',{waitUntil:'networkidle'});
  await pg.waitForTimeout(700);
  await pg.evaluate(()=>abrirVencedores('p1'));
  await pg.waitForTimeout(500);

  console.log('1) O ODT é gerado');
  /* intercepta o download: fica com o Blob em vez de salvar */
  const b64 = await pg.evaluate(()=>new Promise(res=>{
    const oc=URL.createObjectURL, oa=HTMLAnchorElement.prototype.click;
    let blob=null;
    URL.createObjectURL=function(bl){ blob=bl; return 'blob:x'; };
    HTMLAnchorElement.prototype.click=function(){};
    vencGerarODT();
    URL.createObjectURL=oc; HTMLAnchorElement.prototype.click=oa;
    if(!blob) return res(null);
    const fr=new FileReader();
    fr.onload=()=>res(fr.result.split(',')[1]);
    fr.readAsDataURL(blob);
  }));
  t('o arquivo foi gerado', !!b64);
  if(!b64){ console.log('\n'+ok+' passaram, '+(mau+1)+' falharam.'); process.exitCode=1; await b.close(); return; }

  const buf=Buffer.from(b64,'base64');
  fs.writeFileSync('saida-vencedores.odt', buf);
  const zip=await JSZip.loadAsync(buf);
  const nomes=Object.keys(zip.files);
  t('é um zip com o conteúdo esperado',
    ['mimetype','content.xml','styles.xml','META-INF/manifest.xml'].every(n=>nomes.indexOf(n)>=0), nomes);
  t('o mimetype é o de documento de texto ODF',
    (await zip.file('mimetype').async('string'))==='application/vnd.oasis.opendocument.text');

  const c=await zip.file('content.xml').async('string');

  console.log('\n2) A tabela tem 6 colunas — a descrição saiu da grade');
  const larguras=[...c.matchAll(/style:name="TVen\.C\d"[^>]*>\s*<style:table-column-properties style:column-width="([\d.]+)cm"/g)].map(m=>Number(m[1]));
  t('são 6 colunas', larguras.length===6, larguras);
  t('somam a largura útil da página (27,3 cm)',
    Math.abs(larguras.reduce((a,x)=>a+x,0)-27.3)<0.01, larguras);

  const tabela=c.match(/<table:table table:name="Venc0"[\s\S]*?<\/table:table>/)[0];
  const linhas=tabela.match(/<table:table-row[\s\S]*?<\/table:table-row>/g);
  const celulas=l=>[...l.matchAll(/<table:table-cell([^>]*)>([\s\S]*?)<\/table:table-cell>/g)]
      .map(m=>({estilo:tag(m[1],/table:style-name="([^"]+)"/), span:Number(tag(m[1],/number-columns-spanned="(\d+)"/)||1),
                txt:m[2].replace(/<[^>]+>/g,'')}));

  const cab=celulas(linhas[0]).map(x=>x.txt);
  console.log('   cabeçalho:', cab.join(' | '));
  t('o cabeçalho não tem mais a coluna "Produto"', cab.indexOf('Produto')<0, cab);
  t('e traz Item, Marca, Modelo, Qtde e os dois valores',
    cab.join('|')==='Item|Marca/Fabricante|Modelo|Qtde|Valor Unit.|Valor Total', cab);

  console.log('\n3) Cada item ocupa duas linhas: descrição em cima, dados embaixo');
  /* 1 cabeçalho + 2 itens × 2 linhas + 1 total = 6 */
  t('a tabela tem 6 linhas para 2 itens', linhas.length===6, linhas.length);

  const desc1=celulas(linhas[1]);
  t('a 1ª linha do item é uma célula só', desc1.length===1, desc1);
  t('e ela atravessa as 6 colunas', desc1[0].span===6, desc1[0]);
  t('a descrição inteira está lá, sem corte', desc1[0].txt===DESC_LONGA, desc1[0].txt);
  t('a linha da descrição usa o estilo próprio (CDesc)', desc1[0].estilo==='CDesc', desc1[0].estilo);
  t('e as células cobertas pelo merge foram declaradas',
    (linhas[1].match(/<table:covered-table-cell\/>/g)||[]).length===5, linhas[1]);

  const dados1=celulas(linhas[2]);
  console.log('   dados:', dados1.map(x=>x.txt).join(' | '));
  t('a 2ª linha tem as 6 células de dados', dados1.length===6, dados1.length);
  t('todas em cinza claro (CDados)', dados1.every(x=>x.estilo==='CDados'), dados1.map(x=>x.estilo));
  t('nº do item', dados1[0].txt==='1', dados1[0].txt);
  t('marca', dados1[1].txt==='Libell', dados1[1].txt);
  t('modelo', dados1[2].txt==='Tanquinho 10kg', dados1[2].txt);
  t('quantidade com unidade', dados1[3].txt.replace(/ /g,' ')==='40 UN', dados1[3].txt);
  t('valor unitário', dados1[4].txt.replace(/ /g,' ')==='R$ 405,00', dados1[4].txt);
  t('valor total (40 × 405)', dados1[5].txt.replace(/ /g,' ')==='R$ 16.200,00', dados1[5].txt);

  console.log('\n4) Item sem marca/modelo não quebra o formato');
  const desc2=celulas(linhas[3]), dados2=celulas(linhas[4]);
  t('a descrição curta também vira linha inteira', desc2.length===1 && desc2[0].span===6, desc2);
  t('e a linha de dados continua com as 6 células', dados2.length===6, dados2.length);
  t('marca e modelo vazios ficam em branco, sem "undefined"',
    dados2[1].txt==='' && dados2[2].txt==='', [dados2[1].txt, dados2[2].txt]);

  console.log('\n5) O total do vencedor fecha a tabela');
  const tot=celulas(linhas[5]);
  t('rótulo atravessa 5 colunas e sobra 1 para o valor',
    tot.length===2 && tot[0].span===5, tot);
  t('o texto é "TOTAL DO VENCEDOR"', tot[0].txt==='TOTAL DO VENCEDOR', tot[0].txt);
  t('e o valor soma os dois itens (16.200 + 4.450)',
    tot[1].txt.replace(/ /g,' ')==='R$ 20.650,00', tot[1].txt);

  console.log('\n6) Estilos: o cinza claro e o bloco visual das duas linhas');
  const cDados=c.match(/<style:style style:name="CDados"[\s\S]*?<\/style:style>/)[0];
  const cDesc=c.match(/<style:style style:name="CDesc"[\s\S]*?<\/style:style>/)[0];
  const pDesc=c.match(/<style:style style:name="PDesc"[\s\S]*?<\/style:style>/)[0];
  t('a linha de dados tem fundo cinza claro', /fo:background-color="#F1F4FA"/.test(cDados), cDados);
  t('a linha da descrição não tem fundo (fica branca)', !/background-color/.test(cDesc), cDesc);
  /* as duas linhas precisam ler como um bloco só: a de cima fecha em cima, a
     de baixo fecha embaixo, e entre elas fica um traço bem claro */
  t('a descrição fecha em cima e abre embaixo',
    /fo:border-top="0\.02cm solid #d8dff0"/.test(cDesc) && /fo:border-bottom="none"/.test(cDesc), cDesc);
  t('a linha de dados fecha embaixo', /fo:border-bottom="0\.02cm solid #d8dff0"/.test(cDados), cDados);
  t('a descrição sai em negrito', /fo:font-weight="bold"/.test(pDesc), pDesc);
  t('e é segurada junto da linha de dados (não fica sozinha no fim da página)',
    /fo:keep-with-next="always"/.test(pDesc), pDesc);
  t('a fonte viaja junto do estilo (Arial), para não virar Times ao colar',
    /style:font-name="Arial"/.test(pDesc), pDesc);

  console.log('\nerros JS:', errs.length?errs:'nenhum');
  console.log(`\n${ok} passaram, ${mau} falharam.`);
  await b.close();
})();
