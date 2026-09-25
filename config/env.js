import { z } from 'zod';

const bool = z.enum(['true', 'false']).default('false').transform(v => v === 'true');
const schema = z.object({
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  GNX_API_TOKEN: z.string().default(''),
  CLOUD_ROUTE: z.enum(['public', 'private']).default('public'),
  HF_TOKEN: z.string().default(''),
  HF_MODEL: z.string().default(''),
  HF_BASE_URL: z.string().url().default('https://router.huggingface.co/v1'),
  OMNIROUTE_BASE_URL: z.string().url().default('http://localhost:20128/v1'),
  OMNIROUTE_API_KEY: z.string().default(''),
  OMNIROUTE_MODEL: z.string().default(''),
  ORYX_BASE_URL: z.string().url().default('http://localhost:2022'),
  ORYX_TOKEN: z.string().default(''),
  ORYX_VOICE_PATH: z.string().default(''),
  ORYX_PUBLIC_BASE_URL: z.string().default(''),
  VOICE_ENABLED: bool,
  TTS_MODEL: z.string().default(''),
  TTS_VOICE: z.string().default('default'),
  MCP_CONFIG_PATH: z.string().default('config/mcp.json'),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(45000),
  VOICE_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  CORRELATION_TTL_MS: z.coerce.number().int().positive().default(86400000),
  MAX_CORRELATIONS: z.coerce.number().int().positive().default(1000)
});

export const env = schema.parse(process.env);
if (env.VOICE_ENABLED && !env.ORYX_VOICE_PATH.startsWith('/')) {
  throw new Error('VOICE_ENABLED requires an explicit ORYX_VOICE_PATH beginning with /');
}
export const modelRoute = env.CLOUD_ROUTE === 'public'
  ? { base: env.HF_BASE_URL, token: env.HF_TOKEN, model: env.HF_MODEL, ref: 'hf_ref' }
  : { base: env.OMNIROUTE_BASE_URL, token: env.OMNIROUTE_API_KEY, model: env.OMNIROUTE_MODEL, ref: 'omniroute_ref' };
