// Aperçu HTML — Embed du salon privé de ticket ALLÉGÉ (v220), depuis le vrai builder.
const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hx-wlc-'));
const store = require('../server/db');
const ui = require('../server/discord/ui');
const panels = require('../server/discord/panels');
const SEP = ui.SEPARATOR;

const uid = store.users.create('discord:ap@x', 'x', {});
const BOT = store.bots.create({ user_id: uid, name: 'Hoxera', token: 'T', client_id: '1', prefix: '!' });

const member = { id: 'u1', user: { username: 'Alice', displayAvatarURL: () => '' }, toString: () => '@Alice', guild: { name: 'Serveur de Hoxera' } };

// Cas 1 : défaut (pas de réglage salon) + raison + questionnaire.
const chosen = { label: 'Support', emoji: '🎫', color: '#57F287', description: 'Une question, un problème, une demande ?', staff_roles: [] };
const e1 = panels.ticketWelcomeEmbed(member, chosen, '<@&R1>', 'Ma commande n’est jamais arrivée…', '', [
  { q: 'Quel est ton pseudo en jeu ?', a: 'Alice_77' }, { q: 'Date de la commande ?', a: 'Le 2 septembre' },
], 'fr', { number: 12, prevCount: 2, openedAt: '2026-09-05T10:00:00Z' }, {}).toJSON();

// Cas 2 : « déroulement » personnalisé configuré → toujours affiché.
const e2 = panels.ticketWelcomeEmbed(member, { label: 'Support', emoji: '🎫', color: '#57F287', description: 'Une question ?', staff_roles: [] }, '<@&R1>', '', '', [], 'fr', { number: 13 }, { steps: '1️⃣ Le staff te répond sous 24 h.\n2️⃣ Ta demande est traitée dans ce salon.' }).toJSON();

const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function md(html) {
  return html
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<u>$1</u>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}
function colorHex(data) {
  const c = Number(data.color);
  if (!Number.isFinite(c) || c === 0) return '#57F287';
  return '#' + c.toString(16).padStart(6, '0');
}
function linesHTML(text) {
  return String(text || '').split('\n').map((l) => {
    if (l.trim() === SEP) return '<div style="text-align:center;color:#4e5058;font-size:12px;margin:6px 0;letter-spacing:1px;">' + esc(SEP) + '</div>';
    return `<div style="font-size:13px;line-height:1.5;">${md(esc(l)) || '&nbsp;'}</div>`;
  }).join('');
}
function card(e) {
  const author = e.author || {};
  const fields = e.fields || [];
  return `
    <div style="background:#2b2d31;border-radius:6px;overflow:hidden;">
      <div style="border-left:4px solid ${colorHex(e)};padding:12px 14px 8px;">
        ${author.name ? `<div style="color:#fff;font-size:14px;font-weight:600;">${esc(author.name)}</div>` : ''}
        ${e.title ? `<div style="color:#fff;font-weight:600;font-size:15px;margin-top:2px;">${md(esc(e.title))}</div>` : ''}
        <div style="margin-top:4px;">${linesHTML(e.description)}</div>
        ${fields.map((f) => `
          <div style="margin-top:8px;font-size:13px;">
            ${f.name === '\u200b' ? '' : `<div style="color:#e07a5f;font-size:12px;font-weight:600;margin-bottom:2px;">${md(esc(f.name))}</div>`}
            <div style="line-height:1.5;">${linesHTML(f.value)}</div>
          </div>`).join('')}
      </div>
      ${e.footer ? `<div style="background:#00000022;padding:6px 14px;border-top:1px solid #1e1f22;color:#949ba4;font-size:11px;">${esc(e.footer.text || '')}${e.timestamp ? ' · <t>maintenant</t>' : ''}</div>` : ''}
    </div>`;
}

const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Aperçu — Salon privé de ticket allégé (v220)</title></head>
<body style="margin:0;padding:28px;background:#1e1f22;font-family:'gg sans','Noto Sans',system-ui,sans-serif;color:#dbdee1;">
<div style="max-width:860px;margin:0 auto;">
  <div style="text-align:center;margin-bottom:8px;">
    <div style="font-size:15px;color:#949ba4;">Hoxera · Salon privé de ticket — rendu RÉEL du code</div>
    <h1 style="color:#fff;margin:6px 0 0;font-size:23px;">🧹 Embed de bienvenue ALLÉGÉ (v220)</h1>
    <p style="color:#b5bac1;font-size:14px;margin-top:8px;">Ce qui a été retiré par défaut : 📅 date brute (l'horodatage du pied la donne) · 📂 « tickets précédents » · 📋 les 3 étapes détaillées · 🔒 le long mode d'emploi du menu staff. Le menu staff (sous l'embed) reste.</p>
  </div>

  <div style="font-size:13px;color:#949ba4;text-transform:uppercase;letter-spacing:1px;margin:22px 0 10px;">1 · Cas par défaut (raison + questionnaire)</div>
  ${card(e1)}

  <div style="font-size:13px;color:#949ba4;text-transform:uppercase;letter-spacing:1px;margin:28px 0 10px;">2 · Serveur ayant configuré un « déroulement » personnalisé</div>
  ${card(e2)}

  <div style="background:#2b2d31;border-left:4px solid #57F287;border-radius:6px;padding:14px 16px;margin-top:26px;font-size:13px;line-height:1.6;">
    <strong style="color:#fff;">💡 Note de conception</strong><br>
    · Le type, l'équipe en charge, « à propos », la demande et les réponses au questionnaire restent — c'est l'essentiel.<br>
    · La transcription en MP est annoncée par une seule ligne discrète (plus les 3 étapes).<br>
    · Si un serveur a configuré un texte « déroulement » dans le dashboard, il reste affiché (jamais supprimé).<br>
    · Avertissement MP fermés (⚠️) : toujours affiché, mais seulement dans ce cas précis.
  </div>
</div></body></html>`;
fs.writeFileSync('/home/user/apercu-salon-ticket-allege.html', html);
console.log('OK — apercu-salon-ticket-allege.html');
try { fs.rmSync(process.env.BOTDEV_DATA_DIR, { recursive: true, force: true }); } catch {}
