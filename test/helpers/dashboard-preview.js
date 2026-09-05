// ============================================================================
// Harnais : exécute le VRAI `renderPv` de public/js/dashboard.js dans un DOM
// jsdom, pour vérifier ce que l'utilisateur voit dans « 👀 Aperçu sur Discord ».
// Utilisé par test/v239-test.js.
// ============================================================================
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const DASH = path.join(__dirname, '..', '..', 'public', 'js', 'dashboard.js');

// Extrait le corps de `const renderPv = () => { … };` (bornes repérées sur les
// lignes réelles du fichier, pas au jugé).
function extractRenderPv() {
  const src = fs.readFileSync(DASH, 'utf8');
  const start = src.indexOf('const renderPv = () => {');
  if (start < 0) throw new Error('renderPv introuvable dans dashboard.js');
  const end = src.indexOf("cfgZone.addEventListener('input', renderPv);", start);
  if (end < 0) throw new Error('fin de renderPv introuvable');
  return src.slice(start, end);
}

// Construit le DOM minimal que renderPv attend : un cfgZone avec un champ par
// clé de réglage, et une zone .dc-msg à remplir.
function buildDom({ key, config, guild, channels }) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const { window } = dom;
  const doc = window.document;

  const cfgZone = doc.createElement('div');
  // Les champs réels d'EVENT_DEFS pour member_join / member_leave.
  const fields = key === 'member_join'
    ? ['channel', 'message', 'card', 'plain', 'color', 'image', 'channels']
    : ['channel', 'message', 'plain', 'color', 'image', 'channels'];
  fields.forEach((k) => {
    const isBool = (k === 'card' || k === 'plain');
    const el = doc.createElement(isBool ? 'input' : (k === 'message' ? 'textarea' : 'input'));
    if (isBool) { el.type = 'checkbox'; el.checked = !!config[k]; }
    else el.value = config[k] == null ? '' : String(config[k]);
    el.dataset.k = k;
    if (k === 'channel') el.dataset.cmLabel = '#bienvenue';
    cfgZone.appendChild(el);
  });

  // {channels} : le sélecteur multiple réel est un conteneur
  // [data-channelsmulti] avec des rangées .cm-row contenant un champ
  // [data-cm-label] (la phrase) par salon choisi.
  if (Array.isArray(config._channelRows) && config._channelRows.length) {
    const cm = doc.createElement('div');
    cm.setAttribute('data-channelsmulti', '1');
    config._channelRows.forEach(([label, phrase]) => {
      const row = doc.createElement('div');
      row.className = 'cm-row';
      const inp = doc.createElement('input');
      inp.setAttribute('data-cm-label', label);
      inp.dataset.cmLabel = label;
      inp.value = phrase == null ? '' : String(phrase);
      row.appendChild(inp);
      cm.appendChild(row);
    });
    cfgZone.appendChild(cm);
  }

  const pv = doc.createElement('div');
  pv.innerHTML = '<div class="dc-msg"></div>';
  doc.body.appendChild(cfgZone);
  doc.body.appendChild(pv);

  const sandbox = {
    cfgZone, pv, key,
    data: { guild: guild || { name: 'Mon serveur', members: 42 }, channels: channels || [] },
    App: { escapeHtml: (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) },
    Dashboard: { state: { bot: { name: 'Optimus Prime' } } },
    Date, String, Number, Array, Object, Map, JSON, RegExp, Math, console,
  };
  vm.createContext(sandbox);
  vm.runInContext(extractRenderPv() + '\nrenderPv();', sandbox, { filename: 'renderPv' });
  return { html: pv.querySelector('.dc-msg').innerHTML, window };
}

module.exports = { buildDom, extractRenderPv };
