// v283 — 🤖 Deuxième avis IA pour l'auto-modération.
// Philosophie « bot pro » : les règles rapides (automod.js) font TOUT le
// travail de détection et de sanction ; l'IA n'intervient qu'APRÈS coup,
// en avis consultatif dans le journal, et jamais sur chaque message.
// Garde-fous : 1 avis max par heure et par membre, module désactivable,
// quota horaire + plafond journalier gérés par le moteur, aucun blocage.
const ai = require('../ai/engine');
const logging = require('./logging');

const COOLDOWN_MS = 60 * 60 * 1000; // 1 avis IA / heure / membre
const lastReview = new Map(); // `${guildId}:${userId}` -> timestamp

async function review(botId, message, meta = {}) {
  try {
    if (!message || !message.guild || !message.author || message.author.bot) return;
    if (meta.observed) return; // clic « tester » du dashboard : pas de vrai avis
    const cfg = ai.cfgOf(message.guild.id);
    if (!cfg.enabled || !cfg.modules.antispam) return;
    const key = `${message.guild.id}:${message.author.id}`;
    const now = Date.now();
    if ((lastReview.get(key) || 0) > now - COOLDOWN_MS) return;
    lastReview.set(key, now);
    if (lastReview.size > 5000) { for (const [k, t] of lastReview) if (t < now - COOLDOWN_MS) lastReview.delete(k); }
    const rule = String(meta.rule || 'inconnue');
    const content = String(message.content || '').slice(0, 500);
    if (!content) return;
    const { text } = await ai.ask(botId, message.guild.id, 'antispam',
      `L'auto-modération vient de sanctionner ce message (règle « ${rule} ») publié par ${message.author.tag} :\n« ${content} »\nDonnez en 2 lignes maximum : 1) le verdict (spam, publicité, harcèlement, contenu choquant, ou faux positif probable), 2) la recommandation au staff (rien de plus, avertissement, mute, ban).`);
    await logging.log(botId, message.guild, {
      title: '🤖 Deuxième avis IA — auto-modération',
      description: `<@${message.author.id}> — règle « ${rule} »\n${text}`,
      color: '#5865F2',
    });
  } catch { /* un avis IA ne doit jamais gêner la modération */ }
}

module.exports = { review, _test: { lastReview, COOLDOWN_MS } };
