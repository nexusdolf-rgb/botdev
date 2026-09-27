// ============================================================
// /update — panneau public de version (serveur support)
// Réservé au fondateur (NEXORA_ADMIN_DISCORD_ID sur Render).
// Le message est visible par tout le monde dans le salon.
// ============================================================
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const ui = require('./ui');

const VERSION = 334;
const DASHBOARD_URL = 'https://hoxera.is-a.dev';
const SUPPORT_URL = 'https://discord.gg/X9hTdr9N3';

const NOTES = {
  new: [
    'Commande **/update** : publiez ce journal dans le salon des mises à jour.',
    'Tickets : bouton **Prendre ce ticket** (plus dans le menu) — il disparaît après un clic.',
    'Questionnaire : chaque question a sa propre limite de caractères (1 à 4000).',
    'Lives : mention d’**un rôle du serveur**, pas seulement @everyone / @here.',
  ],
  improved: [
    'Page Tickets : tout est rangé dans la carte, plus clair.',
    'Lives sur téléphone : l’ajout de compte s’affiche en pile.',
    'Rôles par réaction : titre et emoji du message modifiables.',
  ],
  fixed: [
    'À l’arrivée d’un membre, la mention ping **vraiment** (notification Discord).',
  ],
};

function isFounder(userId) {
  const id = String(process.env.NEXORA_ADMIN_DISCORD_ID || '').trim();
  return /^\d{15,21}$/.test(id) && String(userId || '') === id;
}

function bullets(lines) {
  return (lines || []).map((line) => `• ${line}`).join('\n');
}

function buildUpdatePanel() {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('🌐 Dashboard').setURL(DASHBOARD_URL),
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('🆘 Serveur support').setURL(SUPPORT_URL),
  );
  return ui.v2panel({
    color: '#e07a5f',
    title: `🚀 Optimus Prime — Mise à jour v${VERSION}`,
    description: [
      'Voici ce qui est **nouveau**, **amélioré** et **corrigé** dans la version actuelle.',
      `✨ **Nouveautés**\n${bullets(NOTES.new)}`,
      `🛠️ **Améliorations**\n${bullets(NOTES.improved)}`,
      `🔧 **Corrections**\n${bullets(NOTES.fixed)}`,
    ].join('\n\n'),
    footer: false,
  }, [row]);
}

async function handleUpdate(interaction) {
  const uid = interaction && interaction.user && interaction.user.id;
  if (!isFounder(uid)) {
    return interaction.reply({
      content: '⛔ Cette commande est réservée au fondateur.',
      ephemeral: true,
    });
  }
  const payload = buildUpdatePanel();
  try {
    const violations = typeof ui.v2Audit === 'function' ? ui.v2Audit(payload) : [];
    if (violations && violations.length) {
      return interaction.reply({
        content: '⚠️ Le panneau de mise à jour dépasse une limite Discord — il sera corrigé.',
        ephemeral: true,
      });
    }
  } catch { /* envoi quand même */ }
  return interaction.reply(payload);
}

module.exports = {
  VERSION,
  NOTES,
  DASHBOARD_URL,
  SUPPORT_URL,
  isFounder,
  buildUpdatePanel,
  handleUpdate,
};
