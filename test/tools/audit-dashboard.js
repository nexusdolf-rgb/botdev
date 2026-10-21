// Le tableau de bord connecté, module par module : cibles tactiles, débordements,
// textes suspects, confirmations manquantes. Données de synthèse réalistes.
const { chromium } = require('playwright-core');
const BASE = process.env.HOX_BASE || 'http://127.0.0.1:3000';
const LARGEURS = (process.env.LARGEURS || '375,1440').split(',').map(Number);
const MODULES = (process.env.MODULES || '').split(',').filter(Boolean);

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  for (const w of LARGEURS) {
    // Sous 900 px, on émule un écran tactile : les règles écrites pour
    // (pointer: coarse) ne s'appliquent qu'ainsi, et c'est ce que voit un
    // téléphone ou une tablette.
    const ctx = await b.newContext({ viewport: { width: w, height: 900 }, ...(w <= 900 ? { hasTouch: true } : {}) });
    const p = await ctx.newPage();
    const err = [];
    p.on('console', (m) => { if (m.type() === 'error') err.push(m.text().slice(0, 70)); });
    p.on('pageerror', (e) => err.push('pageerror: ' + String(e.message).slice(0, 70)));
    await p.addInitScript(() => { if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.resolve({}); });
    await p.goto(BASE + '/', { waitUntil: 'networkidle' });
    await p.evaluate(() => {
      App.state.loaded = true;
      App.state.user = { discord_username: 'nexusdolf', discord_id: '1', is_admin: true };
      document.body.innerHTML = '<div id="modal-root"></div><div id="toasts"></div>'
        + '<div class="dashboard-shell-host"><div class="dash-shell"><aside class="dash-side" id="dash-side"></aside>'
        + '<main class="dash-main"><div class="dash-topbar" id="dash-topbar"></div><div id="dash-content"></div></main></div></div>';
    });
    const mods = MODULES.length ? MODULES : await p.evaluate(() => Dashboard.MODULES.map((m) => m[0]));
    const bilan = [];
    for (const mod of mods) {
      await p.evaluate(async ([m]) => {
        const guild = {
          guild: { id: 'G1', name: 'SN7K COMMUNITY', members: 336 },
          channels: [{ id: 'C0', name: 'general', type: 0, position: 0 }],
          roles: [{ id: 'R2', name: 'Membre', color: '#5865f2', position: 5 }],
          settings: { prefix: '!', xp_enabled: 1 }, tickets: { types: [] }, tickets_stats: {}, verification: {}, rules: {},
          polls: { list: [] }, events: { defs: [], state: {} }, scheduled: [], shop_items: [], voicetemp: {},
          applications: {}, sticky: {}, linkpanel: {}, reaction_roles: [], blacklist: [], automod_blacklist: [],
          xp_roles: [], role_menus: [], ticket_menus: [], log_events: {}, invite_rewards: {}, checklist: [], lockdown: {},
        };
        App.api = async (u) => {
          if (/\/guilds\/[^/]+$/.test(u)) return guild;
          if (u.includes('/stats')) return { activity: [], joins: [], top_active: [] };
          if (u.includes('/modules')) return { modules: [] };
          return {};
        };
        App.toast = () => {};
        Dashboard.state = { bot: { id: 1, name: 'Optimus Prime', online: true }, guildId: 'G1', module: m, moduleHistory: [], discordGuilds: [{ id: 'G1', name: 'S', hasBot: true }], guild: guild.guild, settings: {}, modules: {} };
        Dashboard.renderTopbar && Dashboard.renderTopbar(document.querySelector('#dash-topbar'), Dashboard.state.discordGuilds);
        const c = document.querySelector('#dash-content');
        await Dashboard.renderContent(c);
        await new Promise((r) => setTimeout(r, 250));
      }, [mod]);
      const r = await p.evaluate((vw) => {
        const z = document.querySelector('#dash-content');
        const petits = [];
        for (const el of z.querySelectorAll('button, a[href], input[type="checkbox"], select, .dd-trigger')) {
          // Un interrupteur mesure 20 px mais vit dans un <label class="switch">
          // dont la zone tactile est étendue (::after inset -10px) : on mesure
          // le label, seule cible réelle du doigt.
          // Une case à cocher de 20 px vit presque toujours dans un <label>
          // cliquable bien plus grand : c'est le label que le doigt touche.
          let cible = el;
          const lab = el.closest('label');
          if (lab) cible = lab;
          const b = cible.getBoundingClientRect();
          if (b.width < 2 || b.height < 2) continue;
          const marge = lab && lab.classList.contains('switch') ? 20 : 0; // ::after inset -10px
          const h = Math.round(b.height + marge), w2 = Math.round(b.width + marge);
          // Le seuil tactile ne vaut que sur téléphone : à la souris, un bouton
          // de 32 px reste confortable. Au-delà de 900 px, on ne mesure pas.
          if (vw < 900 && (h < 38 || w2 < 30)) petits.push({ t: (cible.textContent || el.value || el.type || '').trim().slice(0, 22), w: w2, h, html: cible === el ? el.outerHTML.slice(0, 90) : 'label:' + cible.className });
        }
        const deborde = [];
        for (const el of z.querySelectorAll('*')) {
          const b = el.getBoundingClientRect();
          if (b.width < 2) continue;
          if (b.right > vw + 1) deborde.push((el.id || String(el.className) || el.tagName).slice(0, 30) + '+' + Math.round(b.right - vw) + ' L' + Math.round(b.left));
        }
        // Boutons sans aucun contenu visible : ni texte, ni SVG, ni image.
        const vides = [...document.querySelectorAll('#dash-content button, #dash-topbar button')]
          .filter((e) => !e.textContent.trim() && !e.querySelector('svg, img'))
          // Une pastille de couleur (choix d'une teinte) est son propre contenu.
          .filter((e) => getComputedStyle(e).backgroundColor === 'rgba(0, 0, 0, 0)')
          .map((e) => e.id || String(e.className).slice(0, 20));
        // Pluriels « (s) » et parenthèses mécaniques dans les libellés.
        const texte = z.innerText || '';
        const pluriels = (texte.match(/\w+\(s\)/g) || []).slice(0, 3);
        return {
          petits: petits.slice(0, 4), nbPetits: petits.length,
          deborde: deborde.slice(0, 3), nbDeborde: deborde.length,
          franglais: (texte.match(/dashboard/gi) || []).length,
          bouBou: vides, pluriels,
          discrim: (texte.match(/#\d{4}\b/g) || []).slice(0, 2),
          majusculesTitre: Array.from(z.querySelectorAll('h1,h2,h3')).filter((e) => /^[A-ZÀ-Ÿ0-9 ’'!?.,:-]{6,}$/.test(e.textContent.trim())).map((e) => e.textContent.trim().slice(0, 24)),
          vide: texte.trim().length < 20,
        };
      }, w);
      r.mod = mod;
      bilan.push(r);
    }
    console.log('==== ' + w + ' px ====');
    for (const r of bilan) {
      const d = [r.bouBou.length ? 'VIDE:' + r.bouBou.join('/') : '', r.pluriels.length ? 'PLUR:' + r.pluriels.join('/') : '', r.nbDeborde ? 'DEB:' + r.nbDeborde : '', r.nbPetits ? 'PETIT:' + r.nbPetits : '', r.franglais ? 'ANGLO:' + r.franglais : '', r.discrim && r.discrim.length ? 'DISC:' + r.discrim.join(',') : '', r.vide ? 'VIDE' : ''].filter(Boolean).join(' ');
      if (d) console.log(' ', r.mod.padEnd(14), d, JSON.stringify(r.petits.slice(0, 2)), JSON.stringify((r.deborde || []).slice(0, 3)));
    }
    console.log('  console :', [...new Set(err)].slice(0, 3));
    await ctx.close();
  }
  await b.close();
})().catch((e) => { console.error('ECHEC', e.message); process.exit(1); });
