'use strict';

const MODEL = 'gemini-3.5-flash-lite';
const MAX_KEY_LENGTH = 512;
const MAX_PROMPT_CHARS = 18000;

module.exports = async function geminiProxy(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: { message: 'Yalnızca POST istekleri kabul edilir.' } });
  }

  const origin = req.headers.origin;
  const host = String(req.headers.host || '').toLowerCase();
  try {
    if (!origin || !host || new URL(origin).host.toLowerCase() !== host) {
      return res.status(403).json({ error: { message: 'İstek uygulamanın kendi adresinden gelmelidir.' } });
    }
  } catch {
    return res.status(403).json({ error: { message: 'İstek kaynağı doğrulanamadı.' } });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
  const requestedModel = typeof body.model === 'string' ? body.model.replace(/^models\//, '') : '';
  const contents = body.contents;
  const suppliedConfig = body.generationConfig && typeof body.generationConfig === 'object'
    ? body.generationConfig
    : {};

  if (!apiKey || apiKey.length > MAX_KEY_LENGTH) {
    return res.status(400).json({ error: { message: 'Geçerli bir Gemini API anahtarı gerekli.' } });
  }
  if (requestedModel !== MODEL) {
    return res.status(400).json({ error: { message: 'Yalnızca ücretsiz Gemini 3.5 Flash-Lite modeli etkin.' } });
  }
  if (!Array.isArray(contents) || contents.length < 1 || contents.length > 40) {
    return res.status(400).json({ error: { message: 'Gemini isteğinin içerik biçimi geçersiz.' } });
  }

  let promptChars = 0;
  for (const content of contents) {
    if (!content || !['user', 'model'].includes(content.role) || !Array.isArray(content.parts) || !content.parts.length) {
      return res.status(400).json({ error: { message: 'Gemini içerik biçimi geçersiz.' } });
    }
    for (const part of content.parts) {
      if (typeof part?.text !== 'string') {
        return res.status(400).json({ error: { message: 'Bu uygulama yalnızca metin isteklerini destekler.' } });
      }
      promptChars += part.text.length;
      if (promptChars > MAX_PROMPT_CHARS) {
        return res.status(413).json({ error: { message: 'İstek metni çok uzun.' } });
      }
    }
  }

  const generationConfig = {};
  if (Number.isFinite(Number(suppliedConfig.maxOutputTokens))) {
    generationConfig.maxOutputTokens = Math.max(1, Math.min(1500, Math.floor(Number(suppliedConfig.maxOutputTokens))));
  }
  if (Number.isFinite(Number(suppliedConfig.temperature))) {
    generationConfig.temperature = Math.max(0, Math.min(1, Number(suppliedConfig.temperature)));
  }
  if (suppliedConfig.responseMimeType === 'application/json') {
    generationConfig.responseMimeType = 'application/json';
  }

  let upstream;
  try {
    upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: 'Türkçe yanıt veren, yararlı ve dürüst bir alışveriş ve içerik üretim asistanısın. Gerçek zamanlı mağaza fiyatı veya stok verisine erişimin olduğunu iddia etme. Kullanıcı fiyatları kendisi kaydettiyse bunları kayıt zamanı ile değerlendir.' }]
        },
        contents,
        generationConfig
      })
    });
  } catch {
    return res.status(502).json({ error: { message: 'Google Gemini API’ye ulaşılamadı.' } });
  }

  const responseText = await upstream.text();
  res.status(upstream.status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.send(responseText || '{}');
};
