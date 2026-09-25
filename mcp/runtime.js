import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { env, modelRoute, mediaOrigins } from '../config/env.js';

const server = new McpServer({ name: 'gnx-runtime', version: '0.0.2' });
const result = data => ({ content: [{ type: 'text', text: JSON.stringify(data) }] });
const identity = {
  session_id: z.string().max(128),
  turn_id: z.string().max(128),
  locale: z.string().max(32).default('en-US')
};
async function post(url, token, body, timeout) {
  const response = await fetch(url, {
    method: 'POST',
    redirect: 'error',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout)
  });
  if (!response.ok) throw new Error(`Upstream returned HTTP ${response.status}`);
  return response.json();
}

server.registerTool('model_complete', {
  description: 'Complete text using the configured HF or OmniRoute route. Stateless; no automatic tool loop.',
  inputSchema: { ...identity, text: z.string().min(1).max(8000), refs: z.record(z.string()).optional() }
}, async ({ text }) => {
  try {
    if (!modelRoute.model || (env.CLOUD_ROUTE === 'public' && !modelRoute.token)) {
      throw new Error('Configure the selected model and cloud credentials');
    }
    const data = await post(`${modelRoute.base.replace(/\/$/, '')}/chat/completions`, modelRoute.token, {
      model: modelRoute.model,
      messages: [{ role: 'user', content: text }],
      stream: false
    }, env.REQUEST_TIMEOUT_MS);
    const answer = data.choices?.[0]?.message?.content;
    if (typeof answer !== 'string' || !answer.trim()) throw new Error('Model did not return text');
    return result({ text: answer, refs: data.id ? { [modelRoute.ref]: String(data.id) } : {} });
  } catch (error) {
    console.error('model_complete:', error.message);
    return { isError: true, ...result({ code: 'MODEL_UNAVAILABLE' }) };
  }
});

server.registerTool('voice_speak', {
  description: 'Send final text to the configured Oryx-owned voice bridge; Oryx owns synthesis and media.',
  inputSchema: { ...identity, text: z.string().min(1).max(32000), refs: z.record(z.string()).optional() }
}, async ({ text, session_id, turn_id, locale }) => {
  try {
    if (!env.VOICE_ENABLED) return result({ status: 'unavailable', code: 'VOICE_DISABLED' });
    // This bridge contract is application-defined, NOT a claimed native Oryx endpoint.
    if (!env.ORYX_VOICE_PATH.startsWith('/') || !env.ORYX_API_SECRET) {
      throw new Error('Configure ORYX_VOICE_PATH and ORYX_API_SECRET for the deployed Oryx primitive');
    }
    const endpoint = new URL(env.ORYX_VOICE_PATH, env.ORYX_BASE_URL);
    if (endpoint.origin !== new URL(env.ORYX_BASE_URL).origin) throw new Error('Invalid Oryx bridge origin');
    const data = await post(endpoint, env.ORYX_API_SECRET, {
      text, session_id, turn_id, locale
    }, env.VOICE_TIMEOUT_MS);
    if (typeof data.audio_url !== 'string') throw new Error('Oryx bridge must return audio_url');
    const audio = new URL(data.audio_url, env.ORYX_PUBLIC_BASE_URL || env.ORYX_BASE_URL);
    if (!mediaOrigins.has(audio.origin) || audio.username || audio.password) {
      throw new Error('Invalid media URL');
    }
    return result({ status: 'ready', url: audio.href,
      mime_type: typeof data.mime_type === 'string' ? data.mime_type : 'audio/mpeg',
      refs: data.id ? { oryx_ref: String(data.id) } : {} });
  } catch (error) {
    console.error('voice_speak:', error.message);
    return { isError: true, ...result({ code: 'VOICE_UNAVAILABLE' }) };
  }
});

await server.connect(new StdioServerTransport());
