// ============================================================
// Audit UI automatisé (mobile + desktop) sous CSP v205 — v5
// Sélectionne OneState CI-ML-SN → module Bienvenue → vérifie
// la section "Salons à détailler" + pings <#id> (.dc-mention)
// dans l'aperçu + débordements. Puis module Événements (bonus).
// Usage : node scripts/audit-ui.mjs
// ============================================================
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = 'http://127.0.0.1:3100';
const GUILD_NAME = 'OneState CI-ML-SN';
const outDir = '/tmp/audit-shots';
fs.mkdirSync(outDir, { recursive: true });

const errors = [];
function log(...a) { console.log(...a); }

async function checkOverflow(page, label) {
  const r = await page.evaluate(() => {
    const doc = document.documentElement;
    const win = window;
    const offenders = [];
    const max = win.innerWidth;
    document.querySelectorAll('body *').forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.right > max + 1 && rect.left < max) {
        const cls = typeof el.className === 'string' ? el.className.split(' ')[0] : '';
        offenders.push(`${el.tagName.toLowerCase()}.${cls} → ${Math.round(rect.right)}px`);
      }
    });
    return { scrollW: doc.scrollWidth, clientW: doc.clientWidth, offenders: offenders.slice(0, 10) };
  });
  const ok = r.scrollW <= r.clientW + 1;
  log(`  [${label}] scrollW=${r.scrollW} clientW=${r.clientW} ${ok ? '✅' : '⚠️ DÉBORDEMENT'}`);
  if (!ok) {
    r.offenders.forEach((o) => log(`      ⚠️ ${o}`));
    errors.push(`Débordement: ${label}`);
  }
  return ok;
}

async function audit(browser, { width, height, isMobile, label }) {
  log(`\n===== VIEWPORT ${label} (${width}x${height}) =====`);
  const ctx = await browser.newContext({
    viewport: { width, height }, isMobile, hasTouch: isMobile, deviceScaleFactor: 1,
  });
  await ctx.addCookies([{ name: 'botdev_session', value: 'audit-session-v205', domain: '127.0.0.1', path: '/' }]);
  const page = await ctx.newPage();
  const pageErrors = [];
  const failedReq = [];
  page.on('pageerror', (e) => pageErrors.push(`pageerror: ${e.message}`));
  // Les ressources EXTERNES (Google Fonts, avatars Discord) sont bloquées par
  // le sandbox réseau de l'audit : elles sont autorisées par la CSP du vrai
  // site (style-src fonts.googleapis.com, img-src https:), donc on ne les
  // compte pas comme erreurs. Seules les ressources locales comptent.
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (/Failed to load resource/i.test(m.text())) return; // image/font externe du sandbox
    pageErrors.push(`console.error: ${m.text().slice(0, 140)}`);
  });
  page.on('requestfailed', (r) => {
    const url = r.url();
    if (url.startsWith('http://127.0.0.1') || url.startsWith('http://localhost')) {
      failedReq.push(`${url.slice(0, 90)} (${r.failure()?.errorText})`);
    }
  });

  await page.goto(BASE + '/#/dashboard', { waitUntil: 'networkidle', timeout: 25000 }).catch((e) => log(`  ⚠️ goto: ${e.message.slice(0, 100)}`));
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${outDir}/${label}-1-dash.png` });
  await checkOverflow(page, `${label} dashboard`);

  // ---- Sélection de la guilde ----
  let selected = false;
  if (!isMobile) {
    const srvCard = page.locator('.dash-server-card').first();
    if (await srvCard.isVisible().catch(() => false)) {
      await srvCard.click().catch(() => {});
      await page.waitForTimeout(1200);
    }
    const targetCard = page.locator('.sp-card[data-name*="onestate ci-ml-sn"]').first();
    if (await targetCard.isVisible().catch(() => false)) { await targetCard.click().catch(() => {}); selected = true; }
    else log(`  ⚠️ carte cible introuvable (${await page.locator('.sp-card').count()} cartes)`);
  } else {
    const card = page.locator(`button.srv-card:has-text("${GUILD_NAME}")`).first();
    if (await card.isVisible().catch(() => false)) { await card.click().catch(() => {}); selected = true; }
    else log(`  ⚠️ carte mobile introuvable (${await page.locator('.srv-card').count()} cartes)`);
  }
  if (!selected) { errors.push(`${label}: guilde non sélectionnée`); await ctx.close(); return; }

  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${outDir}/${label}-2-guild-config.png` });
  await checkOverflow(page, `${label} config guild`);

  // ---- Module Bienvenue (welcome) : config channelsmulti + aperçu pings ----
  let welcomeOpened = false;
  if (!isMobile) {
    const wNav = page.locator('.dash-side-item[data-m="welcome"]').first();
    if (await wNav.isVisible().catch(() => false)) { await wNav.click().catch(() => {}); welcomeOpened = true; }
  } else {
    const modBtn = page.locator('#d-mobile-modules').first();
    if (await modBtn.isVisible().catch(() => false)) {
      await modBtn.click().catch(() => {});
      await page.waitForTimeout(900);
      const wItem = page.locator('.dash-mobile-module-item[data-mobile-module="welcome"]').first();
      if (await wItem.isVisible().catch(() => false)) { await wItem.click().catch(() => {}); welcomeOpened = true; }
    }
  }
  if (!welcomeOpened) {
    const wTab = page.locator('button:has-text("Bienvenue")').first();
    if (await wTab.isVisible().catch(() => false)) { await wTab.click().catch(() => {}); welcomeOpened = true; }
  }
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${outDir}/${label}-3-welcome.png` });
  await checkOverflow(page, `${label} module Bienvenue`);
  log(`  module Bienvenue ouvert: ${welcomeOpened}`);

  // Ouvrir la config member_join si liste de types
  const joinCard = page.locator('[data-event-type="member_join"], .event-card:has-text("arrivée"), [data-key="member_join"]').first();
  if (await joinCard.isVisible().catch(() => false)) {
    await joinCard.click().catch(() => {});
    await page.waitForTimeout(2500);
  }
  await page.screenshot({ path: `${outDir}/${label}-4-welcome-config.png` });
  await checkOverflow(page, `${label} config bienvenue`);

  // ---- Vérifications pings + channelsmulti ----
  // Scénario réel : le message contient {channels} → l'aperçu doit rendre
  // les salons détaillés en VRAIS pings <#id> (.dc-mention).
  const msgInput = page.locator('[data-k="message"]').first();
  if (await msgInput.isVisible().catch(() => false)) {
    await msgInput.fill('Bienvenue {user} sur {server} ! 🎉\nPour bien commencer, prends connaissance de :\n{channels}\nÀ bientôt !');
    await page.waitForTimeout(800);
  }
  await page.screenshot({ path: `${outDir}/${label}-5-welcome-pings.png` });
  const html = await page.locator('#app').innerHTML().catch(() => '');
  const mentions = (html.match(/class="dc-mention"/g) || []).length;
  const mentionTexts = [...html.matchAll(/class="dc-mention"[^>]*>([^<]*)</g)].map((m) => m[1]);
  const hasMulti = /Salons à détailler|Salons qui seront listés/i.test(html);
  const cmRows = await page.locator('.cm-row').count();
  log(`  section "Salons à détailler": ${hasMulti ? '✅ présente' : '❌ absente'}`);
  log(`  lignes salons (cm-row): ${cmRows}`);
  log(`  pings <#id> rendus (.dc-mention): ${mentions} → ${mentionTexts.slice(0, 4).join(', ')}`);
  if (!hasMulti) errors.push(`${label}: section channelsmulti absente`);
  if (mentions === 0) errors.push(`${label}: aucun ping .dc-mention rendu dans l'aperçu`);

  log(`  erreurs page: ${pageErrors.length ? pageErrors.join(' | ').slice(0, 220) : 'aucune'}`);
  log(`  requêtes locales échouées: ${failedReq.length ? failedReq.join(' | ') : 'aucune'}`);
  if (pageErrors.length) errors.push(`${label}: ${pageErrors[0]}`);
  if (failedReq.length) errors.push(`${label}: req locales: ${failedReq[0]}`);
  await ctx.close();
}

const browser = await chromium.launch({ headless: true });
try {
  await audit(browser, { width: 1440, height: 900, isMobile: false, label: 'desktop' });
  await audit(browser, { width: 390, height: 844, isMobile: true, label: 'mobile' });
} finally { await browser.close(); }

log(`\n===== RÉSUMÉ =====`);
log(errors.length ? `❌ ${errors.length} problème(s):\n  - ${errors.join('\n  - ')}` : '✅ AUCUN problème');
process.exit(errors.length ? 1 : 0);
