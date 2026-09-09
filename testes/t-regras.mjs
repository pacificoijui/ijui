/* As regras do Firestore são a única trava que ninguém contorna: a do
   navegador existe pra dar um aviso claro, mas quem manda é esta aqui. Até
   agora elas nunca tinham sido testadas contra o motor de verdade — eram
   lidas com cuidado e publicadas na fé.

   Este teste roda o arquivo firestore-processos-ijui.rules dentro do
   emulador oficial do Firestore e confere caso a caso quem pode o quê:

     ./rodar-regras.sh

   Se o emulador não puder ser baixado (máquina sem acesso ao storage do
   Google), o script avisa e sai sem falhar — os outros testes não dependem
   dele. */
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, getDocs, collection, addDoc, Timestamp } from "firebase/firestore";

let ok = 0, mau = 0;
async function t(nome, promessa) {
  try { await promessa; console.log("  ✓", nome); ok++; }
  catch (e) { console.log("  ✗", nome, "\n       " + (e.message || e)); mau++; process.exitCode = 1; }
}
const pode  = (p) => assertSucceeds(p);
const nega  = (p) => assertFails(p);

const CONTAS = {
  // Nível de acesso por painel, do jeito que o painel Usuários grava hoje.
  admin:      { uid: "u-admin",   perfil: { email:"pedrohhpacifico@gmail.com", status:"aprovado", isAdmin:true,  acessos:{agenda:"editar", pregoeiro:"editar", contratos:"editar"} } },
  pregoeiro:  { uid: "u-preg",    perfil: { email:"preg@x.com",  status:"aprovado", isAdmin:false, acessos:{agenda:"editar", pregoeiro:"editar", contratos:"nenhum"} } },
  soVer:      { uid: "u-ver",     perfil: { email:"ver@x.com",   status:"aprovado", isAdmin:false, acessos:{agenda:"ver",    pregoeiro:"ver",    contratos:"nenhum"} } },
  soContrato: { uid: "u-contr",   perfil: { email:"contr@x.com", status:"aprovado", isAdmin:false, acessos:{agenda:"nenhum", pregoeiro:"nenhum", contratos:"editar"} } },
  verContrato:{ uid: "u-vcontr",  perfil: { email:"vcontr@x.com",status:"aprovado", isAdmin:false, acessos:{agenda:"nenhum", pregoeiro:"nenhum", contratos:"ver"} } },
  pendente:   { uid: "u-pend",    perfil: { email:"pend@x.com",  status:"pendente", isAdmin:false, acessos:{agenda:"nenhum", pregoeiro:"nenhum", contratos:"nenhum"} } },
  bloqueado:  { uid: "u-bloq",    perfil: { email:"bloq@x.com",  status:"bloqueado",isAdmin:false, acessos:{agenda:"editar", pregoeiro:"editar", contratos:"editar"} } },
  // Conta aprovada ANTES do modelo de três níveis: guarda true/false.
  antiga:     { uid: "u-velha",   perfil: { email:"velha@x.com", status:"aprovado", isAdmin:false, acessos:{agenda:true, pregoeiro:true} } },
  // Documento estragado, sem o campo "acessos": não pode derrubar a regra.
  semAcessos: { uid: "u-quebrada",perfil: { email:"quebrada@x.com", status:"aprovado", isAdmin:false } },
};

const env = await initializeTestEnvironment({
  projectId: "demo-ijui",
  firestore: {
    rules: readFileSync(new URL("../firestore-processos-ijui.rules", import.meta.url), "utf8"),
    host: "127.0.0.1",
    port: Number(process.env.FIRESTORE_EMULATOR_PORT || 8080),
  },
});

// Semeia os perfis e alguns documentos, ignorando as regras.
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const c of Object.values(CONTAS)) await setDoc(doc(db, "usuarios_v2", c.uid), c.perfil);
  await setDoc(doc(db, "processos", "p1"),    { numero: "PE 1/2026" });
  await setDoc(doc(db, "agentes", "ag1"),     { nomeAbrev: "PEDRO" });
  await setDoc(doc(db, "status", "st1"),      { nome: "Em andamento" });
  await setDoc(doc(db, "contratos", "1"),     { contr: 1, ano: 2026, empresa: "X" });
  await setDoc(doc(db, "decisoes", "d1"),     { texto: "…", assinantes: [] });
  await setDoc(doc(db, "rankings", "p1"),     { itens: [] });
  await setDoc(doc(db, "usuarios", "velho1"), { usuario: "julio" });
  const ontem  = Timestamp.fromDate(new Date(Date.now() - 86400000));
  const futuro = Timestamp.fromDate(new Date(Date.now() + 300 * 86400000));
  await setDoc(doc(db, "contratos_historico", "h-vencido"),
    { uid: CONTAS.soContrato.uid, acao: "editou", quando: ontem, expiraEm: ontem });
  await setDoc(doc(db, "contratos_historico", "h-recente"),
    { uid: CONTAS.soContrato.uid, acao: "editou", quando: futuro, expiraEm: futuro });
});

const como = (c) => env.authenticatedContext(c.uid, { email: c.perfil.email }).firestore();
const anonimo = () => env.unauthenticatedContext().firestore();

console.log("\n1) Processos: quem lê, quem grava, quem exclui");
await t("visitante sem conta não lista processos",        nega(getDocs(collection(anonimo(), "processos"))));
await t("mas ainda abre UM processo pelo link (?venc=)",  pode(getDoc(doc(anonimo(), "processos", "p1"))));
await t("pendente não lista processos",                   nega(getDocs(collection(como(CONTAS.pendente), "processos"))));
await t("bloqueado não lista processos",                  nega(getDocs(collection(como(CONTAS.bloqueado), "processos"))));
await t("quem tem acesso lista",                          pode(getDocs(collection(como(CONTAS.soVer), "processos"))));
await t('"Visualizar" NÃO grava processo',                nega(updateDoc(doc(como(CONTAS.soVer), "processos", "p1"), { numero: "X" })));
await t('"Editar" grava processo',                        pode(updateDoc(doc(como(CONTAS.pregoeiro), "processos", "p1"), { numero: "PE 2/2026" })));
await t('"Visualizar" não exclui processo',               nega(deleteDoc(doc(como(CONTAS.soVer), "processos", "p1"))));
await t("conta antiga (true/false) continua valendo como Editar",
                                                          pode(updateDoc(doc(como(CONTAS.antiga), "processos", "p1"), { numero: "PE 3/2026" })));
await t("conta sem o campo acessos não quebra a regra — só não tem acesso",
                                                          nega(getDocs(collection(como(CONTAS.semAcessos), "processos"))));

console.log("\n2) Contratos: nem ler é público");
await t("visitante sem conta não lê contratos",           nega(getDocs(collection(anonimo(), "contratos"))));
await t("visitante sem conta não abre um contrato",       nega(getDoc(doc(anonimo(), "contratos", "1"))));
await t("quem não tem o painel não lê",                   nega(getDocs(collection(como(CONTAS.pregoeiro), "contratos"))));
await t("quem tem Contratos: Visualizar lê",              pode(getDocs(collection(como(CONTAS.verContrato), "contratos"))));
await t("mas não grava",                                  nega(updateDoc(doc(como(CONTAS.verContrato), "contratos", "1"), { empresa: "Y" })));
await t("quem tem Contratos: Editar grava",               pode(updateDoc(doc(como(CONTAS.soContrato), "contratos", "1"), { empresa: "Z" })));
await t("e cadastra contrato novo",                       pode(setDoc(doc(como(CONTAS.soContrato), "contratos", "9999"), { contr: 9999, ano: 2026 })));
await t("ninguém exclui contrato pela tela",              nega(deleteDoc(doc(como(CONTAS.soContrato), "contratos", "1"))));
await t("quem só edita contrato não mexe em processos",   nega(updateDoc(doc(como(CONTAS.soContrato), "processos", "p1"), { numero: "X" })));

console.log("\n3) Histórico dos contratos: registra, não reescreve, não some antes da hora");
const agoraTs  = () => Timestamp.fromDate(new Date());
const futuroTs = () => Timestamp.fromDate(new Date(Date.now() + 365 * 86400000));
await t("quem não tem o painel não lê o histórico",
  nega(getDocs(collection(como(CONTAS.pregoeiro), "contratos_historico"))));
await t("quem tem Contratos: Visualizar lê o histórico",
  pode(getDocs(collection(como(CONTAS.verContrato), "contratos_historico"))));
await t("mas não registra nada",
  nega(addDoc(collection(como(CONTAS.verContrato), "contratos_historico"),
    { uid: CONTAS.verContrato.uid, acao: "editou", quando: agoraTs(), expiraEm: futuroTs() })));
await t("quem edita registra a própria edição",
  pode(addDoc(collection(como(CONTAS.soContrato), "contratos_historico"),
    { uid: CONTAS.soContrato.uid, acao: "editou", quando: agoraTs(), expiraEm: futuroTs() })));
await t("ninguém registra edição em nome de outra pessoa",
  nega(addDoc(collection(como(CONTAS.soContrato), "contratos_historico"),
    { uid: CONTAS.admin.uid, acao: "editou", quando: agoraTs(), expiraEm: futuroTs() })));
await t("registro sem data de validade não entra (nunca seria limpo)",
  nega(addDoc(collection(como(CONTAS.soContrato), "contratos_historico"),
    { uid: CONTAS.soContrato.uid, acao: "editou", quando: agoraTs() })));
await t("registro gravado não se reescreve",
  nega(updateDoc(doc(como(CONTAS.soContrato), "contratos_historico", "h-recente"), { acao: "criou" })));
await t("nem o administrador reescreve",
  nega(updateDoc(doc(como(CONTAS.admin), "contratos_historico", "h-recente"), { acao: "criou" })));
await t("ninguém apaga registro dentro do prazo — nem quem o escreveu",
  nega(deleteDoc(doc(como(CONTAS.soContrato), "contratos_historico", "h-recente"))));
await t("nem o administrador",
  nega(deleteDoc(doc(como(CONTAS.admin), "contratos_historico", "h-recente"))));
await t("o que passou dos 365 dias, sim: é a limpeza da tela",
  pode(deleteDoc(doc(como(CONTAS.soContrato), "contratos_historico", "h-vencido"))));

console.log("\n4) Os links públicos que precisam continuar funcionando");
await t("assinar decisão sem login: só os campos da assinatura",
  pode(updateDoc(doc(anonimo(), "decisoes", "d1"), { assinantes: [{ nome: "Fulano" }], updatedAt: "2026-01-01" })));
await t("mas o texto da decisão, não",                    nega(updateDoc(doc(anonimo(), "decisoes", "d1"), { texto: "adulterado" })));
await t("assinatura do agente sem login: só a imagem",
  pode(updateDoc(doc(anonimo(), "agentes", "ag1"), { assinaturaImg: "data:…", assinaturaEm: "2026-01-01", updatedAt: "x" })));
await t("mas o cadastro do agente, não",                  nega(updateDoc(doc(anonimo(), "agentes", "ag1"), { nomeAbrev: "OUTRO" })));
await t("ranking pelo link continua aberto",              pode(updateDoc(doc(anonimo(), "rankings", "p1"), { itens: [1] })));
await t("listar rankings, não",                           nega(getDocs(collection(anonimo(), "rankings"))));

console.log("\n5) As contas: cada um só cria a própria, e sempre sem poder");
const novo = (uid, email) => env.authenticatedContext(uid, { email }).firestore();
await t("cadastro novo nasce pendente e sem acesso",
  pode(setDoc(doc(novo("u-novo", "novo@x.com"), "usuarios_v2", "u-novo"),
    { email: "novo@x.com", status: "pendente", isAdmin: false, acessos: { agenda: "nenhum", pregoeiro: "nenhum", contratos: "nenhum" } })));
await t("uma aba antiga, que ainda manda false, também consegue se cadastrar",
  pode(setDoc(doc(novo("u-novo2", "novo2@x.com"), "usuarios_v2", "u-novo2"),
    { email: "novo2@x.com", status: "pendente", isAdmin: false, acessos: { agenda: false, pregoeiro: false } })));
await t("ninguém se cadastra já aprovado",
  nega(setDoc(doc(novo("u-esperto", "esperto@x.com"), "usuarios_v2", "u-esperto"),
    { email: "esperto@x.com", status: "aprovado", isAdmin: false, acessos: { agenda: "editar", pregoeiro: "editar", contratos: "editar" } })));
await t("nem se cadastra como administrador",
  nega(setDoc(doc(novo("u-esperto2", "esperto2@x.com"), "usuarios_v2", "u-esperto2"),
    { email: "esperto2@x.com", status: "pendente", isAdmin: true, acessos: { agenda: "nenhum", pregoeiro: "nenhum", contratos: "nenhum" } })));
await t("nem cria a conta de outra pessoa",
  nega(setDoc(doc(novo("u-esperto3", "esperto3@x.com"), "usuarios_v2", "u-outro"),
    { email: "esperto3@x.com", status: "pendente", isAdmin: false, acessos: { agenda: "nenhum", pregoeiro: "nenhum", contratos: "nenhum" } })));
await t("o e-mail de resgate nasce administrador",
  pode(setDoc(doc(novo("u-resgate", "pedrohhpacifico@gmail.com"), "usuarios_v2", "u-resgate"),
    { email: "pedrohhpacifico@gmail.com", status: "aprovado", isAdmin: true, acessos: { agenda: "editar", pregoeiro: "editar", contratos: "editar" } })));

console.log("\n6) Quem mexe no acesso dos outros é só o administrador");
await t("cada um lê o próprio perfil",                    pode(getDoc(doc(como(CONTAS.soVer), "usuarios_v2", CONTAS.soVer.uid))));
await t("mas não o dos outros",                           nega(getDoc(doc(como(CONTAS.soVer), "usuarios_v2", CONTAS.pregoeiro.uid))));
await t("nem lista o cadastro inteiro",                   nega(getDocs(collection(como(CONTAS.pregoeiro), "usuarios_v2"))));
await t("ninguém se promove sozinho",                     nega(updateDoc(doc(como(CONTAS.soVer), "usuarios_v2", CONTAS.soVer.uid), { acessos: { agenda: "editar", pregoeiro: "editar", contratos: "editar" } })));
await t("nem vira administrador sozinho",                 nega(updateDoc(doc(como(CONTAS.soVer), "usuarios_v2", CONTAS.soVer.uid), { isAdmin: true })));
await t("o admin lista, aprova e libera",                 pode(updateDoc(doc(como(CONTAS.admin), "usuarios_v2", CONTAS.pendente.uid), { status: "aprovado", acessos: { agenda: "ver", pregoeiro: "nenhum", contratos: "editar" } })));
await t("o admin lista o cadastro",                       pode(getDocs(collection(como(CONTAS.admin), "usuarios_v2"))));
await t("o cadastro antigo é só do admin, e só de leitura", pode(getDoc(doc(como(CONTAS.admin), "usuarios", "velho1"))));
await t("ninguém mais lê o cadastro antigo",              nega(getDoc(doc(como(CONTAS.pregoeiro), "usuarios", "velho1"))));
await t("e nem o admin escreve nele",                     nega(updateDoc(doc(como(CONTAS.admin), "usuarios", "velho1"), { usuario: "x" })));

await env.cleanup();
console.log(`\n${ok} passaram, ${mau} falharam.`);
