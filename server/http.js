// Helpers HTTP sortants : délais bornés et réponses de taille limitée.
async function readLimitedBody(response, maxBytes) {
  const headerLength = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(headerLength) && headerLength > maxBytes) {
    throw new Error('Réponse HTTP trop volumineuse.');
  }

  const stream = response.body;
  if (stream && typeof stream.getReader === 'function') {
    const reader = stream.getReader();
    const chunks = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = Buffer.from(value);
        total += chunk.length;
        if (total > maxBytes) {
          await reader.cancel().catch(() => {});
          throw new Error('Réponse HTTP trop volumineuse.');
        }
        chunks.push(chunk);
      }
    } finally {
      try { reader.releaseLock(); } catch {}
    }
    return Buffer.concat(chunks, total);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > maxBytes) throw new Error('Réponse HTTP trop volumineuse.');
  return buffer;
}

async function fetchJson(url, options = {}, { timeoutMs = 10000, maxBytes = 2 * 1024 * 1024 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Délai réseau dépassé.')), timeoutMs);
  const externalSignal = options.signal;
  const onExternalAbort = () => controller.abort(externalSignal.reason);
  if (externalSignal) {
    if (externalSignal.aborted) onExternalAbort();
    else externalSignal.addEventListener('abort', onExternalAbort, { once: true });
  }

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const bytes = await readLimitedBody(response, maxBytes);
    let json = null;
    try { json = JSON.parse(bytes.toString('utf8')); } catch {}
    return { response, json };
  } finally {
    clearTimeout(timer);
    if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
  }
}

module.exports = { fetchJson, readLimitedBody };
