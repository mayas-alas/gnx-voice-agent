import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
}

test('API → MCP preserves Oryx, auth, disabled voice and HF failure text fallback', async t => {
  let voiceCalls = 0;
  const upstream = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const input = JSON.parse(body);
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/v1/chat/completions') {
      assert.equal(input.messages[0].content, 'Hello');
      res.end(JSON.stringify({ choices: [{ message: { content: 'Hello back' } }] }));
    } else {
      voiceCalls++;
      assert.equal(req.headers.authorization, 'Bearer oryx-test');
      assert.equal(input.text, 'Hello back');
      res.end(JSON.stringify({ audio_url: '/audio/test.wav', mime_type: 'audio/wav' }));
    }
  });
  const upstreamPort = await listen(upstream);
  t.after(() => new Promise(resolve => upstream.close(resolve)));
  const origin = `http://127.0.0.1:${upstreamPort}`;
  for (const mode of ['oryx', 'huggingface', 'disabled']) {
    const reservation = http.createServer();
    const port = await listen(reservation);
    await new Promise(resolve => reservation.close(resolve));
    const appOrigin = `http://127.0.0.1:${port}`;
    const child = spawn(process.execPath, ['app/server.js'], {
      env: { ...process.env, BIND_HOST: '127.0.0.1', PORT: String(port), APP_ORIGIN: appOrigin,
        GNX_API_TOKEN: 'app-test', CLOUD_ROUTE: 'private', OMNIROUTE_BASE_URL: `${origin}/v1`,
        OMNIROUTE_MODEL: 'mock-model', OMNIROUTE_API_KEY: '',
        VOICE_PROVIDER: mode === 'disabled' ? 'oryx' : mode, VOICE_ENABLED: String(mode !== 'disabled'),
        HF_TOKEN: '', ORYX_BASE_URL: origin, ORYX_PUBLIC_BASE_URL: origin,
        ORYX_VOICE_PATH: '/speech', ORYX_API_SECRET: 'oryx-test', MCP_CONFIG_PATH: 'config/mcp.json' },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let logs = '';
    child.stdout.on('data', chunk => { logs += chunk; });
    child.stderr.on('data', chunk => { logs += chunk; });
    try {
      let ready = false;
      for (let i = 0; i < 100; i++) {
        try { ready = (await fetch(`${appOrigin}/health/live`)).ok; } catch {}
        if (ready || child.exitCode !== null) break;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      assert.ok(ready, logs);
      assert.equal((await fetch(`${appOrigin}/v1/capabilities`)).status, 401);
      const response = await fetch(`${appOrigin}/v1/turns`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer app-test' },
        body: JSON.stringify({ session_id: randomUUID(), turn_id: randomUUID(), text: 'Hello', speak: true })
      });
      assert.equal(response.status, 200, logs);
      const data = await response.json();
      assert.equal(data.text, 'Hello back');
      assert.equal(data.speech.status, mode === 'oryx' ? 'ready' : mode === 'disabled' ? 'unavailable' : 'failed');
      if (mode === 'oryx') assert.equal(data.speech.url, `${origin}/audio/test.wav`);
    } finally {
      if (child.exitCode === null) {
        const exited = once(child, 'exit');
        child.kill();
        await exited;
      }
    }
  }
  assert.equal(voiceCalls, 1);
});
