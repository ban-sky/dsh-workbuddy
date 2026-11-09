# Changelog

## 0.1.2 — 2026-11-09

- Adds **browser sign-in** to the WorkBuddy settings tab: generate a login link
  for the China (`codebuddy.cn`) or International (`workbuddy.ai`) site, open it,
  and the plugin polls the login state and saves the access/refresh token
  automatically. This works without the desktop app and is the supported path
  when the auth file's tokens are `$wbEncrypted`.
- Decodes JWT claims (`sub`, `enterprise_id`, `tenant_id`, `iss`, `exp`) when the
  account ids are not typed, so a valid pasted bearer token no longer sends empty
  `x-user-id` / `x-enterprise-id` / `x-tenant-id` headers and 401s.
- Token store schema v2 keeps `refreshToken`, `expiresAt`, `tenantId`, and
  `nickname`; a refresh of a saved token writes the rotated values back.
- Encrypted `$wbEncrypted` fields are not bearer tokens; the UI and README now
  say so and point to browser sign-in.
- 54 tests (adds JWT-claim and web-login coverage).

## 0.1.1 — 2026-11-09

- Adds **Settings → Plugins → WorkBuddy**: paste an accessToken (plus optional
  uid / enterpriseId / domain), save and connect without editing YAML, test the
  credential, and clear it again. The token is stored in
  `$DSH_HOME/.workbuddy-credentials.json` with mode `0600` and never returned by
  the Host route.
- Credential precedence: config `token` / `WORKBUDDY_TOKEN` → saved settings
  token → desktop auth file. Clearing the saved token falls back to the file.
- The connection test now sends the smallest possible chat completion, because
  the gateway's `/v3/config` answers without authentication and could not tell a
  valid token from an invalid one.
- 45 tests (token store, settings HTTP actions, probe, saved-token precedence).
- Test connection checks the token typed in the form without saving it, so a
  pasted value can be validated before it is stored.

## 0.1.0 — 2026-11-09

First release.

- Adds a `workbuddy` model provider to DSH: 20 WorkBuddy models (GLM-5.3 family,
  Kimi, MiniMax, DeepSeek-V4, Hy, Step, Space-Bunny) appear in the model picker.
- Reuses a signed-in WorkBuddy / CodeBuddy desktop app: discovers the auth
  document on macOS, Windows, and Linux, reads the bearer token, and refreshes
  an expiring token through `/v2/plugin/auth/token/refresh` (single-flight).
- Runs a loopback OpenAI-compatible shim (127.0.0.1, ephemeral port, random
  per-boot key) that forwards `/v1/chat/completions` and `/v1/models` to the
  WorkBuddy gateway with the account headers the gateway expects.
- Supports manual-token mode (`token` config / `WORKBUDDY_TOKEN`) when the
  desktop file is encrypted or the app is on another machine.
- Maps WorkBuddy errors (401, 402, 429, 404, 5xx) to OpenAI-shaped errors and
  retries once after a token refresh.
- 27 tests: credential discovery/parsing/refresh, shim protocol, PiAiAdapter
  end-to-end (text and native tool calls), and plugin activation.
- GitHub Actions CI (Node 22/24) and a tag-driven release workflow that builds
  the installable tarball on GitHub.
