'use strict';
// مؤثرات صوتية بالذكاء الاصطناعي (ElevenLabs Sound Effects) + ترجمة الوصف من العربي للإنجليزي.
const fs = require('fs');
const path = require('path');
const { hash, slug, hasArabic } = require('./util');

const ENDPOINT = 'https://api.elevenlabs.io/v1/sound-generation';

async function translatePrompt(llm, model, text) {
  if (!hasArabic(text)) return text;
  const out = await llm.text({
    model,
    system: 'You translate sound-effect descriptions from Arabic (any dialect) to concise, vivid English prompts for a sound-effects generator. Output only the English prompt, no quotes.',
    user: text, maxTokens: 200
  });
  return out.replace(/^["']|["']$/g, '').trim();
}

async function generate({ apiKey, text, durationSeconds, promptInfluence = 0.4, outDir, fetchImpl, loop = false }) {
  if (!apiKey) throw new Error('حط مفتاح ElevenLabs من الإعدادات الأول.');
  if (!text || !text.trim()) throw new Error('اكتب وصف الصوت.');
  const f = fetchImpl || require('./http').nodeFetch;
  const dur = durationSeconds ? Math.min(30, Math.max(0.5, +durationSeconds)) : null;
  const file = path.join(outDir, `${slug(text, 32)}-${hash(text + '|' + dur + '|' + promptInfluence + '|' + loop)}.mp3`);
  if (fs.existsSync(file)) return { file, cached: true };
  const body = { text, prompt_influence: promptInfluence };
  if (dur) body.duration_seconds = dur;
  if (loop) body.loop = true;
  const res = await f(ENDPOINT, { method: 'POST', headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' }, body: JSON.stringify(body) });
  if (!res.ok) {
    let msg = ''; try { msg = await res.text(); } catch (_) {}
    throw new Error(`ElevenLabs ${res.status}: ${msg.slice(0, 300)}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(file, buf);
  return { file, cached: false, bytes: buf.length };
}

// موسيقى بالذكاء الاصطناعي (ElevenLabs Music) — مزيكا خلفية على مقاس الفيديو.
const MUSIC_ENDPOINT = 'https://api.elevenlabs.io/v1/music';
async function generateMusic({ apiKey, prompt, seconds = 30, instrumental = true, outDir, fetchImpl }) {
  if (!apiKey) throw new Error('حط مفتاح ElevenLabs من الإعدادات الأول.');
  if (!prompt || !prompt.trim()) throw new Error('اوصف المزيكا.');
  const f = fetchImpl || require('./http').nodeFetch;
  const ms = Math.round(Math.min(300, Math.max(10, +seconds || 30)) * 1000);
  const file = path.join(outDir, `music-${slug(prompt, 28)}-${hash(prompt + '|' + ms + '|' + instrumental)}.mp3`);
  if (fs.existsSync(file)) return { file, cached: true };
  const body = { prompt, music_length_ms: ms, model_id: 'music_v1' };
  if (instrumental) body.force_instrumental = true;
  const res = await f(MUSIC_ENDPOINT, { method: 'POST', headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' }, body: JSON.stringify(body), timeout: 300000 });
  if (!res.ok) { let msg = ''; try { msg = await res.text(); } catch (_) {} throw new Error(`ElevenLabs Music ${res.status}: ${msg.slice(0, 300)}`); }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(file, buf);
  return { file, cached: false, bytes: buf.length };
}

module.exports = { translatePrompt, generate, generateMusic, ENDPOINT, MUSIC_ENDPOINT };
