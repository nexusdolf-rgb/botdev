// ============================================================================
// Aperçu HTML du rendu v238 — les 2 demandes utilisateur sur les tickets :
//   1. pied de page du salon privé sans le lien du dashboard ni l'heure ;
//   2. système « ➕ Ajouter un membre » rendu professionnel.
//
// Les panneaux de droite sont les payloads RÉELS produits par server/discord/
// panels.js — pas une maquette. Styles inline, zéro ressource externe.
//
//   node scripts/gen-apercu-v238.js   →  /home/user/apercu-v238.html
// ============================================================================
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.NODE_ENV = 'test';
process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hx-apercu238-'));

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const store = require('../server/db');
const ui = require('../server/discord/ui');
const panels = require('../server/discord/panels');
const i18n = require('../server/i18n');
const { drawPayload, drawModal, page, compare, esc } = require('./lib/discord-preview');

const BOT = store.bots.create({ user_id: store.users.create('discord:ap238@x', 'x', {}), name: 'Hoxera', token: 'T', client_id: '1', prefix: '!' });
const GUILD = 'G-APERCU';
const STAFF = 'STAFF1';

const mkMember = (id, username, opts = {}) => ({
  id,
  nickname: opts.nickname || null,
  displayName: opts.displayName || opts.nickname || username,
  user: { id, username, globalName: opts.globalName || null, tag: `${username}#0001`, displayAvatarURL: () => `https://cdn.discordapp.com/${username}.png` },
});
const MEMBERS = [
  mkMember('100000000000000001', 'alice', { globalName: 'Alice Martin', nickname: 'Alice 🌸' }),
  mkMember('100000000000000003', 'charlie'),
  mkMember('100000000000000004', 'alicia'),
];
const findMember = (id) => MEMBERS.find((m) => m.id === id) || null;
const guild = {
  id: GUILD, name: 'Serveur de Hoxera', ownerId: STAFF, iconURL: () => null,
  members: {
    cache: { get: findMember, values: () => MEMBERS.values(), find: (fn) => MEMBERS.find(fn) },
    fetch: async (arg) => {
      if (typeof arg === 'string') { const m = findMember(arg); if (!m) throw new Error('Unknown Member'); return m; }
      return { values: () => MEMBERS.values() };
    },
  },
  channels: { cache: { get: () => null, find: () => null } },
  roles: { cache: { find: () => null, has: () => false } },
};
const channel = { id: 'CT', name: 'ticket-alice', isTextBased: () => true, permissionOverwrites: { edit: async () => ({}) } };
const mkI = (value, extra = {}) => {
  const out = { guild, channel, values: [], member: { permissions: { has: () => true }, roles: { cache: new Map() } }, user: { id: STAFF, tag: 'Staff#0001' }, ...extra };
  out.reply = async (p) => { out.replied = p; return {}; };
  out.update = async (p) => { out.updated = p; return {}; };
  out.showModal = async (m) => { out.modal = m; return {}; };
  out.fields = { getTextInputValue: () => value };
  return out;
};
const withPredicates = (obj, which) => new Proxy({
  ...obj,
  isChatInputCommand: () => which === 'chat', isButton: () => which === 'button',
  isStringSelectMenu: () => which === 'select', isAnySelectMenu: () => which === 'select',
  isSelectMenu: () => which === 'select', isModalSubmit: () => which === 'modal',
  isRepliable: () => true, deferred: false, replied: false,
}, { get: (t, p) => (p in t ? t[p] : (typeof p === 'string' && /^is[A-Z]/.test(p) ? () => false : undefined)) });

const armPending = async (i) => { await panels.dispatchPanels(BOT, withPredicates({ ...i, customId: `bd-tmenu:${BOT}:addmember` }, 'button')); };

(async () => {
  store.settings.set('public_url', 'https://hoxera.is-a.dev');

  // ── 1. Pied de page du salon privé ──
  const member = { id: 'u1', user: { id: 'u1', username: 'Alice', displayAvatarURL: () => 'https://cdn/a.png' }, toString: () => '@Alice', guild };
  const chosen = { label: 'Support', emoji: '🎫', description: 'Pour toute demande générale.', staff_roles: [], color: '#5865F2' };
  const staffRow = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
    .setCustomId(`bd-troom:${BOT}`).setPlaceholder('⚙️ Actions du staff — gérer ce ticket…')
    .addOptions(
      new StringSelectMenuOptionBuilder().setLabel('🖐️ Prendre en charge').setValue('claim'),
      new StringSelectMenuOptionBuilder().setLabel('➕ Ajouter un membre').setValue('addmember'),
      new StringSelectMenuOptionBuilder().setLabel('🗑 Supprimer définitivement').setValue('delete'),
    ));
  const welcome = panels.ticketWelcomePanel(member, chosen, '<@&R1>', 'Je n\'arrive plus à me connecter au dashboard.', '',
    [{ q: 'Urgence ?', a: 'Haute — bloquant' }], 'fr', { number: 12 }, {},
    { content: '🎫 **Support** · @Alice · @staff', rows: [staffRow] });

  const avantFooter = `<div style="background:#2b2d31;border:1px solid #1e1f22;border-radius:8px;padding:12px 14px;margin:2px 0">
    <div style="font-size:15px;font-weight:700;color:#f2f3f5">🎫 Ticket ouvert</div>
    <div style="font-size:13.5px;color:#dbdee1;margin:6px 0">Bienvenue @Alice ! Un membre de l'équipe va te répondre ici même.</div>
    <div style="font-size:13px;color:#dbdee1"><div style="font-weight:600;color:#f2f3f5">🗂️ Type de ticket</div>🎫 Support</div>
    <div style="font-size:11.5px;color:#949ba4;margin-top:10px">Hoxera · Ticket #12 · <span style="color:#f04747;text-decoration:underline">hoxera.is-a.dev</span> · <span style="color:#f04747">05/09 22:03</span></div>
  </div>
  <div style="color:#80848e;font-size:12px;margin-top:8px;text-align:center">⚠️ lien du dashboard + heure en bas du panneau</div>`;

  // ── 2. Ajouter un membre : les 4 issues réelles ──
  const modal = drawModal(i18n.t('fr', 'ticket_add_modal_title'), i18n.t('fr', 'ticket_add_modal_label'), i18n.t('fr', 'ticket_add_modal_ph'), true);

  const iOk = mkI('charlie'); await armPending(iOk); await panels.__testSubmitAddMember(BOT, iOk);
  const iErr = mkI('zzz-introuvable'); await armPending(iErr); await panels.__testSubmitAddMember(BOT, iErr);
  const iAmb = mkI('ali'); await armPending(iAmb); await panels.__testSubmitAddMember(BOT, iAmb);
  const iPick = mkI('', { values: ['100000000000000004'] }); await panels.__testSubmitAddMemberPick(BOT, iPick);

  // Accès refusé par Discord (rôle du bot trop bas).
  const failingChannel = { id: 'CT', name: 'ticket-alice', isTextBased: () => true, permissionOverwrites: { edit: async () => { throw new Error('Missing Permissions'); } } };
  const iDeny = mkI('charlie', { channel: failingChannel }); await armPending(iDeny); await panels.__testSubmitAddMember(BOT, iDeny);

  const avantFlow = `<div style="font-size:13.5px;color:#dbdee1;line-height:1.6">
    <div style="background:#2b2d31;border-radius:6px;padding:10px 12px;margin-bottom:8px">
      <div style="font-size:12px;color:#949ba4;margin-bottom:4px">Fenêtre à remplir</div>
      <div style="background:#1e1f22;border-radius:3px;padding:8px;color:#6d6f78;font-size:13px">@membre ou identifiant</div>
    </div>
    <div style="color:#949ba4;font-size:12.5px;margin:10px 0 4px">Recherche : <strong style="color:#f2f3f5">pseudo exact uniquement</strong></div>
    <div style="color:#dbdee1;font-size:14px;margin:4px 0">✅ @Charlie a été ajouté au ticket.</div>
    <div style="color:#dbdee1;font-size:14px;margin:4px 0">❌ Membre introuvable. Donne une @mention ou un identifiant valide.</div>
    <div style="color:#80848e;font-size:12px;margin-top:12px;border-top:1px solid #2b2d31;padding-top:10px">
      • « Charlie » avec une majuscule → <strong style="color:#f04747">introuvable</strong><br>
      • « char » (début de pseudo) → <strong style="color:#f04747">introuvable</strong><br>
      • « ali » (2 membres) → <strong style="color:#f04747">introuvable</strong>, aucune proposition<br>
      • @mention collée → <strong style="color:#f04747">introuvable</strong><br>
      • succès annoncé <strong style="color:#f04747">même si Discord refuse</strong> l'accès<br>
      • message de succès <strong style="color:#f04747">visible par tout le salon</strong>
    </div></div>`;

  const apresFlow = `
    <div style="font-size:12px;color:#949ba4;font-weight:700;letter-spacing:.5px;margin:0 0 6px">1 · FENÊTRE À REMPLIR</div>
    ${modal}
    <div style="font-size:12px;color:#949ba4;font-weight:700;letter-spacing:.5px;margin:16px 0 6px">2 · ÇA MARCHE → PANNEAU DE CONFIRMATION</div>
    ${drawPayload(iOk.replied)}
    <div style="font-size:12px;color:#949ba4;font-weight:700;letter-spacing:.5px;margin:16px 0 6px">3 · PLUSIEURS MEMBRES CORRESPONDENT → MENU DE CHOIX</div>
    ${drawPayload(iAmb.replied)}
    <div style="font-size:12px;color:#949ba4;font-weight:700;letter-spacing:.5px;margin:16px 0 6px">4 · LE STAFF TRANCHE → LE MESSAGE EST REMPLACÉ</div>
    ${drawPayload(iPick.updated)}
    <div style="font-size:12px;color:#949ba4;font-weight:700;letter-spacing:.5px;margin:16px 0 6px">5 · INTROUVABLE → LE PANNEAU EXPLIQUE</div>
    ${drawPayload(iErr.replied)}
    <div style="font-size:12px;color:#949ba4;font-weight:700;letter-spacing:.5px;margin:16px 0 6px">6 · DISCORD REFUSE L'ACCÈS → ON LE DIT</div>
    ${drawPayload(iDeny.replied)}
    <div style="color:#80848e;font-size:12px;margin-top:14px;border-top:1px solid #2b2d31;padding-top:10px;line-height:1.6">
      Les 6 écrans sont <strong style="color:#dbdee1">éphémères</strong> : seul le staff qui agit les voit, le salon du membre reste propre.
    </div>`;

  const html = page(
    'Hoxera v238 — pied de page + ajout de membre',
    `Rendu généré à partir du <strong style="color:#dbdee1">vrai code</strong> (server/discord/panels.js + i18n.js), pas d'une maquette.
     Les séparateurs sont des <code style="background:#2b2d31;padding:1px 4px;border-radius:4px">Separator</code> natifs pleine largeur (type 14) —
     aucun caractère <code style="background:#2b2d31;padding:1px 4px;border-radius:4px">━</code>.`,
    compare(1, 'Pied de page du panneau — salon privé du ticket',
      "Le lien du dashboard (<code style='background:#2b2d31;padding:1px 4px;border-radius:4px'>public_url</code>) et l'horodatage sont retirés. Il ne reste que la signature. Le lien continue d'être utilisé là où il sert vraiment : la bannière du panneau public et le lien de transcription envoyé en MP.",
      avantFooter, drawPayload(welcome), 'APRÈS (v238)')
    + compare(2, 'Système « ➕ Ajouter un membre »',
      "La fenêtre à remplir est conservée (ton choix), mais la recherche devient tolérante et chaque réponse devient un vrai panneau. À gauche : tout ce que l'ancien système ratait.",
      avantFlow, apresFlow, 'APRÈS (v238) — les 6 écrans réels')
  );

  const out = '/home/user/apercu-v238.html';
  fs.writeFileSync(out, html);
  try { store.db.close(); } catch {}
  fs.rmSync(process.env.BOTDEV_DATA_DIR, { recursive: true, force: true });
  console.log('OK — ' + out + ' écrit (' + html.length + ' octets)');
  console.log('  pied de page réel : ' + JSON.stringify(require('../test/helpers/v2').footer(welcome)));
})().catch((e) => { console.error('❌', e); process.exit(1); });
