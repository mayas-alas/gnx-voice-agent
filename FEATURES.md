# GNX feature tracking

**Rule:** compose existing services through configuration, MCP, and minimal text contracts. Do not expand GNX into another platform.

## Current capability ownership

| Capability | Owner | v0.0.2 state |
| --- | --- | --- |
| Text input/output and optional STT/playback | PWA | Implemented; browser acceptance pending |
| `voice.gnx` identity, loopback process binding | GNX deployment | Defaults implemented; DNS/proxy must be provisioned externally |
| Minimal turn composition | GNX thin API | Implemented; local composition smoke passed |
| Logical `model.complete` / `voice.speak` wiring | MCP bridge + config | Implemented; browser cannot choose servers/tools |
| Public inference via `HF_TOKEN` | HF | Live MCP inference passed |
| Private model routing/fallback/policy | OmniRoute | Route configured in code; live gateway not verified |
| Voice generation/transformation/lifecycle/serving | Oryx | GNX caller implemented; actual Oryx primitive remains a deployment blocker |
| Persistent `AIBaseURL`, `AISecretKey`, `AIOrganization` | Oryx | Deployment responsibility; not configured or forwarded by GNX |
| TTS model/voice/format | Oryx / OmniRoute / upstream | Removed from GNX ownership |
| Session correlation | GNX | Bounded transient IDs/refs only, no native session ownership |
| MCP credential isolation | Per-server `env_allow` | Implemented; SDK basic OS environment remains available |
| Media origin policy | API + CSP | Self and configured Oryx origin only |
| Trust for `*.gnx` TLS | Deployment certificate stores | Required; no insecure TLS bypass |

## External voice primitive contract

`voice.speak` stays logical and replaceable. For the bundled Oryx binding, the deployed endpoint accepts `{text, locale, session_id, turn_id}` and returns `{id, audio_url, mime_type}`. No provider credential, TTS model/voice, or `AIBaseURL` is sent with the turn.

Oryx should reuse its existing speech/media primitives internally. `/terraform/v1/dubbing/task-tts` is **not** a conversational text-to-speech API. GNX does not implement an Oryx fork, resurrect AI-Talk, or introduce a separate TTS/media service.

## Configurable next steps, without enlarging the core

- [ ] Real Oryx primitive and `Oryx → OmniRoute /v1/audio/speech → TTS` acceptance.
- [ ] Real browser playback with Oryx-managed media authorization/expiry.
- [ ] Bind existing tool-enabled reasoning to `model.complete` when needed, e.g. `https://reasoning.gnx/mcp`.
- [ ] Add external memory/files capabilities only when a use case requires them; native state stays at the service.

The bundled completion is stateless. MCP does not magically supply reasoning loops or memory. External capabilities must implement compatible contracts and own those behaviors.

## Later frontier — not v0.0.2

After the live text → reasoning → text → Oryx → audio path works:

- Live Room / RoomToken.
- WHIP / WHEP.
- Full-duplex voice, interruption/barge-in, and continuous sessions.

These belong to an expanded Oryx real-time runtime; they must not replace the text-first GNX core prematurely.

## Explicitly outside current scope

No database, Redis, queue, vector store, OIDC framework, agent framework, provider registry, Rust rewrite, media proxy, service mesh, WebRTC voice sessions, or transactional exactly-once lifecycle. No changes to occupied `app.gnx` / `compute.gnx`.

Release evidence and migration steps: [REALEASES.md](REALEASES.md).
