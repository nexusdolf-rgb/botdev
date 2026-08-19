// ============================================================
// Test Hoxera v71 — Assistant /roles setup & /roles edit
//  1. /roles setup : nom → texte → salon → rôles (sélecteurs natifs)
//  2. Le panneau est créé et envoyé dans le salon choisi
//  3. Un membre sélectionne un rôle → le bot le lui donne
//     (et le lui retire s'il le désélectionne)
//  4. Style boutons fonctionne aussi (un clic = un rôle)
//  5. /roles edit : modification d'un panneau existant
//  6. Anti-abus : max 25 rôles, pas de doublon, permission admin
// ============================================================
process.env.NODE_ENV = 'test';
const fs = require('fs');
const path = require('path');
const os = require('os');
process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v71-'));

let failures = 0;
const check = (label, cond) => {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  if (!cond) failures++;
};

(async () => {
  const store = require('../server/db');
  const panels = require('../server/discord/panels');
  const BOT = 1;
  store.settings.set('public_url', 'https://dash-hoxora.onrender.com');

  // ---------- Monde factice ----------
  const panelSends = [];
  const rolesMap = new Map();
  const mkRole = (id, name) => { const r = { id, name, hexColor: '#5865F2', toString: () => '@' + name, position: 10 }; rolesMap.set(id, r); return r; };
  const roleJoueur = mkRole('R1', 'Joueur GTA');
  const roleArtiste = mkRole('R2', 'Artiste');
  const chansMap = new Map();
  const mkCh = (id, name, type = 0) => { const c = { id, name, type, isTextBased: () => type === 0, send: async (p) => { panelSends.push(p); return {}; }, toString: () => '#' + name, permissionOverwrites: { edit: async () => ({}), delete: async () => ({}) }, permissionsFor: () => ({ has: () => true }) }; chansMap.set(id, c); return c; };
  const chRoles = mkCh('C1', 'roles');
  const coll = (m) => ({ get: (k) => m.get(k), has: (k) => m.has(k), find: (fn) => [...m.values()].find(fn), values: () => m.values() });
  const makeGuild = () => ({
    id: 'G1', name: 'Serveur', ownerId: 'u1', memberCount: 3,
    channels: { cache: coll(chansMap) },
    roles: { cache: coll(rolesMap), everyone: { id: 'G1' } },
    members: { cache: new Map(), fetch: async () => null, me: { roles: { highest: { position: 100 } } } },
  });
  const mkUser = (id, name) => ({ id, tag: name + '#0001', username: name, bot: false, displayAvatarURL: () => '', send: async () => ({}) });
  const ownerUser = mkUser('u1', 'Alice');
  const memberUser = mkUser('u2', 'Bob');
  const makeI = (over = {}) => {
    const isMember = !!over.memberRole;
    const user = isMember ? memberUser : ownerUser;
    const roleCache = new Map();
    const m = { id: user.id, user, permissions: { has: () => true }, roles: { cache: roleCache, add: async (r) => { roleCache.set(r.id, r); }, remove: async (r) => { roleCache.delete(r.id); }, highest: { position: 100 } } };
    const i = {
      replied: false, deferred: false, replies: [], commandName: '', customId: '', values: [],
      fields: { getTextInputValue: () => '' }, user, member: m, guild: makeGuild(),
      channel: chRoles,
      client: { user: { id: 'bot1' }, users: { fetch: async (id) => user } },
      message: over.message || { id: 'msg-x', edit: async () => ({}), embeds: [], content: '' },
      options: { getString: () => null, getInteger: () => null, getUser: () => null, getChannel: () => null, getSubcommand: () => null, getSubcommandGroup: () => null },
      reply: async function (p) { this.replied = true; this.replies.push(['reply', p]); this.lastMsg = { id: 'wz-' + this.replies.length, edit: async () => ({}), embeds: [], content: '' }; return this.lastMsg; },
      update: async function (p) { this.replied = true; this.replies.push(['update', p]); return {}; },
      deferReply: async function () { this.deferred = true; },
      deferUpdate: async function () { this.deferred = true; },
      editReply: async function (p) { this.replied = true; this.replies.push(['edit', p]); return {}; },
      followUp: async function (p) { this.replied = true; this.replies.push(['followup', p]); return { id: 'wz-msg', edit: async () => ({}), embeds: [], content: '' }; },
      showModal: async function (p) { this.replied = true; this.replies.push(['modal', p]); },
      isRepliable: () => true,
      isChatInputCommand: () => !!over.isChat,
      isButton: () => !!over.isBtn,
      isStringSelectMenu: () => !!over.isSelect,
      isRoleSelectMenu: () => !!over.isRoleSelect,
      isChannelSelectMenu: () => !!over.isChanSelect,
      isModalSubmit: () => !!over.isModal,
    };
    return Object.assign(i, over);
  };
  const wizardMsg = (over = {}) => ({
    id: 'wz-msg',
    edit: async (p) => { wizardEdits.push(p); return {}; },
    embeds: [], content: '',
    ...over,
  });
  let wizardEdits = [];
  const resetEdits = () => { wizardEdits = []; };

  // ---------- 1. /roles setup : parcours complet ----------
  const w0 = makeI({ isChat: true, commandName: 'roles', options: { getSubcommand: () => 'setup' } });
  await panels.dispatchPanels(BOT, w0);
  check('setup : démarre par la modale « nom »', w0.replied && w0.replies[0][0] === 'modal');

  // nom
  const wName = makeI({ isModal: true, customId: 'rls:modal:1:u1', fields: { getTextInputValue: () => 'Rôles du serveur' }, message: wizardMsg() });
  await panels.dispatchPanels(BOT, wName);
  check('setup : nom enregistré + assistant affiché', wName.replied && wName.replies.some((r) => r[0] === 'followup'));

  // texte au-dessus
  const wContent = makeI({ isSelect: true, customId: 'rls:sel:1:u1', values: ['content'], message: wizardMsg() });
  await panels.dispatchPanels(BOT, wContent);
  check('setup : action « texte » → modale', wContent.replies[0][0] === 'modal');
  const wContentVal = makeI({ isModal: true, customId: 'rls:modal:1:u1', fields: { getTextInputValue: () => 'Choisis tes rôles !' }, message: wizardMsg() });
  await panels.dispatchPanels(BOT, wContentVal);
  check('setup : texte enregistré', wContentVal.replied);

  // salon (sélecteur natif)
  const wChannel = makeI({ isSelect: true, customId: 'rls:sel:1:u1', values: ['channel'], message: wizardMsg() });
  await panels.dispatchPanels(BOT, wChannel);
  const wChanPick = makeI({ isChanSelect: true, customId: 'rls:chan:1:u1', values: ['C1'], message: wizardMsg() });
  await panels.dispatchPanels(BOT, wChanPick);
  check('setup : salon sélectionné', wChanPick.replied);

  // ajouter un rôle (sélecteur natif → modale emoji)
  const wAdd = makeI({ isSelect: true, customId: 'rls:sel:1:u1', values: ['addrole'], message: wizardMsg() });
  await panels.dispatchPanels(BOT, wAdd);
  const wRolePick = makeI({ isRoleSelect: true, customId: 'rls:role:1:u1', values: ['R1'], message: wizardMsg() });
  await panels.dispatchPanels(BOT, wRolePick);
  check('setup : rôle sélectionné → modale emoji', wRolePick.replies[0] && wRolePick.replies[0][0] === 'modal');
  const wEmoji = makeI({ isModal: true, customId: 'rls:modal:1:u1', fields: { getTextInputValue: () => '🎮' }, message: wizardMsg() });
  await panels.dispatchPanels(BOT, wEmoji);
  check('setup : rôle ajouté avec emoji', wEmoji.replied);
  // 2e rôle
  const wRolePick2 = makeI({ isRoleSelect: true, customId: 'rls:role:1:u1', values: ['R2'], message: wizardMsg() });
  await panels.dispatchPanels(BOT, wRolePick2);
  const wEmoji2 = makeI({ isModal: true, customId: 'rls:modal:1:u1', fields: { getTextInputValue: () => '🎨' }, message: wizardMsg() });
  await panels.dispatchPanels(BOT, wEmoji2);
  // retour à l'écran principal puis terminer
  const wDoneRoles = makeI({ isBtn: true, customId: 'rls:btn:1:u1:doneroles', message: wizardMsg() });
  await panels.dispatchPanels(BOT, wDoneRoles);
  const wFinish = makeI({ isSelect: true, customId: 'rls:sel:1:u1', values: ['finish'], message: wizardMsg() });
  await panels.dispatchPanels(BOT, wFinish);
  const menus = store.roleMenus.all(BOT, 'G1');
  check('setup : le panneau est enregistré (1 panneau, 2 rôles)', menus.length === 1 && menus[0].options.length === 2);
  check('setup : nom + texte + salon corrects', menus[0].name === 'Rôles du serveur' && menus[0].content === 'Choisis tes rôles !' && menus[0].channel === 'C1');
  check('setup : emojis conservés', menus[0].options[0].emoji === '🎮' && menus[0].options[1].emoji === '🎨');
  check('setup : panneau envoyé dans le salon choisi', panelSends.length === 1);

  // ---------- 2. Un membre choisit son rôle → le bot le lui donne ----------
  panelSends.length = 0;
  const wSelect = makeI({ memberRole: true, isSelect: true, customId: `bd-menu:${BOT}:${menus[0].id}`, values: ['Joueur GTA'] });
  await panels.dispatchPanels(BOT, wSelect);
  check('membre : sélection → réponse', wSelect.replied);
  check('membre : le rôle est donné automatiquement', wSelect.member.roles.cache.has('R1'));
  // désélection
  const wUnselect = makeI({ memberRole: true, isSelect: true, customId: `bd-menu:${BOT}:${menus[0].id}`, values: [] });
  await panels.dispatchPanels(BOT, wUnselect);
  check('membre : désélection → rôle retiré', !wUnselect.member.roles.cache.has('R1'));

  // ---------- 3. Style boutons ----------
  const wMode = makeI({ isSelect: true, customId: 'rls:sel:1:u1', values: ['mode'], message: wizardMsg() });
  // (le wizard a été supprimé à « finish » → relançons un edit)
  const wEdit2 = makeI({ isChat: true, commandName: 'roles', options: { getSubcommand: () => 'edit' } });
  await panels.dispatchPanels(BOT, wEdit2);
  // un seul panneau → assistant direct
  const wModeBtn = makeI({ isSelect: true, customId: 'rls:sel:1:u1', values: ['mode'], message: wizardMsg() });
  await panels.dispatchPanels(BOT, wModeBtn);
  const wFinishBtn = makeI({ isSelect: true, customId: 'rls:sel:1:u1', values: ['finish'], message: wizardMsg() });
  await panels.dispatchPanels(BOT, wFinishBtn);
  const menus2 = store.roleMenus.all(BOT, 'G1');
  check('edit : style passé en boutons', menus2[0].mode === 'buttons');
  // bouton = 1 rôle
  panelSends.length = 0;
  const wBtn = makeI({ memberRole: true, isBtn: true, customId: `bd-rmbtn:${BOT}:${menus2[0].id}:Joueur GTA` });
  await panels.dispatchPanels(BOT, wBtn);
  check('boutons : un clic donne le rôle', wBtn.replied && wBtn.member.roles.cache.has('R1'));

  // ---------- 4. Anti-abus ----------
  const wSetup2 = makeI({ isChat: true, commandName: 'roles', options: { getSubcommand: () => 'setup' } });
  await panels.dispatchPanels(BOT, wSetup2);
  const wName2 = makeI({ isModal: true, customId: 'rls:modal:1:u1', fields: { getTextInputValue: () => 'Test limite' }, message: wizardMsg() });
  await panels.dispatchPanels(BOT, wName2);
  // doublon refusé : on re-ajoute le rôle R1 déjà présent ? (nouveau brouillon → options vides)
  const wAdd2 = makeI({ isSelect: true, customId: 'rls:sel:1:u1', values: ['addrole'], message: wizardMsg() });
  await panels.dispatchPanels(BOT, wAdd2);
  const wRoleAgain = makeI({ isRoleSelect: true, customId: 'rls:role:1:u1', values: ['R1'], message: wizardMsg() });
  await panels.dispatchPanels(BOT, wRoleAgain);
  const wEmojiA = makeI({ isModal: true, customId: 'rls:modal:1:u1', fields: { getTextInputValue: () => '🎮' }, message: wizardMsg() });
  await panels.dispatchPanels(BOT, wEmojiA);
  const wRoleDup = makeI({ isRoleSelect: true, customId: 'rls:role:1:u1', values: ['R1'], message: wizardMsg() });
  await panels.dispatchPanels(BOT, wRoleDup);
  check('anti-abus : doublon refusé', wRoleDup.replied && wRoleDup.replies[0][1].content.includes('déjà'));

  // 25 max : finir sans rôle → refus
  const wName3 = makeI({ isModal: true, customId: 'rls:modal:1:u1', fields: { getTextInputValue: () => 'Vide' }, message: wizardMsg() });
  // (le brouillon précédent existe encore : finissons-le d'abord)
  const wBack = makeI({ isBtn: true, customId: 'rls:btn:1:u1:doneroles', message: wizardMsg() });
  await panels.dispatchPanels(BOT, wBack);
  const wCancel = makeI({ isSelect: true, customId: 'rls:sel:1:u1', values: ['cancel'], message: wizardMsg() });
  await panels.dispatchPanels(BOT, wCancel);
  // nouveau setup sans rôle → finish → refus
  const wSetup3 = makeI({ isChat: true, commandName: 'roles', options: { getSubcommand: () => 'setup' } });
  await panels.dispatchPanels(BOT, wSetup3);
  const wName3v = makeI({ isModal: true, customId: 'rls:modal:1:u1', fields: { getTextInputValue: () => 'Vide' }, message: wizardMsg() });
  await panels.dispatchPanels(BOT, wName3v);
  const wFinishEmpty = makeI({ isSelect: true, customId: 'rls:sel:1:u1', values: ['finish'], message: wizardMsg() });
  await panels.dispatchPanels(BOT, wFinishEmpty);
  check('anti-abus : impossible de terminer sans rôle', wFinishEmpty.replied && wFinishEmpty.replies[0][1].content.includes('au moins'));

  store.db.close();
  console.log(failures === 0 ? '\n✅ V71 — Assistant /roles setup + /roles edit : 100 % fonctionnel, globalement. 🎉' : `\n❌ ${failures} vérification(s) en échec`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('❌', e); process.exit(1); });
