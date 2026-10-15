// ============================================================
// Audit du SYSTÈME DE DESIGN du tableau de bord — ce que l'œil lit, mesuré.
// ------------------------------------------------------------
// Pourquoi ce banc ? Le fondateur a jugé le tableau de bord « encore fait par
// une IA ». C'est une impression, donc invérifiable en l'état. En réalité elle
// se mesure très bien : une interface dessinée à la main par une équipe suit une
// échelle ; une interface générée empile des valeurs au petit bonheur. On relève
// donc quatre choses, sur le rendu réel (Chromium, le vrai CSS, les vrais
// modules) :
//
//   1. L'ÉCHELLE TYPOGRAPHIQUE — l'histogramme des tailles de police COMPUTÉES
//      de tout ce qui porte du texte. Une maison tient sur 6 à 9 crans ; DraftBot,
//      mesuré sur sa propre feuille (/_nuxt/entry.css, 35 374 o) : 8 tailles,
//      toutes entières (12, 14, 16, 18, 20, 24, 26, 36), 14 px pour le corps.
//      Un tableau de bord « IA » en dénombre trente et des demis (11,5 / 12,5 /
//      13,5…) : le demi-pixel n'existe dans aucune maquette, c'est un réglage
//      à l'œil.
//   2. LES EMPREINTES — les émojis employés comme icônes d'INTERFACE (bouton,
//      titre, étiquette, toast). Dans un message Discord simulé, l'émoji est
//      légitime : Discord en est plein, et nos aperçus doivent lui ressembler.
//      Dans un libellé de bouton du tableau de bord, c'est la signature du
//      générateur. On compte donc les deux séparément, et on n'exige rien du
//      premier.
//   3. LE DÉCOR — surfaces en dégradé (l'indice visuel le plus facile à
//      repérer : « tile » arrondie + dégradé + bord coloré), histogramme des
//      rayons, hauteurs réelles des contrôles, couleurs de fond distinctes.
//   4. LE MESSAGE APRÈS ENREGISTREMENT — on clique le vrai bouton du vrai module
//      et on lit ce qui s'affiche : le libellé du bouton, le texte du toast, sa
//      couleur. Un produit fini dit « Enregistré. » ; un générateur dit
//      « ✅ Tout est enregistré ! ».
//
// Comme les autres bancs de test/tools/, c'est un OUTIL DE REVUE : il exige un
// serveur local et Chromium, et la CI ne l'exécute pas. Les contrats qu'il sert
// sont écrits dans test/v367-test.js.
//
//   node test/tools/audit-design-system.js                     → 1440 × 900, souris
//   node test/tools/audit-design-system.js 360 --tactile       → téléphone
//   node test/tools/audit-design-system.js --capture=docs/av
//   node test/tools/audit-design-system.js --json=/tmp/avant.json
// ============================================================
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');

const BASE = process.env.HOX_BASE || 'http://127.0.0.1:3000';
const LARGEUR = Number((process.argv[2] || '').replace(/--.*/, '') || 1440);
const HAUTEUR = Number(process.env.HOX_H || 900);
const TACTILE = process.argv.includes('--tactile');
const CAPTURE = (process.argv.find((a) => a.startsWith('--capture=')) || '').split('=')[1] || '';
const JSON_OUT = (process.argv.find((a) => a.startsWith('--json=')) || '').split('=')[1] || '';
if (CAPTURE) fs.mkdirSync(CAPTURE, { recursive: true });

// Les rendeurs sortent avant d'avoir posé le moindre champ si le guild est
// vide : mêmes données simulées que le banc mobile, pour qu'on compare la même
// page aux deux versions.
const guild = {
  id: 'G1', name: 'Serveur de test', icon: '',
  channels: ['général', 'logs', 'tickets', 'annonces', 'bienvenue', 'règles'].map((n, i) => ({ id: 'C' + i, name: n, category: false, voice: false })),
  roles: [
    { id: 'R1', name: 'Administrateur', color: '#ed4245', position: 10, managed: false },
    { id: 'R2', name: 'Modérateur', color: '#fee75c', position: 8, managed: false },
    { id: 'R3', name: 'Membre', color: '#3ba55d', position: 2, managed: false },
  ],
  members: Array.from({ length: 6 }, (_, i) => ({ id: 'U' + i, username: 'membre_' + i, discriminator: '0001', bot: false, roles: [], avatar: '', joinedAt: Date.now() - i * 86400000 })),
  settings: {
    prefix: '!', log_channel: 'C1',
    am_enabled: 1, am_mode: 'enforce', am_links: 1, am_caps: 1, am_mentions: 5, am_spam: 5,
    am_phishing: 1, am_ignore_staff: 1, am_warn_limit: 2, am_warn_action: 'timeout', am_warn_timeout_min: 10,
    am_timeout_min: 5, am_rule_actions: '{}', am_blacklist_rules: '{}', am_blacklist_thresholds: '{}',
    am_blacklist_duration_min: 0, am_blacklist_channel: '', am_native_enabled: 1, am_native_alert_channel: '',
    am_exempt_roles: '[]', am_exempt_channels: '[]', am_exempt_users: '[]', am_escalation: '{"rules":{}}',
    nk_enabled: 1, nk_channels: '[]', nk_roles: '[]',
    xp_enabled: 1, xp_min: 10, xp_max: 25, xp_cooldown: 60, xp_channel: 'C0', xp_message: '',
    eco_currency: 'Pistoles', eco_start: 100, sug_channel: 'C0', sug_max: 3,
    wel_msg: 'Salut {member} !', wel_channel: 'C0', wel_role_mode: 'add', wel_roles: '[]',
    ticket_channel: 'C2', ticket_support: '[]',
    poll_enabled: 1, poll_question: 'Soirée jeux vendredi ?', poll_options: 'Oui|Non', poll_duration: 60, poll_channel: 'C0',
  },
};

const MODULES = ['overview', 'moderation', 'antinuke', 'welcome', 'levels', 'economy', 'roles', 'suggestions',
  'logs', 'members', 'stats', 'tickets', 'announcements', 'poll', 'embeds', 'server', 'botprofile', 'rules'];

async function monte(page) {
  await page.addInitScript(() => {
    if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.resolve({});
    window.L = (v) => (v == null ? '—' : (typeof v === 'number' ? Math.round(v) : v));
  });
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    App.state.loaded = true;
    App.state.user = { discord_username: 'admin', is_admin: true };
    document.body.innerHTML = `
      <div id="modal-root"></div><div id="toasts"></div>
      <div class="dashboard-shell-host"><div class="dash-shell">
        <aside class="dash-side" id="dash-side"></aside>
        <main class="dash-main">
          <div class="dash-topbar" id="dash-topbar"></div>
          <div id="dash-content"></div>
        </main>
        <nav class="dash-bnav" id="dash-bnav"></nav>
      </div></div>`;
  });
  await page.evaluate(([g]) => {
    App.api = async (u) => {
      if (u.includes('/members')) return { members: g.members };
      if (u.includes('/roles')) return { roles: g.roles };
      if (u.includes('/sanctions')) return { sanctions: [] };
      if (u.includes('/warnings')) return { warnings: [] };
      if (u.includes('/polls')) return { polls: [] };
      if (u.includes('/invites')) return { invites: [] };
      if (u.includes('/modules')) return { modules: [] };
      if (u.includes('/health')) return { ok: true, uptimeMs: 1000, memoryMb: 100, clients: [{ id: 1, ready: true, startedAt: Date.now() }] };
      if (/\/guilds\/[^/]+$/.test(u)) return g;
      return {};
    };
    App.toast = (m, t) => {
      const e = document.createElement('div');
      e.className = 'toast toast-' + (t || 'info');
      e.textContent = String(m);
      (document.getElementById('toasts') || document.body).appendChild(e);
      window.__toasts.push(String(m));
    };
    window.__toasts = [];
    window.__guild = g;
    Dashboard.state = {
      bot: { id: 1, name: 'Hoxera', online: true }, guildId: 'G1', module: 'overview', moduleHistory: [],
      discordGuilds: [{ id: 'G1', name: 'Serveur de test', icon: '', hasBot: true, canManage: true }],
      guild: g, settings: g.settings, modules: { poll: true, welcome: true, moderation: true, antinuke: true, levels: true, economy: true },
    };
    Dashboard.renderTopbar(document.querySelector('#dash-topbar'), Dashboard.state.discordGuilds);
    Dashboard.renderBottomNav(document.querySelector('#dash-bnav'));
    Dashboard.renderSidebar && Dashboard.renderSidebar(document.querySelector('#dash-side'));
  }, [guild]);
}

(async () => {
  let browser;
  try { browser = await chromium.launch({ args: ['--no-sandbox'] }); }
  catch (e) {
    console.log('⚠️  Chromium indisponible (' + String(e.message).slice(0, 90) + ').');
    console.log('   Ce banc est un outil de revue : la CI ne l’exécute pas.');
    console.log('   Pour le remettre en état : sh scripts/install-outils-audit.sh');
    process.exit(2);
  }
  const ctx = await browser.newContext({
    viewport: { width: LARGEUR, height: HAUTEUR }, hasTouch: TACTILE, isMobile: TACTILE,
    userAgent: TACTILE ? 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36' : undefined,
  });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e.message).slice(0, 120)));
  await monte(page);
  console.log('═══ AUDIT SYSTÈME DE DESIGN ═══ ' + LARGEUR + '×' + HAUTEUR + ' · ' + (TACTILE ? 'tactile' : 'souris'));

  const rendu = await page.evaluate(async ({ mods }) => {
    const c = document.querySelector('#dash-content');
    // Un émoji employé comme icône d'interface n'est pas la même chose qu'un
    // émoji dans un message Discord simulé : le second est réaliste (Discord en
    // est plein), le premier est une signature de générateur. On sépare.
    const EMPLACEMENTS = '[class*="preview"], [class*="Preview"], .dp-msg, .dp-embed, .discord-multi-option, .am-example, [data-apercu]';
    const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}]/gu;
  const PICTO = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/gu;
  const FLECHE = /[\u{2190}-\u{21FF}]/gu;
    const visibles = (racine) => [...racine.querySelectorAll('*')].filter((el) => el.offsetParent !== null);
    const porteDuTexte = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    const tailles = {};
    const rayons = {};
    const fonds = {};
    const hauteurs = {};
    const qui = {};
    let emotes = 0, tuiles = 0, textes = 0, emojiIHM = 0, emojiApercu = 0, horsTexte = 0, flechesIHM = 0;
    const emojiVus = {};
    const petits = {};
    let rendus = 0;
    for (const m of mods) {
      c.innerHTML = '';
      try { await Dashboard.renderers[m](c, window.__guild); } catch (e) { continue; }
      await new Promise((r) => setTimeout(r, 90));
      rendus++;
      if (location.hash) history.replaceState(null, '', '#/module/' + m);
      for (const el of visibles(c)) {
        const st = getComputedStyle(el);
        // — typographie —
        if (porteDuTexte(el)) {
          const px = Math.round(parseFloat(st.fontSize) * 10) / 10;
          tailles[px] = (tailles[px] || 0) + 1;
          textes++;
          const dans = el.closest(EMPLACEMENTS);
          // sur les SEULS nœuds texte de l'element : sinon un parent est compte
          // pour chaque pictogramme de ses enfants et le total triple sans rien
          // dire de l'interface (mesure : 30 « label.am-rule-action » pour 2
          // veritables icones en dessous).
          const textePropre = [...el.childNodes].filter((n) => n.nodeType === 3)
            .map((n) => n.textContent).join(' ');
          const fleches = (textePropre.match(FLECHE) || []).length;
          if (fleches && !dans) flechesIHM += fleches;
          const e = (textePropre.match(PICTO) || []).length;
          if (e) {
            if (dans) emojiApercu += e;
            else {
              emojiIHM += e;
              // un regroupement par selecteur, sinon la liste ne sert a rien :
              // c'est le MEMME defaut reproduit trente fois qu'il faut voir.
              const cle = el.tagName.toLowerCase() + (el.className && typeof el.className === 'string'
                ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
              emojiVus[cle] = emojiVus[cle] || { n: 0, ex: (el.textContent || '').trim().slice(0, 26), modules: {} };
              emojiVus[cle].n += e;
              emojiVus[cle].modules[m] = (emojiVus[cle].modules[m] || 0) + 1;
            }
          }
          if (!e && px < 11 && !dans) {
            horsTexte++;
            // pareil : « 29 textes trop petits » ne se corrige pas sans savoir ou.
            const cle = el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim()
              ? '.' + el.className.trim().split(/\s+/)[0] : '') + ' @' + px + 'px';
            petits[cle] = (petits[cle] || 0) + 1;
          }
        }
        // — décor —
        if (/linear-gradient|radial-gradient/.test(st.backgroundImage)) tuiles++;
        const r = st.borderTopLeftRadius;
        if (r && r !== '0px') rayons[r] = (rayons[r] || 0) + 1;
        const bg = st.backgroundColor;
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') fonds[bg] = (fonds[bg] || 0) + 1;
        if (el.matches('input, select, textarea, button, .dd-trigger, .dash-btn, .dash-btn-sm')) {
          const h = Math.round(el.getBoundingClientRect().height);
          if (h) {
            hauteurs[h] = (hauteurs[h] || 0) + 1;
            const cle = el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim()
              ? '.' + el.className.trim().split(/\s+/)[0] : '');
            qui[h] = qui[h] || {};
            qui[h][cle] = (qui[h][cle] || 0) + 1;
          }
        }
        if (el.tagName === 'IMG' && String(el.getAttribute('src') || '').indexOf('/emotes/') >= 0) emotes++;
      }
    }
    const triee = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]);
    const parHauteur = triee(hauteurs).slice(0, 10).map(([h, n]) => [h, n,
      triee(qui[h] || {}).slice(0, 3).map(([k, v]) => k + ' ×' + v).join(' + ')]);
    return {
      rendus, textes,
      echelle: triee(tailles).map(([k, v]) => [Number(k), v]),
      crans: Object.keys(tailles).length,
      demi: Object.keys(tailles).filter((k) => String(k).includes('.')).length,
      emojiIHM, emojiApercu, emojiVus, horsTexte, flechesIHM,
      petits: triee(petits).slice(0, 10),
      tuiles, emotes,
      rayons: triee(rayons).slice(0, 8),
      controles: parHauteur,
      ou: triee(emojiVus).sort((a, b) => b[1].n - a[1].n).slice(0, 16),
      couleursDeFond: Object.keys(fonds).length,
    };
  }, { mods: MODULES });

  console.log('\n── 1. Échelle typographique');
  console.log('   ' + rendu.rendus + ' modules rendus · ' + rendu.textes + ' éléments porteurs de texte');
  console.log('   crans distincts : ' + rendu.crans + ' (dont ' + rendu.demi + ' avec demi-pixel)');
  console.log('   ' + rendu.echelle.map(([k, v]) => k + ' px ×' + v).join(' · '));

  console.log('\n── 2. Empreintes dans l’interface');
  console.log('   pictogrammes employés comme icônes d’interface : ' + rendu.emojiIHM);
  console.log('   flèches dans l’interface (« Réglages → ») : ' + rendu.flechesIHM + ' (non comptées : usage courant)');
  console.log('   émojis dans les aperçus de messages Discord : ' + rendu.emojiApercu + ' (légitimes, non comptés)');
  console.log('   textes hors aperçu sous le plancher de 11 px : ' + rendu.horsTexte);
  if (rendu.ou && rendu.ou.length) {
    console.log('   où (par sélecteur, occurrences rendues) :');
    rendu.ou.forEach(([cle, v]) => console.log('     · ' + cle + ' ×' + v.n + '  « ' + v.ex + ' »  dans '
      + Object.keys(v.modules).length + ' module(s) : ' + Object.keys(v.modules).slice(0, 4).join(', ')));
  }
  if (rendu.petits && rendu.petits.length) {
    console.log('   menus corps de texte (hors badges) :');
    rendu.petits.forEach(([cle, n]) => console.log('     · ' + cle + ' ×' + n));
  }

  console.log('\n── 3. Décor');
  console.log('   surfaces en dégradé : ' + rendu.tuiles + ' · émojis dessinés (PNG /emotes) utilisés : ' + rendu.emotes);
  console.log('   couleurs de fond distinctes : ' + rendu.couleursDeFond);
  console.log('   rayons : ' + rendu.rayons.map(([k, v]) => k + ' ×' + v).join(' · '));
  console.log('   hauteurs de contrôles : ' + rendu.controles.map(([k, v, qui]) => k + 'px ×' + v + (qui ? ' (' + qui + ')' : '')).join('\n     · '));

  // 4 — le message apres un enregistrement, sur le vrai bouton du vrai module.
  // On cherche un bouton dont le gestionnaire est REELLEMENT cable au retour
  // (App.retourEnregistrement) : tester un enregistrement local (brouillon) ne
  // dirait rien du comportement de sauvegarde sur le serveur.
  const saving = await page.evaluate(async () => {
    const c = document.querySelector('#dash-content');
    const candidats = ['tickets', 'welcome', 'levels', 'moderation', 'shop', 'announcements', 'economy', 'roles', 'giveaways'];
    const estCable = (b) => /retourEnregistrement/.test(b.onclick ? String(b.onclick) : '');
    let bouton = null;
    for (const m of candidats) {
      if (typeof Dashboard === "undefined" || !Dashboard.renderers[m]) continue;
      c.innerHTML = '';
      try { await Dashboard.renderers[m](c, window.__guild || {}); } catch (e) { continue; }
      await new Promise((r) => setTimeout(r, 320));
      bouton = [...c.querySelectorAll('button')].find((b) => b.offsetParent && estCable(b));
      if (bouton) { window.__moduleTeste = m; break; }
    }
    if (!bouton) {
      bouton = [...c.querySelectorAll('button')].find((b) => /enregistrer/i.test(b.textContent || '') && b.offsetParent);
    }
    if (!bouton) return { trouve: false };
    const hauteurAvant = Math.round(bouton.getBoundingClientRect().height);
    const avant = (bouton.textContent || '').trim();
    bouton.click();
    await new Promise((r) => setTimeout(r, 380));
    const t = document.querySelector('#toasts .toast');
    const horo = document.querySelector('.save-stamp');
    // diagnostic de cascade (temporaire) : qui gagne la hauteur ?
    const une = [...c.querySelectorAll('button')].find((b) => b.classList.contains('dash-btn') && b.offsetParent);
    const diag = une ? (() => {
      const st = getComputedStyle(une);
      let feuilles = 0, marqueur = false, indexMarqueur = -1, total = 0;
      for (const f of document.styleSheets) {
        try {
          const regs = f.cssRules;
          feuilles++;
          for (let i = 0; i < regs.length; i++) {
            total++;
            if ((regs[i].cssText || '').indexOf('min-height: 40px') >= 0) { marqueur = true; indexMarqueur = i; }
          }
        } catch (e) { feuilles++; }
      }
      return { classe: une.className, minH: st.minHeight, haut: st.height, pad: st.padding,
        fs: st.fontSize, lh: st.lineHeight, box: st.boxSizing, feuilles, regles: total,
        marqueurVu: marqueur, aIndex: indexMarqueur };
    })() : null;
    const sondes = {};
    for (const sel of ['.dash-btn', '.dash-btn-sm', '.dash-input', '.dash-select', '.am-filter', '.dd-add-btn']) {
      const el = [...c.querySelectorAll(sel)].find((x) => x.offsetParent);
      if (el) sondes[sel] = Math.round(el.getBoundingClientRect().height);
    }
    return {
      trouve: true,
      module: window.__moduleTeste || '—',
      cable: estCable(bouton),
      avant,
      apres: (bouton.textContent || '').trim(),
      glyphes: bouton.querySelectorAll('svg').length,
      hauteurAvant,
      hauteurApres: Math.round(bouton.getBoundingClientRect().height),
      horodatage: horo ? (horo.textContent || '').trim() : '(aucun)',
      horoVisible: horo ? getComputedStyle(horo).opacity : '—',
      toast: t ? (t.textContent || '').trim() : 'aucun toast',
      toastBg: t ? getComputedStyle(t).backgroundColor : '—',
      toastTaille: t ? getComputedStyle(t).fontSize : '—',
      historique: (window.__toasts || []).slice(0, 4),
      sondes,
      diag,
    };
  });


  console.log('\n── 4. Après « Enregistrer »');
  if (!saving.trouve) console.log('   (aucun bouton d’enregistrement câblé trouvé dans ce module)');
  else {
    console.log('   module testé : ' + saving.module + ' · gestionnaire câblé au retour : ' + (saving.cable ? 'oui' : 'NON — le bouton ne confirme rien'));
    console.log('   bouton : « ' + saving.avant + ' » → « ' + saving.apres + ' » (' + saving.glyphes + ' glyphe dans le libellé après)');
    console.log('   hauteur du bouton : ' + saving.hauteurAvant + 'px → ' + saving.hauteurApres + 'px');
    console.log('   horodatage : « ' + saving.horodatage + ' » (opacité ' + saving.horoVisible + ')');
    console.log('   toast  : « ' + saving.toast + ' » (' + saving.toastBg + ', ' + saving.toastTaille + ')');
    if (saving.diag) console.log('   cascade : min-height ' + saving.diag.minH + ' · hauteur ' + saving.diag.haut
      + ' · regle du bloc v367 chargee : ' + (saving.diag.marqueurVu ? 'oui' : 'NON'));
    if (saving.sondes) console.log('   contrôles de ce module : ' + Object.entries(saving.sondes).map(([k, v]) => k + ' ' + v + 'px').join(' · '));
    if (saving.historique.length) console.log('   pile   : ' + saving.historique.join(' | '));
  }
  console.log('\n── Erreurs de page : ' + (erreurs.length ? erreurs.join(' | ') : 'aucune'));
  if (CAPTURE) {
    await page.evaluate(() => { document.querySelector('#dash-content').scrollTo(0, 0); window.scrollTo(0, 0); });
    await page.screenshot({ path: path.join(CAPTURE, `survol-${LARGEUR}.png`), fullPage: false });
  }
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify({ vue: [LARGEUR, HAUTEUR, TACTILE ? 'tactile' : 'souris'], rendu, saving }, null, 1));
  await ctx.close();
  await browser.close();
})().catch((e) => { console.error('💥', e); process.exit(1); });
