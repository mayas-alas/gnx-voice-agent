# GNX Voice Agent · v0.0.2

**GNX composes existing services. It does not rebuild their responsibilities.**

```text
PWA → text → voice.gnx → thin API → MCP model.complete → HF | omniroute.gnx
                                      ↓ final text
                              MCP voice.speak → oryx.gnx → audio → PWA
```

TEXT is the protocol. MCP is the capability/control plane. `HF_TOKEN` is the public-cloud credential. OmniRoute is the private AI gateway. Oryx owns voice/media. GNX owns composition and minimal correlation only.

Tracking: [REALEASES.md](REALEASES.md) records release changes and verification; [FEATURES.md](FEATURES.md) records capability scope and pending work.

## Configure service identities first

Copy `.env.example` to `.env` for the server topology:

```dotenv
BIND_HOST=127.0.0.1
PORT=8080
APP_ORIGIN=https://voice.gnx
GNX_API_TOKEN=

CLOUD_ROUTE=public
HF_TOKEN=
HF_MODEL=
HF_BASE_URL=https://router.huggingface.co/v1

OMNIROUTE_BASE_URL=https://omniroute.gnx/v1
OMNIROUTE_API_KEY=
OMNIROUTE_MODEL=

ORYX_BASE_URL=https://oryx.gnx
ORYX_PUBLIC_BASE_URL=https://oryx.gnx
ORYX_API_SECRET=
VOICE_ENABLED=false
ORYX_VOICE_PATH=

MCP_CONFIG_PATH=config/mcp.json
```

`BIND_HOST` is a process binding, not product identity. `APP_ORIGIN` is the browser-facing origin and the allowlisted Origin header for API requests. Defaults in code use `*.gnx` too. `app.gnx` and `compute.gnx` remain untouched.

For local development, copy `.env.dev.example` to `.env` instead. It explicitly uses loopback origins and ports. Do not use a different browser hostname without updating `APP_ORIGIN`.

Requires Node.js 22+:

```sh
npm ci
npm start
```

Use `npm run dev` for watch mode. `npm run mcp` starts the stdio runtime for an external MCP host. Production opens at **https://voice.gnx** behind your reverse proxy; the development profile opens at **http://127.0.0.1:8080**. PowerShell can copy profiles with `Copy-Item`.

Set `HF_TOKEN` and `HF_MODEL` for public inference. `Qwen/Qwen3-8B` passed the live HF probe for this release; availability and costs depend on the account/provider. HF PRO alone does not guarantee every inference model is available. Private mode requires the OmniRoute route/model and its deployment credentials. GNX does not duplicate gateway fallback, policy, or model catalogs.

## MCP capability plane

```text
mcp/bridge.js   connects GNX to configured MCP capabilities
mcp/runtime.js  implements the bundled model and voice capabilities
```

`config/mcp.json` binds logical `model.complete` and `voice.speak` to actual tools. The browser never selects MCP servers or tools. Stdio servers receive only explicitly allowlisted application environment variables, plus the MCP SDK's basic OS launch environment. `GNX_API_TOKEN` is not passed to the bundled runtime. Trust each configured server with the credentials in its `env_allow` list.

An external binding can use Streamable HTTP:

```json
{
  "transport": "http",
  "url": "https://reasoning.gnx/mcp",
  "token_env": "REASONING_MCP_TOKEN"
}
```

Add this entry under `servers` and change the relevant capability's `server`/`tool` binding. Future reasoning, memory, or files capabilities need no change to `/v1/turns`. A configured tool must implement the GNX argument/output contract; arbitrary tool schemas are not automatically adapted.

Both capabilities receive `{session_id, turn_id, text, locale, refs}`. Their MCP response includes a JSON text content block:

```json
{"text":"The answer","refs":{"hf_ref":"native-response-id"}}
```

```json
{"status":"ready","url":"https://oryx.gnx/audio/reference.aac","mime_type":"audio/aac","refs":{"oryx_ref":"native-media-id"}}
```

The bundled model capability performs **one stateless completion**, not an autonomous tool loop. Bind an existing reasoning capability if it needs tools or native conversation state. GNX keeps only expiring in-memory mappings of `session_id`, `turn_id`, and optional `hf_ref`, `omniroute_ref`, `mcp_ref`, `oryx_ref`. A response ID is not automatically a resumable session. No history, database, or credential belongs in these references.

## Oryx owns voice and its AI configuration

Configure Oryx persistently at deployment time:

```text
AIBaseURL      → https://omniroute.gnx/v1
AISecretKey    → OmniRoute credential
AIOrganization → deployment-specific, if required
```

Confirm the base-path convention of the installed Oryx integration so `/v1` is not duplicated. GNX does not provision these fields, send them on turns, or own the TTS model, voice, or format.

The intended Oryx-side implementation is:

```text
voice.speak → Oryx primitive → CreateSpeech → OmniRoute /v1/audio/speech
                              ↓
                       Oryx media delivery
```

The built-in MCP capability calls the explicitly configured `ORYX_VOICE_PATH` with `Authorization: Bearer <ORYX_API_SECRET>` and only:

```json
{"session_id":"UUID","turn_id":"UUID","text":"Hello","locale":"en-US"}
```

Expected Oryx primitive response:

```json
{"id":"oryx-media-ref","audio_url":"https://oryx.gnx/audio/reference.aac","mime_type":"audio/aac"}
```

**Integration boundary:** no universal conversational TTS endpoint is claimed to exist in stock Oryx. This repository does not implement a new TTS server. Supply the actual Oryx-side primitive, or bind `voice.speak` to an existing MCP Oryx capability. `ORYX_VOICE_PATH` is deliberately blank until that interface is available. Do not point it at `/terraform/v1/dubbing/task-tts`: that endpoint serves Dubbing project/group audio, not arbitrary text synthesis. Do not revive AI-Talk.

Enable `VOICE_ENABLED=true` once this path works. An external MCP voice binding does not require the bundled runtime's Oryx path. Failed speech preserves the text answer.

Oryx owns audio authorization, expiry, transformation, serving, and cleanup. Returned media must be browser-reachable and independently authorized: the browser never receives the Oryx API secret. Relative URLs resolve against `ORYX_PUBLIC_BASE_URL`. API validation and CSP allow audio only from the application origin or configured Oryx public origin. HTTPS pages require HTTPS media. External redirects to other media origins are not enabled.

For public HF-backed speech, the deployed Oryx integration must support the selected HF TTS surface; do not assume the HF chat router exposes a universal speech endpoint. The model-route switch does not silently reconfigure Oryx's stored AI settings.

## API and PWA

`GET /health/live` reports process liveness, not upstream readiness.

`GET /v1/capabilities` reports configured text/voice capabilities, not verified upstream availability.

`POST /v1/turns` accepts:

```json
{
  "session_id":"11111111-1111-4111-8111-111111111111",
  "turn_id":"22222222-2222-4222-8222-222222222222",
  "text":"Explain composition-first design briefly.",
  "locale":"en-US",
  "speak":false
}
```

Returns `{session_id, turn_id, text, speech}`. Speech status is `not_requested`, `ready`, `unavailable`, or `failed`. The call remains synchronous, including the bounded speech attempt. There is no durable idempotency or automatic replay.

The PWA handles only text, optional browser STT, transcript review, request state, text output, and playback. Browser STT may use vendor cloud processing; it is not a privacy guarantee. Only static assets are cached. Provider credentials and MCP topology remain server-side.

## Deployment boundary

Proxy `https://voice.gnx/*` to the GNX process, including `/v1/*`; no separate API hostname or CORS setup is needed. Set `GNX_API_TOKEN` before exposing the proxy even with loopback binding. Enter only that application token in the PWA; it remains in page memory.

Configure DNS and trusted certificates for `*.gnx` on both the browser and runtime hosts. For a private CA, configure `NODE_EXTRA_CA_CERTS`; it is explicitly allowlisted for the bundled MCP child. Never disable TLS verification. Keep Oryx management interfaces protected even when serving media on its public origin.

This remains a single-instance, shared-deployment-principal starter. The shared token is not per-user authorization. Place authentication, TLS, network restrictions, and rate limiting at the deployment boundary before public exposure. Correlation state is bounded and disappears on restart. No database, queues, agent framework, media proxy, or transactional lifecycle has been added.

## Layout

```text
app/       thin API + correlation
config/    environment validation + capability bindings
mcp/       bridge + runtime
web/       PWA
```

See the tracking documents for actual verification results and the blocked Oryx deployment checks. Configuration support is not evidence of a working live service.
