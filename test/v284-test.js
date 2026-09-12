// v284 — Hoxera AI : génération d'images (/image).
// Source gratuite sans clé (Pollinations/Flux) avec mode sûr + garde-fous :
// quota 6/heure/serveur, refroidissement 1 min/membre, timeout, prompt borné.
// Vérifié : moteur, URL sûre, garde-fous, commande slash (module off/on,
// pièce jointe), case dashboard live dans le groupe Création, bump.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const TMP = path.join(__dirname, '.tmp-v284');
fs.rmSync(TMP, { recursive: true, force: true });
process.env.BOTDEV_DATA_DIR = TMP;
fs.mkdirSync(TMP, { recursive: true });

const store = require('../server/db');
const ai = require('../server/ai/engine');
const images = require('../server/ai/images');
const extra = require('../server/discord/extra');

let ok = 0;
function check(label, cond, info) {
  assert.ok(cond, 'ÉCHEC : ' + label + (info ? ' (' + info + ')' : ''));
  ok++;
  console.log('  ✅ ' + label);
}

(async () => {
  const BOT = store.bots.create({ user_id: 1, name: 'T', token: 'x', client_id: 'c', prefix: '!' });
  const G = 'gV284';

  console.log('— 1. Moteur d images : URL sûre & garde-fous —');
  const urls = [];
  const BIG = Buffer.alloc(8192, 7);
  global.fetch = async (url) => { urls.push(String(url)); return { ok: true, arrayBuffer: async () => BIG.buffer.slice(BIG.byteOffset, BIG.byteOffset + BIG.length) }; };
  ai.saveCfg(G, { enabled: true, modules: { images: true } });
  const buf = await images.generateImage(G, 'u1', 'un chat astronaute');
  check('image générée (buffer reçu)', Buffer.isBuffer(buf) && buf.length === 8192);
  check('source gratuite sans clé (image.pollinations.ai/prompt/…)', urls[0].startsWith('https://image.pollinations.ai/prompt/un%20chat%20astronaute'));
  check('mode sûr + sans filigrane + modèle flux', urls[0].includes('safe=true') && urls[0].includes('nologo=true') && urls[0].includes('model=flux'));
  let code = ''; try { await images.generateImage(G, 'u1', 'encore'); } catch (e) { code = e.code; }
  check('refroidissement : 2e image du même membre < 1 min → IMG_COOLDOWN', code === 'IMG_COOLDOWN', code);
  check('le refroidissement n a rien demandé au service', urls.length === 1, 'urls=' + urls.length);
  code = ''; try { await images.generateImage(G, 'uX', '   '); } catch (e) { code = e.code; }
  check('prompt vide → IMG_EMPTY', code === 'IMG_EMPTY', code);
  // quota : 1 déjà consommée, 5 autres membres passent, le 7e appel est refusé
  for (const u of ['u2', 'u3', 'u4', 'u5', 'u6']) await images.generateImage(G, u, 'test');
  code = ''; try { await images.generateImage(G, 'u7', 'test'); } catch (e) { code = e.code; }
  check(`quota ${images.LIMIT_PER_HOUR}/heure/serveur → IMG_QUOTA au-delà`, code === 'IMG_QUOTA', code);
  images._test.hourCount.clear(); images._test.lastUser.clear();
  global.fetch = async () => ({ ok: false });
  code = ''; try { await images.generateImage(G, 'u9', 'test'); } catch (e) { code = e.code; }
  check('service en panne → IMG_FAIL (message poli côté Discord)', code === 'IMG_FAIL', code);
  images._test.hourCount.clear(); images._test.lastUser.clear();

  console.log('— 2. Slash /image —');
  const payloads = extra.buildExtraPayloads();
  const pI = payloads.find((p) => p && p.name === 'image');
  check('slash /image déclaré avec option prompt requise', !!pI && !!pI.options.find((o) => o.name === 'prompt' && o.required));
  check('/image documenté dans l aide', String(extra.HELP_EXTRA.image || '').includes('6 images/heure'));
  urls.length = 0;
  global.fetch = async (url) => { urls.push(String(url)); return { ok: true, arrayBuffer: async () => BIG.buffer.slice(BIG.byteOffset, BIG.byteOffset + BIG.length) }; };
  const replies = []; const edits = []; let deferred = 0;
  const itx = (guildId, q) => ({
    commandName: 'image', guild: { id: guildId }, user: { id: 'u1' }, member: { id: 'u1' },
    options: { getString: () => q },
    isChatInputCommand: () => true, isButton: () => false,
    isUserSelectMenu: () => false, isModalSubmit: () => false, isRepliable: () => true,
    reply: async (o) => replies.push(o),
    deferReply: async () => { deferred++; },
    editReply: async (o) => edits.push(o),
  });
  await extra.handleInteraction(BOT.id, BOT, itx('gSansModule', 'un dragon'));
  check('module décoché → invitation à l activer (aucun appel)', replies.length === 1 && replies[0].ephemeral === true && replies[0].content.includes('Génération d images') && urls.length === 0);
  await extra.handleInteraction(BOT.id, BOT, itx(G, 'un dragon mignon'));
  check('module coché → réponse différée puis image jointe', deferred === 1 && edits.length === 1 && Array.isArray(edits[0].files) && edits[0].files.length === 1);
  check('pièce jointe nommée hoxera-ia.png + titre avec le prompt', edits[0].files[0].name === 'hoxera-ia.png' && edits[0].content.includes('un dragon mignon'));

  console.log('— 3. Dashboard —');
  const dash = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'dashboard.js'), 'utf8');
  const modesLine = (dash.match(/const MODES = \[.*?\];/) || [''])[0];
  check('case « Génération d images » live (8 live, 0 🔜 depuis v285)', modesLine.includes("['images', \"Génération d'images\", true]") && (modesLine.match(/, true\]/g) || []).length === 8);
  check('nouveau groupe « 🎨 Création »', dash.includes("['🎨 Création', ['images']]"));
  check('explication de la case images', dash.includes("images: '/image prompt: génère une illustration"));

  console.log('— 4. Version —');
  const index = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');
  check('index.html : ?v=287 référencé 7 fois', (index.match(/\?v=287/g) || []).length === 7);
  check('sw.js : cache « botdev-v287 »', sw.includes("const CACHE = 'botdev-v287';"));

  console.log(`\n🎉 v284 — ${ok} vérifications OK : génération d'images sûre et cadrée.`);
})().catch((e) => { console.error(e); process.exit(1); });
