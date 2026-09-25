import { env } from '../config/env.js';

// Correlation only: no messages, provider state, or durable session ownership.
const entries = new Map();
const allowed = new Set(['hf_ref', 'omniroute_ref', 'mcp_ref', 'oryx_ref']);
export function correlate(sessionId, turnId, refs = {}) {
  const now = Date.now();
  for (const [id, entry] of entries) {
    if (entry.expires <= now) entries.delete(id);
  }
  const previous = entries.get(sessionId)?.refs || {};
  const clean = Object.fromEntries(Object.entries(refs).filter(([key, value]) =>
    allowed.has(key) && typeof value === 'string' && value.length <= 2048));
  const entry = { turn_id: turnId, refs: { ...previous, ...clean }, expires: now + env.CORRELATION_TTL_MS };
  entries.delete(sessionId);
  entries.set(sessionId, entry);
  while (entries.size > env.MAX_CORRELATIONS) entries.delete(entries.keys().next().value);
  return { ...entry.refs };
}
