// Lien d'invitation Hoxera avec les permissions utilisées par ses modules.
// Administrator (8) est volontairement exclu : le serveur conserve le contrôle.
const { PermissionsBitField } = require('discord.js');

const F = PermissionsBitField.Flags;
const REQUIRED_PERMISSIONS = [
  F.ViewChannel,
  F.SendMessages,
  F.ReadMessageHistory,
  F.EmbedLinks,
  F.AttachFiles,
  F.AddReactions,
  F.UseExternalEmojis,
  F.ManageMessages,
  F.ManageChannels,
  F.ManageRoles,
  F.ManageWebhooks,
  F.ViewAuditLog,
  F.ManageGuild,
  F.KickMembers,
  F.BanMembers,
  F.ModerateMembers,
  F.Connect,
  F.Speak,
  F.MoveMembers,
  F.MuteMembers,
  F.DeafenMembers,
  F.ManageEvents,
  F.CreateEvents,
  F.ManageThreads,
  F.CreatePublicThreads,
  F.CreatePrivateThreads,
  F.SendMessagesInThreads,
  F.MentionEveryone,
  F.ManageNicknames,
  F.ChangeNickname,
  F.ManageGuildExpressions,
].filter((flag) => flag !== undefined);

const PERMISSION_BITS = PermissionsBitField.resolve(REQUIRED_PERMISSIONS);

function inviteUrl(clientId) {
  const id = String(clientId || '').trim();
  if (!/^\d{15,21}$/.test(id)) return '';
  const url = new URL('https://discord.com/oauth2/authorize');
  url.searchParams.set('client_id', id);
  url.searchParams.set('permissions', PERMISSION_BITS.toString());
  url.searchParams.set('scope', 'bot applications.commands');
  return url.toString();
}

module.exports = { REQUIRED_PERMISSIONS, PERMISSION_BITS, inviteUrl };
