// ============================================================================
// Rendu « façon Discord » d'un payload Components V2 — partagé par les scripts
// d'aperçu (scripts/gen-apercu-*.js).
//
// Il ne simule pas le contenu : il DESSINE les payloads réellement produits par
// server/discord/ui.js. Tout est en styles inline + zéro ressource externe, pour
// que le fichier HTML s'ouvre hors ligne et dans l'aperçu du workspace.
// ============================================================================
'use strict';

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Markdown Discord minimal : gras, titre ##, discret -#, code, liens, sauts.
function md(raw) {
  let s = esc(raw);
  s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
    '<a href="$2" style="color:#00a8fc;text-decoration:none">$1</a>');
  s = s.replace(/`([^`]+)`/g,
    '<code style="background:#1e1f22;padding:1px 4px;border-radius:4px;font-size:12.5px">$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong style="color:#f2f3f5">$1</strong>');
  s = s.replace(/^## (.*)$/gm,
    '<span style="display:block;font-size:19px;font-weight:800;line-height:1.3;margin:2px 0;color:#f2f3f5">$1</span>');
  s = s.replace(/^-# (.*)$/gm,
    '<span style="display:block;font-size:12px;color:#949ba4;font-weight:500">$1</span>');
  return s.replace(/\n/g, '<br>');
}

const ACCENTS = {
  5763719: '#57f287', 5793266: '#5865f2', 16753989: '#faa61a',
  15548997: '#ed4245', 3447003: '#3498db', 10181046: '#9b59b6',
};
const BTN = {
  1: 'background:#248046', 2: 'background:#4e5058', 3: 'background:#4e5058',
  4: 'background:#da373c', 5: 'background:#4e5058',
};

// Vignette : on ne peut pas charger l'image (aperçu hors ligne) → pastille
// colorée portant les 2 premières lettres du nom de fichier.
function thumb(url, size) {
  const m = /\/([A-Za-z0-9_-]+)\.(png|jpg|jpeg|webp|gif)/i.exec(String(url || ''));
  const label = m ? m[1].slice(0, 2).toUpperCase() : '👤';
  return `<div style="flex:0 0 ${size}px;height:${size}px;border-radius:8px;background:linear-gradient(135deg,#5865f2,#eb459e);display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;font-size:${Math.round(size * 0.34)}px">${esc(label)}</div>`;
}

function drawControl(c) {
  const t = Number(c.type);
  if (t === 2) { // Button
    if (Number(c.style) === 5) {
      return `<a style="${BTN[5]};color:#fff;padding:7px 14px;border-radius:3px;font-size:13.5px;font-weight:500;text-decoration:none;display:inline-block">↗ ${esc(c.label || '')}</a>`;
    }
    return `<span style="${BTN[c.style] || BTN[2]};color:#fff;padding:7px 14px;border-radius:3px;font-size:13.5px;font-weight:500;display:inline-block">${esc(c.label || '')}</span>`;
  }
  if (t === 3) { // StringSelectMenu
    const opts = (c.options || []).slice(0, 4).map((o) => `
      <div style="padding:7px 9px;border-radius:4px;background:#2b2d31;margin-top:4px">
        <div style="font-size:13.5px;color:#f2f3f5;font-weight:600">${esc(o.label || '')}</div>
        ${o.description ? `<div style="font-size:12px;color:#949ba4;margin-top:1px">${esc(o.description)}</div>` : ''}
      </div>`).join('');
    const more = (c.options || []).length > 4 ? `<div style="font-size:12px;color:#949ba4;padding:6px 2px 0">… et ${(c.options.length - 4)} autre(s)</div>` : '';
    return `<div style="background:#1e1f22;border:1px solid #3f4147;border-radius:4px;padding:9px;width:100%;max-width:430px">
      <div style="color:#949ba4;font-size:13px;padding:0 2px 2px">${esc(c.placeholder || '')}</div>${opts}${more}
      <div style="color:#80848e;font-size:11.5px;padding:7px 2px 0;border-top:1px solid #2b2d31;margin-top:7px">▾ menu déroulant Discord</div></div>`;
  }
  return '';
}

function drawComponent(node) {
  const t = Number(node.type);
  if (t === 17) { // Container
    const accent = ACCENTS[node.accent_color] || '#5865f2';
    const inner = (node.components || []).map(drawComponent).join('');
    return `<div style="background:#2b2d31;border:1px solid #1e1f22;border-left:4px solid ${accent};border-radius:8px;padding:12px 14px;margin:2px 0">${inner}</div>`;
  }
  if (t === 10) return `<div style="color:#dbdee1;font-size:14.5px;line-height:1.45;margin:3px 0;word-break:break-word">${md(node.content || '')}</div>`;
  // Separator : pleine largeur — il déborde le padding du conteneur, comme sur
  // Discord. C'est exactement ce que le trait texte ━ ne savait pas faire.
  if (t === 14) return `<hr style="border:0;border-top:1px solid #3f4147;margin:9px -14px;width:calc(100% + 28px)">`;
  if (t === 18) { // Section + accessoire (vignette)
    const acc = node.accessory && Number(node.accessory.type) === 11
      ? thumb(node.accessory.media && node.accessory.media.url, 48) : '';
    const texts = (node.components || []).map(drawComponent).join('');
    return `<div style="display:flex;gap:12px;align-items:flex-start;margin:3px 0"><div style="flex:1 1 auto;min-width:0">${texts}</div>${acc}</div>`;
  }
  if (t === 1) return `<div style="display:flex;flex-wrap:wrap;gap:8px;margin:9px 0 2px">${(node.components || []).map(drawControl).join('')}</div>`;
  // Composant File (type 13) : pièce jointe non-image référencée dans le
  // conteneur. En V2 un fichier uploadé n'apparaît QUE s'il est référencé ici.
  if (t === 13) {
    const url = String((node.file && node.file.url) || '');
    const name = url.replace(/^attachment:\/\//, '');
    const ext = (name.split('.').pop() || '').toUpperCase();
    return `<div style="display:flex;align-items:center;gap:10px;background:#232428;border:1px solid #1e1f22;border-radius:4px;padding:9px 11px;margin:6px 0;max-width:420px">
      <div style="width:34px;height:40px;border-radius:3px;background:#3f4147;display:flex;align-items:center;justify-content:center;font-size:9.5px;font-weight:700;color:#dbdee1">${esc(ext || 'FILE')}</div>
      <div style="min-width:0;flex:1"><div style="font-size:13.5px;color:#00a8fc;word-break:break-all">${esc(name)}</div>
      <div style="font-size:11.5px;color:#949ba4">${esc(node.size ? Math.round(node.size / 1024) + ' Ko' : 'Pièce jointe')}</div></div>
      <div style="color:#949ba4;font-size:17px">⬇</div></div>`;
  }
  if (t === 12) { // MediaGallery
    const items = (node.items || []).map(() => `<div style="height:150px;border-radius:6px;background:#1e1f22;border:1px dashed #3f4147;display:flex;align-items:center;justify-content:center;color:#949ba4;font-size:12px">🖼️ image</div>`).join('');
    return `<div style="display:grid;grid-template-columns:1fr;gap:4px;margin:6px 0">${items}</div>`;
  }
  return '';
}

// Dessine un payload complet (accepte builders discord.js ou JSON brut).
function drawPayload(payload) {
  if (!payload || !Array.isArray(payload.components)) return '';
  return payload.components.map((c) => drawComponent(typeof c.toJSON === 'function' ? c.toJSON() : c)).join('');
}

// Squelette de page (thème sombre Discord).
function page(title, intro, bodyHtml) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title></head>
<body style="margin:0;padding:26px 20px 60px;background:#1e1f22;color:#dbdee1;font-family:'gg sans','Segoe UI',Helvetica,Arial,sans-serif">
<div style="max-width:1180px;margin:0 auto">
  <h1 style="font-size:21px;color:#f2f3f5;margin:0 0 6px">${esc(title)}</h1>
  <p style="font-size:13.5px;color:#949ba4;margin:0 0 24px;line-height:1.55">${intro}</p>
  ${bodyHtml}
</div></body></html>`;
}

// Une comparaison AVANT / APRÈS (ou un rendu seul si `avant` est vide).
function compare(num, titre, note, avant, apres, apresLabel) {
  return `<section style="margin:0 0 26px">
    <h2 style="font-size:16px;color:#f2f3f5;margin:0 0 4px">${esc(num)}. ${esc(titre)}</h2>
    <p style="font-size:13px;color:#949ba4;margin:0 0 10px;line-height:1.55">${note}</p>
    <div style="display:grid;grid-template-columns:${avant ? '1fr 1fr' : '1fr'};gap:14px">
      ${avant ? `<div><div style="font-size:11px;color:#f04747;font-weight:700;letter-spacing:.6px;margin-bottom:6px">AVANT</div>${avant}</div>` : ''}
      <div><div style="font-size:11px;color:#57f287;font-weight:700;letter-spacing:.6px;margin-bottom:6px">${esc(apresLabel || 'APRÈS')}</div>${apres}</div>
    </div>
  </section>`;
}

// Une fenêtre à remplir (modale) — dessinée à la main, Discord ne la fournit
// pas sous forme de composant de message.
function drawModal(title, label, placeholder, required) {
  return `<div style="background:#313338;border:1px solid #1e1f22;border-radius:8px;padding:16px;max-width:440px">
    <div style="font-size:16px;font-weight:700;color:#f2f3f5;margin-bottom:14px">${esc(title)}</div>
    <div style="font-size:12px;font-weight:700;color:#b5bac1;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">${esc(label)}${required ? ' <span style="color:#f23f43">*</span>' : ''}</div>
    <div style="background:#1e1f22;border:1px solid #1e1f22;border-radius:3px;padding:10px;color:#6d6f78;font-size:14px">${esc(placeholder)}</div>
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">
      <span style="color:#dbdee1;padding:8px 16px;font-size:13.5px;font-weight:500">Annuler</span>
      <span style="background:#5865f2;color:#fff;padding:8px 16px;border-radius:3px;font-size:13.5px;font-weight:500">Envoyer</span>
    </div></div>`;
}

module.exports = { esc, md, drawPayload, drawComponent, drawControl, drawModal, page, compare, thumb };
