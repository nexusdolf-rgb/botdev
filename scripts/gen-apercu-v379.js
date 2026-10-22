#!/usr/bin/env node
// ============================================================
// Aperçu v379 — cartes du salon de ticket d'Optimus Prime
// ------------------------------------------------------------
// Ce script ne redessine RIEN à la main : il fait tourner les VRAIES
// fonctions de panels.js (carte du ticket, ajout/retrait de membre,
// confirmation de fermeture, compte à rebours, transcription) avec des
// interactions simulées, récupère les payloads Components V2 exacts, puis
// les rend dans une page qui imite Discord (thème sombre, mobile 393 px).
//
//   node scripts/gen-apercu-v379.js
//   → apercu-v379-salon-ticket-mobile.png / -desktop.png
// ============================================================
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hx-v379-apercu-'));
process.env.BOTDEV_DATA_DIR = DATA_DIR;

const store = require('../server/db');
const panels = require('../server/discord/panels');
const ui = require('../server/discord/ui');

const BOT = store.bots.create({
  user_id: store.users.create('discord:apercu@x', 'x', {}),
  name: 'Optimus Prime', token: 'T', client_id: '1', prefix: '!',
});
const GUILD = 'GAPER';
const STAFF = '200000000000000002';
const OPENER = '200000000000000001';
const TICKET_ID = '300000000000000001';
const LOGS_ID = '300000000000000009';

// ---------- Serveur factice ----------
const messages = [];
const logsMessages = [];
const progress = { edited: null, edit: async (p) => { progress.edited = p; return {}; } };

const mkMember = (id, username, display) => ({
  id,
  nickname: null,
  displayName: display || username,
  user: { id, username, tag: `${username}#0001`, displayAvatarURL: () => '' },
  toString: () => `<@${id}>`,
});
const members = new Map([
  [OPENER, mkMember(OPENER, 'fox', 'Fox')],
  [STAFF, mkMember(STAFF, 'marie', 'Marie')],
]);

const overwrites = new Map();
const mkOverwrite = (view) => ({
  type: 1,
  allow: { has: (bit) => view && String(bit) === 'ViewChannel' },
  deny: { has: () => false },
});

const ticketChannel = {
  id: TICKET_ID,
  name: 'ticket-11',
  topic: 'Ticket #11 de Fox#0001 | 200000000000000001 | Test',
  isTextBased: () => true,
  permissionOverwrites: {
    cache: overwrites,
    edit: async (id) => overwrites.set(String(id), mkOverwrite(true)),
    delete: async (id) => overwrites.delete(String(id)),
  },
  permissionsFor: () => ({ has: () => true }),
  messages: { fetch: async () => new Map() },
  send: async (p) => { messages.push(p); return progress; },
  delete: async () => {},
};
const logsChannel = {
  id: LOGS_ID, name: 'logs', isTextBased: () => true,
  send: async (p) => { logsMessages.push(p); return {}; },
};
const guild = {
  id: GUILD, name: 'Optimus Prime', ownerId: 'OWNER',
  roles: { cache: { get: (id) => (id === 'R1' ? { id: 'R1', name: 'Staff' } : null), find: (fn) => [{ id: 'R1', name: 'Staff' }].find(fn), has: () => true } },
  channels: {
    cache: {
      get: (id) => (id === TICKET_ID ? ticketChannel : (id === LOGS_ID ? logsChannel : null)),
      find: (fn) => [ticketChannel, logsChannel].find(fn),
      values: () => [ticketChannel, logsChannel].values(),
    },
    create: async () => ticketChannel,
  },
  members: { cache: members, fetch: async (id) => members.get(String(id)) || null },
};

function withPredicates(obj, which) {
  const base = {
    ...obj,
    isChatInputCommand: () => which === 'chat',
    isButton: () => which === 'button',
    isStringSelectMenu: () => which === 'select',
    isUserSelectMenu: () => which === 'userSelect',
    isAnySelectMenu: () => which === 'select' || which === 'userSelect',
    isModalSubmit: () => which === 'modal',
    isRepliable: () => true,
    deferred: false,
    replied: false,
  };
  return new Proxy(base, {
    get: (target, prop) => {
      if (prop in target) return target[prop];
      if (typeof prop === 'string' && /^is[A-Z]/.test(prop)) return () => false;
      return undefined;
    },
  });
}

function mkInteraction(which, { customId = '', values = [], value = '', user = STAFF } = {}) {
  const proxy = withPredicates({
    customId, values, guild,
    channel: ticketChannel,
    user: { id: user, tag: `${user}#0001`, username: user, bot: false },
    member: { user: { id: user }, roles: { cache: { has: (id) => id === 'R1' } }, permissions: { has: () => false } },
    client: { user: { id: 'BOTID' }, users: { fetch: async (id) => ({ id, send: async () => ({}), displayAvatarURL: () => '' }) } },
    fields: { getTextInputValue: () => value },
    options: { getString: () => null, getUser: () => null, getSubcommand: () => null },
    modals: [],
  }, which);
  proxy.reply = async (p) => { proxy.replied = p; return {}; };
  proxy.editReply = async (p) => { proxy.edited = p; return {}; };
  proxy.update = async (p) => { proxy.updated = p; return {}; };
  proxy.followUp = async () => ({});
  proxy.deferReply = async () => { proxy.deferred = true; };
  proxy.deferUpdate = async () => { proxy.deferredUpdate = true; };
  proxy.showModal = async (m) => { proxy.modal = m; proxy.modals.push(m); };
  return proxy;
}

(async () => {
  store.settings.set('public_url', 'https://hoxera.is-a.dev');
  store.tickets.set(BOT, GUILD, {
    support_role: 'Staff',
    types: JSON.stringify([{ label: 'Test', emoji: '🧠', description: '', staff_roles: [] }]),
    require_reason: 0,
  });
  store.guildSettings.set(BOT, GUILD, { log_channel: LOGS_ID, ticket_log_channel: '' });
  store.openTickets.add(BOT, GUILD, {
    channel_id: TICKET_ID, number: 11, opener_id: OPENER,
    opener_tag: 'Fox#0001', open_reason: 'Connexion impossible', type_label: 'Test',
  });
  overwrites.set(OPENER, mkOverwrite(true));

  const opener = members.get(OPENER);
  const chosen = { label: 'Test', emoji: '🧠', description: '', staff_roles: [] };
  const reason = 'Bonjour Mr j’arrive pas j’ai gros problème de me connecter en jeu je crois que j’ai perdu mon mot de passe si vous pouvez m’aider svp je suis bloqué';

  const scenes = [];

  // 1. Carte à l'ouverture
  scenes.push({
    kind: 'message',
    label: '1. À l’ouverture du ticket',
    payload: panels.ticketWelcomePanel(opener, chosen, '<@&400000000000000001>', reason, '', [], 'fr', { number: 11 }, {},
      { rows: panels.__testStaffTicketRows(BOT, false, 'fr') }),
    time: '22:59',
  });

  // 2. Carte après prise en charge (même message, bouton grisé)
  scenes.push({
    kind: 'message',
    label: '2. Après « Pris en charge » : même carte, bouton grisé',
    payload: panels.ticketWelcomePanel(members.get(OPENER), chosen, '<@&400000000000000001>', reason, '', [], 'fr', { number: 11 }, {},
      { rows: panels.__testStaffTicketRows(BOT, true, 'fr'), claimedBy: STAFF }),
    time: '22:59',
  });

  // 3. Prise en charge : annonce
  const claimI = mkInteraction('button', { customId: `bd-tmenu:${BOT}:claim` });
  claimI.message = {
    id: 'MSG-CARD',
    components: [
      { type: 17, components: [
        { type: 10, content: '## 🎫 Ticket #11' },
        { type: 14, divider: true },
        { type: 10, content: `👤 **Ouvert par :** <@${OPENER}>\n⏳ **Statut :** en attente` },
        { type: 1, components: [{ type: 2, custom_id: `bd-tmenu:${BOT}:claim`, style: 1, label: '🖐️ Pris en charge' }] },
      ] },
    ],
    toJSON() { return this.components; },
    edit: async () => ({}),
  };
  await panels.dispatchPanels(BOT, claimI);
  const announce = messages.find((m) => JSON.stringify(m).includes('Ticket pris en charge'));
  scenes.push({ kind: 'message', label: '3. Annonce de prise en charge', payload: announce, time: '23:00' });

  // 4. Ajouter un membre
  const addAsk = mkInteraction('select', { customId: `bd-troom:${BOT}`, values: ['addmember'] });
  await panels.dispatchPanels(BOT, addAsk);
  scenes.push({ kind: 'ephemeral', label: '4. « Ajouter un membre » (visible par le staff seul)', payload: addAsk.replied, time: '23:05' });
  // Le sélecteur natif est l'interface de Discord elle-même (pas un panneau du
  // bot) : on le montre pour permettre la comparaison avec la capture.
  scenes.push({ kind: 'picker', label: '4b. Le sélecteur natif de Discord, une fois ouvert', time: '23:05' });

  // 5. Retirer un membre — liste vide
  const removeEmpty = mkInteraction('select', { customId: `bd-troom:${BOT}`, values: ['removemember'] });
  await panels.dispatchPanels(BOT, removeEmpty);
  scenes.push({ kind: 'ephemeral', label: '5. « Retirer un membre » : aucun membre ajouté', payload: removeEmpty.replied, time: '23:06' });

  // 6. Confirmation de fermeture
  const closeAsk = mkInteraction('select', { customId: `bd-troom:${BOT}`, values: ['close'] });
  await panels.dispatchPanels(BOT, closeAsk);
  const closeModal = mkInteraction('modal', { customId: `bd-tcls:${BOT}`, value: 'Ticket été fermé' });
  await panels.dispatchPanels(BOT, closeModal);
  scenes.push({ kind: 'ephemeral', label: '6. Confirmation de fermeture (staff seul)', payload: closeModal.replied, time: '23:07' });

  // 7. Fermeture confirmée : en cours, puis compte à rebours
  const confirm = mkInteraction('button', { customId: `bd-tclsok:${BOT}` });
  const realSetTimeout = global.setTimeout;
  global.setTimeout = () => 0;
  await panels.dispatchPanels(BOT, confirm);
  global.setTimeout = realSetTimeout;
  scenes.push({ kind: 'ephemeral', label: '7a. La carte de confirmation devient « Fermeture en cours… »', payload: confirm.edited, time: '23:07' });
  scenes.push({ kind: 'message', label: '7b. Message public : compte à rebours de 5 secondes', payload: progress.edited, time: '23:07' });

  // 8. Transcription déposée dans le salon de logs
  const logs = logsMessages.find((m) => JSON.stringify(m).includes('Transcription'));
  scenes.push({ kind: 'message', label: '8. Salon de logs : transcription déposée', payload: logs, time: '23:07' });

  // ---------- Rendu HTML ----------
  const NAMES = [[OPENER, 'Fox'], [STAFF, 'Marie'], ['BOTID', 'Optimus Prime']];
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const inline = (s) => {
    let out = esc(s);
    out = out.replace(/&lt;@&amp;(\d+)&gt;/g, () => `<span class="mention role">@Staff</span>`);
    out = out.replace(/&lt;@!?(\d+)&gt;/g, (m, id) => {
      const name = (NAMES.find(([n]) => n === id) || [null, 'membre'])[1];
      return `<span class="mention">@${name}</span>`;
    });
    out = out.replace(/&lt;#(\d+)&gt;/g, `<span class="mention">#salon</span>`);
    out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
    out = out.replace(/\*(.+?)\*/g, '<em>$1</em>');
    return out;
  };

  const renderText = (content) => {
    const lines = String(content || '').split('\n');
    const html = [];
    let quote = [];
    let code = null;                 // lignes d'un bloc ``` … ```
    const flushQuote = () => {
      if (!quote.length) return;
      html.push(`<blockquote>${quote.map((q) => `<div>${inline(q)}</div>`).join('')}</blockquote>`);
      quote = [];
    };
    const flushCode = () => {
      if (code === null) return;
      html.push(`<pre class="code">${esc(code.join('\n'))}</pre>`);
      code = null;
    };
    for (const line of lines) {
      if (code !== null) {
        if (line.trim() === '```') flushCode();
        else code.push(line);
        continue;
      }
      if (line.trim() === '```') { flushQuote(); code = []; continue; }
      if (line.startsWith('> ') || line === '>') {
        quote.push(line.replace(/^>\s?/, ''));
        continue;
      }
      flushQuote();
      if (!line.trim()) { html.push('<div class="blank"></div>'); continue; }
      if (line.startsWith('# ')) { html.push(`<h1>${inline(line.slice(2))}</h1>`); continue; }
      if (line.startsWith('## ')) { html.push(`<h2>${inline(line.slice(3))}</h2>`); continue; }
      if (line.startsWith('### ')) { html.push(`<h3>${inline(line.slice(4))}</h3>`); continue; }
      if (line.startsWith('-# ')) { html.push(`<div class="subtext">${inline(line.slice(3))}</div>`); continue; }
      html.push(`<div>${inline(line)}</div>`);
    }
    flushQuote();
    flushCode();
    return html.join('');
  };

  const buttonHtml = (b) => {
    const styles = { 1: 'primary', 2: 'secondary', 3: 'success', 4: 'danger', 5: 'link' };
    const cls = `btn ${styles[Number(b.style)] || 'secondary'}${b.disabled ? ' disabled' : ''}`;
    const label = esc(b.label || '');
    return `<div class="${cls}">${label}</div>`;
  };
  const selectHtml = (s, isUser) => `
    <div class="select">
      <span class="ph">${esc(s.placeholder || '')}</span>
      <span class="chev">›</span>
    </div>`;

  const renderComponent = (c) => {
    const t = Number(c.type);
    if (t === 17) {
      return `<div class="container">${(c.components || []).map(renderComponent).join('')}</div>`;
    }
    if (t === 10) return `<div class="text">${renderText(c.content)}</div>`;
    if (t === 14) return '<hr class="divider" />';
    if (t === 1) {
      const kids = c.components || [];
      const isSelect = kids.some((k) => [3, 5, 6, 7, 8].includes(Number(k.type)));
      return `<div class="row${isSelect ? ' row-select' : ''}">${kids.map((k) => renderComponent(k)).join('')}</div>`;
    }
    if (t === 2) return buttonHtml(c);
    if (t === 3) return selectHtml(c, false);
    if (t === 5) return selectHtml(c, true);
    if (t === 13) {
      const url = String((c.file && c.file.url) || c.url || '').replace('attachment://', '');
      const name = url.split('/').pop();
      return `<div class="file"><span class="file-ico">📄</span><span>${esc(name)}<span class="file-size"> · 12 Ko</span></span></div>`;
    }
    return '';
  };

  const avatarPath = path.join(__dirname, '..', 'public', 'icons', 'optimus-photo.png');
  const avatar = fs.existsSync(avatarPath)
    ? `data:image/png;base64,${fs.readFileSync(avatarPath).toString('base64')}`
    : '';

  // Les payloads contiennent des BUILDERS discord.js : on les sérialise en JSON
  // (les builders exposent toJSON), sinon le rendu ne voit aucun composant.
  const normalise = (payload) => {
    const p = payload || {};
    let components = [];
    try { components = JSON.parse(JSON.stringify(p.components || [])).map((c) => c); } catch { components = []; }
    return { flags: p.flags, components };
  };

  const PICKER = [
    { name: 'One Assist', tag: 'oneassist#1543', app: true, color: '#5865f2', initial: 'O', checked: false },
    { name: 'Fox', tag: 'zedzed_karacho', app: false, color: '#ed4245', initial: 'F', checked: false },
    { name: 'Optimus Prime', tag: 'optimusprime#2500', app: true, color: '#3ba55d', initial: 'O', checked: false },
    { name: 'Douma', tag: 'douma0319', app: false, color: '#faa61a', initial: 'D', checked: false },
  ];
  const pickerSheet = () => `
    <div class="sheet">
      <div class="sheet-grab"></div>
      <div class="sheet-head">
        <div class="sheet-titles">
          <div class="sheet-title">👥 Choisis le(s) membre(s) à ajouter</div>
          <div class="sheet-sub">Sélectionne au moins 1</div>
        </div>
        <div class="sheet-done">Sélectionner</div>
      </div>
      <div class="sheet-search">🔍 Rechercher</div>
      <div class="sheet-list">
        ${PICKER.map((m) => `
          <div class="sheet-row">
            <div class="sheet-avatar" style="background:${m.color}">${m.initial}</div>
            <div class="sheet-id">
              <div class="sheet-name">${m.name}${m.app ? '<span class="tag">APP</span>' : ''}</div>
              <div class="sheet-tag">${m.tag}</div>
            </div>
            <div class="sheet-check"></div>
          </div>`).join('')}
      </div>
    </div>`;

  const sceneHtml = (sc) => {
    if (sc.kind === 'picker') {
      return `
      <section class="scene">
        <div class="scene-label">${esc(sc.label)}</div>
        ${pickerSheet()}
      </section>`;
    }
    const payload = normalise(sc.payload);
    const app = (Number(payload.flags) & 64) !== 0
      ? '<span class="tag">APP</span><span class="ephem">Toi seul(e) peux voir celui-ci</span>'
      : '<span class="tag">APP</span>';
    const body = (payload.components || []).map(renderComponent).join('');
    // Mobile : la carte occupe toute la largeur, l'auteur est au-dessus (comme
    // sur les captures Discord Android). Bureau : l'avatar reste dans la marge.
    return `
      <section class="scene">
        <div class="scene-label">${esc(sc.label)}</div>
        <div class="msg msg-mobile">
          <div class="meta"><img class="avatar" src="${avatar}" alt="" /><span class="author">Optimus Prime</span>${app}<span class="time">${sc.time}</span></div>
          <div class="bubble">${body}</div>
        </div>
        <div class="msg msg-desktop">
          <img class="avatar" src="${avatar}" alt="" />
          <div class="bubble">
            <div class="meta"><span class="author">Optimus Prime</span>${app}<span class="time">${sc.time}</span></div>
            ${body}
          </div>
        </div>
      </section>`;
  };

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>Aperçu v379 — salon de ticket</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #313338; color: #dbdee1;
    font-family: "gg sans", "Noto Sans", "Helvetica Neue", Arial, sans-serif; font-size: 16px; line-height: 1.375; }
  .wrap { max-width: 760px; margin: 0 auto; padding: 12px 16px 40px; }
  .head { display: flex; align-items: center; gap: 8px; color: #949ba4; font-size: 13px; margin-bottom: 14px; }
  .head b { color: #f2f3f5; font-weight: 600; }
  .scene { margin-bottom: 26px; }
  .scene-label { font-size: 11.5px; letter-spacing: .06em; text-transform: uppercase; color: #8b8f96; margin: 0 0 6px 6px; }
  .msg { display: flex; gap: 12px; align-items: flex-start; }
  .msg-desktop { display: none; }
  .msg-mobile { flex-direction: column; gap: 4px; align-items: stretch; }
  .msg-mobile .meta { padding-left: 2px; }
  @media (min-width: 768px) {
    .wrap { padding: 18px 12px 40px; }
    .msg-desktop { display: flex; }
    .msg-mobile { display: none; }
  }
  .avatar { width: 40px; height: 40px; border-radius: 50%; flex: 0 0 40px; object-fit: cover; background: #1e1f22; }
  .bubble { flex: 1; min-width: 0; }
  .meta { display: flex; align-items: center; gap: 6px; margin-bottom: 5px; flex-wrap: wrap; }
  .author { color: #f2f3f5; font-weight: 600; }
  .tag { background: #5865f2; color: #fff; font-size: 10px; font-weight: 700; border-radius: 3px; padding: 1px 4px; letter-spacing: .02em; }
  .time { color: #949ba4; font-size: 12px; }
  .ephem { color: #949ba4; font-size: 11.5px; border: 1px solid #4e5058; border-radius: 10px; padding: 0 7px; }
  .container { background: #2b2d31; border-radius: 8px; padding: 16px; }
  .text { font-size: 16px; color: #dbdee1; }
  .text strong { color: #f2f3f5; font-weight: 700; }
  .text code { background: #1e1f22; border-radius: 3px; padding: 0 4px; font-family: ui-monospace, Menlo, monospace; font-size: 13px; }
  h1 { font-size: 24px; line-height: 1.25; margin: 2px 0 4px; color: #f2f3f5; font-weight: 700; }
  h2 { font-size: 20px; line-height: 1.25; margin: 2px 0 4px; color: #f2f3f5; font-weight: 700; }
  h3 { font-size: 16px; line-height: 1.25; margin: 2px 0 4px; color: #f2f3f5; font-weight: 700; }
  .container h3:first-child { margin-top: 0; }
  .subtext { font-size: 12px; color: #949ba4; margin-top: 4px; }
  blockquote { margin: 6px 0 2px; padding: 2px 0 2px 12px; border-left: 4px solid #4e5058; }
  pre.code { margin: 6px 0 2px; padding: 8px 10px; background: #1e1f22; border: 1px solid #2b2d31; border-radius: 4px;
    font-family: ui-monospace, "Consolas", "Menlo", monospace; font-size: 13.5px; line-height: 1.35;
    color: #dbdee1; white-space: pre-wrap; word-break: break-word; }
  blockquote div { color: #dbdee1; }
  .blank { height: 8px; }
  .divider { border: 0; border-top: 1px solid #3f4147; margin: 10px 0; }
  .row { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
  .row-select { flex-direction: column; }
  .btn { border-radius: 3px; padding: 9px 16px; font-size: 15px; font-weight: 600; color: #fff; display: inline-flex; align-items: center; gap: 6px; }
  .btn.primary { background: #5865f2; }
  .btn.secondary { background: #4e5058; }
  .btn.success { background: #248046; }
  .btn.danger { background: #da373c; }
  .btn.link { background: #4e5058; color: #00a8fc; }
  .btn.disabled { opacity: .5; }
  .select { background: #1e1f22; border: 1px solid #111214; border-radius: 8px; padding: 10px 12px;
    display: flex; align-items: center; justify-content: space-between; color: #949ba4; font-size: 15px; width: 100%; }
  .select .chev { color: #b5bac1; font-size: 18px; line-height: 1; }
  .mention { background: rgba(88,101,242,.3); color: #c9cdfb; border-radius: 3px; padding: 0 3px; font-weight: 500; }
  .mention.role { color: #c9cdfb; }
  .file { margin-top: 10px; background: #1e1f22; border: 1px solid #3f4147; border-radius: 8px; padding: 10px 12px; font-size: 13px; color: #dbdee1; display: flex; gap: 8px; align-items: center; }
  .file-ico { font-size: 16px; }
  .file-size { color: #949ba4; }
  .sheet { background: #2b2d31; border-radius: 14px; padding: 10px 12px 16px; border: 1px solid #1e1f22; }
  .sheet-grab { width: 42px; height: 4px; border-radius: 2px; background: #4e5058; margin: 2px auto 12px; }
  .sheet-head { display: flex; align-items: flex-start; gap: 10px; }
  .sheet-titles { flex: 1; }
  .sheet-title { font-size: 17px; font-weight: 700; color: #f2f3f5; }
  .sheet-sub { font-size: 12.5px; color: #b5bac1; margin-top: 2px; }
  .sheet-done { background: #4e5058; color: #fff; border-radius: 6px; font-size: 12.5px; font-weight: 600; padding: 6px 10px; }
  .sheet-search { margin: 12px 0 10px; background: #1e1f22; border: 1px solid #3f4147; border-radius: 8px; padding: 10px 12px; color: #949ba4; font-size: 13px; }
  .sheet-row { display: flex; align-items: center; gap: 10px; padding: 9px 2px; border-top: 1px solid #3f4147; }
  .sheet-row:first-child { border-top: 0; }
  .sheet-avatar { width: 32px; height: 32px; border-radius: 50%; color: #fff; font-weight: 700; font-size: 13px; display: flex; align-items: center; justify-content: center; }
  .sheet-id { flex: 1; min-width: 0; }
  .sheet-name { color: #f2f3f5; font-weight: 600; font-size: 14px; display: flex; align-items: center; gap: 6px; }
  .sheet-tag { color: #949ba4; font-size: 12px; }
  .sheet-check { width: 18px; height: 18px; border-radius: 4px; border: 2px solid #6d6f78; }
  .foot { color: #949ba4; font-size: 12px; margin-top: 26px; }
</style>
</head>
<body>
  <div class="wrap">
    <div class="head"><b># ticket-11</b><span>· Optimus Prime · aperçu v379</span></div>
    ${scenes.map(sceneHtml).join('')}
    <div class="foot">Aperçu généré par scripts/gen-apercu-v379.js — les cartes sont celles que le bot enverra, pas une maquette.</div>
  </div>
</body>
</html>`;

  const outHtml = path.join(__dirname, '..', '..', 'apercu-v379-salon-ticket.html');
  fs.writeFileSync(outHtml, html, 'utf8');
  fs.writeFileSync('/tmp/apercu-v379.html', html, 'utf8');
  console.log('HTML →', outHtml);

  // ---------- Captures ----------
  let chromium;
  try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('playwright-core')); }
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--no-sandbox'],
  });
  const shots = [
    { name: 'apercu-v379-salon-ticket-mobile.png', width: 393, scale: 2 },
    { name: 'apercu-v379-salon-ticket-desktop.png', width: 900, scale: 1.5 },
  ];
  for (const shot of shots) {
    const page = await browser.newPage({ viewport: { width: shot.width, height: 900 }, deviceScaleFactor: shot.scale });
    await page.goto('file:///tmp/apercu-v379.html', { waitUntil: 'load' });
    await page.waitForTimeout(150);
    const file = path.join(__dirname, '..', '..', shot.name);
    await page.screenshot({ path: file, fullPage: true });
    console.log('PNG →', file);
    await page.close();
  }
  await browser.close();

  try { store.db.close(); } catch {}
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
})().catch((e) => { console.error('❌', e); process.exit(1); });
