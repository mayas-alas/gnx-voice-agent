# GNX Voice Agent · v0.0.1

**GNX composes existing services; it does not rebuild them.**

```text
TEXT       = canonical protocol
MCP        = capabilities / control
HF_TOKEN   = primary public-cloud credential
OmniRoute  = private AI gateway
Oryx       = voice / media runtime
PWA        = interface
GNX        = configuration + composition + correlation
```

First-pass source code, delivered without installing dependencies, running the application, or executing tests. Not production-hardened. No subagents were used.

## Configuration first

Copy `.env.example` to `.env`. The key settings are:

```dotenv
CLOUD_ROUTE=public
HF_TOKEN=hf_your_token
HF_MODEL=your-supported-model

OMNIROUTE_BASE_URL=http://localhost:20128/v1
OMNIROUTE_API_KEY=
OMNIROUTE_MODEL=

ORYX_BASE_URL=http://localhost:2022
ORYX_TOKEN=
ORYX_VOICE_PATH=
VOICE_ENABLED=false
TTS_MODEL=
TTS_VOICE=default

MCP_CONFIG_PATH=config/mcp.json
```

- **Public:** Hugging Face through `HF_TOKEN`, with an explicitly selected inference model. A PRO subscription does not guarantee every model/provider is available or free.
- **Private:** OmniRoute through its configured OpenAI-compatible gateway. Set `CLOUD_ROUTE=private` and `OMNIROUTE_MODEL`. Privacy still depends on that gateway's upstreams.
- **Voice:** Oryx is the architectural owner of synthesis and media. Enable only when its deployment exposes the bridge contract below.
- Restart the backend after configuration changes; no PWA rebuild is required.
- Secrets stay server-side. `.env` is Git-ignored.

## Run

Requires Node.js 22+ and npm. From the repository root:

```sh
cp .env.example .env
# Edit .env: at minimum HF_TOKEN and HF_MODEL for the public route.
npm install
npm start
```

PowerShell users can use `Copy-Item .env.example .env` instead of `cp`.

Open **http://127.0.0.1:8080**. `npm run dev` enables Node's file watcher. `npm run mcp` starts the built-in stdio MCP server for an external MCP host; it is not an interactive shell command.

The app starts without model credentials so the UI can be inspected; inference fails until configured. `/health/live` reports process liveness, not upstream readiness. No lockfile is included because dependencies have not been installed; generate and commit one when validating this baseline.

## Runtime

```text
PWA → text → thin API → MCP model.complete → HF | OmniRoute
                       ↓ final text
                       MCP voice.speak → Oryx → audio URL → PWA
```

**Control path:** environment + `config/mcp.json` choose capability bindings and routes.

**Data path:** the selected model produces text; Oryx produces and serves audio. GNX never proxies or stores audio, sends HF credentials to the browser, or restores Oryx AI-Talk.

### What is implemented

- Thin Express API and static web serving.
- Real MCP SDK client/server, with stdio and Streamable HTTP connections.
- Built-in `model_complete` capability calling HF or OmniRoute chat completions.
- Built-in `voice_speak` capability calling a configurable Oryx deployment bridge.
- Configuration-based replacement of either capability with an existing MCP service.
- Bounded, expiring in-memory correlation references; no database or message history.
- Optional shared deployment token, input bounds, concurrent-turn bounds, safe text rendering, and generic client-facing errors.
- Text UI, optional browser STT, editable transcript, explicit audio playback, and a static-shell PWA service worker.
- Text preserved when speech fails. No silent provider fallback or automatic request replay.

### Deliberate limits

The bundled model capability is **one stateless completion**, not an autonomous agent. It does not select or execute other tools. For tool-enabled reasoning, bind `model.complete` to an existing MCP capability that owns that behavior and returns the contract below. GNX does not implement a proprietary agent loop.

Correlation IDs do not create conversational memory in stateless HF/OmniRoute chat endpoints. The default route does not send previous messages. An external capability may consume native references and maintain its own context.

There is no OIDC, SQLite, queue, artifact registry, durable replay protection, transactional lifecycle, streaming, or barge-in. Requests are synchronous: text is returned after the optional bounded voice attempt. Browser retries may repeat upstream work. A restart loses correlation mappings. The app is a single-instance, single-deployment-principal baseline, not a multi-tenant service.

## MCP wiring

`config/mcp.json` is GNX configuration, not a universal MCP config schema:

```json
{
  "servers": {
    "runtime": {
      "transport": "stdio",
      "command": "$NODE",
      "args": ["mcp/server.js"]
    }
  },
  "capabilities": {
    "model.complete": { "server": "runtime", "tool": "model_complete" },
    "voice.speak": { "server": "runtime", "tool": "voice_speak" }
  }
}
```

Only configured bindings are callable. Tool names are not accepted from browser input. Local MCP children inherit server environment variables: configure **trusted servers only**. `$NODE` resolves to the running Node executable; relative paths resolve from the repository root.

For a remote reasoning service, add a server and point `model.complete` at its tool:

```json
{
  "transport": "http",
  "url": "https://your-service.example/mcp",
  "token_env": "REASONING_MCP_TOKEN"
}
```

The service must support Streamable HTTP MCP, accept the GNX arguments, and return JSON in an MCP text content block. A transport connection alone does not adapt arbitrary tool schemas.

Both capabilities receive:

```json
{
  "session_id": "client-generated UUID",
  "turn_id": "client-generated UUID",
  "text": "Hello",
  "locale": "en-US",
  "refs": {}
}
```

`model.complete` returns:

```json
{"text":"Hello back","refs":{"hf_ref":"upstream-response-id"}}
```

`voice.speak` returns:

```json
{"status":"ready","url":"https://media.example/short-lived-audio.mp3","mime_type":"audio/mpeg","refs":{"oryx_ref":"media-id"}}
```

Native references are optional, opaque, and must not be credentials. Only `hf_ref`, `omniroute_ref`, `mcp_ref`, and `oryx_ref` are retained. They are passed to capabilities but not returned to the browser. No reference is fabricated when an upstream does not supply one. A model response ID is not necessarily a reusable session ID.

## Oryx voice/media wiring

Oryx remains a principal runtime component, not a vendor-neutral storage plugin. GNX calls `voice.speak` through MCP; the built-in capability forwards final text to an **explicitly configured Oryx-side bridge**.

**Important:** this repository does not contain an Oryx fork or claim a native `/v1/voice` endpoint exists. The deployment must provide the bridge or replace the MCP binding with an existing Oryx capability. Out-of-the-box voice remains disabled. This is the main external integration requirement, not a completed verified Oryx integration.

The configured `ORYX_VOICE_PATH` receives a bearer-authenticated POST:

```json
{
  "session_id":"UUID",
  "turn_id":"UUID",
  "text":"The final answer",
  "locale":"en-US",
  "model":"configured TTS model",
  "voice":"default"
}
```

Expected JSON response:

```json
{
  "id":"oryx-native-reference",
  "audio_url":"https://media.example/signed-or-session-authorized.mp3",
  "mime_type":"audio/mpeg"
}
```

Relative audio URLs are resolved against `ORYX_PUBLIC_BASE_URL`, falling back to `ORYX_BASE_URL`. Oryx must return browser-reachable media with appropriate expiry/access control. The browser never receives `ORYX_TOKEN`; a URL requiring that service bearer token will not play. Use HTTPS media for an HTTPS app. Oryx owns formats, transformation, retention, cleanup, and serving.

### Oryx → OmniRoute TTS

Configure the relevant Oryx AI integration using its **`AIBaseURL`** and **`AISecretKey`** fields, pointed at your OmniRoute deployment. OmniRoute's target speech surface is `/v1/audio/speech`; the resulting path should be:

```text
MCP voice.speak → Oryx → OmniRoute /v1/audio/speech → TTS upstream
                         ↓
                  Oryx media delivery
```

These are Oryx-side configuration fields, not ENV variables that GNX magically provisions. Confirm whether the deployed Oryx interface expects a host root or `/v1` base to avoid doubling the path. GNX's model-route switch does not reconfigure an external Oryx installation: switch its AI settings alongside the deployment profile.

For public speech, configure an Oryx-compatible HF-backed TTS surface using `HF_TOKEN`. Do not assume the HF chat router also implements a universal `/audio/speech` endpoint. Task-specific HF TTS bridging, if needed by the chosen model, belongs beside Oryx—not in GNX. No native Oryx interface or model compatibility was verified during this first pass.

## Minimal API

`GET /v1/capabilities` reports text, configured speech availability, and logical MCP capability names. Configured availability is not a live provider probe.

`POST /v1/turns`:

```json
{
  "session_id":"11111111-1111-4111-8111-111111111111",
  "turn_id":"22222222-2222-4222-8222-222222222222",
  "text":"Explain composition-first design briefly.",
  "locale":"en-US",
  "speak":false
}
```

Response:

```json
{
  "session_id":"11111111-1111-4111-8111-111111111111",
  "turn_id":"22222222-2222-4222-8222-222222222222",
  "text":"Compose existing services rather than recreating them.",
  "speech":{"status":"not_requested"}
}
```

Speech may also be `ready`, `unavailable`, or `failed`. Failed speech does not fail a successful text turn. Invalid input returns `400`, missing configured token `401`, simultaneous session work `409`, capacity exhaustion `429`, and capability failure `502`. There is no exactly-once guarantee.

## Deployment boundary

Default binding is loopback. Set `GNX_API_TOKEN` for access control; binding to a non-loopback address requires it. Enter that **application token**, never `HF_TOKEN`, in the UI's connection settings. The UI keeps it only in page memory.

Put TLS, real user authentication, rate limits, and network restrictions at a trusted deployment boundary before public exposure. The shared token does not establish per-user session ownership. Do not run this starter as a multi-user internet service unchanged. Configure request timeout limits at that boundary to accommodate sequential model and voice calls.

Browser STT may use external vendor processing. It is optional, capability-detected, and never a privacy guarantee. Typing remains available. PWA caching covers only static assets; there is no offline inference or caching of API/audio data. Browser installation requirements vary; production icon packaging may need raster variants.

## Repository

```text
app/       thin HTTP API + transient correlation
config/    validated environment + capability bindings
mcp/       MCP client and built-in model/voice capabilities
web/       lightweight PWA, speech input, playback
```

Next: install dependencies and lock them, validate an actual HF model, wire the concrete Oryx bridge, then connect an existing reasoning/tool capability if needed. Do not add storage or another agent framework before the service composition calls for it.
