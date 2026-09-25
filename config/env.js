import { z } from 'zod';

const bool = z.enum(['true', 'false']).default('false').transform(v => v === 'true');
const httpUrl = z.string().url().refine(value => {
  const url = new URL(value);
  return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
}, 'Expected an HTTP(S) URL without credentials');
const origin = httpUrl.refine(value => new URL(value).origin === value, 'Expected an origin without path or trailing slash');
const schema = z.object({
  BIND_HOST: z.string().default('127.0.0.1'),
  APP_ORIGIN: origin.default('https://voice.gnx'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  GNX_API_TOKEN: z.string().default(''),
  CLOUD_ROUTE: z.enum(['public', 'private']).default('public'),
  HF_TOKEN: z.string().default(''),
  HF_MODEL: z.string().default(''),
  HF_BASE_URL: httpUrl.default('https://router.huggingface.co/v1'),
  OMNIROUTE_BASE_URL: httpUrl.default('https://omniroute.gnx/v1'),
  OMNIROUTE_API_KEY: z.string().default(''),
  OMNIROUTE_MODEL: z.string().default(''),
  ORYX_BASE_URL: httpUrl.default('https://oryx.gnx'),
  ORYX_API_SECRET: z.string().default(''),
  ORYX_VOICE_PATH: z.string().default(''),
  ORYX_PUBLIC_BASE_URL: origin.default('https://oryx.gnx'),
  VOICE_ENABLED: bool,
  MCP_CONFIG_PATH: z.string().default('config/mcp.json'),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(45000),
  VOICE_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  CORRELATION_TTL_MS: z.coerce.number().int().positive().default(86400000),
  MAX_CORRELATIONS: z.coerce.number().int().positive().default(1000)
});

export const env = schema.parse(process.env);
// Validate the native voice path only inside the built-in voice capability:
// deployments may instead bind voice.speak to an external MCP service.
export const mediaOrigins = new Set([env.APP_ORIGIN, env.ORYX_PUBLIC_BASE_URL]);
export const modelRoute = env.CLOUD_ROUTE === 'public'
  ? { base: env.HF_BASE_URL, token: env.HF_TOKEN, model: env.HF_MODEL, ref: 'hf_ref' }
  : { base: env.OMNIROUTE_BASE_URL, token: env.OMNIROUTE_API_KEY, model: env.OMNIROUTE_MODEL, ref: 'omniroute_ref' };
