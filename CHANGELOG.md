# Changelog

## 0.9.0 — 2026-11-10

- **New Usage card.** A fourth card under the model table reports the tokens this
  machine has spent through the plugin: input, output, cache-hit, and uncached
  token counts, the request count, and credits spent, then tokens per credit,
  credits per 1K tokens, and the cache hit rate, plus a per-model breakdown.
  The card is fixed open and full width; its header carries **Refresh usage** and
  a two-click **Reset**.
- **Real billing numbers, not estimates.** The loopback shim now taps its own SSE
  stream (and the JSON body for non-streaming calls) and records the `usage` block
  WorkBuddy returns: `prompt_tokens`, `completion_tokens`, `prompt_cache_hit_tokens`,
  `prompt_cache_miss_tokens`, and `usage.credit`. Because credits come from the
  gateway itself, the totals match server-side billing; a 1-token ping reports 0.
- **New `lib/usage.js`.** A per-account, per-model ledger with counters only —
  no prompts, responses, or identifiers beyond the account id — persisted debounced
  to `$DSH_HOME/.workbuddy-usage.json` (mode 0600, atomic rename, 1 MB cap, 16
  accounts, 64 models). `summarizeCounters` derives the ratio fields and rounds
  credits to six decimals so repeated addition cannot drift.
- **New Host actions** `usage` and `resetUsage`, exposed through `usagePayload`.
  The client stays quiet when a pre-0.9.0 Host answers `UNKNOWN_ACTION`.
- Tests: 112 total (21 new for the ledger and SSE tap, 3 for the shim recording
  path, 3 for the new actions).

## 0.8.0 — 2026-11-10

- **The accounts and connection cards are fixed open.** `Card` gained a `fixed`
  prop: those two cards render their body unconditionally and their header is a
  plain `div` (no chevron, no toggle button), so there is nothing to collapse.
  Only the models card still toggles. The `open` state shrank to `{ models: false }`.
- **Account rows were rebuilt for legibility.** Each account is now a two-tier
  block: an initial avatar plus the account name and the 「当前」 chip on the first
  line, then an 11px muted meta line with the nickname, domain, token expiry date
  and the first 8 characters of the uid (full uid removed), with switch / rename /
  remove on their own left-aligned row at 26px height. The list cap grew from
  236px to 300px because rows are taller.
- **「添加账号」 now scrolls to the sign-in block** inside the connection card
  (`#wb-login` via `scrollIntoView`) instead of trying to expand a card that can
  no longer collapse.
- The CSS class audit is clean: 97 defined classes, 92 used, the remainder all
  conditional (`wb-card-icon-*`, `wb-bar-ok/warn/low`).

## 0.7.0 — 2026-11-10

- **The accounts and connection cards now share a row baseline.** The grid uses
  `align-items: stretch`, each card is a flex column whose body grows to fill the
  row, and the credits block is pinned to the bottom with `margin-top: auto`, so
  the two cards end at the same edge regardless of how many accounts exist. The
  account list is capped at 236px with its own scrollbar so a long list cannot
  stretch the row.
- **The models table is much more compact.** Cell padding dropped from 9px to
  5px, the header is 10.5px uppercase with 7px padding, reasoning and promotion
  chips use a new `wb-chips-sm` 18px variant, the model name and id sit on one
  baseline instead of stacked, and promotion copy is a single ellipsised line
  with the full text in `title`. The table body scrolls at 340px so the card no
  longer runs long.
- **Colour is used where it carries meaning.** Each card header has a tinted
  inline glyph (blue accounts, green connection, amber models); account rows show
  a coloured initial avatar and a tinted background when active; the connection
  state row has a success/warn status dot; credit bars and their numeric counts
  turn amber below 30% and red below 10%.
- The page keeps the 0.6.0 monochrome mark and theme-token palette; every new
  colour is derived with `color-mix` from `--dsw-alias-state-*` tokens so light
  and dark themes stay consistent.

## 0.6.0 — 2026-11-10

- **The icon is monochrome.** `icon.svg`, the rail glyph, and the page mark
  are now a single line-art W drawn with `currentColor` (rounded square outline
  plus a stroke-only W and a solid dot), so the mark inherits the theme instead
  of carrying its own blue→indigo→violet gradient.
- **The page is a card grid.** Cards render in the order **账号 → 连接 → 模型**.
  The accounts card keeps the account list and the credit balance; the
  connection card now holds the status table, the connection test, the storage
  note, and browser sign-in (the separate sign-in card is gone); the models card
  spans the full row with the catalog table.
- **Responsive grid.** `.wb-cards` is a two-column grid on wide viewports and
  collapses to a single column at 860px, so desktops show at most two cards per
  row and phones show one. The models card opts into `grid-column: 1 / -1`.
- **Typography pass.** 22px/30px page title with tighter tracking, 14px/22px
  semibold card titles with count pills, 13px/21px row titles, 12px/19px hints,
  11px table headers, tabular numerals for credits, a 28px metric value, and a
  consistent 8–16px spacing rhythm. Card headers are borderless when collapsed
  and gain a hairline only when open.
- The connection card keeps a 12px section label (`connection → browser sign-in`)
  so the folded-in sign-in block stays legible.

## 0.5.0 — 2026-11-10

- **The panel moved from Settings into the left sidebar.** It now registers a
  main panel (`main` slot, key `workbuddy`) plus a rail entry
  (`sidebar.panellist`, id `workbuddy`, order 11), so the WorkBuddy icon sits
  right above 「更多」 in the icon rail and opens a full page instead of a
  settings section. The `settings.section` registration is gone.
- **The page was redesigned to match the app's own pages.** It reuses the
  built-in page rhythm: a scrolling 960px-max content column, a 20px/28px
  title with the gradient brand mark and a signed-in pill, 16px rounded cards
  with 52px headers, rows separated by 0.5px `--dsw-alias-border-l4` hairlines,
  30px buttons, and an empty-state block. Every color, border, and focus ring
  comes from `--dsw-alias-*` / `--dsw-specific-*` theme tokens, so light and
  dark themes both follow the app; `[data-platform=darwin]` top clearance is
  respected like the built-in pages.
- Credits got a real metric treatment: a 30px tabular total, per-package
  remaining/total bars on the business accent color, and a wrapped meta line,
  replacing the old inline list.
- Model table is now borderless with hairline row rules, sticky column headers
  in the tertiary label color, and chip-style reasoning levels (the default
  level is filled with the accent color).
- The old settings-only entry is removed, so the panel no longer appears under
  Settings → Plugins or Settings → Models.

## 0.4.0 — 2026-11-10

- **The configuration panel moved out of the Plugins page** into a standalone
  settings section: **设置 → 模型 · WorkBuddy** (slot `settings.section`,
  id `models-workbuddy`, order 11, right after the built-in Models section).
  The four groups — accounts, browser sign-in, models and billing, runtime
  status — are collapsible.
- **Multi-account management.** The credential file is now v3
  `{version:3, activeId, accounts:[...]}`; up to 8 accounts, each with its own
  token, refresh token, and account headers. Switching, renaming, and removing
  work from the panel; signing in again adds an account instead of replacing
  the previous one. A v2 single-account file is read as one account, so
  upgrading never logs anybody out.
- **Per-account isolation and pacing.** Each account derives its own
  `x-machine-id`/`x-session-id` from a local 64-hex device salt, and outbound
  requests are paced per account (1.2 s minimum gap, at most 2 in flight), so
  one account never delays another and identities never mix.
- **Credit balance.** The accounts group shows the active account's total
  credits, a remaining/total bar per package, cycle end dates, and the nearest
  expiry, read from WorkBuddy's billing endpoint (`get-user-resource` for
  personal accounts, `get-enterprise-user-usage` for enterprise ones). A failed
  read reports the error instead of showing zero.
- New `lib/accounts.js` and `lib/credits.js`; 85 tests.

## 0.3.0 — 2026-11-10

- Reads WorkBuddy's app-channel model catalog after sign-in (54 chat models on
  the CN gateway, 23 on the global gateway) instead of only the 20-model
  built-in snapshot; the snapshot remains the signed-out/offline fallback.
- The settings tab gains a **模型与计费** table: reasoning levels (default level
  highlighted), credit multiplier, and active/upcoming promotion windows
  (daily night windows and absolute end dates included). **刷新目录** re-reads
  the catalog and refreshes the DSH model picker in place.
- Adds `lib/catalog-source.js` (per-gateway app-channel UA, media filtering,
  credits normalization) and `lib/promotions.js` (wall-clock windows, IANA
  time zones, cross-midnight ranges).
- New plugin icon and an inline brand mark in the settings header.
- README/README.zh updated; 58 tests.

## 0.2.0 — 2026-11-10

- **Breaking:** browser sign-in is the only credential source. The config
  `token`, `uid`, `enterpriseId`, `domain`, `authFile`, and `writeBack` keys
  and the `WORKBUDDY_TOKEN` / `WORKBUDDY_AUTH_FILE` environment variables are
  removed, together with desktop `*.info` discovery, the paste form, and the
  `save` route action.
- The settings tab now contains only status, browser login, connection test,
  and sign-out. Sign-out deletes `$DSH_HOME/.workbuddy-credentials.json`.
- Configuration is now `baseURL`, `region`, and `port`.
- Security: one 0600 credential file; tokens never enter config, logs,
  responses, or the npm package; `$wbEncrypted` blobs have no input path
  because they are not bearer tokens.
- README and README.zh rewritten for the browser-login-only flow.
- 45 tests.

## 0.1.3 — 2026-11-09

- Rejects a pasted `$wbEncrypted` envelope in the token field with
  `ENCRYPTED_TOKEN` and points at browser sign-in, instead of saving a value that
  can only produce 401.
- Reports `$wbEncrypted` fields in a desktop auth file as encrypted (new
  envelope shape) and refuses to send them as a bearer token.
- 55 tests.

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
