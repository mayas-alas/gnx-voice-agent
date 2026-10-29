import { InferenceClient } from '@huggingface/inference';
import { AUDIO_TYPES, MAX_AUDIO_BYTES } from '../app/audio.js';

export async function speakWithHuggingFace(text, locale, config, client) {
  if (!config.HF_TOKEN) throw new Error('Set HF_TOKEN with Inference Providers permission');
  // The default fal-ai Kokoro mapping is specifically American English.
  if (config.HF_TTS_PROVIDER === 'fal-ai' && config.HF_TTS_MODEL === 'hexgrad/Kokoro-82M'
    && !/^en(?:-|$)/i.test(locale)) {
    throw new Error('Default Kokoro route supports English; configure a compatible TTS model/provider for other languages');
  }
  client ||= new InferenceClient(config.HF_TOKEN);
  const audio = await client.textToSpeech({
    model: config.HF_TTS_MODEL, provider: config.HF_TTS_PROVIDER, inputs: text
  }, { signal: AbortSignal.timeout(config.VOICE_TIMEOUT_MS) });
  const mime_type = audio.type.split(';')[0].trim().toLowerCase();
  if (!audio.size || audio.size > MAX_AUDIO_BYTES || !AUDIO_TYPES.has(mime_type)) {
    throw new Error('Invalid or oversized Hugging Face audio');
  }
  return { status: 'ready', mime_type,
    audio_base64: Buffer.from(await audio.arrayBuffer()).toString('base64') };
}
