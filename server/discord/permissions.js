// ============================================================
// Hoxera — Autorisations de configuration par serveur
//
// Règle Optimus Prime :
//   - le propriétaire du serveur a toujours accès ;
//   - un membre qui possède la permission Discord native
//     « Administrateur » a accès ;
//   - « Gérer le serveur » et les autres permissions seules ne suffisent pas.
//
// Ce fichier centralise la règle pour éviter qu'une route, une commande ou
// un assistant interactif applique une politique différente.
// ============================================================

const ADMINISTRATOR = 8n; // Discord PermissionFlagsBits.Administrator

function permissionBits(value) {
  if (value === null || value === undefined || value === '') return 0n;
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.trunc(value));
  try { return BigInt(String(value).trim()); } catch { return 0n; }
}

function hasAdministratorPermission(value) {
  return (permissionBits(value) & ADMINISTRATOR) === ADMINISTRATOR;
}

function memberHasAdministrator(member) {
  if (!member) return false;
  const permissions = member.permissions;
  if (!permissions) return false;

  if (typeof permissions.has === 'function') {
    try {
      if (permissions.has(Number(ADMINISTRATOR))) return true;
    } catch {}
  }
  return hasAdministratorPermission(permissions.bitfield);
}

function isServerOwner(guild, userId) {
  return !!guild && userId !== null && userId !== undefined
    && String(guild.ownerId) === String(userId);
}

function canConfigureGuild(guild, member, userId) {
  const effectiveUserId = userId !== undefined && userId !== null ? userId : member && member.id;
  return isServerOwner(guild, effectiveUserId) || memberHasAdministrator(member);
}

function canConfigureInteraction(interaction) {
  return !!interaction && canConfigureGuild(
    interaction.guild,
    interaction.member,
    interaction.user && interaction.user.id,
  );
}

function oauthGuildCanConfigure(guild) {
  if (!guild) return false;
  return !!guild.owner || hasAdministratorPermission(guild.permissions);
}

function accessKind(guild) {
  if (!guild) return 'none';
  if (guild.owner) return 'owner';
  if (hasAdministratorPermission(guild.permissions)) return 'administrator';
  return 'readonly';
}

module.exports = {
  ADMINISTRATOR,
  permissionBits,
  hasAdministratorPermission,
  memberHasAdministrator,
  isServerOwner,
  canConfigureGuild,
  canConfigureInteraction,
  oauthGuildCanConfigure,
  accessKind,
};
