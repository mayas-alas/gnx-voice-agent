# GNX release tracking

The filename `REALEASES.md` is retained as requested. Feature ownership and future scope are tracked in [FEATURES.md](FEATURES.md).

## v0.0.2 — service identity and runtime wiring

**Status: code implemented; live Oryx release gate remains blocked.**

### Completed changes

- [x] `HOST` → `BIND_HOST`; `APP_ORIGIN=https://voice.gnx` separates identity from binding.
- [x] `*.gnx` defaults in code and production environment example.
- [x] Separate `.env.dev.example` for loopback development.
- [x] `mcp/client.js` → `mcp/bridge.js`; `mcp/server.js` → `mcp/runtime.js`; imports, scripts, and config updated.
- [x] Keep `model.complete` / `voice.speak` and the browser turn contract unchanged.
- [x] `ORYX_TOKEN` → `ORYX_API_SECRET` with bearer authentication.
- [x] Remove `TTS_MODEL` and `TTS_VOICE`; no AI credentials/settings in voice payloads.
- [x] Document Oryx-owned `AIBaseURL`, `AISecretKey`, and `AIOrganization`.
- [x] Per-server `env_allow` replaces blanket application environment inheritance.
- [x] Narrow CSP media sources to self + configured Oryx origin; validate returned audio origins too.
- [x] Validate browser Origin against `APP_ORIGIN`; preserve CLI requests without Origin.
- [x] Preserve TLS verification; allowlist `NODE_EXTRA_CA_CERTS`; reject upstream POST redirects.
- [x] Generate `package-lock.json`; bump runtime/UI/cache version to 0.0.2.

### Verification performed

| Check | Result | Evidence / boundary |
| --- | --- | --- |
| Dependency installation | Passed | `npm install --ignore-scripts`; 94 packages added; audit reported zero vulnerabilities at execution time |
| JavaScript syntax / patch whitespace | Passed | `node --check` across app/config/MCP/web JavaScript; `git diff --check` |
| SDK environment behavior | Inspected | SDK supplies basic OS launch variables; GNX adds only per-server `env_allow`, not all `process.env` |
| Local composition smoke | Passed | Actual API → stdio MCP → mock chat and mock Oryx; asserted text/audio result, authorization, rejected foreign Origin, restricted CSP, and voice payload without TTS/provider settings |
| Direct HF inference | Passed | Stored WSL HF credential; `Qwen/Qwen3-8B`; HTTP 200 with text |
| MCP → real HF | Passed | Actual bridge/runtime with the same live model; nonempty text and native `hf_ref`; credential kept out of repository/log output |
| Service DNS | Blocked | `voice.gnx`, `oryx.gnx`, `omniroute.gnx` unresolved from both Windows and WSL during verification |
| Oryx live voice primitive | Blocked | DNS unavailable; no configured `ORYX_API_SECRET` or `ORYX_VOICE_PATH` in the inspected WSL environment |
| Oryx → OmniRoute → TTS | Not verified | Requires reachable deployment, persisted Oryx AI configuration, and the actual voice primitive |
| Real browser speech/playback | Not verified | No GUI/browser acceptance run performed |

Smoke checks were run inline, not added as a new testing subsystem. A mock voice response is not evidence that stock Oryx exposes conversational TTS. No server DNS, proxy, or Oryx configuration was changed.

### Remaining release gates

- [ ] Make `*.gnx` resolve from the GNX execution host and browser, with trusted TLS.
- [ ] Identify/deploy the actual Oryx conversational voice primitive (not Dubbing `task-tts`).
- [ ] Configure the Oryx API secret locally; never commit it.
- [ ] Persist Oryx `AIBaseURL → https://omniroute.gnx/v1` and its upstream secret in Oryx.
- [ ] Verify real text → Oryx → OmniRoute → TTS → browser-playable audio.
- [ ] Verify media expiry/access controls and text preservation on a live voice failure.

### Migration from v0.0.1

1. Rename `HOST` to `BIND_HOST`; set the correct `APP_ORIGIN`.
2. Rename `ORYX_TOKEN` to `ORYX_API_SECRET`; remove `TTS_MODEL` / `TTS_VOICE`.
3. Update custom MCP process args to `mcp/runtime.js` and explicitly list required variables in `env_allow`. The old free-form `env` injection is no longer used.
4. Set `ORYX_PUBLIC_BASE_URL` to the exact browser-facing origin (no path/trailing slash). Other media origins are rejected.
5. Run `npm ci`, restart GNX, and align reverse-proxy request timeouts with sequential model/voice calls.

Legacy variables are not compatibility aliases. Defaults do not migrate an existing deployment automatically.

## v0.0.1 — composition-first baseline

Thin API, MCP model/voice bindings, HF/OmniRoute route selection, transient correlation, and PWA. Initial implementation was delivered without execution. Oryx was a configurable external contract, not a verified native integration. Published as a public Hugging Face source repository, not a deployed Space.
