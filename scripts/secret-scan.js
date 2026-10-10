#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['.git', 'node_modules', 'coverage', 'dist', 'build', 'out', 'target']);
const TEXT_EXTENSIONS = new Set(['.js', '.cjs', '.mjs', '.json', '.yml', '.yaml', '.md', '.txt', '.html', '.css', '.sh', '.toml', '.ini']);
const SPECIAL_TEXT_FILES = new Set(['Dockerfile', '.env', '.env.example', '.gitignore', '.dockerignore', '.npmrc', '.node-version', 'Procfile']);
const SENSITIVE_ENV_KEYS = new Set([
  'HOXERA_TOKEN', 'DISCORD_TOKEN', 'DISCORD_CLIENT_SECRET', 'BOTDEV_GH_TOKEN',
  'BOTDEV_DATA_ENCRYPTION_KEY', 'BOTDEV_DATA_ENCRYPTION_KEY_PREVIOUS',
  'GITHUB_TOKEN', 'AWS_SECRET_ACCESS_KEY', 'DATABASE_URL',
]);
const SECRET_PATTERNS = [
  ['GitHub token', /(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/],
  ['Slack token', /xox[baprs]-[A-Za-z0-9-]{10,}/],
  ['Discord token', /(?:mfa\.[A-Za-z0-9_-]{70,}|[A-Za-z0-9_-]{23,28}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{25,})/],
  ['Google API key', /AIza[0-9A-Za-z_-]{35}/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['Private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
];
const PLACEHOLDER = /^(?:\.\.\.|<[^>]+>|\$\{[^}]+\}|(?:your|example|sample|replace|change|placeholder|dummy|fake|test)(?:[-_ ]|$)|x{3,}$)/i;

const matches = [];
function record(rel, message) { matches.push(`${rel}: ${message}`); }

function scanEnvFile(rel, text) {
  for (const line of text.split(/\r?\n/)) {
    const assignment = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!assignment || !SENSITIVE_ENV_KEYS.has(assignment[1])) continue;
    let value = assignment[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1).trim();
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }
    if (value && !PLACEHOLDER.test(value)) record(rel, `valeur configurée pour ${assignment[1]} (ne pas la committer)`);
  }
}

function inspectFile(file) {
  const basename = path.basename(file);
  const ext = path.extname(file).toLowerCase();
  const isEnv = basename === '.env' || basename.startsWith('.env.');
  if (!TEXT_EXTENSIONS.has(ext) && !SPECIAL_TEXT_FILES.has(basename) && !isEnv) return;
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return; }
  if (text.includes('\u0000')) return;
  const rel = path.relative(ROOT, file);
  if (isEnv) scanEnvFile(rel, text);
  for (const [name, pattern] of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) record(rel, `motif de ${name} détecté`);
  }
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(full);
    } else if (entry.isFile()) {
      inspectFile(full);
    }
  }
}

walk(ROOT);
if (matches.length) {
  console.error('❌ Des motifs de secrets possibles ont été trouvés :');
  for (const match of matches) console.error(`  - ${match}`);
  process.exit(1);
}
console.log('✅ Aucun motif de jeton ou clé privée détecté dans les sources et fichiers d’environnement.');
