import express from 'express';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { env } from '../config/env.js';
import { capabilities, call, close } from '../mcp/client.js';
import { correlate } from './correlation.js';

if (!['127.0.0.1', '::1', 'localhost'].includes(env.HOST) && !env.GNX_API_TOKEN) {
  throw new Error('Non-loopback binding requires GNX_API_TOKEN (use TLS at the deployment boundary)');
}
const app = express();
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'no-referrer');
  res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; media-src 'self' https: http:; img-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  next();
});
app.get('/health/live', (_req, res) => res.json({ status: 'ok', version: '0.0.1' }));
app.use('/v1', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (env.GNX_API_TOKEN) {
    const supplied = Buffer.from(req.headers.authorization || '');
    const expected = Buffer.from(`Bearer ${env.GNX_API_TOKEN}`);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED' } });
    }
  }
  if (req.method !== 'GET' && !req.is('application/json')) {
    return res.status(415).json({ error: { code: 'JSON_REQUIRED' } });
  }
  next();
});
app.use(express.json({ limit: '32kb' }));
app.get('/v1/capabilities', (_req, res) => res.json({
  text: true, speech: env.VOICE_ENABLED, capabilities, max_input_chars: 8000
}));
const turn = z.object({
  session_id: z.string().uuid(), turn_id: z.string().uuid(),
  text: z.string().trim().min(1).max(8000), locale: z.string().max(32).default('en-US'),
  speak: z.boolean().default(false)
}).strict();
const busy = new Set();
app.post('/v1/turns', async (req, res) => {
  const parsed = turn.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: 'INVALID_TURN' } });
  const input = parsed.data;
  if (busy.has(input.session_id)) return res.status(409).json({ error: { code: 'SESSION_BUSY' } });
  if (busy.size >= 20) return res.status(429).json({ error: { code: 'BUSY' } });
  busy.add(input.session_id);
  const started = Date.now();
  const request_id = randomUUID();
  try {
    const { speak, ...args } = input;
    const refs = correlate(input.session_id, input.turn_id);
    const answer = await call('model.complete', { ...args, refs });
    if (typeof answer.text !== 'string' || !answer.text.trim() || answer.text.length > 32000) {
      throw new Error('Invalid model capability output');
    }
    let finalRefs = correlate(input.session_id, input.turn_id, answer.refs || {});
    let speech = { status: 'not_requested' };
    if (speak) {
      speech = { status: 'unavailable', code: 'VOICE_DISABLED' };
      if (env.VOICE_ENABLED) {
        try {
          const audio = await call('voice.speak', { ...args, text: answer.text, refs: finalRefs });
          if (audio.status !== 'ready' || typeof audio.url !== 'string') throw new Error('Invalid voice output');
          const url = new URL(audio.url);
          if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid audio URL');
          finalRefs = correlate(input.session_id, input.turn_id, audio.refs || {});
          speech = { status: 'ready', url: url.href, mime_type: audio.mime_type };
        } catch {
          speech = { status: 'failed', code: 'VOICE_UNAVAILABLE' };
        }
      }
    }
    res.json({ session_id: input.session_id, turn_id: input.turn_id, text: answer.text, speech });
    console.log(JSON.stringify({ request_id, turn_id: input.turn_id, duration_ms: Date.now() - started, speech: speech.status, status: 'ok' }));
  } catch {
    console.error(JSON.stringify({ request_id, turn_id: input.turn_id, status: 'failed' }));
    res.status(502).json({ error: { code: 'CAPABILITY_FAILED', message: 'Check runtime configuration and upstream availability.' }, request_id });
  } finally { busy.delete(input.session_id); }
});
app.use('/v1', (_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND' } }));
app.use(express.static(fileURLToPath(new URL('../web/', import.meta.url))));
app.use((error, _req, res, _next) => {
  res.status(error.type === 'entity.too.large' ? 413 : 400).json({ error: { code: 'INVALID_REQUEST' } });
});
const server = app.listen(env.PORT, env.HOST, () => console.log(`GNX v0.0.1: http://${env.HOST}:${env.PORT}`));
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  const timer = setTimeout(() => process.exit(1), 5000).unref();
  server.close();
  await close();
  clearTimeout(timer);
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
