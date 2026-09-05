// Génère l'aperçu HTML du rendu RÉEL (code v220) des panneaux Hoxera,
// dans le style validé (embed Discord sombre, trait discret).
process.env.NODE_ENV = 'test';
const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hx-apper2-'));
const store = require('../server/db');
const ui = require('../server/discord/ui');
const SEP = ui.SEPARATOR;

const uid = store.users.create('discord:ap@x', 'x', {});
const BOT = store.bots.create({ user_id: uid, name: 'Hoxera', token: 'T', client_id: '1', prefix: '!' });

// ---- Panneaux réels ----
const panels = require('../server/discord/panels');
const ticket = panels.buildTicketPanelEmbed({}, [], [], 'Serveur de Hoxera', 'G');
const roleMenu = panels.roleMenuPayload(BOT, {
  id: 'M', name: 'Rôles & notifications', mode: 'select', guild_id: 'G',
  content: 'Choisis tes rôles ci-dessous. Tu peux les activer ou les retirer à tout moment.',
  options: [
    { label: '🎮 Gamer', role: 'R1' }, { label: '🎨 Créatif', role: 'R2' },
    { label: '🎧 Music', role: 'R3' }, { label: '📚 Lecture', role: 'R4' },
  ],
}).embeds[0].data;

const giveaway = require('../server/discord/giveaway');
const gData = giveaway.buildEmbed(
  { prize: 'Nitro Boost 1 mois', winners: 1, ends_at: Date.now() + 7200000 },
  { message: 'Réagis avec 🎉 pour participer !\n\nCe concours est réservé aux membres du serveur.' },
).data;

const suggest = require('../server/discord/suggest');
const sData = suggest.buildEmbed(
  { id: 42, status: 'pending', upvotes: 7, downvotes: 1, bot_id: BOT, text: 'Ajouter un salon musique où chacun peut partager ses playlists.\n\nEt pourquoi pas un salon cinéma pour les soirées du vendredi ?' },
  'Membre',
  {},
).data;

const announce = require('../server/discord/announcements');
const aData = announce.buildEmbed({
  title: '📣 Tournoi de rentrée',
  message: 'Le grand tournoi de rentrée démarre ce week-end !\n\n🏆 1ʳᵉ place : 3 mois de Nitro\n🥈 2ᵉ place : 1 mois de Nitro\n\nInscrivez-vous avec la commande /event create.',
  color: '#e07a5f',
  footer: 'Hoxera · Serveur de Hoxera',
}, { name: 'Serveur de Hoxera' }).data;

const xpAnnounce = (() => {
  // Chemin réel : announce() de xp.js (template utilisateur → description)
  const xp = require('../server/discord/xp');
  // Le code de prod applique ui.sectionize(text) : on reproduit exactement
  // le même chemin pour cet aperçu (template multi-paragraphes).
  const template = '{user} vient d’atteindre le **niveau {level}** ! 🎉\n\nContinuez comme ça, le niveau {next} vous attend…';
  const text = template
    .replace('{user}', '<@123>').replace('{level}', '12')
    .replace('{server}', 'Serveur de Hoxera').replace('{next}', '13');
  return { title: '🎉 Niveau supérieur', description: ui.sectionize(text), color: '#e07a5f' };
})();

// Liste de panels pour l'aperçu (champ "description" suffit ici).
const SAMPLES = [
  { label: '🎫 Panneau « Centre d’assistance » (tickets)', color: '#ED4245', title: ticket.title, description: ticket.description, sub: 'bienvenue + explication · règles et patience restent en champs natifs' },
  { label: '📋 Panneau « Menu de rôles » (contenu personnalisé)', color: '#e07a5f', title: roleMenu.title, description: roleMenu.description, sub: 'contenu libre du serveur — les paragraphes deviennent des sections' },
  { label: '🎁 Giveaway (message personnalisé multi-paragraphes)', color: '#FEE75C', title: gData.title, description: gData.description, sub: 'prix · invitation · conditions' },
  { label: '📣 Annonce (contenu libre du dashboard)', color: '#e07a5f', title: aData.title, description: aData.description, sub: 'intro · récompenses · inscription — texte 100 % saisi par l’utilisateur' },
  { label: '💡 Suggestion multi-paragraphes', color: '#e07a5f', title: '💡 Suggestion', description: sData.description, sub: 'texte libre du membre structuré automatiquement' },
  { label: '🎉 Annonce de niveau (message personnalisé XP)', color: '#e07a5f', title: xpAnnounce.title, description: xpAnnounce.description, sub: 'template du serveur — paragraphes séparés par le trait' },
];

const esc = (s) => String(s || '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Avant : même texte, traits retirés (remis en lignes vides).
const beforeOf = (text) => String(text || '').split('\n' + SEP + '\n').join('\n\n');

function md(html) {
  // mini-markdown : gras + code + italique suffisent pour la lisibilité
  return html
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<u>$1</u>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code style="background:#1e1f22;border-radius:4px;padding:1px 5px;font-size:12px;">$1</code>');
}

function blockHTML(text, after) {
  // Découpe par traits ou par lignes vides selon la version
  const parts = after
    ? String(text || '').split('\n' + SEP + '\n')
    : String(text || '').split(/\n\s*\n/);
  return parts.map((part, i) => {
    const html = md(esc(part)).split('\n').join('<br>');
    const sep = after
      ? `<div style="text-align:center;color:#4e5058;font-size:12px;margin:8px 0;letter-spacing:1px;">${esc(SEP)}</div>`
      : `<div style="height:14px;"></div>`;
    return (i < parts.length - 1 ? html + '\n' + sep : html);
  }).join('\n');
}

function cardHTML(sample, after) {
  const desc = after ? sample.description : beforeOf(sample.description);
  return `
      <div style="background:#2b2d31;border-radius:6px;overflow:hidden;">
        <div style="border-left:4px solid ${sample.color};padding:12px 14px 6px;">
          <div style="color:#fff;font-weight:600;font-size:15px;">${md(esc(sample.title))}</div>
          <div style="font-size:13px;line-height:1.5;margin-top:6px;color:#dbdee1;">${blockHTML(desc, after)}</div>
        </div>
        <div style="background:#00000022;padding:6px 14px;border-top:1px solid #1e1f22;color:#949ba4;font-size:11px;">${esc(sample.sub)}</div>
      </div>`;
}

const rows = SAMPLES.map((s) => `
    <div style="font-size:13px;color:#949ba4;text-transform:uppercase;letter-spacing:1px;margin:26px 0 10px;">${s.label}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
      <div>${cardHTML(s, false)}
        <div style="text-align:center;color:#f0b232;font-size:12px;margin-top:6px;">▼ AVANT — lignes vides</div>
      </div>
      <div>${cardHTML(s, true)}
        <div style="text-align:center;color:#57F287;font-size:12px;margin-top:6px;">▲ APRÈS — traits v220</div>
      </div>
    </div>`).join('');

const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Aperçu réel v220 — Traits de séparation</title>
</head>
<body style="margin:0;padding:28px;background:#1e1f22;font-family:'gg sans','Noto Sans',system-ui,-apple-system,'Segoe UI',sans-serif;color:#dbdee1;">
  <div style="max-width:1180px;margin:0 auto;">
    <div style="text-align:center;margin-bottom:10px;">
      <div style="font-size:15px;color:#949ba4;">Hoxera · Design des panneaux — rendu RÉEL du code (v220)</div>
      <h1 style="color:#fff;margin:6px 0 0;font-size:24px;">🪄 Traits de séparation entre les grandes sections</h1>
      <p style="color:#b5bac1;font-size:14px;margin-top:8px;">Généré depuis les vrais embeds du bot : avant = lignes vides · après = trait discret <span style="color:#4e5058;letter-spacing:1px;">━━━━━━━━━━━━━━━━━━</span> (20 × ━, texte, aucune couleur).</p>
    </div>
    ${rows}
    <div style="background:#2b2d31;border-left:4px solid #57F287;border-radius:6px;padding:14px 16px;margin-top:28px;font-size:13px;line-height:1.6;">
      <strong style="color:#fff;">🧭 Règles du rendu</strong><br>
      · Tout paragraphe délimité par une ligne vide devient une section : trait de 20 × <span style="color:#b5bac1;">━</span> entre chaque section (même gris sourd que la bordure Discord, aucune couleur ajoutée).<br>
      · Les blocs de code (\`\`\`) ne sont jamais coupés par un trait.<br>
      · Un panneau à une seule section reste strictement inchangé ; les listes compactes (classements, choix de sondage…) et les micro-réponses éphémères gardent leur mise en page naturelle.<br>
      · Le contenu libre saisi par l’utilisateur (annonces, giveaways, menus de rôles, suggestions, bienvenue, message XP…) est structuré automatiquement de la même façon.<br>
      · Les champs natifs Discord (règles, stats…) restent des champs : le trait structure le texte, pas la mise en page des champs.
    </div>
  </div>
</body>
</html>
`;

fs.writeFileSync('/home/user/apercu-v220-rendu-reel.html', html);
console.log('OK — apercu-v220-rendu-reel.html écrit');
