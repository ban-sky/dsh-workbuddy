# DSH WorkBuddy

Use the models of a **WorkBuddy / CodeBuddy** account inside [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Sign in once from the DSH settings page (no desktop app needed), then chat, call tools, send images, and pick reasoning levels with the normal DSH agent loop. Multiple accounts, a credit balance, and per-account pacing are included.

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

The panel is a **standalone sidebar page**: click the WorkBuddy icon in the left rail (directly above 「More」) to open it. It is a card grid in the order **accounts → connection → models → usage**. The accounts and connection cards are **fixed open** and cannot be collapsed; only the models card toggles from its header. Account rows are now two-tier: an initial avatar and the account name (with a "Current" chip) on top, then one 11px muted line holding nickname, domain, token expiry, and the first 8 characters of the uid, with the switch / rename / remove buttons on their own left-aligned row instead of squeezing the name from the right. The accounts card keeps the credit total, per-package bars, and expiry, pinned to the card bottom. Wide viewports put the accounts and connection cards side by side at equal height with the models and usage cards spanning the full row; below 860px everything stacks. Colour is meaningful: tinted card-header glyphs, account avatars, a status dot on the connection state, and credit bars that turn amber below 30% and red below 10%. The rail glyph and page mark are monochrome line art that follows the theme.


## Usage statistics

The **Usage** card under the model table shows what this machine has spent through the plugin:

- input / output / cache-hit / uncached token counts, plus request count and credits spent;
- tokens per credit, credits per 1K tokens, and the cache hit rate;
- a per-model breakdown of tokens and credits;
- **Refresh usage** and **Reset** in the card header (reset needs a second click and clears the current account only).

Credits come straight from the `usage.credit` field WorkBuddy returns with every response, and cache hits from `prompt_cache_hit_tokens`, so the numbers match server-side billing. Statistics are isolated per account and stored in `$DSH_HOME/.workbuddy-usage.json` (mode 0600) as counters only — no conversation content is ever written.

## Requirements

- DSH `0.2.x`, Node.js 22+.
- A WorkBuddy account (China `codebuddy.cn` or International `workbuddy.ai`). No WorkBuddy desktop installation is required on the DSH host.

## Install

From a release asset (recommended):

```sh
dsh plugin --profile web add ./ban-sky-dsh-workbuddy-0.9.2.tgz
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

1. Click the **WorkBuddy** icon in the left sidebar rail (above 「More」).
2. Expand **Browser sign-in**, choose **China (codebuddy.cn)** or **International (workbuddy.ai)**, then click **Generate login link**.
3. Complete the login in your browser; the page polls every 2 seconds and saves that account.
4. **Test connection** sends a one-token `ping`.

Signing in again adds a **new account** instead of overwriting the existing one.

## Multiple accounts

- Up to 8 accounts, each with its own token, refresh token, and account headers.
- **Switch** makes an account active; model requests and credit lookups only ever use the active account.
- **Rename** changes only the label, **Remove** asks for a second click, and removing the active account promotes the next one.
- Every account gets its own device identity and request pacing channel, so accounts never block or impersonate each other.
- All accounts live in `$DSH_HOME/.workbuddy-credentials.json` (mode `0600`, atomic write); the device salt sits next to it in `.device`. **Sign out** removes only the active account.

## Credits

The accounts card shows the active account's credit balance: the total, a remaining/total progress bar per package, cycle end dates, and the nearest expiry. It is read from WorkBuddy's billing endpoint, on this machine only; enterprise accounts use the enterprise quota table and personal accounts use the package table. A failed read shows an error instead of reporting zero.

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
npm test        # 112 tests: account store, device identity and pacing, credits, usage ledger, credentials, OAuth, catalog, promotions, HTTP route, shim, adapter, plugin
npm run verify  # syntax + manifest + locale/icon checks
npm run build   # dist/*.tgz + sha256
```

Layout: `lib/credentials.js` (saved token + refresh), `lib/oauth.js` (browser login), `lib/catalog-source.js` (live catalog + promotions), `lib/promotions.js` (windows and badges), `lib/token-store.js` (0600 file), `lib/usage.js` (per-account token and credit counters), `lib/http.js` (settings route), `lib/shim.js` (loopback proxy), `lib/adapter.js` (DSH provider), `client.js` (the sidebar panel with the model table and usage card).

GitHub Actions runs tests on Node 22/24 and publishes tagged releases.

## License

MIT
