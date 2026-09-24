// v299 — 💡 Suggestions améliorées : anonymat + motif de refus + discussion.
// Vérifié : colonnes suggestions (author_tag, anonymous, status_reason) +
// statut « discussion », modale de refus obligatoire (routage panels.js),
// panneau (auteur anonyme, tag mémorisé, motif affiché, couleur discussion),
// annonce des approuvées (anonyme respecté), option /suggest anonyme,
// réglage dashboard + route, bump v299.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { MessageFlags } = require('discord.js');

const TMP = path.join(__dirname, '.tmp-v299');
fs.rmSync(TMP, { recursive: true, force: true });
process.env.BOTDEV_DATA_DIR = TMP;
fs.mkdirSync(TMP, { recursive: true });

const store = require('../server/db');
const suggest = require('../server/discord/suggest');

let ok = 0;
function check(label, cond, info) {
  assert.ok(cond, 'ÉCHEC : ' + label + (info ? ' (' + info + ')' : ''));
  ok++;
  console.log('  ✅ ' + label);
}
const racine = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const json = (x) => JSON.stringify(x.components.map((c) => (c.toJSON ? c.toJSON() : c)));

(async () => {
  const B = Number(store.bots.create({ user_id: 1, name: 'T', token: 'x', client_id: 'c', prefix: '!' }));
  const G = 'gV299';

  console.log('— 1. Base de données —');
  const id1 = store.suggestions.create({ bot_id: B, guild_id: G, author_id: 'u1', text: 'Idée', message_id: '', channel_id: 'c1', author_tag: 'Fondateur#0001', anonymous: 1 });
  const r1 = store.suggestions.get(id1);
  check('author_tag + anonymous enregistrés', r1.author_tag === 'Fondateur#0001' && r1.anonymous === 1);
  const id2 = store.suggestions.create({ bot_id: B, guild_id: G, author_id: 'u2', text: 'Autre', message_id: '', channel_id: 'c1' });
  const r2 = store.suggestions.get(id2);
  check('création sans les nouveaux champs = défauts (0 / vide)', r2.anonymous === 0 && r2.author_tag === '' && r2.status_reason === '');
  store.suggestions.setStatus(id2, 'discussion');
  check('statut « discussion » accepté', store.suggestions.get(id2).status === 'discussion');
  store.suggestions.setStatus(id2, 'nimporte');
  check('statut inconnu → pending (comme avant)', store.suggestions.get(id2).status === 'pending');
  store.suggestions.setStatusWithReason(id2, 'denied', 'x'.repeat(600));
  const r2b = store.suggestions.get(id2);
  check('motif de refus enregistré + borné à 500', r2b.status === 'denied' && r2b.status_reason.length === 500);
  store.guildSettings.set(B, G, { suggestion_anon: 1 });
  check('réglage suggestion_anon enregistré', store.guildSettings.get(B, G).suggestion_anon === 1);
  store.guildSettings.set(B, G, { suggestion_channel: '#idées' });
  check('suggestion_anon préservé par un autre réglage (merge)', store.guildSettings.get(B, G).suggestion_anon === 1 && store.guildSettings.get(B, G).suggestion_channel === '#idées');

  console.log('— 2. Panneau : anonymat + auteur mémorisé —');
  const base = { id: 9, bot_id: B, status: 'pending', upvotes: 2, downvotes: 0, text: 'Une idée', author_id: 'u9', author_tag: 'Paul#1234', anonymous: 0, status_reason: '' };
  const jAnon = json(suggest.buildPanel({ ...base, anonymous: 1 }, 'Paul#1234', {}));
  check('suggestion anonyme → « 🕶️ Anonyme », pseudo masqué', jAnon.includes('🕶️ Anonyme') && !jAnon.includes('Paul#1234'));
  const jTag = json(suggest.buildPanel(base, '', {}));
  check('réédition sans tag → le pseudo mémorisé reste affiché (avant : « membre »)', jTag.includes('Paul#1234') && !jTag.includes('— membre'));
  const jOld = json(suggest.buildPanel({ ...base, author_tag: '' }, '', {}));
  check('ancienne suggestion sans author_tag → repli « membre »', jOld.includes('— membre'));

  console.log('— 3. Panneau : motif de refus + statut discussion —');
  const jDen = json(suggest.buildPanel({ ...base, status: 'denied', status_reason: 'Déjà proposé en #idées' }, '', {}));
  check('refus avec motif → bloc « 📝 Motif du refus »', jDen.includes('📝 Motif du refus') && jDen.includes('Déjà proposé en #idées'));
  const jDenNo = json(suggest.buildPanel({ ...base, status: 'denied' }, '', {}));
  check('refus sans motif (avant v299) → aucun bloc vide', !jDenNo.includes('Motif du refus'));
  const pDis = suggest.buildPanel({ ...base, status: 'discussion' }, '', {});
  const jDis = json(pDis);
  check('statut « 💬 En discussion » affiché', jDis.includes('💬 En discussion'));
  check('discussion → accent jaune, refus → rouge, attente → corail',
    pDis.components[0].toJSON().accent_color === 0xFEE75C
    && suggest.buildPanel({ ...base, status: 'denied' }, '', {}).components[0].toJSON().accent_color === 0xED4245
    && suggest.buildPanel(base, '', {}).components[0].toJSON().accent_color === 0xE07A5F);
  check('les 3 compteurs restent groupés (v232)', /\*\*📊 Statut\*\* .* · \*\*👍 Votes\*\* 2 · \*\*👎 Votes\*\* 0/.test(jDis));

  console.log('— 4. Boutons : 2 lignes, votes + staff —');
  const comps = suggest.buildComponents(base, {});
  check('2 lignes : votes puis staff', comps.length === 2);
  const cj = comps.map((r) => r.toJSON());
  check('ligne 1 = 👍 👎', cj[0].components.length === 2 && cj[0].components[1].custom_id === `bd-sugg:${B}:down:9`);
  check('ligne 2 = ✅ ❌ 💬 (custom ids cohérents)', cj[1].components.map((b) => b.custom_id).join('|') === `bd-sugg:${B}:approve:9|bd-sugg:${B}:deny:9|bd-sugg:${B}:discuss:9`);
  check('💬 En discussion = bouton secondaire', cj[1].components[2].style === 2 && cj[1].components[2].label === '💬 En discussion');
  const compsOff = JSON.stringify(suggest.buildComponents(base, { suggestion_downvotes: 0 }).map((r) => r.toJSON()));
  check('👎 désactivé → absent (v198 conservé)', !compsOff.includes(':down:'));

  console.log('— 5. Modale « motif du refus » —');
  const modal = suggest.denyReasonModal(B, 9).toJSON();
  check('customId bd-suggdeny:bot:id', modal.custom_id === `bd-suggdeny:${B}:9`);
  const input = modal.components[0].components[0];
  check('champ « reason » obligatoire, paragraphe, max 500', input.custom_id === 'reason' && input.required === true && input.style === 2 && input.max_length === 500);
  const srcPanels = racine('server/discord/panels.js');
  check('routage de la modale dans panels.js', srcPanels.includes('bd-suggdeny:') && srcPanels.includes('submitDenyReason'));
  const srcSugg = racine('server/discord/suggest.js');
  check('❌ Refuser ouvre la modale (plus de refus direct)', srcSugg.includes("if (action === 'deny') return interaction.showModal(denyReasonModal(botId, sid));"));
  check('motif vide refusé à la validation', srcSugg.includes('Le motif du refus est obligatoire'));

  console.log('— 6. Annonce des approuvées : anonymat respecté —');
  const ann = suggest.buildApprovedAnnouncement(base);
  check('annonce = Components V2', (ann.flags & MessageFlags.IsComponentsV2) === MessageFlags.IsComponentsV2);
  const jAnn = json(ann);
  check('auteur mentionné si non anonyme', jAnn.includes('<@u9>'));
  const jAnnA = json(suggest.buildApprovedAnnouncement({ ...base, anonymous: 1 }));
  check('anonyme → aucune mention, mot « anonyme »', !jAnnA.includes('<@u9>') && jAnnA.includes('Suggestion **anonyme**'));

  console.log('— 7. /suggest : option anonyme —');
  const premade = racine('server/discord/premade.js');
  check('option booléenne « anonyme » dans la commande', premade.includes("name: 'anonyme'") && premade.includes('ApplicationCommandOptionType.Boolean'));
  check('option défensive (getBoolean facultatif) + transmise au moteur', premade.includes("typeof src.interaction.options.getBoolean === 'function'") && premade.includes('submitSuggestion(botId, src.interaction, text, anon)'));
  check('garde serveur : anonymat non activé → refus poli', srcSugg.includes('Les suggestions anonymes ne sont pas activées sur ce serveur.'));

  console.log('— 8. Dashboard + route —');
  const dash = racine('public/js/dashboard.js');
  check('toggle « 🕶️ Autoriser les suggestions anonymes »', dash.includes('s-anon') && dash.includes('Autoriser les suggestions anonymes'));
  check('toggle envoyé dans la sauvegarde', dash.includes("anon: c.querySelector('#s-anon').checked ? 1 : 0"));
  check('aide de la carte mentionne le motif + la discussion', dash.includes('une fenêtre demande le motif') && dash.includes('💬 En discussion'));
  check('route : suggestion_anon borné à 0/1', racine('server/routes.js').includes("suggestion_anon: (b.anon === 1 || b.anon === true || b.anon === '1') ? 1 : 0"));

  console.log('— 9. Bump v299 —');
  const index = racine('public/index.html');
  check('index.html : ?v=317 référencé 7 fois', (index.match(/\?v=317/g) || []).length === 7, String((index.match(/\?v=317/g) || []).length));
  check('sw.js : cache « botdev-v317 »', racine('public/sw.js').includes("const CACHE = 'botdev-v317';"));

  console.log(`\n🎉 v299 : ${ok} vérifications passées`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
