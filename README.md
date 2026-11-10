# DSH WorkBuddy

Use the models of a **WorkBuddy / CodeBuddy** account inside [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Sign in once from the DSH settings page (no desktop app needed), then chat, call tools, send images, and pick reasoning levels with the normal DSH agent loop.

English | [中文](./README.zh.md)

## How it works

```text
DSH agent loop
   → pi-ai adapter (openai-completions)
   → 127.0.0.1:<random port>  local shim (random per-boot bearer key)
   → WorkBuddy gateway  POST /v2/chat/completions
```

The shim adds the WorkBuddy bearer token and account headers (`x-user-id`, `x-enterprise-id`, `x-tenant-id`, `x-domain`), refreshes an expiring token, and retries once on a rejected token.

The model roster is read from WorkBuddy's own app-channel catalog after sign-in (54 chat models on the CN gateway, 23 on the global gateway), with a built-in 20-model snapshot as fallback. The settings tab lists each model's reasoning levels, credit multiplier, and active or upcoming promotion window; **刷新目录** re-reads the catalog without restarting DSH.

## Requirements

- DSH `0.2.x`, Node.js 22+.
- A WorkBuddy account (China `codebuddy.cn` or International `workbuddy.ai`). No WorkBuddy desktop installation is required on the DSH host.

## Install

From a release asset (recommended):

```sh
dsh plugin --profile web add ./ban-sky-dsh-workbuddy-0.3.0.tgz
```

From source:

```sh
git clone https://github.com/ban-sky/dsh-workbuddy.git
cd dsh-workbuddy
npm ci && npm test && npm run build
dsh plugin --profile web add "$PWD"
```

Restart DSH after installing.

## Sign in

1. Open **Settings → Plugins → WorkBuddy**.
2. Choose **中国站** or **国际站**, then click **生成登录链接**.
3. Complete the login in your browser; the page polls every 2 seconds and saves the token automatically.
4. Click **测试连接** to verify (sends a one-token `ping`).

The token and its refresh token are stored in `$DSH_HOME/.workbuddy-credentials.json` (mode `0600`). Refreshes write the rotated token back. **退出登录** deletes the file.

## Configuration

The plugin usually needs no configuration. Optional keys, set on the `workbuddy` row of the profile's `cordis.patch.yml`:

```yaml
- id: workbuddy
  config:
    region: auto       # auto | cn | global
    baseURL: ''        # explicit gateway; leave empty to pick by region
    port: 0            # local shim port; 0 = random
```

## Security

- **Browser login is the only credential source.** There is no config token, environment token, CLI token, or paste field; encrypted `$wbEncrypted` envelopes are rejected by design.
- The token file is `0600` under `$DSH_HOME`, is never written to logs, the plugin config, or an HTTP response, and is excluded from the npm package.
- The shim listens on `127.0.0.1` only, with a random per-boot bearer key; the real WorkBuddy token stays inside the Host process.
- Outbound traffic goes only to the selected WorkBuddy gateway.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `尚未登录 WorkBuddy` | Complete the browser login in the settings tab. |
| `登录已失效（HTTP 401）` | Generate a new login link; the refresh token was rejected. |
| `MISSING_CREDENTIAL` from a model request | Same as above: the Host has no saved token yet. |
| Login link expired | Links are valid for 10 minutes; generate a new one. |
| Port already in use | Set `port: 0` (default) or another free port. |

Quota and rate-limit errors from WorkBuddy are returned to DSH as normal model errors.

## Development

```sh
npm test        # 58 tests: credentials, OAuth, catalog, promotions, HTTP route, shim, adapter, plugin
npm run verify  # syntax + manifest + locale/icon checks
npm run build   # dist/*.tgz + sha256
```

Layout: `lib/credentials.js` (saved token + refresh), `lib/oauth.js` (browser login), `lib/catalog-source.js` (live catalog + promotions), `lib/promotions.js` (windows and badges), `lib/token-store.js` (0600 file), `lib/http.js` (settings route), `lib/shim.js` (loopback proxy), `lib/adapter.js` (DSH provider), `client.js` (settings tab with the model table).

GitHub Actions runs tests on Node 22/24 and publishes tagged releases.

## License

MIT
