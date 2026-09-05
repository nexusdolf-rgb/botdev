// Aperçu HTML — Galerie des panneaux & messages du bot (design system v220).
// Rendu depuis les VRAIS builders + ui.panel/ui.embed (grammaire des sections).
// Usage : node scripts/gen-apercu-galerie.js  →  /home/user/apercu-galerie-panneaux.html
const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hx-gal-'));
const store = require('../server/db');
const ui = require('../server/discord/ui');
const panels = require('../server/discord/panels');
const giveaway = require('../server/discord/giveaway');
const suggest = require('../server/discord/suggest');

const uid = store.users.create('discord:gal@x', 'x', {});
const BOT = store.bots.create({ user_id: uid, name: 'Hoxera', token: 'T', client_id: '1', prefix: '!' });
const member = { id: 'u1', user: { username: 'Alice', displayAvatarURL: () => '' }, toString: () => '@Alice', guild: { name: 'Serveur de Hoxera' } };

const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function md(html) {
  return String(html || '')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<u>$1</u>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}
function colorHex(e) {
  const c = Number(e.color);
  if (!Number.isFinite(c) || c === 0) return '#e07a5f';
  return '#' + c.toString(16).padStart(6, '0');
}
function linesHTML(text) {
  return String(text || '').split('\n').map((l) => {
    if (l.trim() === ui.SEPARATOR) return '<div style="text-align:center;color:#5b5e66;font-size:11px;margin:5px 0;letter-spacing:2px;">' + esc(ui.SEPARATOR) + '</div>';
    return `<div style="font-size:13px;line-height:1.5;word-break:break-word;">${md(esc(l)) || '&nbsp;'}</div>`;
  }).join('');
}
function card(e, caption, badge) {
  const author = e.author || {};
  const fields = e.fields || [];
  const hasTrait = /━{4,}/.test(String(e.description || ''));
  const badgeHtml = badge || (hasTrait
    ? '<span style="background:#57F28722;color:#57F287;border:1px solid #57F28755;border-radius:999px;padding:2px 10px;font-size:11px;font-weight:600;">✔ trait ━ appliqué</span>'
    : '<span style="background:#FEE75C22;color:#FEE75C;border:1px solid #FEE75C55;border-radius:999px;padding:2px 10px;font-size:11px;font-weight:600;">message court / interactif — naturel (sans ━)</span>');
  return `
  <div style="background:#2b2d31;border-radius:8px;overflow:hidden;border:1px solid #1e1f22;">
    <div style="border-left:4px solid ${colorHex(e)};padding:11px 14px 8px;">
      ${author.name ? `<div style="color:#fff;font-size:13px;font-weight:600;">${esc(author.name)}</div>` : ''}
      ${e.title ? `<div style="color:#fff;font-weight:600;font-size:14px;margin-top:2px;">${md(esc(e.title))}</div>` : ''}
      ${e.description ? `<div style="margin-top:4px;">${linesHTML(e.description)}</div>` : ''}
      ${fields.map((f) => `
        <div style="margin-top:8px;font-size:13px;">
          ${f.name === '\u200b' ? '' : `<div style="color:#e07a5f;font-size:12px;font-weight:600;margin-bottom:2px;">${md(esc(f.name))}</div>`}
          <div style="line-height:1.5;word-break:break-word;">${linesHTML(f.value)}</div>
        </div>`).join('')}
    </div>
    <div style="background:#00000022;padding:6px 14px;border-top:1px solid #1e1f22;color:#949ba4;font-size:11px;display:flex;justify-content:space-between;gap:8px;align-items:center;">
      <span>${esc(caption)}</span>${badgeHtml}
    </div>
  </div>`;
}
const cardFrom = (embed, caption) => card(embed.toJSON ? embed.toJSON() : embed, caption);

const embTicket = panels.buildTicketPanelEmbed({ message: '' }, {}, [
  { emoji: '🎫', label: 'Support', questions: [] },
  { emoji: '📝', label: 'Candidature staff', questions: [{}] },
], 'Serveur de Hoxera', 'G220');

const rolePayload = panels.roleMenuPayload(BOT, {
  id: 'M1', name: 'Rôles & notifications', mode: 'select', guild_id: 'G220',
  content: 'Choisis tes rôles ci-dessous.\n\nTu peux les activer ou les retirer à tout moment.',
  options: [
    { label: '🎮 Gamer', role: 'R1' }, { label: '🎨 Créatif', role: 'R2' }, { label: '🎧 Music', role: 'R3' },
  ],
});

const embGive = giveaway.buildEmbed(
  { prize: 'Nitro Boost · 1 mois', winners: 2, ends_at: Date.now() + 3600000 },
  { message: 'Réagis avec 🎉 pour participer !\n\nSeuls les membres du serveur sont éligibles.' },
);
const embEnd = giveaway.buildEndedEmbed(
  { prize: 'Nitro Boost · 1 mois' },
  [{ toString: () => '<@Alice>' }, { toString: () => '<@Bob>' }],
  false,
);
const embSugg = suggest.buildEmbed(
  { id: 7, status: 'pending', upvotes: 12, downvotes: 2, bot_id: BOT.id, text: 'Ajouter un salon dédié à la musique pour partager ses playlists.\n\nEt pourquoi pas un salon cinéma pour les sorties du week-end ?' },
  'Alice', {},
);
const embSalon = panels.ticketWelcomeEmbed(
  member, { label: 'Support', emoji: '🎫', color: '#57F287', description: 'Une question, un problème, une demande ?', staff_roles: [] },
  '<@&R1>', 'Ma commande n’est jamais arrivée…', '',
  [{ q: 'Pseudo en jeu ?', a: 'Alice_77' }, { q: 'Date ?', a: 'Le 2 septembre' }],
  'fr', { number: 12 }, {},
);
const embDm = ui.embed({
  color: '#57F287',
  title: '🎫 Ton ticket est ouvert',
  sections: false,
  description: 'Ta demande sur **Serveur de Hoxera** a bien été créée.\n\nNotre équipe va te répondre dans le salon privé prévu pour toi.',
});
// Mêmes options que le code des jeux (ui.panel + sections:false)
const embMarry = ui.panel({
  variant: 'live', title: '💍 Une demande en mariage !', sections: false,
  description: '**@Bob**, @Alice te demande en mariage !\n\nUne belle histoire commence peut-être. Choisis ta réponse ci-dessous.',
  fields: [{ name: '💌 Demandeur', value: '@Alice', inline: true }, { name: '💑 Destinataire', value: '@Bob', inline: true }],
  footer: 'Hoxera · Serveur de Hoxera · Réponse réservée à Bob',
}).embeds[0];
const embPendu = ui.panel({
  variant: 'brand', title: '🪢 Pendu', sections: false,
  description: '@Alice, devine le mot caché !\n\n⬜ ⬜ ⬜ ⬜ ⬜',
  fields: [{ name: '❤️ Vies restantes', value: '❤️'.repeat(8), inline: true }, { name: '🧭 Règle', value: 'Choisis une lettre par bouton.', inline: true }],
  footer: 'Hoxera · Partie de Alice',
}).embeds[0];

const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Aperçu — Panneaux & messages du bot (v220)</title></head>
<body style="margin:0;padding:26px;background:#1e1f22;font-family:'gg sans','Noto Sans',system-ui,sans-serif;color:#dbdee1;">
<div style="max-width:760px;margin:0 auto;">
  <div style="text-align:center;margin-bottom:6px;">
    <div style="font-size:15px;color:#949ba4;">Hoxera · Audit visuel des messages Discord — rendu depuis le VRAI code</div>
    <h1 style="color:#fff;margin:6px 0 0;font-size:24px;">Tous les panneaux : organisés avec le trait ━ pro</h1>
    <p style="color:#b5bac1;font-size:13.5px;margin-top:8px;line-height:1.6;">
      Les <strong>grands textes structurés</strong> (panneaux, giveaways, suggestions, bienvenue…) sont découpés en sections reliées par le long trait.<br>
      Les <strong>messages courts & interactifs</strong> (accueil du salon privé, DM, jeux, demandes) gardent leur respiration naturelle — pas de trait plaqué entre deux phrases.
    </p>
  </div>

  <div style="font-size:12px;color:#949ba4;text-transform:uppercase;letter-spacing:1px;margin:20px 0 8px;">Panneaux structurés — trait ━ entre les sections</div>
  ${cardFrom(embTicket, 'Panneau « Centre d’assistance » (salon #support) — description découpée en sections')}
  ${cardFrom(rolePayload.embeds[0], 'Menu de rôles — contenu personnalisé multi-paragraphes')}
  ${cardFrom(embGive, 'Giveaway en cours — message personnalisé structuré')}
  ${cardFrom(embEnd, 'Giveaway terminé — prix / gagnants / merci séparés par le trait')}
  ${cardFrom(embSugg, 'Suggestion publiée — texte du membre structuré')}

  <div style="font-size:12px;color:#949ba4;text-transform:uppercase;letter-spacing:1px;margin:24px 0 8px;">Messages courts & interactifs — naturels, sans trait</div>
  ${cardFrom(embSalon, 'Salon privé du ticket : accueil court puis rubriques natives (Type, Équipe, Demande, Réponses…)')}
  ${cardFrom(embDm, 'DM « Ton ticket est ouvert » — confirmation courte')}
  ${cardFrom(embMarry, '💍 Demande en mariage — message court (sections:false)')}
  ${cardFrom(embPendu, '🪢 Pendu — partie interactive mise à jour à chaque lettre (sections:false)')}

  <div style="background:#2b2d31;border-left:4px solid #e07a5f;border-radius:8px;padding:12px 16px;margin-top:22px;font-size:13px;line-height:1.7;">
    <strong style="color:#fff;">💡 Règles appliquées partout</strong><br>
    · Texte multi-sections des panneaux → trait ━ (20 × U+2501) entre les sections ; texte mono-section → inchangé.<br>
    · Rubriques natives (fields) et composants → jamais de trait texte ; les panneaux natifs (Container V2) utilisent leurs séparateurs pleine largeur natifs.<br>
    · Confirmations, DMs et parties de jeux courts (1-2 phrases) → sauts de ligne naturels (sections:false).
  </div>
</div></body></html>`;
fs.writeFileSync('/home/user/apercu-galerie-panneaux.html', html);
console.log('OK — /home/user/apercu-galerie-panneaux.html');
try { fs.rmSync(process.env.BOTDEV_DATA_DIR, { recursive: true, force: true }); } catch {}
