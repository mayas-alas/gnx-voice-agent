import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { secretValue } from '../config/secrets.js';

test('file credentials work without copying them into the process environment', t => {
  const dir = mkdtempSync(join(tmpdir(), 'gnx-secret-test-'));
  t.after(() => rmSync(dir, { recursive: true }));
  const path = join(dir, 'token');
  writeFileSync(path, ' test-only-value\n');
  const config = { HF_TOKEN_FILE: path };
  assert.equal(secretValue('HF_TOKEN', config), 'test-only-value');
  assert.equal(config.HF_TOKEN, undefined);
  assert.equal(secretValue('HF_TOKEN', { HF_TOKEN: 'legacy-test' }), 'legacy-test');
  assert.throws(() => secretValue('HF_TOKEN', { ...config, HF_TOKEN: 'legacy-test' }), /Set only/);
  writeFileSync(path, '');
  assert.throws(() => secretValue('HF_TOKEN', config), { message: 'Cannot read HF_TOKEN_FILE' });
  writeFileSync(path, 'x'.repeat(16385));
  assert.throws(() => secretValue('HF_TOKEN', config), { message: 'Cannot read HF_TOKEN_FILE' });
  assert.throws(() => secretValue('GNX_API_TOKEN', { GNX_API_TOKEN_FILE: dir }), { message: 'Cannot read GNX_API_TOKEN_FILE' });
});
