# DSH WorkBuddy

Bring the models of a signed-in **WorkBuddy / CodeBuddy desktop app** into [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH). Install the plugin, restart DSH, and a **WorkBuddy** group appears in the model picker; pick a model and chat, call tools, and send images inside DSH, reusing the desktop account and its credits.

English | [中文](./README.zh.md)

## How it works

```text
DSH agent loop
   │  ctx.llm (provider-neutral model seam)
   ▼
@deepseek-ai/dsh-llm-pi-ai  (PiAiAdapter, openai-completions protocol)
   │  http://127.0.0.1:<ephemeral port>/v1  +  a random per-boot local key
   ▼
dsh-workbuddy loopback shim (binds 127.0.0.1 only)
   │  injects WorkBuddy Authorization / X-User-Id / X-Enterprise-Id / X-Domain
   ▼
WorkBuddy gateway  POST /v2/chat/completions
   (CN copilot.tencent.com; international www.workbuddy.ai)
```

The WorkBuddy chat gateway already speaks the OpenAI `chat/completions` protocol, but it authenticates with the desktop app's rotating bearer token plus account headers. The plugin:

1. **Finds credentials** in the desktop app's `CodeBuddyExtension/Data/Public/auth/*.info` (or accepts a manual token);
2. **Forwards locally** through a loopback OpenAI-compatible shim that injects fresh credentials per request, refreshes an expiring token, and retries once;
3. **Registers the provider** through the pi-ai adapter, so streaming, native tool calls, image input, and reasoning levels work through DSH's normal agent loop.

The desktop auth file is **read-only by default**, and the WorkBuddy token never appears in the plugin configuration, logs, or a response body. A token pasted in the DSH settings tab is stored only in a mode-`0600` file under DSH's home directory.

## Requirements

- DSH `0.2.x` (developed and tested on `0.2.1-rc.5`), Node.js 22+;
- A signed-in WorkBuddy (CN) or WorkBuddy AI (international) desktop app:
  - macOS: `~/Library/Application Support/CodeBuddyExtension/Data/Public/auth/`
  - Windows: `%LOCALAPPDATA%\CodeBuddyExtension\Data\Public\auth\`
  - Linux: `${XDG_DATA_HOME:-~/.local/share}/CodeBuddyExtension/Data/Public/auth/`

A desktop install is not required in manual-token mode (see below).

## Install

### From source (works today)

```sh
git clone https://github.com/ban-sky/dsh-workbuddy.git
cd dsh-workbuddy
npm ci
npm test          # 54 tests, including a fake-gateway end-to-end run
npm run build     # dist/*.tgz + sha256
dsh plugin --profile web add "$PWD"
```

### From a release asset

Download the latest `ban-sky-dsh-workbuddy-*.tgz` (and its `.sha256`) from
[GitHub Releases](https://github.com/ban-sky/dsh-workbuddy/releases):

```sh
dsh plugin --profile web add /path/to/ban-sky-dsh-workbuddy-0.1.2.tgz
```

Restart DSH after installing (`dsh web`). The plugin's configuration lives in the profile's `cordis.patch.yml`; the model group follows the plugin's enabled state.

## Configuration

Zero configuration is the default: the plugin discovers the desktop auth file itself.

To override, edit the `config` of the `workbuddy` row in the profile's `cordis.patch.yml`:

```yaml
- insert:
    - id: workbuddy
      name: '@ban-sky/dsh-workbuddy'
      config:
        authFile: ''            # explicit *.info path
        token: ''               # manual accessToken (instead of authFile)
        uid: ''                 # account id for manual-token mode
        enterpriseId: ''        # enterprise id for manual-token mode
        domain: ''              # defaults to www.codebuddy.cn
        baseURL: ''             # override the gateway; region picks the default
        region: auto            # auto | cn | global
        port: 0                 # shim port; 0 = ephemeral
        writeBack: false        # persist refreshed tokens into the auth file
```

Environment variables:

| Variable | Meaning |
| --- | --- |
| `WORKBUDDY_AUTH_FILE` | Explicit desktop auth-file path |
| `WORKBUDDY_TOKEN` | Manual accessToken (takes precedence over the auth file) |

`token` is marked secret in the config schema; prefer the environment variable when you do not want the token in YAML.

### Enter the token in DSH (recommended)

You do not have to edit YAML at all:

1. Open **Settings → Plugins → WorkBuddy**.
2. Paste the desktop app's `accessToken` (and optionally `uid`, `enterpriseId`, `domain`) and press **保存并连接** (Save and connect). The token is used on the next request, no restart needed.
3. **测试连接** (Test connection) sends a one-token `ping` to the gateway and reports whether the token is accepted. If the token field still contains a value, that token is tested without being saved. **清除** (Clear) removes the saved token and falls back to the desktop auth file if one exists.

The saved token lives in `$DSH_HOME/.workbuddy-credentials.json` (`~/.dsh` by default), mode `0600`, never in the profile YAML. Precedence: `token` config / `WORKBUDDY_TOKEN` → saved settings token → desktop auth file.

### Sign in from the browser (no desktop app)

If the auth file is encrypted or WorkBuddy is not installed on the DSH host, use the built-in web login:

1. Open **Settings → Plugins → WorkBuddy** and pick the China (`codebuddy.cn`) or International (`workbuddy.ai`) site.
2. Press **生成登录链接** (Generate login link) and open the link; sign in with the WorkBuddy account.
3. The page polls every 2 s and saves the access/refresh token automatically when authorization completes.

The login session expires after 10 minutes; **取消** (Cancel) discards it. Tokens are tied to the site that issued them, so match the region to the account.

### Manual-token mode

If you have a real bearer token (for example copied from a build that does not encrypt its auth file), put it in `token` or `WORKBUDDY_TOKEN`, together with optional `uid` / `enterpriseId`. The token string itself is enough when it is a JWT: the plugin reads `sub`, `enterprise_id`, `tenant_id`, and `iss` from the claims to build the account headers. A manual token has no refresh token, so re-copy it when it expires.

An encrypted `{"$wbEncrypted":1,"envelope":"…"}` field is **not** a bearer token — copying it always produces 401. Use the browser sign-in above instead.

## Verify

1. Open the DSH model picker after restarting: a **WorkBuddy** group with 20 models appears (GLM-5.3 family, Kimi, MiniMax, DeepSeek-V4, Hy, …).
2. Or open **Settings → Plugins → WorkBuddy**, paste a token there and press **测试连接** — a green banner means the gateway accepted it.
3. Pick a model and send "hello": it streams a normal reply.
4. Image and tool tasks work too (the gateway supports native OpenAI tool calls).

Without GUI access, confirm the plugin started in the DSH log:

```text
workbuddy: shim listening on 127.0.0.1:<port>, gateway https://copilot.tencent.com, 20 models
```

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Group appears, requests fail with `MISSING_CREDENTIAL` | The desktop app is not signed in, or the auth file is outside the default paths. Sign in and restart DSH, or set `WORKBUDDY_AUTH_FILE`. |
| `ENCRYPTED_CREDENTIAL` | The desktop build encrypts its token fields. Use the browser sign-in in the settings page (no desktop app needed). |
| 401 / `Offline user session not found` | The token expired and cannot be refreshed. Sign in again, or update the manual token. |
| 402 / insufficient credit | The WorkBuddy account is out of credit; the plugin neither tops it up nor bypasses billing. |
| The model list differs from the desktop app | The bundled roster is a 2026-10 snapshot; see Limitations. |

## Security and privacy

- The shim binds **`127.0.0.1` only**, uses an ephemeral port, and requires a random per-boot bearer key.
- The desktop auth file is read-only by default; `writeBack: true` opts in to an atomic write-back.
- The token appears only in request headers toward the WorkBuddy gateway — never in logs, config, or response bodies. The settings token is kept in a mode-`0600` JSON file under `$DSH_HOME`.
- Conversation content is forwarded from this machine to the WorkBuddy gateway and is governed by your agreement with WorkBuddy; the plugin collects no telemetry.

## Limitations

- **The model roster is a snapshot.** The upstream adds and retires model ids at will; a retired id fails with a clear upstream error. Issues with the current roster are welcome.
- **Encrypted desktop credentials are not decrypted.** `safeStorage` requires the desktop app's own helper process; the plugin reports the condition instead of bypassing it.
- **Only the WorkBuddy / CodeBuddy gateways are supported**: `copilot.tencent.com` (CN) and `www.workbuddy.ai` (international). A compatible self-hosted proxy can be reached with `baseURL`.
- **CI does not contact the real WorkBuddy service.** Tests use a local fake gateway covering the protocol, auth, refresh, error mapping, and tool calls; live end-to-end verification requires a signed-in desktop environment.

## Development

```sh
npm ci
npm test            # node:test, 54 tests
npm run verify      # per-file syntax check
npm run build       # dist/*.tgz + *.sha256
```

Test layout:

- `test/credentials.test.js` — discovery, parsing, encrypted detection, single-flight refresh, headers;
- `test/shim.test.js` — local auth, `/v1/models`, SSE passthrough, 401 refresh retry, error mapping;
- `test/adapter.test.js` — real `PiAiAdapter` → shim → fake gateway (text, tool call, missing-credential failure);
- `test/token-store.test.js` — atomic `0600` token store, normalization, refresh metadata, corrupt/oversized files;
- `test/http.test.js` — settings route actions (`status`/`save`/`clear`/`test`), envelopes, probe;
- `test/oauth.test.js` — web-login state creation, polling, account collection, expiry;
- `test/plugin.test.js` — `apply()` route registration and the no-credential diagnostic.

## Build and release (on GitHub by default)

- [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) — tests and builds on Node 22 and 24 for every push / PR, and uploads the tarball artifacts;
- [`.github/workflows/release.yml`](./.github/workflows/release.yml) — on a `v*` tag, re-tests, builds, and attaches the tarball plus SHA-256 to a GitHub Release.

There is no need to commit `dist/`; GitHub Actions owns release artifacts.
The first release is [v0.1.2](https://github.com/ban-sky/dsh-workbuddy/releases/tag/v0.1.2),
with `ban-sky-dsh-workbuddy-0.1.2.tgz` and its SHA-256 attached.

## License

MIT. Model names and protocol behavior come from public WorkBuddy documentation and public community notes; see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
