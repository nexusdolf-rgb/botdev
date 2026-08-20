// ============================================================
// Hoxera — Utilitaires de fuseau horaire (zéro dépendance)
// Les annonces programmées / anniversaires doivent partir à
// l'heure LOCALE du serveur Discord (Europe/Paris par défaut),
// jamais à l'heure UTC du serveur d'hébergement.
// ============================================================
const DEFAULT_TZ = 'Europe/Paris';

function pad2(n) { return String(n).padStart(2, '0'); }

// Vérifie qu'un fuseau IANA est valide, sinon repli Europe/Paris.
function safeTz(tz) {
  if (tz && typeof tz === 'string') {
    try { new Intl.DateTimeFormat('en-CA', { timeZone: tz }); return tz; }
    catch { /* fuseau invalide → repli */ }
  }
  return DEFAULT_TZ;
}

// Décompose une Date dans un fuseau donné :
// { ymd, year, month, day, dow (1=lundi…7=dimanche), hour, minute, tz }
function parts(date, tz) {
  const safe = safeTz(tz);
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: safe,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const p = {};
  for (const part of fmt.formatToParts(date)) p[part.type] = part.value;
  const hour = parseInt(p.hour, 10) % 24;
  const minute = parseInt(p.minute, 10);
  const day = parseInt(p.day, 10);
  const month = parseInt(p.month, 10);
  const ymd = `${p.year}-${p.month}-${p.day}`;
  // Jour de la semaine calculé sur la date locale (indépendant du locale)
  const jsDow = new Date(Date.parse(`${ymd}T12:00:00Z`)).getUTCDay(); // 0=dim
  const dow = jsDow === 0 ? 7 : jsDow;
  return { ymd, year: parseInt(p.year, 10), month, day, dow, hour, minute, tz: safe };
}

function nowParts(tz) { return parts(new Date(), tz); }

// Instant UTC (ms) où il est `ymd` à `hour`:`minute` dans le fuseau `tz`.
// Exact même pendant les changements d'heure (sauf dans la nuit même du
// changement, où l'erreur est bornée à 1 h — sans conséquence ici).
function zonedInstant(ymd, hour, minute, tz) {
  const approx = Date.parse(`${ymd}T${pad2(hour)}:${pad2(minute)}:00Z`);
  if (Number.isNaN(approx)) return NaN;
  const p = parts(new Date(approx), tz);
  const asUtc = Date.parse(`${p.ymd}T${pad2(p.hour)}:${pad2(p.minute)}:00Z`);
  const offset = asUtc - approx; // décalage du fuseau à cet instant
  return approx - offset;
}

module.exports = { DEFAULT_TZ, safeTz, parts, nowParts, zonedInstant };
