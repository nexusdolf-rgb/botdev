// ============================================================================
// Aperçu HTML du rendu v239 — les 2 bugs signalés par l'utilisateur :
//   1. le MP de transcription (envoyé au créateur du ticket après fermeture)
//      n'avait AUCUN séparateur : dernier panneau construit à la main ;
//   2. l'aperçu « 👀 Aperçu sur Discord » du modèle « ✨ bienvenue pro »
//      (dashboard) ne dessinait jamais de panneau — il lisait une clé de
//      réglage inexistante (`embed` au lieu de `plain`).
//
// Tout est rendu à partir du VRAI code : le MP via panels.sendTranscriptDm(),
// l'aperçu dashboard via le VRAI renderPv() exécuté dans jsdom.
//
//   node scripts/gen-apercu-v239.js   →  /home/user/apercu-v239.html
// ============================================================================
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.NODE_ENV = 'test';
process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hx-apercu239-'));

const store = require('../server/db');
const ui = require('../server/discord/ui');
const panels = require('../server/discord/panels');
const { drawPayload, page, compare, esc } = require('./lib/discord-preview');
const { buildDom } = require('../test/helpers/dashboard-preview');

const GUILD_ID = 'G-APERCU239';
const OPENER = '100000000000000009';

// ── Le MP de transcription, capturé à l'envoi ──
let captured = null;
const fakeUser = { id: OPENER, username: 'alice', tag: 'alice#0001', send: async (p) => { captured = p; return {}; } };
const fakeClient = { users: { fetch: async () => fakeUser }, botId: 1 };
const fakeGuild = { id: GUILD_ID, name: 'Serveur de Hoxera', client: fakeClient, members: { fetch: async () => ({ user: fakeUser }) } };

// ── Le panneau de bienvenue réellement envoyé sur Discord (référence) ──
const PRO_TEXT = "👋 Bienvenue @NouveauMembre sur Mon serveur !\nTu es le membre n°42 🎉\n\nPour bien commencer, découvre les salons utiles :\n📜 <#111111111111111111> · règlement\n💬 <#222222222222222222> · support\n\nPasse un bon moment parmi nous — l'équipe est là pour t'aider ! 🚀";
const welcomeDiscord = ui.v2panel({
  color: '#57F287',
  author: { name: 'NouveauMembre#0001 vient d\u2019arriver !' },
  title: '👋 Bienvenue sur Mon serveur !',
  description: PRO_TEXT,
  fields: [{ name: '👥 Tu es le membre', value: '**n°42**', inline: true }],
  thumbnail: 'https://cdn/avatar.png',
  footer: 'Mon serveur',
});

// ── MAQUETTES « AVANT » (code d'origine, recopié à l'identique) ──
const avantDm = `
  <div style="background:#2b2d31;border-left:4px solid #ed4245;border-radius:4px;padding:12px 14px;margin:2px 0">
    <div style="font-size:15px;font-weight:700;color:#f2f3f5">Serveur de Hoxera · 📜 Transcription du ticket</div>
    <div style="font-size:14px;color:#dbdee1;margin:8px 0;line-height:1.5">Bonjour @Alice,<br><br>Ton ticket « Problème de connexion » sur Serveur de Hoxera a été fermé.<br><br>Tu trouveras la transcription complète de vos échanges en pièce jointe.</div>
    <div style="height:120px;border-radius:4px;background:#1e1f22;border:1px dashed #3f4147;display:flex;align-items:center;justify-content:center;color:#949ba4;font-size:12px;margin:8px 0">🖼️ bannière</div>
    <div style="font-size:11.5px;color:#949ba4">Hoxera · Tickets</div>
  </div>
  <div style="display:flex;gap:8px;margin-top:8px"><span style="background:#4e5058;color:#fff;padding:7px 14px;border-radius:3px;font-size:13.5px">↗ 📜 Ouvrir la transcription</span></div>
  <div style="display:flex;align-items:center;gap:10px;background:#232428;border-radius:4px;padding:9px 11px;margin-top:8px;max-width:420px">
    <div style="width:34px;height:40px;border-radius:3px;background:#3f4147;display:flex;align-items:center;justify-content:center;font-size:9.5px;font-weight:700;color:#dbdee1">TXT</div>
    <div><div style="font-size:13.5px;color:#00a8fc">transcription-ticket-alice.txt</div><div style="font-size:11.5px;color:#949ba4">2 Ko</div></div></div>
  <div style="color:#f04747;font-size:12px;margin-top:10px;line-height:1.6">
    ⚠️ embed construit à la main → <strong>aucun séparateur</strong>, le bouton et le fichier
    traînent <strong>hors</strong> du panneau, rendu différent de tous les autres.</div>`;

const avantPreview = `
  <div style="background:#1e1f22;border:1px solid #2b2d31;border-radius:6px;padding:12px">
    <div style="font-size:11px;color:#949ba4;font-weight:700;letter-spacing:.4px;margin-bottom:9px">👀 APERÇU SUR DISCORD</div>
    <div style="display:flex;gap:10px">
      <div style="width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#5865F2,#8B5CF6);flex-shrink:0"></div>
      <div style="min-width:0;flex:1">
        <div style="font-size:13px"><b style="color:#f2f3f5">Optimus Prime</b> <span style="background:#5865F2;color:#fff;font-size:9px;padding:1px 5px;border-radius:4px">✓ APP</span></div>
        <div style="font-size:13.5px;color:#dbdee1;margin-top:2px">👋 Bienvenue <span style="background:#3c4270;color:#c9cdfb;padding:0 2px;border-radius:3px">@NouveauMembre</span> sur Mon serveur !<br/>Tu es le membre n°42 🎉<br/><br/>Pour bien commencer, découvre les salons utiles :<br/>Lis le règlement → <span style="background:#3c4270;color:#c9cdfb;padding:0 2px;border-radius:3px">#règlement</span><br/>Ouvre un ticket → <span style="background:#3c4270;color:#c9cdfb;padding:0 2px;border-radius:3px">#support</span><br/><br/>Passe un bon moment parmi nous — l'équipe est là pour t'aider ! 🚀</div>
      </div></div></div>
  <div style="color:#f04747;font-size:12px;margin-top:10px;line-height:1.6">
    ⚠️ <strong>aucun panneau, aucun trait</strong> — alors que Discord affiche un panneau avec
    4 séparateurs. Cause : l'aperçu lisait la clé <code style="background:#2b2d31;padding:1px 4px;border-radius:4px">embed</code>,
    qui <strong>n'existe pas</strong> dans les réglages (la vraie s'appelle
    <code style="background:#2b2d31;padding:1px 4px;border-radius:4px">plain</code>, logique inversée) →
    il retombait en permanence sur le rendu « texte simple ».</div>`;

// Encadre un rendu d'aperçu dashboard comme dans la vraie interface.
const dashFrame = (inner) => `
  <div style="background:#1e1f22;border:1px solid #2b2d31;border-radius:6px;padding:12px">
    <div style="font-size:11px;color:#949ba4;font-weight:700;letter-spacing:.4px;margin-bottom:9px">👀 APERÇU SUR DISCORD</div>
    ${inner}
  </div>`;

(async () => {
  store.settings.set('public_url', 'https://hoxera.is-a.dev');

  const ok = await panels.sendTranscriptDm(fakeClient, fakeGuild, 'ticket-alice', {
    text: 'alice: bonjour, je n\u2019arrive plus à me connecter\nstaff: bonjour ! On regarde ça\nstaff: c\u2019est réglé ✅',
    url: 'https://hoxera.is-a.dev/transcript/abc123',
    openerId: OPENER,
    msgCount: 3,
  }, 1);
  if (!ok || !captured) throw new Error('le MP de transcription n\u2019a pas pu être capturé');

  // L'aperçu dashboard, rendu par le VRAI renderPv() dans jsdom.
  const pvCfg = {
    message: "👋 Bienvenue {user} sur {server} !\nTu es le membre n°{count} 🎉\n\nPour bien commencer, découvre les salons utiles :\n{channels}\n\nPasse un bon moment parmi nous — l'équipe est là pour t'aider ! 🚀",
    plain: false, card: false, color: '#57F287', image: '',
    _channelRows: [['règlement', 'Lis le règlement'], ['support', 'Ouvre un ticket']],
  };
  const pvGuild = { name: 'Mon serveur', members: 42 };
  const pvChans = [{ id: '111111111111111111', name: 'règlement' }, { id: '222222222222222222', name: 'support' }];
  const apresPreview = dashFrame(buildDom({ key: 'member_join', config: pvCfg, guild: pvGuild, channels: pvChans }).html);
  const apresPlain = dashFrame(buildDom({ key: 'member_join', config: { ...pvCfg, plain: true }, guild: pvGuild, channels: pvChans }).html);

  const html = page(
    'Hoxera v239 — MP de transcription + aperçu « bienvenue pro »',
    `Rendu généré à partir du <strong style="color:#dbdee1">vrai code</strong> : le MP est capturé à la sortie de
     <code style="background:#2b2d31;padding:1px 4px;border-radius:4px">panels.sendTranscriptDm()</code>, et l'aperçu du dashboard est produit par le
     <strong style="color:#dbdee1">vrai</strong> <code style="background:#2b2d31;padding:1px 4px;border-radius:4px">renderPv()</code> exécuté dans un navigateur simulé (jsdom).
     Aucun caractère <code style="background:#2b2d31;padding:1px 4px;border-radius:4px">━</code> : uniquement des séparateurs natifs pleine largeur.`,

    compare(1, 'Le MP envoyé au créateur du ticket après la fermeture',
      "C'était le <strong style='color:#dbdee1'>dernier</strong> panneau du bot encore construit à la main avec un <code style='background:#2b2d31;padding:1px 4px;border-radius:4px'>new EmbedBuilder()</code> : il n'est jamais passé par le système de panneaux, donc la grande migration des séparateurs (v231→v236) ne l'a jamais vu. Maintenant il est identique aux autres.",
      avantDm, drawPayload(captured), 'APRÈS (v239)')

    + compare(2, "L'aperçu « 👀 Aperçu sur Discord » du modèle « ✨ bienvenue pro »",
      "Le bouton du dashboard remplissait bien le bon texte, mais l'aperçu en dessous ne montrait <strong style='color:#f04747'>aucun trait</strong>. Ce n'était pas une impression : le code lisait une clé de réglage qui n'existe pas.",
      avantPreview, apresPreview, 'APRÈS (v239)')

    + `<section style="margin:0 0 26px">
        <h2 style="font-size:16px;color:#f2f3f5;margin:0 0 4px">3. Vérification croisée — l'aperçu dit-il la vérité ?</h2>
        <p style="font-size:13px;color:#949ba4;margin:0 0 10px;line-height:1.55">
          À gauche : ce que le dashboard montre maintenant. À droite : ce que Discord affiche réellement
          (panneau produit par <code style="background:#2b2d31;padding:1px 4px;border-radius:4px">events.js</code>).
          Même structure, même nombre de traits.</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
          <div><div style="font-size:11px;color:#00a8fc;font-weight:700;letter-spacing:.6px;margin-bottom:6px">DANS LE DASHBOARD</div>${apresPreview}</div>
          <div><div style="font-size:11px;color:#57f287;font-weight:700;letter-spacing:.6px;margin-bottom:6px">SUR DISCORD</div>${drawPayload(welcomeDiscord)}</div>
        </div></section>`

    + compare(4, 'Cas particulier : « 📝 Mode texte simple »',
      "Quand cette case est cochée, le bot n'envoie volontairement <strong style='color:#dbdee1'>aucun panneau</strong> — juste du texte. L'aperçu doit donc lui aussi n'afficher aucun trait. C'est désormais fidèle.",
      '', apresPlain, 'APRÈS (v239) — aucun trait, et c\u2019est normal')
  );

  const out = '/home/user/apercu-v239.html';
  fs.writeFileSync(out, html);
  try { store.db.close(); } catch {}
  fs.rmSync(process.env.BOTDEV_DATA_DIR, { recursive: true, force: true });
  const v2h = require('../test/helpers/v2');
  console.log('OK — ' + out + ' écrit (' + html.length + ' octets)');
  console.log('  MP transcription  : ' + v2h.dividers(captured) + ' séparateurs natifs, ' + v2h.componentCount(captured) + '/40 composants');
  console.log('  Aperçu dashboard  : ' + ((buildDom({ key: 'member_join', config: pvCfg, guild: pvGuild, channels: pvChans }).html.match(/<hr/g) || []).length) + ' séparateurs');
  console.log('  Panneau Discord   : ' + v2h.dividers(welcomeDiscord) + ' séparateurs');
  console.log('  → aperçu fidèle   : ' + (((buildDom({ key: 'member_join', config: pvCfg, guild: pvGuild, channels: pvChans }).html.match(/<hr/g) || []).length) === v2h.dividers(welcomeDiscord) ? 'OUI ✅' : 'NON ❌'));
})().catch((e) => { console.error('❌', e); process.exit(1); });
