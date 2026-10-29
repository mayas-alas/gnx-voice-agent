import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { speakWithHuggingFace } from '../mcp/hf-voice.js';
import { inlineSpeech, MAX_AUDIO_BYTES } from '../app/audio.js';

const config = { HF_TOKEN: 'test-only', HF_TTS_MODEL: 'hexgrad/Kokoro-82M',
  HF_TTS_PROVIDER: 'fal-ai', VOICE_TIMEOUT_MS: 1000 };

test('HF audio becomes validated inline speech without exposing the credential', async () => {
  const client = { async textToSpeech(args, options) {
    assert.deepEqual(args, { model: config.HF_TTS_MODEL, provider: 'fal-ai', inputs: 'Hello' });
    assert.ok(options.signal instanceof AbortSignal);
    return new Blob(['test-audio'], { type: 'audio/wav' });
  } };
  const audio = inlineSpeech(await speakWithHuggingFace('Hello', 'en-US', config, client));
  assert.equal(Buffer.from(audio.audio_base64, 'base64').toString(), 'test-audio');
  assert.equal(audio.mime_type, 'audio/wav');
  assert.ok(!JSON.stringify(audio).includes(config.HF_TOKEN));
});

test('missing token and unsupported default language fail before provider calls', async () => {
  const client = { textToSpeech() { assert.fail('must not call provider'); } };
  await assert.rejects(speakWithHuggingFace('Hi', 'en-US', { ...config, HF_TOKEN: '' }, client), /HF_TOKEN/);
  await assert.rejects(speakWithHuggingFace('Hola', 'es-MX', config, client), /English/);
});

test('HF rejects empty, oversized and non-audio responses', async () => {
  for (const blob of [new Blob([]), new Blob(['{}'], { type: 'application/json' }),
    new Blob([new Uint8Array(MAX_AUDIO_BYTES + 1)], { type: 'audio/wav' })]) {
    await assert.rejects(speakWithHuggingFace('Hi', 'en', config,
      { textToSpeech: async () => blob }), /Invalid or oversized/);
  }
});

test('voice routing defaults preserve configured Oryx and honor explicit switches', () => {
  for (const [path, provider, expected] of [
    ['', undefined, 'huggingface'], ['/speech', undefined, 'oryx'],
    ['/speech', 'huggingface', 'huggingface'], ['', 'oryx', 'oryx']
  ]) {
    const env = { ...process.env, ORYX_VOICE_PATH: path, VOICE_ENABLED: 'false' };
    delete env.VOICE_PROVIDER;
    if (provider) env.VOICE_PROVIDER = provider;
    const output = execFileSync(process.execPath, ['--input-type=module', '-e',
      "import { env } from './config/env.js'; console.log(JSON.stringify([env.VOICE_PROVIDER, env.VOICE_ENABLED]));"],
    { env, encoding: 'utf8' });
    assert.deepEqual(JSON.parse(output), [expected, false]);
  }
});

test('provider failures propagate to the runtime fallback', async () => {
  await assert.rejects(speakWithHuggingFace('Hi', 'en', config,
    { textToSpeech: async () => { throw new Error('provider unavailable'); } }), /provider unavailable/);
});

test('API boundary rejects malformed base64, MIME types and oversize audio', () => {
  const valid = { status: 'ready', audio_base64: 'aGk=', mime_type: 'audio/wav' };
  assert.deepEqual(inlineSpeech(valid), valid);
  for (const override of [{ status: 'failed' }, { audio_base64: '' },
    { audio_base64: '!!!!' }, { audio_base64: 'aGk' }, { audio_base64: 'aGl=' },
    { mime_type: 'text/html' }, { audio_base64: Buffer.alloc(MAX_AUDIO_BYTES + 1).toString('base64') }]) {
    assert.throws(() => inlineSpeech({ ...valid, ...override }), /Invalid inline audio/);
  }
});
