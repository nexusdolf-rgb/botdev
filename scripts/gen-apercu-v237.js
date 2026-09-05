// ============================================================================
// Aperçu HTML du rendu v237 — les 3 panneaux de tickets corrigés.
//
// Il ne simule RIEN à la main : il appelle le VRAI code (panels.js / ui.js),
// récupère les payloads Components V2 et les dessine comme Discord le ferait
// (thème sombre, conteneur à liseré coloré, TextDisplay, Separator pleine
// largeur, ActionRow). Tout est en styles inline : le fichier s'ouvre hors ligne.
//
//   node scripts/gen-apercu-v237.js   →  /home/user/apercu-v237.html
// ============================================================================
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.NODE_ENV = 'test';
process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hx-apercu237-'));

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, MessageFlags } = require('discord.js');
const store = require('../server/db');
const ui = require('../server/discord/ui');
const panels = require('../server/discord/panels');
const i18n = require('../server/i18n');

const BOT = store.bots.create({ user_id: store.users.create('discord:ap@x', 'x', {}), name: 'Hoxera', token: 'T', client_id: '1', prefix: '!' });
const GUILD = 'G-APERCU';

// ---------------------------------------------------------------------------
// Rendu markdown minimal (gras, titre ##, discret -#, code, liens, sauts)
// ---------------------------------------------------------------------------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function md(raw) {
  let s = esc(raw);
  s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" style="color:#00a8fc;text-decoration:none">$1</a>');
  s = s.replace(/`([^`]+)`/g, '<code style="background:#2b2d31;padding:1px 4px;border-radius:4px;font-size:12px">$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/^## (.*)$/gm, '<span style="display:block;font-size:19px;font-weight:800;line-height:1.3;margin:2px 0">$1</span>');
  s = s.replace(/^-# (.*)$/gm, '<span style="display:block;font-size:12px;color:#949ba4;font-weight:500">$1</span>');
  return s.replace(/\n/g, '<br>');
}

// ---------------------------------------------------------------------------
// Dessin d'un payload Components V2
// ---------------------------------------------------------------------------
const ACCENT = { 5763719: '#57f287', 5793266: '#5865f2', 16753989: '#faa61a', 15548997: '#ed4245', 3447003: '#3498db' };
function drawComponent(node) {
  const t = Number(node.type);
  if (t === 17) { // Container
    const accent = ACCENT[node.accent_color] || '#5865f2';
    const inner = (node.components || []).map(drawComponent).join('');
    return `<div style="background:#2b2d31;border:1px solid #1e1f22;border-left:4px solid ${accent};border-radius:8px;padding:12px 14px;margin:2px 0">${inner}</div>`;
  }
  if (t === 10) return `<div style="color:#dbdee1;font-size:14.5px;line-height:1.45;margin:3px 0;word-break:break-word">${md(node.content || '')}</div>`;
  if (t === 14) return `<hr style="border:0;border-top:1px solid #3f4147;margin:9px -14px;width:calc(100% + 28px)">`;
  if (t === 18) { // Section + accessoire vignette
    const acc = node.accessory && node.accessory.type === 11
      ? `<div style="flex:0 0 48px;height:48px;border-radius:8px;background:linear-gradient(135deg,#5865f2,#eb459e);display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;font-size:17px">${esc(initialsOf(node.accessory.media && node.accessory.media.url))}</div>` : '';
    const texts = (node.components || []).map(drawComponent).join('');
    return `<div style="display:flex;gap:12px;align-items:flex-start;margin:3px 0"><div style="flex:1 1 auto;min-width:0">${texts}</div>${acc}</div>`;
  }
  if (t === 1) { // ActionRow
    return `<div style="display:flex;flex-wrap:wrap;gap:8px;margin:9px 0 2px">${(node.components || []).map(drawControl).join('')}</div>`;
  }
  if (t === 12) { // MediaGallery
    const items = (node.items || []).map(() => `<div style="height:150px;border-radius:6px;background:#1e1f22;border:1px dashed #3f4147;display:flex;align-items:center;justify-content:center;color:#949ba4;font-size:12px">🖼️ image</div>`).join('');
    return `<div style="display:grid;grid-template-columns:1fr;gap:4px;margin:6px 0">${items}</div>`;
  }
  return '';
}
function initialsOf(url) {
  const m = /\/([A-Za-z0-9_-]+)\.(png|jpg|webp|gif)/.exec(String(url || ''));
  return m ? m[1].slice(0, 2).toUpperCase() : '👤';
}
const STYLE = { 1: 'background:#248046', 2: 'background:#4e5058', 3: 'background:#4e5058', 4: 'background:#da373c', 5: 'background:#3f4147;border:1px solid #4e5058' };
function drawControl(c) {
  const t = Number(c.type);
  if (t === 2) {
    if (c.style === 5) return `<a style="background:#4e5058;color:#fff;padding:7px 14px;border-radius:3px;font-size:13.5px;font-weight:500;text-decoration:none">↗ ${esc(c.label || '')}</a>`;
    return `<span style="${STYLE[c.style] || STYLE[2]};color:#fff;padding:7px 14px;border-radius:3px;font-size:13.5px;font-weight:500">${esc(c.label || '')}</span>`;
  }
  if (t === 3) {
    const opts = (c.options || []).map((o) => `<div style="padding:6px 8px;border-radius:4px;font-size:13.5px;color:#dbdee1">🖐️ ${esc(o.label || '')}</div>`).join('');
    return `<div style="background:#1e1f22;border:1px solid #3f4147;border-radius:4px;padding:8px;width:100%;max-width:420px">
      <div style="color:#949ba4;font-size:13.5px;padding:0 2px 6px">${esc(c.placeholder || '')}</div>${opts}
      <div style="color:#949ba4;font-size:12px;padding:6px 2px 0;border-top:1px solid #2b2d31;margin-top:4px">▾ menu déroulant — dans le panneau</div></div>`;
  }
  return '';
}
const drawPayload = (p) => (p.components || []).map((c) => drawComponent(c.toJSON ? c.toJSON() : c)).join('');

// ---------------------------------------------------------------------------
// Les 3 panneaux réels
// ---------------------------------------------------------------------------
(async () => {
  store.guildSettings.set(BOT, GUILD, { ticket_log_channel: 'journal' });

  // --- 1. Récapitulatif du journal des tickets ---
  let recap = null;
  const board = { id: 'CB', name: 'journal', isTextBased: () => true, send: async (p) => { recap = p; return { id: 'M1' }; } };
  const guild = { id: GUILD, name: 'Serveur de Hoxera', iconURL: () => null, channels: { cache: { find: (fn) => (fn(board) ? board : undefined), get: (id) => (id === 'CB' ? board : undefined) } } };
  const inter = { guild, user: { id: 'S1', tag: 'Moderateur#0001' }, client: { users: { fetch: async () => ({ displayAvatarURL: () => 'https://cdn/x/alice.png' }) } } };
  await panels.__testSendTicketRecap(BOT, inter, {
    row: { number: 7, opener_id: 'U1', opener_tag: 'Alice#0001', claimed_by: 'S2', claimed_tag: 'Bob#0002', type_label: '🎫 Support', opened_at: new Date(Date.now() - 4500000).toISOString().slice(0, 19).replace('T', ' ') },
    meta: { openerId: 'U1', reason: 'Je n\'arrive plus à me connecter au dashboard depuis ce matin.' },
    closeReason: 'Problème résolu — le mot de passe a été réinitialisé.',
    transcript: { msgCount: 24, url: 'https://hoxera.is-a.dev/t/abc123' },
  });
  let rated = null;
  board.messages = { fetch: async () => ({ components: JSON.parse(JSON.stringify(recap.components.map((c) => c.toJSON()))), edit: async (p) => { rated = p; } }) };
  const client = { guilds: { cache: { get: () => guild } } };
  await panels.__testUpdateRecapRating(BOT, client, GUILD, 7, 4);

  // --- 2. MP d'évaluation (avant le clic) + confirmation (après le clic) ---
  const starRow = new ActionRowBuilder().addComponents([1, 2, 3, 4, 5].map((n) => new ButtonBuilder()
    .setCustomId(`bd-rate:${GUILD}:8:${n}:fr`).setLabel('⭐'.repeat(n)).setStyle(n >= 4 ? ButtonStyle.Success : ButtonStyle.Secondary)));
  const ratingDm = ui.v2panel({
    variant: 'warning', title: `⭐ ${i18n.t('fr', 'ticket_rating_title')}`,
    description: i18n.t('fr', 'ticket_rating_desc', { number: 8, server: 'Serveur de Hoxera' }),
    fields: [{ name: '🧭 Comment noter ?', value: 'Choisis une note ci-dessous. Ton avis aide le staff à améliorer le support.' }],
    footer: 'Hoxera · Ticket #8 · Évaluation du support',
  }, [starRow]);
  let confirm = null;
  let fb = null;
  await panels.__testHandleRating(BOT, {
    customId: `bd-rate:${GUILD}:8:5:fr`, user: { id: 'U1' }, client,
    update: async (p) => { confirm = p; }, reply: async (p) => { fb = p; },
  });

  // --- 3. Salon privé du ticket ---
  const member = { id: 'u1', user: { id: 'u1', username: 'Alice', displayAvatarURL: () => 'https://cdn/x/alice.png' }, toString: () => '@Alice', guild: { name: 'Serveur de Hoxera' } };
  const chosen = { label: 'Support', emoji: '🎫', description: 'Pour toute demande générale : question, bug, aide sur le dashboard.', staff_roles: [], color: '#5865F2' };
  const staffRow = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
    .setCustomId(`bd-troom:${BOT}`).setPlaceholder('⚙️ Actions du staff — gérer ce ticket…')
    .addOptions(
      new StringSelectMenuOptionBuilder().setLabel('🖐️ Prendre en charge').setValue('claim'),
      new StringSelectMenuOptionBuilder().setLabel('🔒 Fermer').setValue('close'),
      new StringSelectMenuOptionBuilder().setLabel('🗑 Supprimer définitivement').setValue('delete'),
    ));
  const roomWelcome = panels.ticketWelcomePanel(member, chosen, '<@&R1>', 'Je n\'arrive plus à me connecter au dashboard depuis ce matin.', '',
    [{ q: 'Urgence ?', a: 'Haute — bloquant' }, { q: 'Navigateur ?', a: 'Chrome 128' }], 'fr', { number: 12 }, {},
    { content: '🎫 **Support** · @Alice · @staff', rows: [staffRow] });

  // ---------------------------------------------------------------------------
  const card = (num, titre, note, avant, apres) => `
  <section style="margin:0 0 26px">
    <h2 style="font-size:16px;color:#f2f3f5;margin:0 0 4px">${num}. ${esc(titre)}</h2>
    <p style="font-size:13px;color:#949ba4;margin:0 0 10px;line-height:1.5">${note}</p>
    <div style="display:grid;grid-template-columns:${avant ? '1fr 1fr' : '1fr'};gap:14px">
      ${avant ? `<div><div style="font-size:11px;color:#f04747;font-weight:700;letter-spacing:.6px;margin-bottom:6px">AVANT</div>${avant}</div>` : ''}
      <div><div style="font-size:11px;color:#57f287;font-weight:700;letter-spacing:.6px;margin-bottom:6px">${avant ? 'APRÈS (v237)' : 'RENDU v237'}</div>${apres}</div>
    </div>
  </section>`;

  // Le « avant » : reconstruction fidèle de l'ancien rendu (embed classique +
  // menu en dessous du panneau), uniquement pour la comparaison visuelle.
  const avantRecap = `<div style="background:#2b2d31;border:1px solid #1e1f22;border-radius:8px;padding:12px 14px;margin:2px 0">
    <div style="font-size:15px;font-weight:700;color:#f2f3f5;margin-bottom:8px">📔 Récapitulatif — Ticket #7 · 🎫 Support</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;font-size:13px;color:#dbdee1">
      <div><div style="font-weight:600;color:#f2f3f5">👤 Ouvert par</div>@Alice<br><code style="font-size:11px">Alice#0001</code></div>
      <div><div style="font-weight:600;color:#f2f3f5">🖐️ Pris en charge par</div>@Bob<br><code style="font-size:11px">Bob#0002</code></div>
      <div><div style="font-weight:600;color:#f2f3f5">🔒 Fermé par</div>@Moderateur<br><code style="font-size:11px">Moderateur#0001</code></div>
    </div>
    <div style="font-size:13px;color:#dbdee1;margin-top:8px"><div style="font-weight:600;color:#f2f3f5">📝 Raison d'ouverture</div>Je n'arrive plus à me connecter…</div>
    <div style="font-size:13px;color:#dbdee1;margin-top:6px"><div style="font-weight:600;color:#f2f3f5">🔐 Raison de fermeture</div>Problème résolu…</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;font-size:13px;color:#dbdee1;margin-top:8px">
      <div><div style="font-weight:600;color:#f2f3f5">⏱️ Durée</div>1 h 15 min</div>
      <div><div style="font-weight:600;color:#f2f3f5">💬 Messages</div>24</div>
      <div><div style="font-weight:600;color:#f2f3f5">⭐ Évaluation</div>En attente…</div></div>
    <div style="font-size:11.5px;color:#949ba4;margin-top:10px">Serveur de Hoxera · Journal des tickets</div>
  </div>
  <div style="color:#80848e;font-size:12px;margin-top:8px;text-align:center">⚠️ aucun séparateur — les blocs se touchent</div>`;

  const avantRating = `<div style="color:#dbdee1;font-size:13px;margin:2px 0 8px">❌ <em>Après le clic sur les étoiles :</em> Discord <strong>rejette</strong> la mise à jour
    (<code style="background:#2b2d31;padding:1px 4px;border-radius:4px">content</code> interdit sur un message V2) → le bot bascule sur une réponse éphémère
    et <strong style="color:#f04747">le panneau reste affiché</strong> avec ses 5 boutons.</div>${drawPayload(ratingDm)}`;

  const avantRoom = `<div style="color:#dbdee1;font-size:14px;margin:2px 0">🎫 <strong>Support</strong> · @Alice · @staff</div>
  <div style="background:#2b2d31;border:1px solid #1e1f22;border-radius:8px;padding:12px 14px;margin:2px 0">
    <div style="font-size:15px;font-weight:700;color:#f2f3f5">🎫 Ticket ouvert</div>
    <div style="font-size:13.5px;color:#dbdee1;margin:6px 0">Bonjour @Alice, merci d'avoir ouvert un ticket…<br><br>Un membre du staff va te répondre.</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:13px;color:#dbdee1;margin-top:6px">
      <div><div style="font-weight:600;color:#f2f3f5">Type de ticket</div>🎫 Support</div>
      <div><div style="font-weight:600;color:#f2f3f5">Équipe en charge</div>@staff</div></div>
    <div style="font-size:13px;color:#dbdee1;margin-top:6px"><div style="font-weight:600;color:#f2f3f5">Votre demande</div>Je n'arrive plus à me connecter…</div>
  </div>
  <div style="background:#1e1f22;border:1px solid #3f4147;border-radius:4px;padding:9px;width:100%;max-width:420px;margin-top:8px;color:#949ba4;font-size:13.5px">⚙️ Actions du staff — gérer ce ticket…</div>
  <div style="color:#80848e;font-size:12px;margin-top:8px;text-align:center">⚠️ message en 3 morceaux · menu EN DESSOUS du panneau · aucun séparateur</div>`;

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Hoxera v237 — aperçu des 3 corrections</title></head>
<body style="margin:0;padding:26px 20px 60px;background:#1e1f22;color:#dbdee1;font-family:'gg sans','Segoe UI',Helvetica,Arial,sans-serif">
<div style="max-width:1180px;margin:0 auto">
  <h1 style="font-size:21px;color:#f2f3f5;margin:0 0 6px">Hoxera — v237 : les 3 corrections tickets</h1>
  <p style="font-size:13.5px;color:#949ba4;margin:0 0 24px;line-height:1.55">
    Rendu généré à partir du <strong style="color:#dbdee1">vrai code</strong> (server/discord/panels.js + ui.js), pas d'une maquette.
    Le panneau de droite est ce que Discord affichera une fois la v237 en ligne.
    ${fb ? '<strong style="color:#f04747">/!\\ le repli éphémère a été atteint dans ce rendu.</strong>' : ''}
  </p>
  ${card(1, 'Récapitulatif du journal des tickets',
    "C'était un embed construit à la main, jamais passé par le système de panneaux : <strong style='color:#dbdee1'>aucun séparateur</strong>. Il est maintenant en Components V2, avec un séparateur natif pleine largeur entre chaque bloc — et le bouton « transcription » est rentré dans le panneau.",
    avantRecap, drawPayload(recap))}
  ${card('1 bis', 'Le même récapitulatif, APRÈS la note du membre',
    "Avant, la note s'écrivait en relisant <code style='background:#2b2d31;padding:1px 4px;border-radius:4px'>msg.embeds[0].fields</code> — impossible sur un conteneur V2. Le bloc « ⭐ Évaluation » est donc isolé, et le bot remplace uniquement ce bloc : tout le reste du panneau est conservé à l'identique.",
    '', drawPayload(rated))}
  ${card(2, "Le MP d'évaluation ne reste plus affiché",
    "<strong style='color:#f04747'>Le vrai bug.</strong> Après le clic sur les étoiles, Discord rejetait la mise à jour : le panneau restait là avec ses 5 boutons. Il est maintenant <strong style='color:#dbdee1'>remplacé</strong> par une courte confirmation, au même format.",
    avantRating, drawPayload(confirm))}
  ${card(3, 'Le salon privé du ticket',
    "Le message partait en 3 morceaux (texte + embed + menu en dessous). C'est maintenant <strong style='color:#dbdee1'>un seul panneau</strong> : la première ligne (type + créateur + ping staff) en tête, le menu « ⚙️ Actions du staff » <strong style='color:#dbdee1'>à l'intérieur</strong>, et des séparateurs natifs entre les blocs — comme tu l'as demandé.",
    avantRoom, drawPayload(roomWelcome))}
  <p style="font-size:12px;color:#80848e;margin-top:26px;line-height:1.6">
    Généré par <code style="background:#2b2d31;padding:1px 4px;border-radius:4px">scripts/gen-apercu-v237.js</code> —
    les panneaux de droite sont les payloads réels renvoyés par le code.
    Les séparateurs y sont des <code style="background:#2b2d31;padding:1px 4px;border-radius:4px">Separator</code> natifs (type 14, pleine largeur) :
    aucun caractère <code style="background:#2b2d31;padding:1px 4px;border-radius:4px">━</code> n'est utilisé.
  </p>
</div></body></html>`;

  const out = '/home/user/apercu-v237.html';
  fs.writeFileSync(out, html);
  try { store.db.close(); } catch {}
  fs.rmSync(process.env.BOTDEV_DATA_DIR, { recursive: true, force: true });
  console.log('OK — ' + out + ' écrit (' + html.length + ' octets)');
})().catch((e) => { console.error('❌', e); process.exit(1); });
