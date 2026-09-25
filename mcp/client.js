import { readFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { z } from 'zod';
import { env } from '../config/env.js';

const settings = z.object({
  servers: z.record(z.object({
    transport: z.enum(['stdio', 'http']), command: z.string().optional(),
    args: z.array(z.string()).default([]), url: z.string().url().optional(),
    token_env: z.string().optional(), env: z.record(z.string()).default({})
  })),
  capabilities: z.record(z.object({ server: z.string(), tool: z.string() }))
}).parse(JSON.parse(await readFile(env.MCP_CONFIG_PATH, 'utf8')));
const connections = new Map();

async function connect(name) {
  const config = settings.servers[name];
  if (!config) throw new Error('Unknown MCP server');
  const client = new Client({ name: 'gnx-composer', version: '0.0.1' });
  let transport;
  if (config.transport === 'stdio') {
    if (!config.command) throw new Error('MCP stdio command is required');
    transport = new StdioClientTransport({
      command: config.command === '$NODE' ? process.execPath : config.command,
      args: config.args,
      // Only configure trusted child servers: they inherit application credentials.
      env: { ...process.env, ...config.env }, stderr: 'inherit'
    });
  } else {
    if (!config.url) throw new Error('MCP HTTP URL is required');
    const token = config.token_env ? process.env[config.token_env] : undefined;
    if (config.token_env && !token) throw new Error('Missing MCP credential');
    transport = new StreamableHTTPClientTransport(new URL(config.url), {
      requestInit: { headers: token ? { Authorization: `Bearer ${token}` } : {} }
    });
  }
  try { await client.connect(transport); }
  catch (error) { await transport.close().catch(() => {}); throw error; }
  return client;
}
export const capabilities = Object.keys(settings.capabilities);
export async function call(capability, args) {
  const binding = settings.capabilities[capability];
  if (!binding) throw new Error('Capability is not configured');
  if (!connections.has(binding.server)) {
    connections.set(binding.server, connect(binding.server).catch(error => {
      connections.delete(binding.server); throw error;
    }));
  }
  const client = await connections.get(binding.server);
  const output = await client.callTool({ name: binding.tool, arguments: args }, undefined,
    { timeout: env.REQUEST_TIMEOUT_MS + 2000 });
  if (output.isError) throw new Error('Capability execution failed');
  const text = output.content?.find(item => item.type === 'text')?.text;
  if (!text) throw new Error('Capability must return JSON text');
  return JSON.parse(text);
}
export async function close() {
  await Promise.allSettled([...connections.values()].map(async pending => (await pending).close()));
}
