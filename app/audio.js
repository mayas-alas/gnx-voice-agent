export const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
export const AUDIO_TYPES = new Set(['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/flac', 'audio/aac', 'audio/mp4', 'audio/webm']);

export function inlineSpeech(audio) {
  const encoded = audio.audio_base64;
  if (audio.status !== 'ready' || !AUDIO_TYPES.has(audio.mime_type)
    || typeof encoded !== 'string' || !encoded.length
    || encoded.length > 4 * Math.ceil(MAX_AUDIO_BYTES / 3)
    || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new Error('Invalid inline audio');
  }
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length > MAX_AUDIO_BYTES || bytes.toString('base64') !== encoded) {
    throw new Error('Invalid inline audio');
  }
  return { status: 'ready', audio_base64: encoded, mime_type: audio.mime_type };
}
