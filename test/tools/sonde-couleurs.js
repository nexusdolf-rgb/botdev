// Sonde de couleur v2 — elle lit ce que le navigateur PEINT réellement.
//   • tous les modules (pages d'atterrissage) ;
//   • ET les sous-vues ouvertes après un clic dans le module (onglets,
//     panneaux, formulaires, fenêtres).
// Aucune interprétation : uniquement des styles calculés et des rapports WCAG.
//
//   HOX_BASE=http://127.0.0.1:3212 THEME=dark MODULES=all SUBS=1 node sonde-couleurs.js
//
// Règles de mesure :
//   • fond effectif composé RÉCURSIVEMENT (jamais de fusion naïve sur du noir) ;
//   • dégradé → on retient le PIRE arrêt, pas le meilleur ;
//   • le seuil porte sur le ratio NON arrondi (4,497 ne passe pas pour 4,5).
const { chromium } = require('playwright-core');
const BASE = process.env.HOX_BASE || 'http://127.0.0.1:3212';
const THEME = process.env.THEME || 'dark';
const W = Number(process.env.W || 1440);
const SUBS = process.env.SUBS === '1';
const MAXCLICKS = Number(process.env.MAXCLICKS || 6);
const MODS = (process.env.MODULES || 'all').split(',');

const GUILDE = {
  guild: { id: 'G1', name: 'SN7K COMMUNITY', members: 336, boosts: 3, channelsCount: 12, rolesCount: 8, createdAt: Date.now() - 300 * 86400000, icon: null },
  channels: [{ id: 'C0', name: 'general', type: 0, position: 0 }, { id: 'C1', name: 'logs', type: 0, position: 1 }],
  roles: [{ id: 'R2', name: 'Membre', color: '#5865f2', position: 5 }],
  settings: { prefix: '!', xp_enabled: 1, log_channel: 'C1' },
  tickets: { types: [] }, tickets_stats: { open: 2, total: 14 }, verification: {}, rules: {},
  polls: { list: [] }, events: { defs: {}, state: {} }, scheduled: [], shop_items: [],
  voicetemp: {}, applications: {}, sticky: {}, linkpanel: {}, reaction_roles: [], blacklist: [],
  automod_blacklist: [], xp_roles: [], role_menus: [], ticket_menus: [], log_events: {}, invite_rewards: {},
  checklist: [], lockdown: {}, modules: {}, stats: {}, embeds: [], giveaways: [], birthdays: [],
  announcements: [], starboard: {}, quiz: { sets: [], top: [] }, lives: [], invites: [], members: [],
};

const LIRE = () => {
  const parse = (c) => {
    const m = String(c).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(',').map((x) => parseFloat(x.trim()));
    if (p.length === 3) p.push(1);
    if (p[3] === 0) return null;
    return p;
  };
  const lum = ([r, g, b]) => {
    const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const blend = (fg, bg) => fg.slice(0, 3).map((c, i) => Math.round(c * fg[3] + bg[i] * (1 - fg[3])));
  const ratioBrut = (a, b) => {
    const la = lum(a), lb = lum(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };
  const ratio = (a, b) => +ratioBrut(a, b).toFixed(2);
  const hex = (rgb) => '#' + rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('');
  const cssToRgb = (v) => {
    if (v[0] === '#') {
      let h = v.slice(1);
      if (h.length === 3) h = h.split('').map((x) => x + x).join('');
      return `rgb(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)})`;
    }
    return v;
  };

  // fond effectif : composition récursive
  const effectif = (el, profondeur = 0) => {
    if (!el || profondeur > 40) return [255, 255, 255];
    const c = parse(getComputedStyle(el).backgroundColor);
    const parent = el.parentElement ? effectif(el.parentElement, profondeur + 1) : [255, 255, 255];
    if (!c) return parent;
    if (c[3] >= 0.999) return c.slice(0, 3);
    return blend(c, parent);
  };

  // un dégradé n'a pas de background-color : on retient le pire arrêt
  const fondDe = (el) => {
    const cs = getComputedStyle(el);
    const img = cs.backgroundImage || 'none';
    if (img.includes('gradient')) {
      const stops = [];
      const re = /rgba?\([^)]+\)|#[0-9a-f]{3,8}/gi;
      let m;
      while ((m = re.exec(img))) {
        const c = parse(cssToRgb(m[0]));
        if (c) stops.push(c);
      }
      const texte = parse(cs.color) || [0, 0, 0, 1];
      if (stops.length) {
        const base = effectif(el.parentElement || document.body);
        let pire = null, pireC = Infinity;
        stops.forEach((st) => {
          const c = st[3] >= 0.999 ? st.slice(0, 3) : blend(st, base);
          const k = ratioBrut(c, texte.slice(0, 3));
          if (k < pireC) { pireC = k; pire = c; }
        });
        return pire;
      }
    }
    return effectif(el);
  };

  const textes = [];
  const scope = '#dash-content *, .dash-side *, .dash-topbar *';
  document.querySelectorAll(scope).forEach((el) => {
    const txt = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join('');
    if (!txt || txt.length < 2) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') return;
    if (parseFloat(cs.opacity) < 0.5) return;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return;
    const fg = parse(cs.color);
    if (!fg) return;
    const bg = fondDe(el);
    const taille = parseFloat(cs.fontSize);
    const gras = parseInt(cs.fontWeight, 10) >= 700;
    const grand = taille >= 24 || (taille >= 18.66 && gras);
    const fgs = fg.slice(0, 3);
    textes.push({
      texte: txt.slice(0, 40), c: ratio(fgs, bg), brut: ratioBrut(fgs, bg), taille, grand,
      fg: hex(fgs), bg: hex(bg), cls: String(el.className || '').slice(0, 36),
    });
  });

  const traits = [];
  document.querySelectorAll('#dash-content *, .dash-side *').forEach((el) => {
    const cs = getComputedStyle(el);
    const w = parseFloat(cs.borderTopWidth) || 0;
    if (w < 0.5) return;
    const c = parse(cs.borderTopColor);
    if (!c) return;
    const bg = fondDe(el);
    // Un trait de la même couleur que le fond de SON élément ne porte aucune
    // information : c'est le liseré d'un bouton plein. On l'ignore.
    const propre = parse(cs.backgroundColor);
    if (propre && propre[3] > 0.9 && ratioBrut(c.slice(0, 3), propre.slice(0, 3)) < 1.02) return;
    const cs3 = c.slice(0, 3);
    traits.push({ c: ratio(cs3, bg), brut: ratioBrut(cs3, bg), fg: hex(cs3), bg: hex(bg), cls: String(el.className || '').slice(0, 30) });
  });

  const uniques = new Set();
  textes.forEach((t) => uniques.add(t.fg));
  document.querySelectorAll('#dash-content *, .dash-side *').forEach((el) => {
    const c = parse(getComputedStyle(el).backgroundColor);
    if (c && c[3] > 0.9) uniques.add(hex(c.slice(0, 3)));
  });

  return {
    textes, traits, couleursUniques: [...uniques],
    echecs: textes.filter((t) => t.brut < (t.grand ? 3 : 4.5)),
  };
};

// Ce qu'on a le droit de cliquer : de vrais contrôles de navigation ou
// d'ouverture, jamais une action destructrice.
const CANDIDATS = () => {
  const mauvais = /supprim|retir|effac|réinitial|reset|déconnect|logout|bannir|kick|expulser|danger|delete|remove|quitter|fermer|enregistr|import|export|envoy|créer|creer|ajout|lanç|lanc|test|synchronis|install|désactiv|activer|sauvegard|génér|gener|payer|acheter|valider/i;
  const out = [];
  document.querySelectorAll('#dash-content button, #dash-content [role="tab"], #dash-content .dash-tab, #dash-content [data-tab]').forEach((el) => {
    const txt = (el.textContent || '').trim();
    if (!txt || txt.length > 32) return;
    if (mauvais.test(txt) || mauvais.test(el.className || '')) return;
    if (el.disabled) return;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return;
    if (getComputedStyle(el).visibility === 'hidden') return;
    out.push(el);
  });
  return out;
};

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: W, height: 900 }, colorScheme: THEME, serviceWorkers: 'block' });
  p.on('dialog', (d) => d.dismiss().catch(() => {}));
  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  await p.evaluate((g) => {
    App.state.loaded = true;
    App.state.user = { discord_id: '1', discord_username: 'nexusdolf', is_admin: true };
    document.body.innerHTML = '<div class="dashboard-shell-host"><div class="dash-shell"><aside class="dash-side" id="dash-side"></aside><main class="dash-main"><div class="dash-topbar" id="dash-topbar"></div><div id="dash-content"></div></main></div></div><div id="toasts"></div>';
    App.api = async (u) => {
      if (/\/guilds\/[^/]+$/.test(u)) return g;
      if (u.includes('/stats')) return { activity: [], joins: [], totals: {}, top_active: [] };
      if (u.includes('/shop')) return { items: [{ id: 1, name: 'Rôle VIP', description: 'Accès', price: 500, role: 'R2', emoji: '💎' }], purchases: [] };
      return g;
    };
    App.toast = () => {};
  }, GUILDE);

  const MODULES = process.env.MODULES === 'all'
    ? await p.evaluate(() => Dashboard.MODULES.map((m) => m[0]))
    : MODS;

  const rendre = async (mod) => {
    await p.evaluate(async ([m, g]) => {
      Dashboard.state = {
        bot: { id: 1, name: 'Hoxera', online: true }, guildId: 'G1', module: m, moduleHistory: [],
        discordGuilds: [{ id: 'G1', name: g.guild.name, hasBot: true }],
        guild: g.guild, settings: g.settings, modules: {},
      };
      document.querySelector('#dash-side').innerHTML = '';
      document.querySelector('#dash-topbar').innerHTML = '';
      Dashboard.renderSide && Dashboard.renderSide(document.querySelector('#dash-side'), Dashboard.state);
      Dashboard.renderTopbar && Dashboard.renderTopbar(document.querySelector('#dash-topbar'), Dashboard.state.discordGuilds);
      try { await Dashboard.renderContent(document.querySelector('#dash-content')); } catch (e) { /* état d'erreur : il reste mesurable */ }
      await new Promise((r) => setTimeout(r, 320));
    }, [mod, GUILDE]);
  };

  let total = { vues: 0, textes: 0, echecs: 0, traits: 0, faibles: 0, pires: [], tlist: [] };
  const parVue = [];

  for (const mod of MODULES) {
    // vue d'atterrissage
    await rendre(mod);
    let r = await p.evaluate(LIRE);
    const vues = [{ nom: mod, ...r }];

    // sous-vues : un clic à la fois, puis remise à zéro du module
    if (SUBS) {
      const n = await p.evaluate(`(${CANDIDATS.toString()})().length`);
      const max = Math.min(n, MAXCLICKS);
      for (let i = 0; i < max; i++) {
        await rendre(mod);
        const libelle = await p.evaluate(([idx, fn]) => {
          const els = eval(`(${fn})`)();
          const el = els[idx];
          if (!el) return null;
          const t = (el.textContent || '').trim().slice(0, 28);
          el.click();
          return t;
        }, [i, CANDIDATS.toString()]);
        if (!libelle) continue;
        await p.waitForTimeout(420);
        const rr = await p.evaluate(LIRE);
        vues.push({ nom: `${mod} › ${libelle}`, ...rr });
      }
    }

    for (const v of vues) {
      total.vues++;
      const nuls = v.traits.filter((t) => t.brut < 1.15).length;
      total.textes += v.textes.length;
      total.traits += v.traits.length;
      total.echecs += v.echecs.length;
      total.faibles += nuls;
      v.textes.forEach((t) => total.pires.push({ ...t, vue: v.nom }));
      v.traits.forEach((t) => total.tlist.push({ ...t, vue: v.nom }));
      parVue.push({ nom: v.nom, textes: v.textes.length, echecs: v.echecs.length, faibles: nuls });
      if (v.echecs.length) {
        console.log(`  ✗ ${v.nom} — ${v.echecs.length}/${v.textes.length} · ${v.echecs.slice(0, 3).map((e) => `${e.c}:1 ${e.fg}/${e.bg}`).join(' · ')}`);
      }
    }
  }

  const piresVues = parVue.filter((v) => v.echecs).sort((a, b) => b.echecs - a.echecs).slice(0, 12);
  if (piresVues.length) {
    console.log('\n── VUES LES PLUS TOUCHÉES ──');
    piresVues.forEach((v) => console.log(`   ${String(v.echecs).padStart(3)}/${String(v.textes).padStart(4)}  ${v.nom}`));
  }

  if (process.env.DUMP) {
    const groupes = new Map();
    total.pires.filter((t) => t.brut < (t.grand ? 3 : 4.5)).forEach((t) => {
      const k = `${t.fg} sur ${t.bg}`;
      if (!groupes.has(k)) groupes.set(k, { n: 0, c: t.c, ex: t.texte, cls: t.cls, vue: t.vue });
      groupes.get(k).n++;
    });
    console.log('\n── GROUPES EN ÉCHEC ──');
    [...groupes.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 25).forEach(([k, v]) => {
      console.log(`   ${String(v.n).padStart(3)}×  ${k}  ${v.c}:1  [${v.cls}] « ${v.ex} » (${v.vue})`);
    });
    const gt = new Map();
    total.tlist.filter((t) => t.brut < 1.15).forEach((t) => {
      const k = `${t.fg} sur ${t.bg}`;
      if (!gt.has(k)) gt.set(k, { n: 0, c: t.c, cls: t.cls, vue: t.vue });
      gt.get(k).n++;
    });
    console.log('\n── TRAITS QUASI INVISIBLES ──');
    [...gt.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 15).forEach(([k, v]) => {
      console.log(`   ${String(v.n).padStart(3)}×  ${k}  ${v.c}:1  [${v.cls}] (${v.vue})`);
    });
  }

  total.pires.sort((a, b) => a.brut - b.brut);
  console.log('\n═══ BILAN ═══');
  console.log(`vues mesurées : ${total.vues} · textes : ${total.textes} · sous le seuil : ${total.echecs} · traits < 1,15:1 : ${total.faibles}`);
  console.log('les 10 pires contrastes :');
  total.pires.slice(0, 10).forEach((t) => console.log(`   ${t.c}:1  ${t.fg} sur ${t.bg}  (${t.vue}) « ${t.texte} »`));
  await b.close();
})();
