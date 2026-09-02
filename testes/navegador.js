/* Acha o Playwright e o Chromium sem depender de onde eles foram instalados.
 *
 * Os testes nasceram num container onde o Playwright vinha em
 * /opt/node22/lib/node_modules e o Chromium em /opt/pw-browsers. Com o caminho
 * cravado, o teste só roda naquela máquina. Aqui a busca é por tentativa: o
 * que estiver disponível serve, e se nada estiver, a mensagem diz o que
 * instalar em vez de estourar um "module not found" seco.
 */
const fs = require('fs');
const path = require('path');

function acharPlaywright() {
  const tentativas = [
    'playwright',                                    // instalado no projeto
    '/opt/node22/lib/node_modules/playwright',       // container do Claude Code
    '/usr/lib/node_modules/playwright',
  ];
  for (const t of tentativas) {
    try { return require(t); } catch (e) { /* tenta o próximo */ }
  }
  console.error(
    '\nNão achei o Playwright. Instale com:\n' +
    '   npm install -D playwright && npx playwright install chromium\n');
  process.exit(1);
}

/* O Chromium do Playwright fica numa pasta com a versão no nome
   (chromium-1194, chromium-1200...), que muda a cada atualização. Procurar
   pelo padrão evita ter que corrigir o caminho a cada upgrade. */
function acharChromium() {
  const bases = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers',
                 path.join(process.env.HOME || '', '.cache/ms-playwright')];
  for (const base of bases) {
    if (!base || !fs.existsSync(base)) continue;
    // caminho direto (o container guarda o executável solto)
    const solto = path.join(base, 'chromium');
    if (fs.existsSync(solto) && fs.statSync(solto).isFile()) return solto;
    for (const dir of fs.readdirSync(base)) {
      if (!dir.startsWith('chromium')) continue;
      for (const rel of ['chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
        const p = path.join(base, dir, rel);
        if (fs.existsSync(p)) return p;
      }
    }
  }
  return undefined; // deixa o Playwright resolver sozinho
}

const playwright = acharPlaywright();
const executablePath = acharChromium();

/* Abre o navegador já resolvido. Os testes chamam isto em vez de
   chromium.launch({executablePath: '/caminho/cravado'}). */
async function abrirNavegador(opcoes) {
  return playwright.chromium.launch(
    Object.assign({}, executablePath ? { executablePath } : {}, opcoes || {}));
}

module.exports = { chromium: playwright.chromium, executablePath, abrirNavegador };
