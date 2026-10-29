import { readFileSync, lstatSync } from 'node:fs';

// File-backed credentials for containers; legacy environment configuration remains supported.
export function secretValue(name, settings = process.env) {
  const path = settings[`${name}_FILE`];
  if (!path) return settings[name] || '';
  if (settings[name]) throw new Error(`Set only ${name} or ${name}_FILE`);
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.size > 16384) throw new Error();
    const value = readFileSync(path, 'utf8').trim();
    if (!value) throw new Error();
    return value;
  } catch {
    // Never include file paths, contents or underlying errors in diagnostics.
    throw new Error(`Cannot read ${name}_FILE`);
  }
}
