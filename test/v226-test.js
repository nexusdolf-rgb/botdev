// Test v2.26 — Visibilité & organisation des commandes.
// Objectif : les commandes sont triées par public visé (public / staff /
// admin) et une commande staff reste INVISIBLE pour un membre non-staff,
// aussi bien à l'enregistrement Discord (default_member_permissions) que
// dans le centre d'aide /help.
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const DATA_DIR = path.join(os.tmpdir(), `botdev-v226-${Date.now()}`);
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.BOTDEV_DATA_DIR = DATA_DIR;

const { PermissionsBitField } = require('discord.js');
const store = require('../server/db');
const premade = require('../server/discord/premade');
const extra = require('../server/discord/extra');
const guildEvents = require('../server/discord/guildEvents');

const F = PermissionsBitField.Flags;
const ADMIN = F.Administrator;
let failures = 0;
function check(name, ok) {
  if (!ok) failures++;
  console.log(`  ${ok ? '✅' : '❌'} ${name}`);
}

// Membre factice dont la permission est un bitfield. Miroir exact de la
// semantique Discord : la permission Administrateur donne TOUTES les autres.
function mkMember(flags, id = 'M1') {
  const bit = flags.reduce((a, f) => a | BigInt(f), 0n);
  return {
    id,
    user: { id },
    permissions: {
      bitfield: bit,
      has: (p) => {
        const need = (Array.isArray(p) ? p : [p]).reduce((a, f) => a | BigInt(f), 0n);
        if (bit & BigInt(ADMIN)) return true; // Administrateur => tout passe
        return (bit & need) === need;
      },
    },
  };
}
const guild = { id: 'G1', name: 'Serveur', ownerId: 'OWNER' };
const clientUser = { username: 'Hoxera', tag: 'Hoxera#1', displayAvatarURL: () => 'https://cdn/x.png' };
const helpCtx = { prefix: '!' };

(async () => {
  // ---------- 0. Bot avec TOUS les modules ----------
  const uid = store.users.create('discord:v226@discord.botdev', 'x', {});
  const BOT = store.bots.create({ user_id: uid, name: 'Hoxera', token: 'T', client_id: '1', prefix: '!' });
  for (const k of ['moderation', 'utility', 'fun', 'economy', 'levels', 'community']) store.modules.set(BOT, k, 1);

  // ---------- 1. Classification ----------
  console.log('\n1) Classification public / staff / admin');
  const ADMIN_NAMES = ['ticket', 'botprofile', 'modlogs', 'blacklist', 'roles', 'lockdown', 'voicetemp', 'apply', 'event', 'lang', 'say', 'giveaway', 'suggestions'];
  const STAFF_NAMES = ['kick', 'ban', 'unban', 'timeout', 'warn', 'warns', 'clear', 'sanction', 'temprole'];
  const PUBLIC_NAMES = ['ping', '8ball', 'meme', 'marry', 'quiz', 'daily', 'suggest', 'help'];
  for (const n of ADMIN_NAMES) check(`${n} -> admin`, premade.commandKind(n) === 'admin');
  for (const n of STAFF_NAMES) check(`${n} -> staff`, premade.commandKind(n) === 'staff');
  for (const n of PUBLIC_NAMES) check(`${n} -> public`, premade.commandKind(n) === 'public');

  // ---------- 2. Enregistrement : permissions natives coherentes ----------
  console.log('\n2) Enregistrement Discord : permission metier exacte');
  const payloads = premade.buildSlashPayloads(BOT);
  const find = (name) => payloads.find((p) => p.name === name);

  // /warns corrige : reserve au staff (ModerateMembers), comme /warn
  check('CMD_DEFS.warns : perms ModerateMembers', premade.CMD_DEFS.warns.perms && String(premade.CMD_DEFS.warns.perms[0]) === String(F.ModerateMembers));
  const warnsP = find('warns');
  check('/warns : default_member_permissions = ModerateMembers', !!warnsP && warnsP.default_member_permissions === String(F.ModerateMembers));

  // Permission metier SEULE (pas Administrateur + metier : un moderateur
  // avec KickMembers mais sans Administrateur doit VOIR /kick).
  const kickP = find('kick');
  check('/kick : visible des KickMembers', !!kickP && kickP.default_member_permissions === String(F.KickMembers));
  check("kick : n'exige plus Administrateur en plus", !!kickP && kickP.default_member_permissions !== String(ADMIN | F.KickMembers));
  const clearP = find('clear');
  check('/clear : visible des ManageMessages', !!clearP && clearP.default_member_permissions === String(F.ManageMessages));
  const temproleP = find('temprole');
  check('/temprole : visible des ManageRoles', !!temproleP && temproleP.default_member_permissions === String(F.ManageRoles));
  const warnP = find('warn');
  check('/warn : visible des ModerateMembers', !!warnP && warnP.default_member_permissions === String(F.ModerateMembers));

  // Commandes de configuration -> '8' (Administrateur), pas de bit metier.
  for (const n of ['lang', 'say', 'giveaway', 'suggestions']) {
    const p = find(n);
    check(`${n} : default = Administrateur`, !!p && p.default_member_permissions === String(ADMIN));
  }
  // Payloads dedies administration
  const allDedicated = premade.buildSlashPayloads(BOT).concat(extra.buildExtraPayloads(), guildEvents.buildEventPayloads());
  for (const n of ADMIN_NAMES) {
    const p = allDedicated.find((x) => x.name === n);
    check(`${n} (payload dedie) : default = Administrateur`, !!p && p.default_member_permissions === String(ADMIN));
  }
  // Publics : AUCUNE restriction d'enregistrement
  for (const n of PUBLIC_NAMES) {
    const p = find(n);
    if (p) check(`${n} : public (aucune permission)`, !p.default_member_permissions);
  }
  const marryP = extra.buildExtraPayloads().find((p) => p.name === 'marry');
  check('marry (extra) : public (aucune permission)', !!marryP && !marryP.default_member_permissions);

  // Coherence globale : toute commande CMD_DEFS avec perms enregistre
  // exactement la valeur calculee par defaultPermissionBitsFor.
  let coherent = true;
  for (const name of premade.enabledCommandNames(BOT)) {
    const def = premade.CMD_DEFS[name];
    const p = find(name);
    if (!p) continue;
    const expect = premade.defaultPermissionBitsFor(def);
    const got = p.default_member_permissions ? BigInt(p.default_member_permissions) : null;
    if ((expect === null) !== (got === null) || (expect !== null && got !== expect)) coherent = false;
  }
  check('coherence totale registre <-> garde (CMD_DEFS)', coherent);

  // ---------- 3. /help filtre par le role du membre ----------
  console.log('\n3) Centre aide : staff invisible pour les non-staff');
  const fieldsOf = (embed) => embed.data.fields.map((f) => f.name);
  const hasField = (embed, part) => fieldsOf(embed).some((n) => n.includes(part));

  const normal = mkMember([]);
  const mod = mkMember([F.KickMembers, F.ModerateMembers]);
  const admin = mkMember([ADMIN], 'ADM');
  const owner = mkMember([], 'OWNER');

  // Vue complete (sans contexte membre) : conserve l'ancienne semantique
  const full = premade.buildHelpEmbed(BOT, helpCtx, { user: clientUser }, null, null, null);
  check('sans contexte : Personnalisation du serveur presente', hasField(full, 'Personnalisation du serveur'));
  check('sans contexte : bloc moderation present', hasField(full, 'Modération & sanctions'));
  check('sans contexte : bloc tickets present', hasField(full, 'Tickets & menus'));

  // Membre lambda : aucune commande staff/admin, legende explicite
  const gNormal = premade.buildHelpEmbed(BOT, helpCtx, { user: clientUser }, guild, null, normal);
  check('membre lambda : pas de bloc moderation', !hasField(gNormal, 'Modération & sanctions'));
  check('membre lambda : pas de Personnalisation du serveur', !hasField(gNormal, 'Personnalisation du serveur'));
  check('membre lambda : pas de bloc tickets', !hasField(gNormal, 'Tickets & menus'));
  check('membre lambda : pas de /kick dans les champs', !JSON.stringify(gNormal.data.fields).includes('/kick'));
  check('membre lambda : legende Commandes invisibles', hasField(gNormal, 'Commandes invisibles'));
  check('membre lambda : les blocs publics restent', hasField(gNormal, 'Utilitaires') && hasField(gNormal, 'Social & interactions'));

  // Moderateur (KickMembers + ModerateMembers) : la moderation apparait,
  // l'administration reste masquee
  const gMod = premade.buildHelpEmbed(BOT, helpCtx, { user: clientUser }, guild, null, mod);
  check('moderateur : bloc moderation visible', hasField(gMod, 'Modération & sanctions'));
  check('moderateur : /warns visible dans le bloc', JSON.stringify(gMod.data.fields).includes('/warns'));
  check('moderateur : pas de configuration admin', !hasField(gMod, 'Personnalisation du serveur'));
  check('moderateur : legende administration presente', hasField(gMod, 'Commandes invisibles'));

  // Administrateur : tout est visible
  const gAdmin = premade.buildHelpEmbed(BOT, helpCtx, { user: clientUser }, guild, null, admin);
  check('administrateur : bloc moderation visible', hasField(gAdmin, 'Modération & sanctions'));
  check('administrateur : Personnalisation du serveur visible', hasField(gAdmin, 'Personnalisation du serveur'));
  check('administrateur : bloc tickets visible', hasField(gAdmin, 'Tickets & menus'));
  check("administrateur : pas de legende d'invisibilite", !hasField(gAdmin, 'Commandes invisibles'));

  // Proprietaire du serveur : tout est visible sans permission speciale
  const gOwner = premade.buildHelpEmbed(BOT, helpCtx, { user: clientUser }, guild, null, owner);
  check('proprietaire : bloc admin visible', hasField(gOwner, 'Personnalisation du serveur') && hasField(gOwner, 'Tickets & menus'));

  // Detail d'une commande staff : non divulgue au membre lambda
  const detailNormal = premade.buildHelpEmbed(BOT, helpCtx, { user: clientUser }, guild, 'kick', normal);
  check('/help kick (lambda) -> reservee au staff', JSON.stringify(detailNormal.data).includes('réservée au staff'));
  const detailMod = premade.buildHelpEmbed(BOT, helpCtx, { user: clientUser }, guild, 'kick', mod);
  check('/help kick (moderateur) -> detail fourni', !JSON.stringify(detailMod.data).includes('réservée au staff') && JSON.stringify(detailMod.data.title || '').includes('kick'));
  const detailBotprofileAdmin = premade.buildHelpEmbed(BOT, helpCtx, { user: clientUser }, guild, 'botprofile', admin);
  check('/help botprofile (admin) -> detail fourni', JSON.stringify(detailBotprofileAdmin.data).includes('botprofile avatar'));

  // ---------- 4. Sanity : commandes enregistrees toujours bien routees ----------
  console.log('\n4) Sanity final');
  const all = premade.buildSlashPayloads(BOT).concat(extra.buildExtraPayloads(), guildEvents.buildEventPayloads());
  const names = new Set(all.map((p) => p.name));
  for (const n of [...premade.enabledCommandNames(BOT), 'ticket', 'roles', 'botprofile', 'modlogs', 'blacklist', 'lockdown', 'voicetemp', 'apply', 'event']) {
    check(`commande ${n} enregistree`, names.has(n));
  }

  console.log(failures === 0 ? '\n✅ V226 — Commandes triées, visibilité staff/public cohérente (registre + /help). 🎉' : `\n❌ ${failures} vérification(s) en échec`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
